"""
Job scraper — multi-source strategy
=====================================
Sources are selectively activated based on the user's location preference to
ensure results stay geographically relevant.

Source gating rules
-------------------
Primary (always run when API key is set):
  0. JSearch (RapidAPI) — real-time aggregator: Google Jobs, LinkedIn, Indeed,
                          Glassdoor, ZipRecruiter. Most up-to-date source.
                          Requires JSEARCH_API_KEY in .env

US Government jobs (always run when API key is set):
  A. USAJOBS          — official US federal government jobs portal.
                        Requires USAJOBS_API_KEY + USAJOBS_USER_AGENT in .env
                        All results tagged: org_type="Government"

Location-aware (always run):
  1. Indeed RSS       — stable XML feed, location + radius aware, US-focused
  2. The Muse         — free JSON API, professional/tech jobs, location-aware

Direct company career boards (always run, no auth):
  B. Greenhouse       — queries ~24 popular company boards in parallel, keyword filters
  C. Lever            — queries ~20 popular company boards in parallel, keyword filters

Remote / global (run only when remote wanted OR no location given):
  3. Remotive         — free JSON API, remote tech jobs only
  4. RemoteOK         — free JSON API, remote tech jobs only
  5. Jobicy           — free JSON API, remote jobs, keyword + geo params
  6. We Work Remotely — free RSS feed, remote jobs, category-mapped feeds
  7. Himalayas        — free JSON API, remote-first jobs

No-location fallback (run only when NO location specified):
  8. Arbeit Now       — European board; useful as a global catchall,
                        but location filter unreliable for US cities

Last-resort fallback (only when every source above returns 0):
  9. Google Jobs      — JSON-LD parsing + HTML card fallback,
                        returns [] gracefully on bot-detection

Each job dict carries a "source" field so the UI can show provenance.
Each job dict also carries enrichment fields:
  - industry     : industry / sector (from API data or search category)
  - org_type     : "Government" | "Non-Profit" | "For-Profit"
  - company_size : "Large" (federal agencies) | None when unknown
The task result includes a "sources" dict with per-source counts for debugging.
"""

import asyncio
import json
import logging
import re
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Dict, List, Optional, Tuple
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

from app.config import settings

logger = logging.getLogger(__name__)

# ── In-memory task store ───────────────────────────────────────────────────────
_tasks: Dict[str, dict] = {}

# ── HTTP headers ───────────────────────────────────────────────────────────────
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_HEADERS = {
    "User-Agent":      _UA,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
_JSON_HEADERS = {**_HEADERS, "Accept": "application/json, */*"}
_RSS_HEADERS  = {**_HEADERS, "Accept": "application/rss+xml, application/xml, text/xml, */*"}

# ── Indeed helpers ────────────────────────────────────────────────────────────
_RADIUS_MAP    = {0: 0, 5: 5, 10: 10, 15: 15, 25: 25, 50: 50, 100: 100}
_REMOTE_FILTER = {
    "only":    "&sc=0kf%3Aattr(DSQF7)%3B",
    "include": "&sc=0kf%3Aattr(DSQF7)attr(RBLC7)%3B",
    "no":      "",
}

# ── JSearch (RapidAPI) date-range mapping ─────────────────────────────────────
# date_range is passed as number of days (string); map to JSearch's date_posted param.
# JSearch's broadest option is "month"; 90 and 120 day ranges fall back to "all"
# so the RSS/scraping sources (which use Indeed's fromage param directly) carry
# the extended date filtering for those longer windows.
_JSEARCH_DATE_MAP: Dict[str, str] = {
    "1":   "today",
    "3":   "3days",
    "7":   "week",
    "14":  "month",
    "30":  "month",
    "90":  "all",
    "120": "all",
}

# ── The Muse category map ─────────────────────────────────────────────────────
_MUSE_CAT = {
    "software engineer":         "Software Engineer",
    "frontend engineer":         "Software Engineer",
    "backend engineer":          "Software Engineer",
    "full stack engineer":       "Software Engineer",
    "mobile developer":          "Software Engineer",
    "qa engineer":               "Software Engineer",
    "data scientist":            "Data Science",
    "data analyst":              "Data & Analytics",
    "machine learning engineer": "Data Science",
    "devops / sre":              "DevOps & Sysadmin",
    "cloud engineer":            "DevOps & Sysadmin",
    "product manager":           "Product",
    "ux designer":               "Design & UX",
    "ui designer":               "Design & UX",
    "project manager":           "Project Management",
    "business analyst":          "Business & Strategy",
    "marketing manager":         "Marketing & PR",
    "sales representative":      "Sales",
    "hr manager":                "Human Resources",
    "finance analyst":           "Finance",
    "cybersecurity analyst":     "IT & Security",
    "technical writer":          "Writing",
}


# ── Org-type heuristic ────────────────────────────────────────────────────────
_NONPROFIT_KEYWORDS = {
    "nonprofit", "non-profit", "non profit", "foundation", "charitable",
    "charity", "charities", "association", "institute", "ngo", "trust",
    "society", "coalition", "alliance", "council", "federation", "league",
    "fund", "endowment", "ministry", "church", "cathedral", "diocese",
    "hospital", "health system", "clinic", "medical center",
    "university", "college", "school district", "unified school",
    "public library", "red cross", "united way",
}

def _infer_org_type(company: str, source: str = "") -> str:
    """
    Classify a company as Government, Non-Profit, or For-Profit.

    - USAJOBS results are always Government.
    - Checks company name against known non-profit keywords.
    - Falls back to For-Profit.
    """
    if source == "USAJOBS":
        return "Government"
    name_lower = (company or "").lower()
    for kw in _NONPROFIT_KEYWORDS:
        if kw in name_lower:
            return "Non-Profit"
    return "For-Profit"


# ── Public task API ────────────────────────────────────────────────────────────

def create_task() -> str:
    tid = str(uuid.uuid4())
    _tasks[tid] = {"status": "pending", "results": [], "error": None, "sources": {}, "source_errors": {}}
    return tid


def get_task(task_id: str) -> dict:
    return _tasks.get(task_id, {"status": "not_found"})


async def run_search(
    task_id: str,
    categories: List[str],
    location: str,
    date_range: str,
    radius: int = 25,
    remote: str = "no",
):
    _tasks[task_id]["status"] = "running"
    try:
        search_cats = categories if categories else [""]

        per_cat = await asyncio.gather(
            *[_search_category(c, location, date_range, radius, remote) for c in search_cats],
            return_exceptions=True,
        )

        seen:          set              = set()
        merged:        List[dict]       = []
        sources:       Dict[str, int]   = {}
        source_errors: Dict[str, str]   = {}

        for cat, result in zip(search_cats, per_cat):
            if isinstance(result, Exception):
                logger.warning("Category %r raised: %s", cat, result)
                continue
            jobs_list, src_counts, src_errors = result
            for job in jobs_list:
                url = job.get("job_url", "")
                if url and url in seen:
                    continue
                seen.add(url)
                job["search_category"] = cat
                merged.append(job)
            for k, v in src_counts.items():
                sources[k] = sources.get(k, 0) + v
            for k, v in src_errors.items():
                source_errors[k] = v   # last error per source wins

        # ── Enrich every job with org_type / company_size / industry ─────────
        # Sources that already set these fields (e.g. JSearch, USAJOBS) keep
        # their values.  All other sources get defaults derived from heuristics.
        for job in merged:
            if "org_type" not in job or not job["org_type"]:
                job["org_type"] = _infer_org_type(
                    job.get("company", ""), job.get("source", "")
                )
            if "company_size" not in job:
                job["company_size"] = None
            if "industry" not in job or not job["industry"]:
                # Fall back to the search category so the tag is always populated
                job["industry"] = job.get("search_category") or None

        _tasks[task_id]["status"]        = "completed"
        _tasks[task_id]["results"]       = merged[:100]
        _tasks[task_id]["sources"]       = sources
        _tasks[task_id]["source_errors"] = source_errors
        logger.info("Done: %d jobs. Sources: %s", len(merged), sources)

    except Exception as exc:
        logger.error("run_search error: %s", exc, exc_info=True)
        _tasks[task_id]["status"] = "failed"
        _tasks[task_id]["error"]  = str(exc)


# ── Company-targeted search ──────────────────────────────────────────────────

async def run_company_search(
    task_id: str,
    companies: List[dict],
    categories: List[str],
    location: str = "",
):
    """
    Search for jobs within specific companies via their Greenhouse / Lever boards.
    Only queries boards for companies where a valid slug is provided.
    """
    _tasks[task_id]["status"] = "running"
    try:
        all_jobs:      List[dict]     = []
        sources:       Dict[str, int] = {}
        source_errors: Dict[str, str] = {}
        seen:          set            = set()

        gh_companies = [c for c in companies if c.get("greenhouse_slug")]
        lv_companies = [c for c in companies if c.get("lever_slug")]

        async with httpx.AsyncClient(
            headers=_JSON_HEADERS, follow_redirects=True, timeout=15,
        ) as client:
            # Greenhouse queries
            async def _gh_query(company: dict) -> List[dict]:
                slug = company["greenhouse_slug"]
                name = company.get("name", slug.replace("-", " ").title())
                url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
                params = {"content": "true"}
                r = await client.get(url, params=params)
                if r.status_code != 200:
                    return []
                data = r.json()
                results = []
                for j in data.get("jobs", []):
                    title = (j.get("title") or "").strip()
                    if not title:
                        continue
                    if categories and not _title_matches_category(title, " ".join(categories)):
                        continue
                    loc_obj = j.get("location") or {}
                    job_loc = loc_obj.get("name", "") if isinstance(loc_obj, dict) else str(loc_obj)
                    updated = j.get("updated_at") or ""
                    posted = "N/A"
                    if updated:
                        try:
                            posted = datetime.fromisoformat(updated[:19]).strftime("%b %d, %Y")
                        except Exception:
                            posted = updated[:10]
                    desc_html = j.get("content") or ""
                    desc = BeautifulSoup(desc_html, "lxml").get_text(" ", strip=True)[:400] if desc_html else ""
                    depts = j.get("departments") or []
                    industry = depts[0].get("name") if depts else company.get("industry")
                    results.append({
                        "title": title, "company": name,
                        "location": job_loc or "N/A", "posted_date": posted,
                        "job_url": j.get("absolute_url") or "",
                        "description": desc, "source": "Greenhouse",
                        "industry": industry,
                        "org_type": _infer_org_type(name, "Greenhouse"),
                        "company_size": None,
                    })
                return results

            # Lever queries
            async def _lv_query(company: dict) -> List[dict]:
                slug = company["lever_slug"]
                name = company.get("name", slug.replace("-", " ").title())
                url = f"https://api.lever.co/v0/postings/{slug}"
                r = await client.get(url, params={"mode": "json"})
                if r.status_code != 200:
                    return []
                data = r.json()
                if not isinstance(data, list):
                    return []
                results = []
                for j in data:
                    title = (j.get("text") or "").strip()
                    if not title:
                        continue
                    if categories and not _title_matches_category(title, " ".join(categories)):
                        continue
                    cats = j.get("categories") or {}
                    job_loc = cats.get("location") or ""
                    created = j.get("createdAt")
                    posted = "N/A"
                    if created and isinstance(created, (int, float)):
                        try:
                            posted = datetime.fromtimestamp(created / 1000).strftime("%b %d, %Y")
                        except Exception:
                            pass
                    desc_plain = (j.get("descriptionPlain") or "")[:400]
                    if not desc_plain:
                        desc_html = j.get("description") or ""
                        desc_plain = BeautifulSoup(desc_html, "lxml").get_text(" ", strip=True)[:400] if desc_html else ""
                    results.append({
                        "title": title, "company": name,
                        "location": job_loc or "N/A", "posted_date": posted,
                        "job_url": j.get("hostedUrl") or j.get("applyUrl") or "",
                        "description": desc_plain, "source": "Lever",
                        "industry": cats.get("department") or company.get("industry"),
                        "org_type": _infer_org_type(name, "Lever"),
                        "company_size": None,
                    })
                return results

            # Run all queries concurrently
            all_tasks = (
                [_gh_query(c) for c in gh_companies] +
                [_lv_query(c) for c in lv_companies]
            )
            results = await asyncio.gather(*all_tasks, return_exceptions=True)

        gh_count = 0
        lv_count = 0
        for i, res in enumerate(results):
            if isinstance(res, Exception):
                logger.warning("Company search error: %s", res)
                continue
            for job in res:
                url = job.get("job_url", "")
                if url and url in seen:
                    continue
                seen.add(url)
                all_jobs.append(job)
                if i < len(gh_companies):
                    gh_count += 1
                else:
                    lv_count += 1

        if gh_count:
            sources["Greenhouse"] = gh_count
        if lv_count:
            sources["Lever"] = lv_count

        # Enrich
        for job in all_jobs:
            if "org_type" not in job or not job["org_type"]:
                job["org_type"] = _infer_org_type(job.get("company", ""), job.get("source", ""))
            if "company_size" not in job:
                job["company_size"] = None
            if "industry" not in job or not job["industry"]:
                job["industry"] = None

        _tasks[task_id]["status"]        = "completed"
        _tasks[task_id]["results"]       = all_jobs[:150]
        _tasks[task_id]["sources"]       = sources
        _tasks[task_id]["source_errors"] = source_errors
        logger.info("Company search done: %d jobs. Sources: %s", len(all_jobs), sources)

    except Exception as exc:
        logger.error("run_company_search error: %s", exc, exc_info=True)
        _tasks[task_id]["status"] = "failed"
        _tasks[task_id]["error"]  = str(exc)


# ── Per-category orchestrator ─────────────────────────────────────────────────

async def _search_category(
    category: str,
    location: str,
    date_range: str,
    radius: int,
    remote: str,
) -> Tuple[List[dict], Dict[str, int], Dict[str, str]]:
    """
    Run sources concurrently, gating appropriately on location and remote preference.

    Source gating logic:
    - has_location AND remote == "no"  → location-aware sources only; remote-only
      boards are skipped and any remote-tagged results are filtered out so the
      user only sees jobs within their chosen city / radius.
    - no location OR remote != "no"   → all sources run (remote boards contribute
      keyword-matched results and act as a fallback when Indeed is blocked).

    Source behaviour:
    - JSearch (RapidAPI) : primary aggregator — Google Jobs, LinkedIn, Indeed,
                           Glassdoor, ZipRecruiter. Only runs if JSEARCH_API_KEY set.
    - Indeed RSS         : fully location-aware (radius, city, state)
    - The Muse           : location-aware (US-focused, passes location param)
    - Remotive           : remote-only source — skipped when remote == "no" + location
    - RemoteOK           : remote-only source — skipped when remote == "no" + location
    - Jobicy             : remote-only source — skipped when remote == "no" + location
    - We Work Remotely   : remote-only source — skipped when remote == "no" + location
    - Himalayas          : remote-only source — skipped when remote == "no" + location
    - Arbeit Now         : European board — global catchall (no-location only)

    Falls back to Google Jobs scraping when total results < 5.
    """
    has_location  = bool(location.strip())
    # True when the user explicitly wants no remote jobs and supplied a location.
    # In this mode we skip all remote-only boards and strip remote-tagged results.
    strict_local  = has_location and remote == "no"
    # Remote boards should run when: user wants remote, OR user wants both, OR no
    # location was given (they act as keyword-based fallback in that case).
    include_remote_sources = not strict_local

    # ── Always-on sources ─────────────────────────────────────────────────────
    source_fns: Dict[str, any] = {}

    # JSearch — primary real-time aggregator (requires JSEARCH_API_KEY in .env)
    if settings.JSEARCH_API_KEY:
        source_fns["JSearch"] = _fetch_jsearch(category, location, date_range, remote)

    # USAJOBS — official US federal government jobs portal (requires API key)
    if settings.USAJOBS_API_KEY and settings.USAJOBS_USER_AGENT:
        source_fns["USAJOBS"] = _fetch_usajobs(category, location, date_range, remote)

    # Free location-aware boards (always run)
    source_fns["Indeed"]     = _scrape_indeed_rss(category, location, date_range, radius, remote)
    source_fns["The Muse"]   = _fetch_the_muse(category, location)

    # Direct company career boards — free, no auth, always run.
    # These query curated lists of popular companies in parallel.
    source_fns["Greenhouse"] = _fetch_greenhouse(category, location)
    source_fns["Lever"]      = _fetch_lever(category, location)

    # Remote/global boards — only run when the user hasn't restricted to local-only.
    # When a location is given with remote == "no" these boards are skipped entirely
    # because every result they return is tagged "Remote" and would be filtered anyway.
    if include_remote_sources:
        source_fns["Remotive"]         = _fetch_remotive(category)
        source_fns["RemoteOK"]         = _fetch_remote_ok(category)
        source_fns["Jobicy"]           = _fetch_jobicy(category)
        source_fns["We Work Remotely"] = _fetch_wwr(category)
        source_fns["Himalayas"]        = _fetch_himalayas(category)

    # Arbeit Now: European board — global catchall (no-location searches only)
    if not has_location:
        source_fns["Arbeit Now"] = _fetch_arbeit_now(category, location)

    labels  = list(source_fns.keys())
    results = await asyncio.gather(*source_fns.values(), return_exceptions=True)

    jobs:          List[dict]     = []
    sources:       Dict[str, int] = {}
    source_errors: Dict[str, str] = {}
    seen:          set            = set()

    for label, res in zip(labels, results):
        if isinstance(res, Exception):
            logger.warning("Source %r error: %s", label, res)
            sources[label]       = 0
            source_errors[label] = str(res)
            continue
        sources[label] = len(res)
        logger.info("  %s → %d jobs", label, len(res))
        for job in res:
            # ── Strict local filter ───────────────────────────────────────────
            # When the user specified a location and chose no remote work type,
            # drop any job whose location field looks like a remote-only posting.
            if strict_local:
                loc_val = (job.get("location") or "").strip().lower()
                if loc_val in ("remote", "remote only", "worldwide", "anywhere") or \
                        loc_val.startswith("remote"):
                    continue
            # ── Deduplication by URL ─────────────────────────────────────────
            url = job.get("job_url", "")
            if not url or url not in seen:
                seen.add(url)
                jobs.append(job)

    # ── Google fallback when results are thin (< 5) ───────────────────────────
    if len(jobs) < 5:
        logger.info("Thin results (%d) for %r — trying Google Jobs fallback", len(jobs), category)
        try:
            google = await _scrape_google_jobs(category, location, remote)
            sources["Google Jobs"] = len(google)
            for job in google:
                if strict_local:
                    loc_val = (job.get("location") or "").strip().lower()
                    if loc_val in ("remote", "remote only", "worldwide", "anywhere") or \
                            loc_val.startswith("remote"):
                        continue
                url = job.get("job_url", "")
                if not url or url not in seen:
                    seen.add(url)
                    jobs.append(job)
            if google:
                logger.info("  Google Jobs → %d jobs", len(google))
        except Exception as exc:
            logger.warning("Google Jobs fallback error: %s", exc)
            sources["Google Jobs"]       = 0
            source_errors["Google Jobs"] = str(exc)

    return jobs, sources, source_errors


# ══════════════════════════════════════════════════════════════════════════════
# Source 0 — JSearch (RapidAPI)  ★ PRIMARY real-time aggregator
# ══════════════════════════════════════════════════════════════════════════════

async def _fetch_jsearch(
    category: str,
    location: str,
    date_range: str,
    remote: str = "no",
) -> List[dict]:
    """
    JSearch via RapidAPI — aggregates Google Jobs, LinkedIn, Indeed, Glassdoor,
    and ZipRecruiter into a single call. Updates within hours of posting.

    Docs: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
    Requires JSEARCH_API_KEY in .env  (get one free at rapidapi.com).
    """
    api_key = settings.JSEARCH_API_KEY
    if not api_key:
        return []

    # Build natural-language query: "software engineer in New York" or "remote python developer"
    if remote == "only":
        query = f"remote {category}"
    elif location.strip():
        query = f"{category} in {location}"
    else:
        query = category

    date_posted = _JSEARCH_DATE_MAP.get(str(date_range), "all")

    params: dict = {
        "query":       query,
        "num_pages":   "2",          # up to 20 results per page → max 40
        "date_posted": date_posted,
    }
    if remote == "only":
        params["remote_jobs_only"] = "true"

    headers = {
        "X-RapidAPI-Key":  api_key,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    }

    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(
                "https://jsearch.p.rapidapi.com/search",
                params=params,
                headers=headers,
            )
            if r.status_code == 429:
                logger.warning("JSearch: rate limit hit (429)")
                raise RuntimeError("JSearch rate limit (429) — API quota may be exhausted")
            if r.status_code == 403:
                body = r.text[:200]
                logger.warning("JSearch: 403 Forbidden — %s", body)
                raise RuntimeError(f"JSearch 403 Forbidden — RapidAPI may be blocking this server IP. Response: {body}")
            if r.status_code != 200:
                body = r.text[:200]
                logger.warning("JSearch: HTTP %d — %s", r.status_code, body)
                raise RuntimeError(f"JSearch HTTP {r.status_code}: {body}")
            data = r.json()

        jobs: List[dict] = []
        for j in data.get("data", []):
            # Posted date
            posted = "N/A"
            raw_dt = j.get("job_posted_at_datetime_utc") or ""
            if raw_dt:
                try:
                    posted = datetime.fromisoformat(raw_dt.replace("Z", "+00:00")).strftime("%b %d, %Y")
                except Exception:
                    posted = raw_dt[:10]

            # Location
            if j.get("job_is_remote"):
                loc_str = "Remote"
            else:
                city  = j.get("job_city") or ""
                state = j.get("job_state") or ""
                country = j.get("job_country") or ""
                loc_str = ", ".join(filter(None, [city, state])) or country or location or "N/A"

            # Description — plain text, capped at 400 chars
            desc_raw = j.get("job_description") or ""
            desc = desc_raw[:400] if desc_raw else ""

            title = (j.get("job_title") or "").strip()
            company = (j.get("employer_name") or "N/A").strip()
            job_url = j.get("job_apply_link") or j.get("job_google_link") or ""

            # Industry from employer_company_type (e.g. "Information Technology")
            industry_raw = (j.get("employer_company_type") or "").strip()

            if title:
                jobs.append({
                    "title":        title,
                    "company":      company,
                    "location":     loc_str,
                    "posted_date":  posted,
                    "job_url":      job_url,
                    "description":  desc,
                    "source":       "JSearch",
                    "industry":     industry_raw or None,
                    "org_type":     _infer_org_type(company, "JSearch"),
                    "company_size": None,
                })

        logger.info("JSearch → %d jobs for %r", len(jobs), query)
        return jobs

    except httpx.RequestError as e:
        logger.warning("JSearch request error: %s", e)
        raise RuntimeError(f"JSearch network error: {e}")
    except RuntimeError:
        raise
    except Exception as e:
        logger.warning("JSearch unexpected error: %s", e)
        raise RuntimeError(f"JSearch error: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# Source 1 — Indeed RSS
# ══════════════════════════════════════════════════════════════════════════════

async def _scrape_indeed_rss(
    category: str, location: str, date_range: str,
    radius: int = 25, remote: str = "no",
) -> List[dict]:
    """Indeed /rss endpoint — stable XML, no JavaScript rendering."""
    query  = category.replace(" ", "+")
    loc    = location.replace(" ", "+").replace(",", "%2C")
    r_val  = _RADIUS_MAP.get(radius, 25)
    r_flt  = _REMOTE_FILTER.get(remote, "")

    if remote == "only" and not location.strip():
        loc = "remote"

    base = (
        f"https://www.indeed.com/rss?q={query}&l={loc}"
        f"&radius={r_val}&fromage={date_range}&sort=date{r_flt}"
    )
    jobs: List[dict] = []
    last_error = None
    async with httpx.AsyncClient(headers=_RSS_HEADERS, follow_redirects=True, timeout=25) as c:
        for start in range(0, 30, 10):
            try:
                resp = await c.get(f"{base}&start={start}")
                if resp.status_code == 403:
                    last_error = f"Indeed returned 403 Forbidden — likely blocking this server's IP"
                    logger.warning("Indeed RSS: 403 Forbidden (IP blocked?)")
                    break
                if resp.status_code != 200:
                    last_error = f"Indeed HTTP {resp.status_code}"
                    break
                page = _parse_indeed_rss(resp.text)
                if not page:
                    break
                jobs.extend(page)
                if len(jobs) >= 30:
                    break
                await asyncio.sleep(0.8)
            except httpx.RequestError as e:
                last_error = f"Indeed network error: {e}"
                logger.warning("Indeed RSS request error: %s", e)
                break
    if not jobs and last_error:
        raise RuntimeError(last_error)
    return jobs


def _parse_indeed_rss(xml_text: str) -> List[dict]:
    clean = re.sub(r'\s+xmlns(?::\w+)?="[^"]*"', "", xml_text)
    try:
        root = ET.fromstring(clean)
    except ET.ParseError:
        return []

    channel = root.find("channel") or root
    jobs: List[dict] = []
    for item in channel.findall("item"):
        try:
            title_raw = (item.findtext("title") or "").strip()
            link      = (item.findtext("link")  or "").strip()
            pub       = (item.findtext("pubDate") or "").strip()
            desc_html = (item.findtext("description") or "").strip()

            src_el  = item.find("source")
            company = (src_el.text or "").strip() if src_el is not None else ""
            title   = title_raw
            if not company and " - " in title_raw:
                parts   = title_raw.rsplit(" - ", 1)
                title   = parts[0].strip()
                company = parts[1].strip()

            loc_str = desc = ""
            if desc_html:
                soup    = BeautifulSoup(desc_html, "lxml")
                text    = soup.get_text(" ", strip=True)
                m = re.search(r"Location[:\s]+([^\n<]{3,80}?)(?:\s{2,}|\n|<|$)", desc_html, re.I)
                if m:
                    loc_str = m.group(1).strip().rstrip(".,;")
                desc = text[:400]

            posted = "N/A"
            if pub:
                try:
                    posted = parsedate_to_datetime(pub).strftime("%b %d, %Y")
                except Exception:
                    posted = pub[:16]

            if title and title != "N/A":
                jobs.append({"title": title, "company": company or "N/A",
                             "location": loc_str or "N/A", "posted_date": posted,
                             "job_url": link, "description": desc, "source": "Indeed"})
        except Exception:
            continue
    return jobs


# ══════════════════════════════════════════════════════════════════════════════
# Source 2 — The Muse  (free JSON API, professional/tech jobs)
# ══════════════════════════════════════════════════════════════════════════════

async def _fetch_the_muse(category: str, location: str = "") -> List[dict]:
    cat = _MUSE_CAT.get(category.lower(), category)
    params = {"category": cat, "page": "0", "descending": "true"}
    if location:
        params["location"] = location
    url = "https://www.themuse.com/api/public/jobs?" + "&".join(
        f"{k}={quote_plus(str(v))}" for k, v in params.items()
    )
    try:
        async with httpx.AsyncClient(headers=_JSON_HEADERS, follow_redirects=True, timeout=15) as c:
            r = await c.get(url)
            if r.status_code != 200:
                raise RuntimeError(f"The Muse HTTP {r.status_code}")
            data = r.json()

        jobs = []
        for j in data.get("results", []):
            name    = j.get("name") or ""
            company = (j.get("company") or {}).get("name") or "N/A"
            locs    = j.get("locations") or []
            loc_str = locs[0].get("name") if locs else (location or "N/A")
            pub     = j.get("publication_date") or ""
            landing = (j.get("refs") or {}).get("landing_page") or ""
            posted  = "N/A"
            if pub:
                try:
                    posted = datetime.fromisoformat(pub[:19]).strftime("%b %d, %Y")
                except Exception:
                    posted = pub[:10]
            desc = BeautifulSoup(j.get("contents") or "", "lxml").get_text(" ", strip=True)[:400]
            if name:
                jobs.append({"title": name, "company": company, "location": loc_str,
                             "posted_date": posted, "job_url": landing,
                             "description": desc, "source": "The Muse"})
        return jobs
    except Exception as e:
        logger.warning("The Muse error: %s", e)
        raise RuntimeError(f"The Muse error: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# Source 3 — Remotive  (free JSON API, remote tech jobs)
# ══════════════════════════════════════════════════════════════════════════════

async def _fetch_remotive(category: str) -> List[dict]:
    # No category → fetch latest jobs (no keyword filter)
    url = (
        f"https://remotive.com/api/remote-jobs?search={quote_plus(category)}&limit=20"
        if category else
        "https://remotive.com/api/remote-jobs?limit=20"
    )
    try:
        async with httpx.AsyncClient(headers=_JSON_HEADERS, follow_redirects=True, timeout=15) as c:
            r = await c.get(url)
            if r.status_code != 200:
                return []
            raw = r.json().get("jobs", [])
        jobs = []
        for j in raw:
            pub = j.get("publication_date", "")
            try:
                posted = datetime.fromisoformat(pub.replace("Z", "+00:00")).strftime("%b %d, %Y")
            except Exception:
                posted = pub[:10] if pub else "N/A"
            desc = BeautifulSoup(j.get("description") or "", "lxml").get_text(" ", strip=True)[:400]
            jobs.append({"title": j.get("title", "N/A"), "company": j.get("company_name", "N/A"),
                         "location": j.get("candidate_required_location") or "Remote",
                         "posted_date": posted, "job_url": j.get("url", ""),
                         "description": desc, "source": "Remotive"})
        return jobs
    except Exception as e:
        logger.debug("Remotive error: %s", e)
        return []


# ══════════════════════════════════════════════════════════════════════════════
# Source 4 — RemoteOK  (free JSON API, remote tech jobs)
# ══════════════════════════════════════════════════════════════════════════════

async def _fetch_remote_ok(category: str) -> List[dict]:
    # No category → fetch latest jobs from the base API (no tag filter)
    if category:
        tag = category.lower().replace(" ", "-").replace("/", "-")
        url = f"https://remoteok.io/api?tag={quote_plus(tag)}&limit=20"
    else:
        url = "https://remoteok.io/api?limit=20"
    try:
        async with httpx.AsyncClient(
            headers={**_JSON_HEADERS, "Accept": "application/json"},
            follow_redirects=True, timeout=15,
        ) as c:
            r = await c.get(url)
            if r.status_code != 200:
                return []
            raw = [j for j in r.json() if isinstance(j, dict) and j.get("position")]
        jobs = []
        for j in raw[:20]:
            epoch  = j.get("epoch") or 0
            posted = "N/A"
            if epoch:
                try:
                    posted = datetime.utcfromtimestamp(int(epoch)).strftime("%b %d, %Y")
                except Exception:
                    pass
            desc = BeautifulSoup(j.get("description") or "", "lxml").get_text(" ", strip=True)[:400]
            jobs.append({
                "title":       j.get("position", "N/A"),
                "company":     j.get("company", "N/A"),
                "location":    j.get("location") or "Remote",
                "posted_date": posted,
                "job_url":     j.get("url") or f"https://remoteok.io/remote-jobs/{j.get('id','')}",
                "description": desc,
                "source":      "RemoteOK",
            })
        return jobs
    except Exception as e:
        logger.debug("RemoteOK error: %s", e)
        return []


# ══════════════════════════════════════════════════════════════════════════════
# Source 5 — Arbeit Now  (free JSON API, broad job coverage)
# ══════════════════════════════════════════════════════════════════════════════

async def _fetch_arbeit_now(category: str, location: str = "") -> List[dict]:
    """
    Arbeit Now public API — free, no authentication required.
    https://www.arbeitnow.com/api/job-board-api?search={q}&location={l}
    Good coverage for both remote and on-site roles internationally.
    """
    params = [f"search={quote_plus(category)}"]
    if location:
        params.append(f"location={quote_plus(location)}")
    url = "https://www.arbeitnow.com/api/job-board-api?" + "&".join(params)
    try:
        async with httpx.AsyncClient(headers=_JSON_HEADERS, follow_redirects=True, timeout=15) as c:
            r = await c.get(url)
            if r.status_code != 200:
                logger.debug("Arbeit Now HTTP %d", r.status_code)
                return []
            raw = r.json().get("data", [])
        jobs = []
        for j in raw[:25]:
            created = j.get("created_at") or 0
            posted  = "N/A"
            if created:
                try:
                    posted = datetime.utcfromtimestamp(int(created)).strftime("%b %d, %Y")
                except Exception:
                    pass
            desc = BeautifulSoup(j.get("description") or "", "lxml").get_text(" ", strip=True)[:400]
            loc_str = j.get("location") or ("Remote" if j.get("remote") else "N/A")
            job_url = j.get("url") or ""
            if not job_url and j.get("slug"):
                job_url = f"https://www.arbeitnow.com/jobs/{j['slug']}"
            if j.get("title"):
                jobs.append({
                    "title":       j["title"],
                    "company":     j.get("company_name") or "N/A",
                    "location":    loc_str,
                    "posted_date": posted,
                    "job_url":     job_url,
                    "description": desc,
                    "source":      "Arbeit Now",
                })
        return jobs
    except Exception as e:
        logger.debug("Arbeit Now error: %s", e)
        return []


# ══════════════════════════════════════════════════════════════════════════════
# Source 6 — Jobicy  (free JSON API, remote tech jobs, no auth)
# ══════════════════════════════════════════════════════════════════════════════

async def _fetch_jobicy(category: str) -> List[dict]:
    """
    Jobicy public API — free JSON, no auth, remote-only jobs.
    https://jobicy.com/api/v2/remote-jobs?count=20&tag={query}
    """
    # No category → fetch latest jobs (omit tag param)
    url = (
        f"https://jobicy.com/api/v2/remote-jobs?count=20&tag={quote_plus(category)}"
        if category else
        "https://jobicy.com/api/v2/remote-jobs?count=20"
    )
    try:
        async with httpx.AsyncClient(headers=_JSON_HEADERS, follow_redirects=True, timeout=15) as c:
            r = await c.get(url)
            if r.status_code != 200:
                return []
            data = r.json()
        jobs = []
        for j in data.get("jobs", []):
            pub = j.get("pubDate") or ""
            try:
                posted = datetime.fromisoformat(pub[:19]).strftime("%b %d, %Y")
            except Exception:
                posted = pub[:10] if pub else "N/A"
            desc_raw = j.get("jobExcerpt") or j.get("jobDescription") or ""
            desc = BeautifulSoup(desc_raw, "lxml").get_text(" ", strip=True)[:400]
            region = j.get("jobGeo") or j.get("jobRegion") or "Remote"
            job_url = j.get("url") or j.get("jobSlug") or ""
            if job_url and not job_url.startswith("http"):
                job_url = f"https://jobicy.com/jobs/{job_url}"
            if j.get("jobTitle"):
                jobs.append({
                    "title":       j["jobTitle"],
                    "company":     j.get("companyName") or "N/A",
                    "location":    region,
                    "posted_date": posted,
                    "job_url":     job_url,
                    "description": desc,
                    "source":      "Jobicy",
                })
        return jobs
    except Exception as e:
        logger.debug("Jobicy error: %s", e)
        return []


# ══════════════════════════════════════════════════════════════════════════════
# Source 7 — We Work Remotely  (free RSS feed, remote tech jobs, no auth)
# ══════════════════════════════════════════════════════════════════════════════

# Map category → WWR feed slug so we hit the most relevant category feed.
# Falls back to the all-jobs feed when no mapping exists.
_WWR_SLUG = {
    "software engineer":         "programming",
    "frontend engineer":         "programming",
    "backend engineer":          "programming",
    "full stack engineer":       "programming",
    "mobile developer":          "programming",
    "qa engineer":               "programming",
    "data scientist":            "programming",
    "data analyst":              "programming",
    "machine learning engineer": "programming",
    "devops / sre":              "devops-sysadmin",
    "cloud engineer":            "devops-sysadmin",
    "product manager":           "product",
    "ux designer":               "design-ux",
    "ui designer":               "design-ux",
    "marketing manager":         "marketing-sales",
    "sales representative":      "marketing-sales",
    "hr manager":                "management-finance",
    "finance analyst":           "management-finance",
    "project manager":           "management-finance",
}

async def _fetch_wwr(category: str) -> List[dict]:
    """
    We Work Remotely public RSS feeds — no auth required.
    Category feeds give tighter relevance than the all-jobs feed.
    https://weworkremotely.com/categories/remote-{slug}-jobs.rss
    """
    slug = _WWR_SLUG.get(category.lower())
    url  = (
        f"https://weworkremotely.com/categories/remote-{slug}-jobs.rss"
        if slug else
        "https://weworkremotely.com/remote-jobs.rss"
    )
    try:
        async with httpx.AsyncClient(headers=_RSS_HEADERS, follow_redirects=True, timeout=15) as c:
            r = await c.get(url)
            if r.status_code != 200:
                return []
            xml_text = r.text

        clean = re.sub(r'\s+xmlns(?::\w+)?="[^"]*"', "", xml_text)
        try:
            root = ET.fromstring(clean)
        except ET.ParseError:
            return []

        channel = root.find("channel") or root
        jobs: List[dict] = []
        for item in channel.findall("item")[:20]:
            try:
                title_raw = (item.findtext("title") or "").strip()
                link      = (item.findtext("link")  or "").strip()
                pub       = (item.findtext("pubDate") or "").strip()
                # WWR encodes region in a <region> tag
                region_el = item.find("region")
                region    = (region_el.text or "Remote").strip() if region_el is not None else "Remote"

                # Title format: "Company Name | Job Title"
                company, title = "N/A", title_raw
                if " | " in title_raw:
                    parts   = title_raw.split(" | ", 1)
                    company = parts[0].strip()
                    title   = parts[1].strip()

                posted = "N/A"
                if pub:
                    try:
                        posted = parsedate_to_datetime(pub).strftime("%b %d, %Y")
                    except Exception:
                        posted = pub[:16]

                desc_html = (item.findtext("description") or "").strip()
                desc = BeautifulSoup(desc_html, "lxml").get_text(" ", strip=True)[:400] if desc_html else ""

                if title and title != "N/A":
                    jobs.append({
                        "title":       title,
                        "company":     company,
                        "location":    region,
                        "posted_date": posted,
                        "job_url":     link,
                        "description": desc,
                        "source":      "We Work Remotely",
                    })
            except Exception:
                continue
        return jobs
    except Exception as e:
        logger.debug("WWR error: %s", e)
        return []


# ══════════════════════════════════════════════════════════════════════════════
# Source 8 — Himalayas  (free JSON API, remote jobs, no auth)
# ══════════════════════════════════════════════════════════════════════════════

async def _fetch_himalayas(category: str) -> List[dict]:
    """
    Himalayas public jobs API — free JSON, no auth, remote-first jobs.
    https://himalayas.app/jobs/api/search?q={query}&limit=20
    """
    # No category → fetch latest jobs (omit q param)
    url = (
        f"https://himalayas.app/jobs/api/search?q={quote_plus(category)}&limit=20"
        if category else
        "https://himalayas.app/jobs/api?limit=20"
    )
    try:
        async with httpx.AsyncClient(headers=_JSON_HEADERS, follow_redirects=True, timeout=15) as c:
            r = await c.get(url)
            if r.status_code != 200:
                return []
            data = r.json()
        jobs = []
        for j in data.get("jobs", []):
            pub = j.get("createdAt") or j.get("publishedAt") or ""
            try:
                posted = datetime.fromisoformat(pub[:19]).strftime("%b %d, %Y")
            except Exception:
                posted = pub[:10] if pub else "N/A"

            # Location: prefer first named location, fall back to "Remote"
            locations = j.get("locations") or []
            loc_str   = locations[0].get("name") if locations else "Remote"

            company_obj = j.get("company") or {}
            company     = (
                company_obj.get("name") if isinstance(company_obj, dict)
                else j.get("companyName") or "N/A"
            )

            job_url = j.get("applicationLink") or j.get("url") or ""
            desc_raw = j.get("description") or j.get("shortDescription") or ""
            desc = BeautifulSoup(desc_raw, "lxml").get_text(" ", strip=True)[:400] if desc_raw else ""

            if j.get("title"):
                jobs.append({
                    "title":       j["title"],
                    "company":     company or "N/A",
                    "location":    loc_str or "Remote",
                    "posted_date": posted,
                    "job_url":     job_url,
                    "description": desc,
                    "source":      "Himalayas",
                })
        return jobs
    except Exception as e:
        logger.debug("Himalayas error: %s", e)
        return []


# ══════════════════════════════════════════════════════════════════════════════
# Source B — Greenhouse Job Board API  (free, no auth, per-company boards)
# ══════════════════════════════════════════════════════════════════════════════

# Curated list of popular companies using Greenhouse.
# Board tokens are the slug part of boards.greenhouse.io/{token}
# Edit this list freely — add/remove companies to taste.
_GREENHOUSE_BOARDS = [
    "airbnb",          "cloudflare",      "figma",           "notion",
    "discord",         "databricks",      "hashicorp",       "gitlab",
    "snyk",            "cockroachlabs",   "brex",            "gusto",
    "samsara",         "grammarly",       "airtable",        "doordash",
    "twitch",          "instacart",       "stripe",          "lyft",
    "okta",            "plaid",           "relativity",      "rivian",
]


def _title_matches_category(title: str, category: str) -> bool:
    """Check whether a job title is relevant to the search category.

    We split the category into keywords and require at least one to appear
    in the title. Empty categories match everything (general search).
    """
    if not category:
        return True
    title_lower = title.lower()
    keywords = [w for w in category.lower().split() if len(w) > 2]
    return any(kw in title_lower for kw in keywords)


async def _fetch_greenhouse(category: str, location: str) -> List[dict]:
    """
    Greenhouse Job Board API — public JSON, no auth required.
    Queries multiple company boards concurrently and keyword-filters the results.

    Endpoint: GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs
    Docs: https://developers.greenhouse.io/job-board.html
    """

    async def _query_board(client: httpx.AsyncClient, token: str) -> List[dict]:
        """Fetch one company board and return matching jobs."""
        url = f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs"
        try:
            r = await client.get(url, params={"content": "true"})
            if r.status_code != 200:
                return []
            data = r.json()
        except Exception:
            return []

        loc_lower = (location or "").lower()
        results: List[dict] = []
        for j in data.get("jobs", []):
            title = (j.get("title") or "").strip()
            if not title or not _title_matches_category(title, category):
                continue

            job_loc = ""
            loc_obj = j.get("location") or {}
            if isinstance(loc_obj, dict):
                job_loc = (loc_obj.get("name") or "").strip()
            elif isinstance(loc_obj, str):
                job_loc = loc_obj.strip()

            # If user specified a location, skip jobs that don't mention it
            if loc_lower and job_loc:
                if loc_lower not in job_loc.lower() and "remote" not in job_loc.lower():
                    continue

            # Posted date from updated_at
            updated = j.get("updated_at") or ""
            posted = "N/A"
            if updated:
                try:
                    posted = datetime.fromisoformat(updated[:19]).strftime("%b %d, %Y")
                except Exception:
                    posted = updated[:10]

            job_url = j.get("absolute_url") or ""

            # Description (HTML) — strip tags, truncate
            desc_html = j.get("content") or ""
            desc = BeautifulSoup(desc_html, "lxml").get_text(" ", strip=True)[:400] if desc_html else ""

            # Departments → industry
            depts = j.get("departments") or []
            industry = depts[0].get("name") if depts else None

            company_name = token.replace("-", " ").title()

            results.append({
                "title":        title,
                "company":      company_name,
                "location":     job_loc or "N/A",
                "posted_date":  posted,
                "job_url":      job_url,
                "description":  desc,
                "source":       "Greenhouse",
                "industry":     industry,
                "org_type":     _infer_org_type(company_name, "Greenhouse"),
                "company_size": None,
            })
        return results

    try:
        async with httpx.AsyncClient(
            headers=_JSON_HEADERS, follow_redirects=True, timeout=12,
        ) as client:
            board_results = await asyncio.gather(
                *[_query_board(client, token) for token in _GREENHOUSE_BOARDS],
                return_exceptions=True,
            )
        jobs: List[dict] = []
        for res in board_results:
            if isinstance(res, list):
                jobs.extend(res)
        logger.info("Greenhouse → %d jobs for %r across %d boards",
                     len(jobs), category, len(_GREENHOUSE_BOARDS))
        return jobs[:25]
    except Exception as e:
        logger.warning("Greenhouse error: %s", e)
        return []


# ══════════════════════════════════════════════════════════════════════════════
# Source C — Lever Postings API  (free, no auth, per-company boards)
# ══════════════════════════════════════════════════════════════════════════════

# Curated list of popular companies using Lever.
# Slugs are the part of jobs.lever.co/{slug}
_LEVER_COMPANIES = [
    "netflix",         "twilio",          "postman",         "webflow",
    "netlify",         "mux",             "flexport",        "benchling",
    "anduril",         "vercel",          "upstart",         "nerdwallet",
    "coursera",        "verkada",         "mashgin",         "palantir",
    "reddit",          "mckinsey",        "robinhood",       "openai",
]


async def _fetch_lever(category: str, location: str) -> List[dict]:
    """
    Lever Postings API — public JSON, no auth required.
    Queries multiple company slugs concurrently and keyword-filters the results.

    Endpoint: GET https://api.lever.co/v0/postings/{slug}?mode=json
    Docs: https://github.com/lever/postings-api
    """

    async def _query_company(client: httpx.AsyncClient, slug: str) -> List[dict]:
        """Fetch one company's postings and return matching jobs."""
        url = f"https://api.lever.co/v0/postings/{slug}"
        try:
            r = await client.get(url, params={"mode": "json"})
            if r.status_code != 200:
                return []
            data = r.json()
            if not isinstance(data, list):
                return []
        except Exception:
            return []

        loc_lower = (location or "").lower()
        results: List[dict] = []
        for j in data:
            title = (j.get("text") or "").strip()
            if not title or not _title_matches_category(title, category):
                continue

            cats = j.get("categories") or {}
            job_loc = (cats.get("location") or "").strip()

            # Location filter
            if loc_lower and job_loc:
                if loc_lower not in job_loc.lower() and "remote" not in job_loc.lower():
                    continue

            # Lever stores createdAt as Unix timestamp in milliseconds
            created = j.get("createdAt")
            posted = "N/A"
            if created and isinstance(created, (int, float)):
                try:
                    posted = datetime.fromtimestamp(created / 1000).strftime("%b %d, %Y")
                except Exception:
                    pass

            job_url  = j.get("hostedUrl") or j.get("applyUrl") or ""

            # Description
            desc_plain = (j.get("descriptionPlain") or "").strip()
            if not desc_plain:
                desc_html = j.get("description") or ""
                desc_plain = BeautifulSoup(desc_html, "lxml").get_text(" ", strip=True)[:400] if desc_html else ""
            else:
                desc_plain = desc_plain[:400]

            # Industry from department/team categories
            industry = cats.get("department") or cats.get("team") or None

            company_name = slug.replace("-", " ").title()

            results.append({
                "title":        title,
                "company":      company_name,
                "location":     job_loc or "N/A",
                "posted_date":  posted,
                "job_url":      job_url,
                "description":  desc_plain,
                "source":       "Lever",
                "industry":     industry,
                "org_type":     _infer_org_type(company_name, "Lever"),
                "company_size": None,
            })
        return results

    try:
        async with httpx.AsyncClient(
            headers=_JSON_HEADERS, follow_redirects=True, timeout=12,
        ) as client:
            company_results = await asyncio.gather(
                *[_query_company(client, slug) for slug in _LEVER_COMPANIES],
                return_exceptions=True,
            )
        jobs: List[dict] = []
        for res in company_results:
            if isinstance(res, list):
                jobs.extend(res)
        logger.info("Lever → %d jobs for %r across %d companies",
                     len(jobs), category, len(_LEVER_COMPANIES))
        return jobs[:25]
    except Exception as e:
        logger.warning("Lever error: %s", e)
        return []


# ══════════════════════════════════════════════════════════════════════════════
# Source A — USAJOBS  (official US federal government job board)
# ══════════════════════════════════════════════════════════════════════════════

async def _fetch_usajobs(
    category: str,
    location: str,
    date_range: str,
    remote: str = "no",
) -> List[dict]:
    """
    USAJOBS official API — US federal government jobs.
    Free to use; requires an API key from developer.usajobs.gov.

    All results are tagged:
      org_type     = "Government"
      company_size = "Large"   (federal agencies are always large organisations)
      industry     = derived from PositionSchedule / JobCategory

    Docs: https://developer.usajobs.gov/api-reference/
    Requires USAJOBS_API_KEY + USAJOBS_USER_AGENT (your email) in .env
    """
    api_key    = settings.USAJOBS_API_KEY
    user_agent = settings.USAJOBS_USER_AGENT
    if not api_key or not user_agent:
        return []

    params: dict = {
        "Keyword":        category or "",
        "ResultsPerPage": 25,
    }
    # DatePosted: USAJOBS accepts 1–60 days only. Cap larger ranges at 60.
    try:
        days = min(int(date_range), 60)
        if days > 0:
            params["DatePosted"] = days
    except (ValueError, TypeError):
        pass

    # Location filter
    if location.strip():
        if remote == "only":
            params["RemoteIndicator"] = "True"
        else:
            params["LocationName"] = location
            if remote == "include":
                params["RemoteIndicator"] = "True"
    elif remote == "only":
        params["RemoteIndicator"] = "True"

    # NOTE: Do NOT set Host explicitly — httpx sets it automatically from the URL.
    # USAJOBS requires User-Agent to be the registered email address.
    headers = {
        "User-Agent":        user_agent,
        "Authorization-Key": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(
                "https://data.usajobs.gov/api/search",
                params=params,
                headers=headers,
            )
            if r.status_code == 401:
                raise RuntimeError("USAJOBS 401 Unauthorised — check USAJOBS_API_KEY and USAJOBS_USER_AGENT")
            if r.status_code != 200:
                raise RuntimeError(f"USAJOBS HTTP {r.status_code}: {r.text[:200]}")
            data = r.json()

        total = data.get("SearchResult", {}).get("SearchResultCount", "?")
        logger.info("USAJOBS raw response: %s total hits for %r", total, category)

        items = (
            data.get("SearchResult", {})
                .get("SearchResultItems", [])
        )

        jobs: List[dict] = []
        for item in items:
            d = item.get("MatchedObjectDescriptor", {})

            title   = (d.get("PositionTitle") or "").strip()
            if not title:
                continue

            # Organisation / department
            org     = (d.get("OrganizationName") or d.get("DepartmentName") or "US Government").strip()

            # Location — prefer first named location
            locs    = d.get("PositionLocation") or []
            if locs:
                loc_str = locs[0].get("LocationName") or location or "USA"
            else:
                loc_str = "Remote" if d.get("RemoteIndicator") else (location or "USA")

            # Posted date (PublicationStartDate: "2024-01-15")
            pub_raw = d.get("PublicationStartDate") or ""
            posted  = "N/A"
            if pub_raw:
                try:
                    posted = datetime.fromisoformat(pub_raw[:10]).strftime("%b %d, %Y")
                except Exception:
                    posted = pub_raw[:10]

            # Apply URL — first ApplyURI or PositionURI
            apply_uris = d.get("ApplyURI") or []
            job_url    = apply_uris[0] if apply_uris else (d.get("PositionURI") or "")

            # Description — QualificationSummary or PositionFormattedDescription
            desc = ""
            qual = (d.get("QualificationSummary") or "").strip()
            if qual:
                desc = qual[:400]
            else:
                fmt_descs = d.get("PositionFormattedDescription") or []
                if fmt_descs:
                    raw_html = fmt_descs[0].get("Content") or ""
                    desc = BeautifulSoup(raw_html, "lxml").get_text(" ", strip=True)[:400]

            # Industry from JobCategory (e.g. "Information Technology Management")
            cats = d.get("JobCategory") or []
            industry = cats[0].get("Name") if cats else None

            jobs.append({
                "title":        title,
                "company":      org,
                "location":     loc_str,
                "posted_date":  posted,
                "job_url":      job_url,
                "description":  desc,
                "source":       "USAJOBS",
                "industry":     industry,
                "org_type":     "Government",
                "company_size": "Large",
            })

        logger.info("USAJOBS → %d jobs for %r", len(jobs), category)
        return jobs

    except httpx.RequestError as e:
        logger.warning("USAJOBS request error: %s", e)
        raise RuntimeError(f"USAJOBS network error: {e}")
    except RuntimeError:
        raise
    except Exception as e:
        logger.warning("USAJOBS unexpected error: %s", e)
        raise RuntimeError(f"USAJOBS error: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# Source 9 — Google Jobs  (last-resort fallback when all sources return 0)
# ══════════════════════════════════════════════════════════════════════════════

async def _scrape_google_jobs(
    category: str, location: str, remote: str = "no",
) -> List[dict]:
    """
    Scrape Google's job-search panel as a last-resort fallback.
    Parses JSON-LD structured data first, then visible HTML job cards.
    Returns [] gracefully on bot-detection.
    """
    parts = [category, "jobs"]
    if location:
        parts.append(f"in {location}")
    if remote == "only":
        parts.append("remote")
    query = " ".join(filter(None, parts))
    url   = f"https://www.google.com/search?q={quote_plus(query)}&ibp=htl;jobs&num=20"

    headers = {
        **_HEADERS,
        "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Encoding":           "gzip, deflate, br",
        "DNT":                       "1",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest":            "document",
        "Sec-Fetch-Mode":            "navigate",
        "Sec-Fetch-Site":            "none",
    }

    try:
        async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=20) as c:
            r = await c.get(url)
            if r.status_code != 200:
                return []
            html = r.text
    except httpx.RequestError as e:
        logger.debug("Google Jobs request error: %s", e)
        return []

    lo = html.lower()
    if any(k in lo for k in ("recaptcha", "detected unusual traffic", "verify you're a human")):
        logger.info("Google Jobs: bot-detection page received")
        return []

    soup = BeautifulSoup(html, "lxml")
    jobs: List[dict] = []

    # Method A: JSON-LD structured data
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data  = json.loads(script.string or "[]")
            items = data if isinstance(data, list) else [data]
            for item in items:
                if not isinstance(item, dict):
                    continue
                if item.get("@type") in ("JobPosting", "jobPosting"):
                    job = _jsonld_to_job(item, location)
                    if job:
                        jobs.append(job)
                for node in item.get("@graph", []):
                    if isinstance(node, dict) and node.get("@type") in ("JobPosting", "jobPosting"):
                        job = _jsonld_to_job(node, location)
                        if job:
                            jobs.append(job)
        except Exception:
            continue

    # Method B: visible HTML job cards
    if not jobs:
        cards = []
        for sel in ["li.iFjolb", "div.gws-plugins-horizon-jobs__tl-lif",
                    "div[jsname='MRfBf']", "div.PwjeAc"]:
            cards = soup.select(sel)
            if cards:
                break
        for card in cards[:20]:
            try:
                t = card.select_one("div.BjJfJf, div.sH3zFd")
                if not t:
                    continue
                co = card.select_one("div.vNEEBe, div.hiDeQb")
                lo = card.select_one("div.Qk80Jf, div.nJlQNd")
                title   = t.get_text(strip=True)
                company = co.get_text(strip=True) if co else "N/A"
                loc_str = lo.get_text(strip=True) if lo else (location or "N/A")
                jobs.append({
                    "title": title, "company": company, "location": loc_str,
                    "posted_date": "N/A",
                    "job_url": f"https://www.google.com/search?q={quote_plus(title+' '+company+' jobs')}&ibp=htl;jobs",
                    "description": "", "source": "Google Jobs",
                })
            except Exception:
                continue

    return jobs[:20]


def _jsonld_to_job(data: dict, fallback_loc: str = "") -> Optional[dict]:
    title = (data.get("title") or "").strip()
    if not title:
        return None
    org     = data.get("hiringOrganization") or {}
    company = (org.get("name") or "N/A").strip() if isinstance(org, dict) else "N/A"
    ld      = data.get("jobLocation") or {}
    if isinstance(ld, list):
        ld = ld[0] if ld else {}
    addr = (ld.get("address") or {}) if isinstance(ld, dict) else {}
    if isinstance(addr, dict):
        city  = addr.get("addressLocality") or ""
        state = addr.get("addressRegion") or ""
        loc_str = f"{city}, {state}".strip(", ") or fallback_loc or "N/A"
    elif isinstance(addr, str):
        loc_str = addr
    else:
        loc_str = fallback_loc or "N/A"
    if (data.get("jobLocationType") or "") == "TELECOMMUTE":
        loc_str = "Remote"
    dp     = data.get("datePosted") or ""
    posted = "N/A"
    if dp:
        try:
            posted = datetime.fromisoformat(dp[:10]).strftime("%b %d, %Y")
        except Exception:
            posted = dp[:10]
    job_url  = data.get("url") or data.get("@id") or ""
    desc_raw = data.get("description") or ""
    desc     = BeautifulSoup(desc_raw, "lxml").get_text(" ", strip=True)[:400] if desc_raw else ""
    return {"title": title, "company": company, "location": loc_str,
            "posted_date": posted, "job_url": job_url, "description": desc,
            "source": "Google Jobs"}
