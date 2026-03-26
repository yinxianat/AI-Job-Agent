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
        json_str = _extract_json_object(raw)
        data = json.loads(json_str)
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


# ── Job match assessment ────────────────────────────────────────────────────────

ASSESSMENT_SYSTEM_PROMPT = """You are a seasoned career coach and hiring manager with deep expertise in evaluating candidate-job fit.
Analyse the candidate's profile against the job posting and return a concise, honest assessment in JSON.

Rules:
- Be specific and factual — reference actual skills/experiences from the resume
- Be constructive — weaknesses should be actionable improvement areas
- match_score must be an integer 0-100 based on genuine keyword, experience, and skills alignment
- match_level must map exactly: 85-100 = Excellent, 70-84 = Strong, 55-69 = Good, 40-54 = Fair, 0-39 = Weak
- strengths: 3-5 bullets of concrete reasons this candidate is competitive for this role
- weaknesses: 3-5 bullets of honest gaps or missing qualifications
- key_skills_to_develop: 2-4 specific skills/tools the candidate should build to become more competitive
- recommendation: 2-3 sentences of overall honest career advice for applying to this role
- Output ONLY valid JSON — no markdown, no code fences, no preamble"""


async def assess_job_match(
    resume_text: str,
    job_title: str,
    company: str,
    job_description: str,
    extra_skills: str = "",
) -> dict:
    """Assess how well a candidate's resume/skills match a job posting."""
    client = get_client()

    skills_section = (
        f"\n=== CANDIDATE EXTRA SKILLS & KEYWORDS ===\n{extra_skills}"
        if extra_skills.strip() else ""
    )
    desc_section = (
        f"\n=== JOB DESCRIPTION ===\n{job_description[:3000]}"
        if job_description.strip() else "\n(No job description provided — assess based on title and company only.)"
    )

    user_message = f"""Assess this candidate's fit for the job below.

=== CANDIDATE RESUME ===
{resume_text[:4000]}
{skills_section}

=== TARGET JOB ===
Title:   {job_title}
Company: {company}
{desc_section}

Return ONLY this JSON structure:
{{
  "match_score": <integer 0-100>,
  "match_level": "<Excellent|Strong|Good|Fair|Weak>",
  "strengths": ["<specific strength 1>", "<specific strength 2>", "..."],
  "weaknesses": ["<specific gap 1>", "<specific gap 2>", "..."],
  "key_skills_to_develop": ["<skill 1>", "<skill 2>", "..."],
  "recommendation": "<2-3 sentences of honest advice>"
}}"""

    try:
        response = await client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=800,
            system=ASSESSMENT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        raw = response.content[0].text.strip()
        json_str = _extract_json_object(raw)
        return json.loads(json_str)
    except Exception as exc:
        log.error("Assessment error for %s @ %s: %s", job_title, company, exc)
        return {
            "match_score": 0,
            "match_level": "Unknown",
            "strengths": [],
            "weaknesses": [],
            "key_skills_to_develop": [],
            "recommendation": f"Assessment unavailable: {exc}",
        }


# ── Job category suggestions ───────────────────────────────────────────────────

_SUGGEST_SYSTEM = """You are a career taxonomy expert. Given any job-related input (a title,
partial phrase, or keyword), return a structured JSON object with:
  "family"     : short job family / department name (2-4 words, e.g. "Software Engineering")
  "titles"     : array of 5-8 specific, real-world job titles closely related to the input
  "categories" : array of 3-6 broader search categories that would surface these jobs on job boards

CRITICAL: Output ONLY the raw JSON object — no markdown fences, no ```json, no explanatory text
before or after the JSON. Start your response with { and end with }."""


def _extract_json_object(text: str) -> str:
    """
    Extract the first complete JSON object from text.

    Strategy (in order):
    1. Try json.loads on the whole stripped text — works when Claude follows instructions.
    2. Strip markdown code fences (```json ... ```) and retry json.loads.
    3. Walk character-by-character tracking brace depth while skipping quoted strings,
       so that { / } inside string values don't confuse the counter.

    Raises ValueError if no valid JSON object can be extracted.
    """
    stripped = text.strip()

    # Strategy 1: direct parse (Claude followed the "start with {" instruction)
    try:
        json.loads(stripped)
        return stripped
    except (json.JSONDecodeError, ValueError):
        pass

    # Strategy 2: strip markdown fences
    fence_stripped = re.sub(r'^```(?:json)?\s*', '', stripped, flags=re.IGNORECASE)
    fence_stripped = re.sub(r'\s*```\s*$', '', fence_stripped).strip()
    try:
        json.loads(fence_stripped)
        return fence_stripped
    except (json.JSONDecodeError, ValueError):
        pass

    # Strategy 3: string-aware brace-depth scanning
    start = text.find('{')
    if start == -1:
        raise ValueError("No JSON object found in response")

    depth = 0
    in_string = False
    escape_next = False
    end = start

    for i, ch in enumerate(text[start:], start):
        if escape_next:
            escape_next = False
            continue
        if ch == '\\' and in_string:
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if not in_string:
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
            if depth == 0:
                end = i
                break

    if depth != 0:
        raise ValueError("Unclosed JSON object in response")

    candidate = text[start:end + 1]
    # Validate the extracted slice is actually parseable
    json.loads(candidate)
    return candidate


async def suggest_job_categories(input_text: str) -> Dict[str, Any]:
    """
    Use Claude Haiku to suggest related job titles and search categories for a given input.
    Returns a dict with keys: family (str), titles (list[str]), categories (list[str]).
    On any error returns an empty structure.
    """
    client = get_client()
    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=_SUGGEST_SYSTEM,
            messages=[{
                "role": "user",
                "content": f'Suggest job family, titles, and search categories for: "{input_text}"',
            }],
        )
        raw = response.content[0].text.strip()
        # Robustly extract the JSON object regardless of surrounding prose or fences
        json_str = _extract_json_object(raw)
        data = json.loads(json_str)
        return {
            "family":     str(data.get("family", "")),
            "titles":     [str(t) for t in data.get("titles", [])],
            "categories": [str(c) for c in data.get("categories", [])],
        }
    except Exception as exc:
        log.warning("suggest_job_categories error for %r: %s", input_text, exc)
        return {"family": "", "titles": [], "categories": []}


# ── Profile-based job category suggestions ─────────────────────────────────────

_PROFILE_SUGGEST_SYSTEM = """You are a senior career counsellor and talent-market analyst.
Analyse the candidate profile provided and return the top 10–15 most relevant job SEARCH CATEGORIES
that this person should explore, ranked by how well they match the candidate's skills, experience,
and stated career goals.

Return ONLY a valid JSON object with a single key "suggestions" — an array sorted descending by score:
{
  "suggestions": [
    {
      "category":  "<job search keyword / category, e.g. 'Data Engineer'>",
      "score":     <integer 0-100>,
      "reason":    "<1-2 sentences: specific skills/experiences from the profile that make this a strong match>",
      "titles":    ["<related job title 1>", "<related job title 2>", ...]
    },
    ...
  ]
}

Scoring guide:
90-100 = Perfect match — core skills & experience align almost entirely
75-89  = Strong match — most key skills present, very relevant background
60-74  = Good match — solid overlap, transferable experience
40-59  = Moderate match — some relevant skills, career pivot potential
20-39  = Adjacent — limited but notable overlap

Rules:
- categories must be specific enough to be useful job board search keywords (not "Technology" — use "Full Stack Engineer" or "Cloud Architect")
- titles should be 3-5 real-world job titles the candidate could realistically target
- reason must reference SPECIFIC skills, technologies, or experiences from the profile
- Sort the array by score descending (highest first)
- CRITICAL: Output ONLY the raw JSON object. Start with { and end with }."""


async def suggest_categories_from_profile(
    resume_texts: List[str],
    extra_skills: str = "",
    job_log: str = "",
    wishes: str = "",
) -> List[Dict[str, Any]]:
    """
    Analyse the candidate's full profile (resumes + skills + goals) and return
    a list of job search categories ranked by match score.

    Returns list of dicts: {category, score, reason, titles}, sorted desc by score.
    On error returns an empty list.
    """
    client = get_client()

    # Build the profile block
    parts: List[str] = []

    if resume_texts:
        for i, text in enumerate(resume_texts):
            label = f"RESUME {i + 1}" if len(resume_texts) > 1 else "RESUME"
            parts.append(f"=== {label} ===\n{text[:4000]}")

    if extra_skills.strip():
        parts.append(f"=== ADDITIONAL SKILLS & KEYWORDS ===\n{extra_skills.strip()[:1000]}")

    if job_log.strip():
        parts.append(f"=== WORK HISTORY & ACCOMPLISHMENTS LOG ===\n{job_log.strip()[:2000]}")

    if wishes.strip():
        parts.append(f"=== WHAT I AM LOOKING FOR ===\n{wishes.strip()[:500]}")

    if not parts:
        return []

    profile_block = "\n\n".join(parts)

    log.info(
        "suggest_categories_from_profile: profile has %d resume(s), skills=%r, log=%r, wishes=%r",
        len(resume_texts),
        bool(extra_skills.strip()),
        bool(job_log.strip()),
        bool(wishes.strip()),
    )

    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=_PROFILE_SUGGEST_SYSTEM,
            messages=[{
                "role": "user",
                "content": (
                    f"Analyse this candidate profile and return ranked job category suggestions:\n\n"
                    f"{profile_block}"
                ),
            }],
        )
        raw = response.content[0].text.strip()
        log.info("suggest_categories_from_profile raw response (first 300 chars): %r", raw[:300])

        json_str = _extract_json_object(raw)
        data = json.loads(json_str)
        suggestions = data.get("suggestions", [])
        log.info("suggest_categories_from_profile: got %d suggestions from Claude", len(suggestions))

        # Normalise and sort
        result = []
        for s in suggestions:
            cat = str(s.get("category", "")).strip()
            if not cat:
                continue
            result.append({
                "category": cat,
                "score":    max(0, min(100, int(s.get("score", 0)))),
                "reason":   str(s.get("reason", "")).strip(),
                "titles":   [str(t) for t in s.get("titles", [])],
            })
        result.sort(key=lambda x: x["score"], reverse=True)
        return result
    except Exception as exc:
        log.error("suggest_categories_from_profile error: %s", exc, exc_info=True)
        raise  # Let the caller handle and report the error to the frontend


# ── Company discovery ─────────────────────────────────────────────────────────

DISCOVER_COMPANIES_PROMPT = """You are a local business research assistant. Given a location and radius, return a JSON array of notable companies that have offices or headquarters within that area.

RULES:
- Return 20-40 companies, prioritising larger employers and well-known tech/business companies
- Include a MIX of company sizes: large enterprises, mid-size, and notable startups
- Include companies from diverse industries: tech, finance, healthcare, retail, manufacturing, etc.
- For each company provide:
  - "name": exact legal/brand name (e.g. "Stripe" not "Stripe Inc")
  - "website": main company website (e.g. "https://stripe.com")
  - "career_url": direct link to their careers/jobs page (e.g. "https://stripe.com/jobs")
  - "industry": short industry label (e.g. "Fintech", "Cloud Computing", "Healthcare")
  - "greenhouse_slug": if you know they use Greenhouse for hiring, provide the board token (the slug in boards.greenhouse.io/{slug}). Otherwise null.
  - "lever_slug": if you know they use Lever for hiring, provide the company slug (the slug in jobs.lever.co/{slug}). Otherwise null.

For greenhouse_slug and lever_slug, ONLY provide values you are confident about. It is better to leave them null than guess wrong. Common known slugs:
- Greenhouse: airbnb, cloudflare, figma, notion, discord, databricks, stripe, lyft, doordash, gitlab, hashicorp, snyk, brex, gusto, samsara, grammarly, airtable, instacart, plaid, okta, rivian, cockroachlabs, relativity, twitch
- Lever: netflix, twilio, postman, webflow, netlify, anduril, vercel, upstart, nerdwallet, coursera, verkada, palantir, reddit, mckinsey, robinhood, openai, mux, flexport, benchling, mashgin

CRITICAL: Output ONLY the raw JSON array. Start with [ and end with ]. No commentary."""


async def discover_companies(location: str, radius: int = 25) -> List[Dict[str, Any]]:
    """
    Use Claude to discover notable companies near a location.
    Returns a list of company dicts with name, website, career_url, industry,
    and optional greenhouse_slug / lever_slug.
    """
    client = get_client()

    user_msg = f"Find notable companies with offices within {radius} miles of {location}."

    try:
        resp = await client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=4000,
            system=DISCOVER_COMPANIES_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )
        raw = resp.content[0].text.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)

        data = json.loads(raw)
        if not isinstance(data, list):
            log.warning("discover_companies: expected list, got %s", type(data).__name__)
            return []

        companies = []
        for c in data:
            if not isinstance(c, dict) or not c.get("name"):
                continue
            companies.append({
                "name":            str(c.get("name", "")).strip(),
                "website":         str(c.get("website") or "").strip() or None,
                "career_url":      str(c.get("career_url") or "").strip() or None,
                "industry":        str(c.get("industry") or "").strip() or None,
                "greenhouse_slug": str(c.get("greenhouse_slug") or "").strip() or None,
                "lever_slug":      str(c.get("lever_slug") or "").strip() or None,
            })
        return companies

    except Exception as exc:
        log.error("discover_companies error: %s", exc, exc_info=True)
        raise
