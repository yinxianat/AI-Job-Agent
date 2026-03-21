"""
Excel export utilities.
Saves job search results and resume tracker to .xlsx files.
"""

import io
from typing import List
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter


# ── Colour palette ─────────────────────────────────────────────────────────────
HEADER_FILL  = PatternFill("solid", fgColor="2563EB")   # brand blue
ALT_FILL     = PatternFill("solid", fgColor="EFF6FF")   # light blue
HEADER_FONT  = Font(bold=True, color="FFFFFF", size=11)
THIN_BORDER  = Border(
    left=Side(style="thin", color="D1D5DB"),
    right=Side(style="thin", color="D1D5DB"),
    top=Side(style="thin", color="D1D5DB"),
    bottom=Side(style="thin", color="D1D5DB"),
)


def _style_header_row(ws, num_cols: int):
    for col in range(1, num_cols + 1):
        cell = ws.cell(row=1, column=col)
        cell.fill   = HEADER_FILL
        cell.font   = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = THIN_BORDER
    ws.row_dimensions[1].height = 28


def _style_data_rows(ws, num_rows: int, num_cols: int):
    for row in range(2, num_rows + 2):
        fill = ALT_FILL if row % 2 == 0 else None
        for col in range(1, num_cols + 1):
            cell = ws.cell(row=row, column=col)
            if fill:
                cell.fill = fill
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            cell.border    = THIN_BORDER


def jobs_to_excel(jobs: List[dict]) -> bytes:
    """Convert a list of job dicts to an in-memory Excel file (bytes)."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Job Results"

    headers = ["Title", "Company", "Location", "Posted Date", "Job URL", "Company URL", "Description"]
    ws.append(headers)

    for job in jobs:
        ws.append([
            job.get("title",       ""),
            job.get("company",     ""),
            job.get("location",    ""),
            job.get("posted_date", ""),
            job.get("job_url",     ""),
            job.get("company_url", ""),
            job.get("description", ""),
        ])

    _style_header_row(ws, len(headers))
    _style_data_rows(ws, len(jobs), len(headers))

    # Set column widths
    col_widths = [35, 25, 20, 15, 55, 45, 60]
    for i, width in enumerate(col_widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width

    # Freeze header
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


def resume_tracker_to_excel(entries: List[dict]) -> bytes:
    """Build an Excel tracker for tailored resumes."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Resume Tracker"

    headers = ["Resume Filename", "Job Title", "Company", "Location", "Job URL", "Company Description", "Created At"]
    ws.append(headers)

    for e in entries:
        ws.append([
            e.get("filename",            ""),
            e.get("job_title",           ""),
            e.get("company",             ""),
            e.get("location",            ""),
            e.get("job_url",             ""),
            e.get("company_description", ""),
            str(e.get("created_at",      "")),
        ])

    _style_header_row(ws, len(headers))
    _style_data_rows(ws, len(entries), len(headers))

    col_widths = [40, 30, 25, 20, 55, 60, 20]
    for i, width in enumerate(col_widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width

    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


def batch_tracker_to_excel(entries: List[dict]) -> bytes:
    """Excel tracker for a batch generation run — includes cover letter filenames."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Batch Tracker"

    headers = [
        "Resume Filename", "Cover Letter Filename", "Job Title", "Company",
        "Location", "Job URL", "Company Description", "Status",
    ]
    ws.append(headers)

    STATUS_COLOR = {
        "done":       "D1FAE5",
        "error":      "FEE2E2",
        "pending":    "FEF9C3",
        "processing": "DBEAFE",
    }

    for row_idx, e in enumerate(entries, start=2):
        ws.append([
            e.get("filename",              ""),
            e.get("cover_letter_filename", ""),
            e.get("job_title",             ""),
            e.get("company",               ""),
            e.get("location",              ""),
            e.get("job_url",               ""),
            e.get("company_description",   ""),
            e.get("status",                ""),
        ])
        status = e.get("status", "")
        color  = STATUS_COLOR.get(status, "FFFFFF")
        ws.cell(row=row_idx, column=8).fill = PatternFill("solid", fgColor=color)

    _style_header_row(ws, len(headers))

    for row in range(2, len(entries) + 2):
        for col in range(1, len(headers) + 1):
            cell = ws.cell(row=row, column=col)
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            cell.border    = THIN_BORDER

    col_widths = [40, 42, 28, 25, 20, 55, 60, 12]
    for i, width in enumerate(col_widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width

    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


def assessment_to_excel(assessments: list) -> bytes:
    """
    Build a styled Excel workbook with full job match assessment data.

    Columns (sorted best → worst by match score):
      Job Title | Company | Location | Posted Date | Match Score | Match Level |
      How to Apply | Job URL | Strengths | Weaknesses | Key Skills to Develop |
      Recommendation | Job Description
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Match Assessment"

    SCORE_COLORS = {
        "Excellent": "D1FAE5",   # green-100
        "Strong":    "DBEAFE",   # blue-100
        "Good":      "FEF9C3",   # yellow-100
        "Fair":      "FED7AA",   # orange-100
        "Weak":      "FEE2E2",   # red-100
    }

    # ── Sort completed assessments by match_score descending; pending/failed at end ──
    def _sort_key(a):
        score = a.get("match_score")
        return (-score if isinstance(score, (int, float)) else 1, a.get("title", ""))

    sorted_assessments = sorted(assessments, key=_sort_key)

    # ── Column definitions ────────────────────────────────────────────────────
    headers = [
        "Rank",
        "Job Title",
        "Company",
        "Location",
        "Posted Date",
        "Match Score",
        "Match Level",
        "How to Apply",
        "Job URL",
        "Strengths",
        "Weaknesses / Gaps",
        "Key Skills to Develop",
        "Recommendation",
        "Job Description",
    ]
    ws.append(headers)
    _style_header_row(ws, len(headers))
    ws.row_dimensions[1].height = 36

    # ── Data rows ─────────────────────────────────────────────────────────────
    for rank, a in enumerate(sorted_assessments, start=1):
        job_url     = a.get("job_url",     "") or ""
        company_url = a.get("company_url", "") or ""
        score       = a.get("match_score", "")
        level       = a.get("match_level", "") or ""

        # Build "How to Apply" text
        if job_url:
            how_to_apply = (
                f"1. Click the Job URL to go directly to the job posting.\n"
                f"2. Follow the application instructions on the page.\n"
            )
            if company_url and company_url != job_url:
                how_to_apply += f"3. You may also apply via the company website: {company_url}"
        elif company_url:
            how_to_apply = (
                f"1. Visit the company website: {company_url}\n"
                f"2. Search for this role in their Careers section and apply there."
            )
        else:
            how_to_apply = "No direct apply link available. Search for this role on LinkedIn, Indeed, or the company website."

        ws.append([
            rank,
            a.get("title",       ""),
            a.get("company",     ""),
            a.get("location",    ""),
            a.get("posted_date", ""),
            score,
            level,
            how_to_apply,
            job_url,
            "\n".join(f"• {s}" for s in a.get("strengths",             [])),
            "\n".join(f"• {w}" for w in a.get("weaknesses",            [])),
            "\n".join(f"• {k}" for k in a.get("key_skills_to_develop", [])),
            a.get("recommendation", ""),
            a.get("description",    ""),
        ])

        row_idx = rank + 1
        color   = SCORE_COLORS.get(level, "FFFFFF")

        for col in range(1, len(headers) + 1):
            cell = ws.cell(row=row_idx, column=col)
            cell.fill      = PatternFill("solid", fgColor=color)
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            cell.border    = THIN_BORDER

        # Rank: centered, small
        ws.cell(row=row_idx, column=1).alignment = Alignment(horizontal="center", vertical="center")
        ws.cell(row=row_idx, column=1).font      = Font(bold=True, size=10, color="6B7280")

        # Score: large, bold
        score_cell       = ws.cell(row=row_idx, column=6)
        score_cell.font  = Font(bold=True, size=13)
        score_cell.alignment = Alignment(horizontal="center", vertical="center")

        # Level: centered
        ws.cell(row=row_idx, column=7).alignment = Alignment(horizontal="center", vertical="top")

        # Job URL: hyperlink
        if job_url:
            url_cell       = ws.cell(row=row_idx, column=9)
            url_cell.value = job_url
            url_cell.hyperlink = job_url
            url_cell.font  = Font(color="2563EB", underline="single", size=10)

        # Row height: taller for description rows
        ws.row_dimensions[row_idx].height = 80

    # ── Column widths ────────────────────────────────────────────────────────
    col_widths = [
        6,    # Rank
        30,   # Job Title
        24,   # Company
        18,   # Location
        14,   # Posted Date
        13,   # Match Score
        13,   # Match Level
        52,   # How to Apply
        42,   # Job URL
        50,   # Strengths
        50,   # Weaknesses
        42,   # Key Skills
        60,   # Recommendation
        70,   # Job Description
    ]
    for i, width in enumerate(col_widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width

    ws.freeze_panes = "B2"   # freeze rank col + header

    # ── Legend sheet ────────────────────────────────────────────────────────
    legend_ws = wb.create_sheet("Legend")
    legend_ws.append(["Match Level", "Score Range", "What it means", "Action"])
    legend_data = [
        ("Excellent", "85–100", "Very strong fit — your profile closely matches this role",    "Apply immediately with high confidence"),
        ("Strong",    "70–84",  "Good fit — likely to land an interview with a tailored resume","Apply — tailor your resume to the JD keywords"),
        ("Good",      "55–69",  "Decent fit — some gaps exist but role is reachable",          "Apply — address gaps in your cover letter"),
        ("Fair",      "40–54",  "Partial fit — significant gaps in skills or experience",      "Consider applying after quick skill-building"),
        ("Weak",      "0–39",   "Poor fit — major gaps between your profile and requirements", "Develop missing skills before applying"),
    ]
    for row in legend_data:
        legend_ws.append(list(row))
    _style_header_row(legend_ws, 4)
    for row_idx, (level, *_) in enumerate(legend_data, start=2):
        color = SCORE_COLORS.get(level, "FFFFFF")
        for col in range(1, 5):
            cell = legend_ws.cell(row=row_idx, column=col)
            cell.fill      = PatternFill("solid", fgColor=color)
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            cell.border    = THIN_BORDER
        legend_ws.row_dimensions[row_idx].height = 36
    for i, w in enumerate([16, 14, 62, 52], start=1):
        legend_ws.column_dimensions[get_column_letter(i)].width = w

    # ── How to Apply sheet (tips) ────────────────────────────────────────────
    tips_ws = wb.create_sheet("How to Apply Tips")
    tips_ws.append(["Step", "Tip"])
    _style_header_row(tips_ws, 2)
    tips = [
        ("1 — Tailor your resume",       "For each job, update your resume to mirror the exact keywords and phrases in the job description. Focus on the skills listed under 'Requirements'."),
        ("2 — Write a targeted cover letter", "Address the hiring manager by name if possible. Open with why you are excited about this specific company and role."),
        ("3 — Apply via Job URL",         "Use the Job URL column to go directly to the listing. Apply on the company's own careers page when possible — it often reaches HR faster than third-party boards."),
        ("4 — Follow up",                "If you have not heard back within 1–2 weeks, send a brief, polite follow-up email referencing your application date and role title."),
        ("5 — Track your applications",  "Use a spreadsheet or ATS tool to log: company, role, date applied, status, and any interview dates or notes."),
        ("6 — Prioritise by score",       "Start with Excellent and Strong matches — you are most likely to get calls back here. Use Fair/Weak listings as stretch opportunities."),
    ]
    for step, tip in tips:
        tips_ws.append([step, tip])
    for row_idx in range(2, len(tips) + 2):
        tips_ws.cell(row=row_idx, column=1).font      = Font(bold=True, size=10)
        tips_ws.cell(row=row_idx, column=1).fill      = ALT_FILL
        tips_ws.cell(row=row_idx, column=1).border    = THIN_BORDER
        tips_ws.cell(row=row_idx, column=1).alignment = Alignment(vertical="top", wrap_text=True)
        tips_ws.cell(row=row_idx, column=2).border    = THIN_BORDER
        tips_ws.cell(row=row_idx, column=2).alignment = Alignment(vertical="top", wrap_text=True)
        tips_ws.row_dimensions[row_idx].height = 54
    tips_ws.column_dimensions["A"].width = 30
    tips_ws.column_dimensions["B"].width = 90

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()
