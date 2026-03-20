"""
Job scraper — multi-source strategy
=====================================
All five sources are attempted concurrently on every search.
Google Jobs is the last-resort fallback if all five return 0.

Sources
-------
1. Indeed RSS       – stable XML feed, no JS rendering needed
2. The Muse API     – free JSON API, professional/tech jobs, location-aware
3. Remotive API     – free JSON API, remote tech jobs (always queried)
4. RemoteOK API     – free JSON API, remote tech jobs (always queried)
5. Arbeit Now API   – free JSON API, broad job coverage, location-aware

Fallback (only when all 5 return 0):
6. Google Jobs scraper – JSON-LD parsing + HTML card fallback,
                         returns [] gracefully on bot-detection

Each job dict carries a "source" field so the UI can show provenance.
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


# ── Public task API ────────────────────────────────────────────────────────────

def create_task() -> str:
    tid = str(uuid.uuid4())
    _tasks[tid] = {"status": "pending", "results": [], "error": None, "sources": {}}
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

        seen:    set             = set()
        merged:  List[dict]      = []
        sources: Dict[str, int]  = {}

        for cat, result in zip(search_cats, per_cat):
            if isinstance(result, Exception):
                logger.warning("Category %r raised: %s", cat, result)
                continue
            jobs_list, src_counts = result
            for job in jobs_list:
                url = job.get("job_url", "")
                if url and url in seen:
                    continue
                seen.add(url)
                job["search_category"] = cat
                merged.append(job)
            for k, v in src_counts.items():
                sources[k] = sources.get(k, 0) + v

        _tasks[task_id]["status"]  = "completed"
        _tasks[task_id]["results"] = merged[:100]
        _tasks[task_id]["sources"] = sources
        logger.info("Done: %d jobs. Sources: %s", len(merged), sources)

    except Exception as exc:
        logger.error("run_search error: %s", exc, exc_info=True)
        _tasks[task_id]["status"] = "failed"
        _tasks[task_id]["error"]  = str(exc)


# ── Per-category orchestrator ─────────────────────────────────────────────────

async def _search_category(
    category: str,
    location: str,
    date_range: str,
    radius: int,
    remote: str,
) -> Tuple[List[dict], Dict[str, int]]:
    """
    Run ALL sources concurrently.
    Remotive and RemoteOK are always queried (not just for remote searches)
    so there is always at least some fallback when Indeed/Muse are blocked.
    Falls back to Google only if every source returns 0.
    """
    # ── All 5 sources run concurrently every time ─────────────────────────────
    source_fns = {
        "Indeed":    _scrape_indeed_rss(category, location, date_range, radius, remote),
        "The Muse":  _fetch_the_muse(category, location),
        "Remotive":  _fetch_remotive(category),
        "RemoteOK":  _fetch_remote_ok(category),
        "Arbeit Now": _fetch_arbeit_now(category, location),
    }

    labels  = list(source_fns.keys())
    results = await asyncio.gather(*source_fns.values(), return_exceptions=True)

    jobs:    List[dict]     = []
    sources: Dict[str, int] = {}
    seen:    set            = set()

    for label, res in zip(labels, results):
        if isinstance(res, Exception):
            logger.warning("Source %r error: %s", label, res)
            sources[label] = 0
            continue
        sources[label] = len(res)
        logger.info("  %s → %d jobs", label, len(res))
        for job in res:
            url = job.get("job_url", "")
            if not url or url not in seen:
                seen.add(url)
                jobs.append(job)

    # ── Google fallback only when all above are 0 ────────────────────────────
    if not jobs:
        logger.info("All sources returned 0 for %r — trying Google Jobs", category)
        google = await _scrape_google_jobs(category, location, remote)
        sources["Google Jobs"] = len(google)
        jobs.extend(google)
        if google:
            logger.info("  Google Jobs → %d jobs", len(google))

    return jobs, sources


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
    async with httpx.AsyncClient(headers=_RSS_HEADERS, follow_redirects=True, timeout=25) as c:
        for start in range(0, 30, 10):
            try:
                resp = await c.get(f"{base}&start={start}")
                if resp.status_code != 200:
                    break
                page = _parse_indeed_rss(resp.text)
                if not page:
                    break
                jobs.extend(page)
                if len(jobs) >= 30:
                    break
                await asyncio.sleep(0.8)
            except httpx.RequestError as e:
                logger.debug("Indeed RSS request error: %s", e)
                break
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
                return []
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
        logger.debug("The Muse error: %s", e)
        return []


# ══════════════════════════════════════════════════════════════════════════════
# Source 3 — Remotive  (free JSON API, remote tech jobs)
# ══════════════════════════════════════════════════════════════════════════════

async def _fetch_remotive(category: str) -> List[dict]:
    if not category:
        return []
    url = f"https://remotive.com/api/remote-jobs?search={quote_plus(category)}&limit=20"
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
    if not category:
        return []
    tag = category.lower().replace(" ", "-").replace("/", "-")
    url = f"https://remoteok.io/api?tag={quote_plus(tag)}&limit=20"
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
# Source 6 — Google Jobs  (last-resort fallback when all 5 return 0)
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
