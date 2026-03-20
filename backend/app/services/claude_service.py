"""
Claude AI integration for resume tailoring, cover letter generation,
and AI-powered job match scoring.
Uses the Anthropic Python SDK with the claude-opus-4-6 model.
"""

import json
import logging
import re
from typing import List, Dict, Any, Tuple, Optional

import anthropic
from ..config import settings

log = logging.getLogger(__name__)

_client: anthropic.AsyncAnthropic | None = None


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


# ── Resume tailoring ───────────────────────────────────────────────────────────

TAILOR_SYSTEM_PROMPT = """You are an elite resume writer and ATS optimisation specialist with 15+ years of experience
helping candidates land interviews at top companies.

Your single most important goal: maximise keyword overlap between the resume and the job description
so the resume passes ATS filters and resonates immediately with human reviewers.

STEP 1 — KEYWORD EXTRACTION (do this mentally before writing):
Scan the job description and extract every important term:
  • Required and preferred technical skills (tools, languages, frameworks, platforms, methodologies)
  • Soft skills explicitly named (e.g. "cross-functional collaboration", "stakeholder management")
  • Domain vocabulary (industry-specific terms, product areas, business metrics)
  • Action verbs used in the JD (e.g. "drive", "scale", "architect", "partner with")
  • Exact job title and any close variants

STEP 2 — AGGRESSIVE KEYWORD INTEGRATION (rewrite every section with these in mind):
  • Rephrase every bullet to embed the JD's exact keywords and phrases wherever truthful
    — prefer the JD's wording over synonyms (e.g. if the JD says "machine learning pipelines",
    use that exact phrase, not "ML workflows")
  • Every required skill mentioned in the JD that the candidate possesses MUST appear somewhere
    in the resume — in bullets, the skills section, or both
  • Mirror the JD's seniority language (if the JD says "lead", bullets should say "led")
  • Put the most JD-relevant bullets FIRST within each role
  • Reorder sections so the most relevant ones appear near the top
  • The SKILLS section must list every JD keyword the candidate has, using the JD's exact
    capitalisation and terminology (e.g. "React.js" not "ReactJS" if that's what the JD uses)

CONTENT RULES:
  • Preserve ALL factual information (dates, job titles, companies, education, certifications)
  • Never fabricate skills or experience the candidate does not have
  • Use strong action verbs and quantifiable achievements; add metrics from the original if present
  • STRICT LENGTH LIMIT: Resume MUST fit within 2 pages. Trim the least-relevant bullets to stay
    within the limit. Keep at least 2 bullets per role; prioritise recent and most-relevant experience.

STRICT FORMATTING RULES (must follow exactly):
- Section headers: ALL CAPS (e.g. EXPERIENCE, EDUCATION, SKILLS)
- Accomplishments and responsibilities: ALWAYS use bullet points starting with •
  Never use paragraphs for describing job duties — every accomplishment gets its own bullet
- Job/education entry headers: Job title and company MUST be on the SAME line as the date,
  separated from the date by at least 4 spaces.
  Example: "Senior Software Engineer | Acme Corp    Jan 2021 – Present"
  Example: "B.S. Computer Science | State University    2015 – 2019"
  The renderer will automatically bold the job title, company name, and date — do NOT add
  any markdown bold markers (**). Just output plain text in the format above.
- Date format: "Mon YYYY – Mon YYYY" or "Mon YYYY – Present" (e.g. "Jan 2020 – Mar 2023")
- Output ONLY the final resume text — no markdown, no code fences, no explanatory notes"""


async def tailor_resume(
    resume_text: str,
    job_title: str,
    company: str,
    location: str,
    job_description: str,
    extra_skills: str = "",
    job_log: str = "",
    home_location: str = "",
) -> str:
    """Tailor the resume for a specific job, optionally injecting extra skills/keywords and job log."""
    client = get_client()

    skills_section = (
        f"\n=== CANDIDATE'S ADDITIONAL SKILLS & KEYWORDS TO HIGHLIGHT ===\n{extra_skills}"
        if extra_skills.strip() else ""
    )
    job_log_section = (
        f"\n=== CANDIDATE'S JOB HISTORY & WORK ACCOMPLISHMENTS LOG ===\n"
        f"(Use this supplemental data to enrich and strengthen the resume)\n{job_log}"
        if job_log.strip() else ""
    )
    home_location_section = (
        f"\n=== CANDIDATE HOME LOCATION ===\n{home_location.strip()}"
        if home_location.strip() else ""
    )

    user_message = f"""Tailor the resume below for maximum keyword match with this job.

=== TARGET JOB ===
Title:    {job_title}
Company:  {company}
Location: {location}

=== JOB DESCRIPTION (extract every keyword from this) ===
{job_description}
{skills_section}
{job_log_section}
{home_location_section}

=== ORIGINAL RESUME ===
{resume_text}

Instructions:
1. Extract all keywords, skills, tools, methodologies, and domain terms from the job description.
2. Rewrite every bullet to embed the JD's exact keywords wherever the candidate's experience supports it.
3. Ensure the SKILLS section lists every JD keyword the candidate has, using the JD's exact phrasing.
4. Prioritise the most JD-relevant bullets first within each role.
5. If a CANDIDATE HOME LOCATION is provided, include it in the contact line at the top of the resume (e.g. "City, State | email | phone").
6. Keep the resume to 2 pages maximum.
Output ONLY the resume — no preamble, no commentary."""

    response = await client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=2500,
        system=TAILOR_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )
    return response.content[0].text


# ── Multi-resume synthesis + tailoring ────────────────────────────────────────

MULTI_RESUME_TAILOR_SYSTEM_PROMPT = """You are an elite resume writer and ATS optimisation specialist with 15+ years of experience
helping candidates land interviews at top companies.

The candidate has provided MULTIPLE resume versions. Your task:
1. Consolidate ALL unique roles, projects, skills, and achievements across every resume (no omissions)
2. Synthesise into ONE unified resume
3. Aggressively tailor it for the target job with maximum keyword match

STEP 1 — KEYWORD EXTRACTION (do this mentally before writing):
Scan the job description and extract every important term:
  • Required and preferred technical skills (tools, languages, frameworks, platforms, methodologies)
  • Soft skills explicitly named (e.g. "cross-functional collaboration", "stakeholder management")
  • Domain vocabulary (industry-specific terms, product areas, business metrics)
  • Action verbs used in the JD (e.g. "drive", "scale", "architect", "partner with")
  • Exact job title and any close variants

STEP 2 — AGGRESSIVE KEYWORD INTEGRATION:
  • Rephrase every bullet to embed the JD's exact keywords and phrases wherever truthful
    — prefer the JD's wording over synonyms (e.g. if the JD says "machine learning pipelines",
    use that exact phrase, not "ML workflows")
  • Every required skill the candidate has MUST appear in the resume — in bullets AND the skills section
  • Mirror the JD's seniority language; put the most JD-relevant bullets FIRST within each role
  • The SKILLS section must use the JD's exact capitalisation/terminology for each skill
  • Where different resume versions describe the same role, keep the most detailed version and
    rewrite its bullets to maximise JD keyword coverage

CONTENT RULES:
  • Include ALL distinct roles and experiences from every resume (no omissions)
  • Preserve ALL factual information (dates, job titles, companies, education, certifications)
  • Never fabricate skills or experience the candidate does not have
  • Use strong action verbs and quantifiable achievements
  • STRICT LENGTH LIMIT: Resume MUST fit within 2 pages. Trim least-relevant bullets to stay
    within the limit. Keep at least 2 bullets per role; prioritise recent and most-relevant experience.

STRICT FORMATTING RULES (must follow exactly):
- Section headers: ALL CAPS (e.g. EXPERIENCE, EDUCATION, SKILLS)
- Accomplishments and responsibilities: ALWAYS use bullet points starting with •
  Never use paragraphs for describing job duties — every accomplishment gets its own bullet
- Job/education entry headers: Job title and company MUST be on the SAME line as the date,
  separated from the date by at least 4 spaces.
  Example: "Senior Software Engineer | Acme Corp    Jan 2021 – Present"
  Example: "B.S. Computer Science | State University    2015 – 2019"
  The renderer will automatically bold the job title, company name, and date — do NOT add
  any markdown bold markers (**). Just output plain text in the format above.
- Date format: "Mon YYYY – Mon YYYY" or "Mon YYYY – Present" (e.g. "Jan 2020 – Mar 2023")
- Output ONLY the final resume text — no markdown, no code fences, no explanatory notes"""


async def tailor_resume_from_multiple(
    resume_texts: List[str],
    job_title: str,
    company: str,
    location: str,
    job_description: str,
    extra_skills: str = "",
    job_log: str = "",
    home_location: str = "",
) -> str:
    """Combine info from multiple resumes and tailor into one optimised resume for the specific job."""
    client = get_client()

    skills_section = (
        f"\n=== CANDIDATE'S ADDITIONAL SKILLS & KEYWORDS TO HIGHLIGHT ===\n{extra_skills}"
        if extra_skills.strip() else ""
    )
    job_log_section = (
        f"\n=== CANDIDATE'S JOB HISTORY & WORK ACCOMPLISHMENTS LOG ===\n"
        f"(Use this supplemental data to enrich and strengthen the resume)\n{job_log}"
        if job_log.strip() else ""
    )
    home_location_section = (
        f"\n=== CANDIDATE HOME LOCATION ===\n{home_location.strip()}"
        if home_location.strip() else ""
    )

    resumes_block = "\n\n".join(
        f"=== RESUME {i + 1} of {len(resume_texts)} ===\n{text}"
        for i, text in enumerate(resume_texts)
    )

    user_message = f"""Synthesise the {len(resume_texts)} resumes below into ONE resume with maximum keyword match for this job.

=== TARGET JOB ===
Title:    {job_title}
Company:  {company}
Location: {location}

=== JOB DESCRIPTION (extract every keyword from this) ===
{job_description}
{skills_section}
{job_log_section}
{home_location_section}

{resumes_block}

Instructions:
1. Consolidate ALL unique roles, skills, and achievements from every resume (no omissions).
2. Extract all keywords, skills, tools, methodologies, and domain terms from the job description.
3. Rewrite every bullet to embed the JD's exact keywords wherever the candidate's experience supports it.
4. Ensure the SKILLS section lists every JD keyword the candidate has, using the JD's exact phrasing.
5. Prioritise the most JD-relevant bullets first within each role.
6. If a CANDIDATE HOME LOCATION is provided, include it in the contact line at the top of the resume (e.g. "City, State | email | phone").
7. Keep the resume to 2 pages maximum.
Output ONLY the resume — no preamble, no commentary, no explanation of what you combined."""

    response = await client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=2500,
        system=MULTI_RESUME_TAILOR_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )
    return response.content[0].text


# ── Cover letter generation ────────────────────────────────────────────────────

COVER_LETTER_SYSTEM_PROMPT = """You are an expert career coach who writes compelling, personalised cover letters.

Guidelines:
- Write a professional cover letter of 3-4 paragraphs (approx 300-400 words)
- Opening: express genuine interest in the specific role and company
- Body paragraph 1: match 2-3 key skills/achievements from the resume to the job requirements
- Body paragraph 2: demonstrate knowledge of the company culture/mission and explain why you are a great fit
- Closing: confident call-to-action, thank the reader
- Use first-person, confident, professional tone
- Do NOT use generic filler phrases like "I am writing to express my interest..."
- Output ONLY the cover letter text (no subject line, no markdown)
- Start directly with "Dear Hiring Manager," or a specific name if available"""


async def generate_cover_letter(
    resume_text: str,
    job_title: str,
    company: str,
    location: str,
    job_description: str,
    company_description: str = "",
    extra_skills: str = "",
) -> str:
    """Generate a tailored cover letter for a specific job application."""
    client = get_client()

    company_context = (
        f"\n=== COMPANY BACKGROUND ===\n{company_description}"
        if company_description.strip() else ""
    )
    skills_context = (
        f"\n=== CANDIDATE'S KEY SKILLS TO FEATURE ===\n{extra_skills}"
        if extra_skills.strip() else ""
    )

    user_message = f"""Write a compelling cover letter for this job application.

=== JOB DETAILS ===
Title:    {job_title}
Company:  {company}
Location: {location}

=== JOB DESCRIPTION ===
{job_description}
{company_context}
{skills_context}

=== CANDIDATE'S RESUME (for reference) ===
{resume_text}

Write the cover letter now. Output only the letter text."""

    response = await client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=1024,
        system=COVER_LETTER_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )
    return response.content[0].text


# ── Company research ───────────────────────────────────────────────────────────

COMPANY_RESEARCH_PROMPT = """You are a concise business researcher.
Given a company name and job title, write a 2-3 sentence description of the company:
what they do, their industry, approximate size/stage, and any notable culture or values.
Be factual and professional. Output ONLY the description, no preamble."""


async def infer_job_info(description: str) -> Dict[str, str]:
    """Extract job title and company name from a job description.
    Returns a dict with 'job_title' and 'company' keys (empty string if not found)."""
    client = get_client()
    response = await client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=128,
        system=(
            "You are a parser. Extract the job title and company name from the job description. "
            "Return ONLY a JSON object with exactly two keys: \"job_title\" and \"company\". "
            "Use your best guess if not explicitly stated. Never leave both blank — infer from context. "
            "Example: {\"job_title\": \"Senior Software Engineer\", \"company\": \"Acme Corp\"}"
        ),
        messages=[{"role": "user", "content": description[:3000]}],
    )
    try:
        raw = response.content[0].text.strip()
        # Strip markdown fences if present
        raw = re.sub(r"^```[a-z]*\n?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
        data = json.loads(raw)
        return {
            "job_title": str(data.get("job_title") or "").strip(),
            "company":   str(data.get("company")   or "").strip(),
        }
    except Exception:
        return {"job_title": "", "company": ""}


async def research_company(company: str, job_title: str) -> str:
    """Return a short company description for the resume tracker and cover letter context."""
    client = get_client()
    response = await client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=256,
        system=COMPANY_RESEARCH_PROMPT,
        messages=[{
            "role": "user",
            "content": f"Company: {company}\nRole being applied for: {job_title}"
        }],
    )
    return response.content[0].text


# ── Job match scoring ─────────────────────────────────────────────────────────

SCORE_SYSTEM_PROMPT = """You are a senior career advisor and talent-matching expert.
Your job is to evaluate how well each job listing fits a candidate based on:
1. Alignment between the job requirements and the candidate's resume / skills / experience
2. Alignment with the candidate's stated career wishes and goals
3. Industry / seniority fit

Return ONLY a valid JSON array — no markdown fences, no commentary — in this exact format:
[
  {"index": 0, "score": 85, "reason": "Strong match: your 5-yr Python background directly maps to the role's core requirement; the AI/ML focus aligns with your stated interest in machine-learning roles."},
  ...
]

Scoring guide:
90-100 = Exceptional fit — almost every requirement matches
75-89  = Strong fit — most key requirements match
60-74  = Good fit — solid overlap with some gaps
40-59  = Moderate fit — some relevant experience, notable gaps
20-39  = Weak fit — limited overlap
0-19   = Poor fit — significant mismatch

Keep each reason to 1-2 sentences; be specific about WHY it scores that way."""


async def score_jobs(
    jobs: List[Dict[str, Any]],
    profile: str = "",
    wishes: str = "",
) -> Tuple[List[Dict[str, Any]], Optional[str], Optional[str]]:
    """
    Score each job against the candidate profile + wishes using Claude.

    Returns:
        (scored_jobs, error_message, error_type)
        scored_jobs: list of dicts with index, score, reason
        error_message: human-readable string if an error occurred, else None
        error_type: "overloaded" | "rate_limit" | "api_error" | None
    """
    if not jobs:
        return [], None, None

    client = get_client()

    # Build candidate profile block
    profile_lines = []
    if profile.strip():
        profile_lines.append(f"=== CANDIDATE PROFILE / RESUME ===\n{profile.strip()[:3000]}")
    if wishes.strip():
        profile_lines.append(f"=== WHAT THE CANDIDATE IS LOOKING FOR ===\n{wishes.strip()[:500]}")
    if not profile_lines:
        profile_lines.append("=== CANDIDATE PROFILE ===\n(No profile provided — score purely on job quality and general desirability.)")

    candidate_block = "\n\n".join(profile_lines)

    # Build jobs block — cap description at 300 chars per job to stay within tokens
    jobs_block_lines = []
    for i, job in enumerate(jobs):
        desc = (job.get("description") or "")[:300].replace("\n", " ")
        jobs_block_lines.append(
            f"Job {i} | Title: {job.get('title','N/A')} | Company: {job.get('company','N/A')} "
            f"| Location: {job.get('location','N/A')}\nDescription: {desc or 'No description available.'}"
        )
    jobs_block = "\n\n".join(jobs_block_lines)

    user_message = f"""{candidate_block}

=== JOBS TO SCORE ({len(jobs)} total) ===
{jobs_block}

Score every job (indexes 0 to {len(jobs)-1}) for this candidate.
Return ONLY the JSON array."""

    try:
        response = await client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=4096,
            system=SCORE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        raw = response.content[0].text.strip()

        # Strip markdown fences if Claude included them anyway
        raw = re.sub(r"^```[a-z]*\n?", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\n?```$", "", raw, flags=re.IGNORECASE)

        parsed = json.loads(raw)
        return parsed, None, None

    except anthropic.APIStatusError as exc:
        if exc.status_code == 529:
            msg = (
                "Claude API is currently overloaded. Your usage credits may also be exhausted. "
                "Please wait a few minutes and try again when your credits are renewed."
            )
            log.warning("Claude overloaded (529) during job scoring: %s", exc)
            return [], msg, "overloaded"
        if exc.status_code == 429:
            msg = (
                "Claude API rate limit reached — you may have run out of credits for this period. "
                "Please wait for your credit allowance to renew and try again."
            )
            log.warning("Claude rate-limited (429) during job scoring: %s", exc)
            return [], msg, "rate_limit"
        log.error("Claude API error during job scoring: %s", exc)
        return [], f"Claude API error ({exc.status_code}): {exc.message}", "api_error"

    except anthropic.APIConnectionError as exc:
        log.error("Claude connection error: %s", exc)
        return [], "Could not reach the Claude API. Check your internet connection and try again.", "api_error"

    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        log.error("Failed to parse Claude score response: %s", exc)
        return [], "Received an unexpected response from Claude. Please try again.", "api_error"
