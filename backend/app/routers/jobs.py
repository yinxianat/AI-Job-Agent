import asyncio
import csv
import io
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models.job import Job
from ..schemas.jobs import (
    JobSearchRequest, SearchTaskResponse, TaskStatusResponse,
    JobMatchRequest, JobMatchResponse, MatchedJobResult,
)
from ..services import scraper_service, excel_service, claude_service
from .auth import get_current_user

# ── Column name aliases (lowercase, stripped) ───────────────────────────────
_TITLE_ALIASES   = {"job title", "title", "position", "role", "job name", "job_title"}
_COMPANY_ALIASES = {"company", "company name", "employer", "organization", "company_name"}
_DESC_ALIASES    = {"job description", "description", "details", "jd", "job_description"}
_LOC_ALIASES     = {"location", "city", "office", "city/state", "job location"}
_URL_ALIASES     = {"url", "link", "job url", "website", "company website", "job link",
                    "job_url", "company_url", "apply link", "apply url"}

def _normalize_header(headers: list[str]) -> dict[str, int]:
    """Return {field: col_index} for recognised columns."""
    mapping = {}
    for i, h in enumerate(headers):
        key = h.strip().lower()
        if key in _TITLE_ALIASES:   mapping.setdefault("title",       i)
        if key in _COMPANY_ALIASES: mapping.setdefault("company",     i)
        if key in _DESC_ALIASES:    mapping.setdefault("description", i)
        if key in _LOC_ALIASES:     mapping.setdefault("location",    i)
        if key in _URL_ALIASES:     mapping.setdefault("url",         i)
    return mapping


def _row_to_job(row: list[str], col_map: dict[str, int]) -> dict | None:
    """Convert a row list to a job dict; return None if no title found."""
    def get(field):
        idx = col_map.get(field)
        return row[idx].strip() if idx is not None and idx < len(row) else ""
    title = get("title")
    if not title:
        return None
    return {
        "title":       title,
        "company":     get("company"),
        "description": get("description"),
        "location":    get("location"),
        "url":         get("url"),
        "posted_date": "",
        "source":      "spreadsheet",
    }

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("/search", response_model=SearchTaskResponse)
async def start_search(
    payload:     JobSearchRequest,
    background:  BackgroundTasks,
    db:          AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    task_id = scraper_service.create_task()

    background.add_task(
        scraper_service.run_search,
        task_id,
        payload.categories,   # may be empty list → general search
        payload.location,
        payload.date_range,
        payload.radius,
        payload.remote,
    )

    return SearchTaskResponse(task_id=task_id, status="running")


@router.get("/task/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(
    task_id:     str,
    db:          AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    task = scraper_service.get_task(task_id)
    if task["status"] == "not_found":
        raise HTTPException(status_code=404, detail="Task not found")

    # Persist completed results to DB (once only)
    if task["status"] == "completed" and task.get("results"):
        existing = await db.execute(
            select(Job).where(Job.task_id == task_id).limit(1)
        )
        if not existing.scalar_one_or_none():
            for j in task["results"]:
                db.add(Job(
                    user_id     = current_user.id,
                    task_id     = task_id,
                    title       = j.get("title", ""),
                    company     = j.get("company", ""),
                    location    = j.get("location", ""),
                    posted_date = j.get("posted_date", ""),
                    job_url     = j.get("job_url", ""),
                    company_url = j.get("company_url"),
                    description = j.get("description"),
                ))
            await db.commit()

    return TaskStatusResponse(
        task_id = task_id,
        status  = task["status"],
        results = task.get("results"),
        error   = task.get("error"),
    )


@router.get("/export/{task_id}")
async def export_jobs_excel(
    task_id:     str,
    current_user = Depends(get_current_user),
):
    task = scraper_service.get_task(task_id)
    if task["status"] != "completed":
        raise HTTPException(status_code=400, detail="Task not completed yet")

    xlsx_bytes = excel_service.jobs_to_excel(task.get("results", []))
    return Response(
        content    = xlsx_bytes,
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers    = {"Content-Disposition": f"attachment; filename=jobs_{task_id[:8]}.xlsx"},
    )


@router.post("/match", response_model=JobMatchResponse)
async def match_jobs(
    payload:     JobMatchRequest,
    current_user = Depends(get_current_user),
):
    """
    Score each job in payload.jobs against the candidate profile + wishes.
    Returns scores (0-100) and a short reason per job.
    Handles Claude overload / rate-limit errors with specific messages.
    """
    if not payload.jobs:
        raise HTTPException(status_code=400, detail="No jobs provided to score.")

    raw_scores, error_msg, error_type = await claude_service.score_jobs(
        jobs    = payload.jobs,
        profile = payload.profile,
        wishes  = payload.wishes,
    )

    if error_msg:
        # Return a structured response with the error — frontend handles display
        return JobMatchResponse(results=[], error=error_msg, error_type=error_type)

    results = []
    for item in raw_scores:
        try:
            results.append(MatchedJobResult(
                job_index = int(item["index"]),
                score     = max(0, min(100, int(item["score"]))),
                reason    = str(item.get("reason", "")),
            ))
        except (KeyError, ValueError, TypeError):
            continue

    return JobMatchResponse(results=results)


@router.post("/parse-spreadsheet")
async def parse_spreadsheet(
    file: UploadFile = File(...),
    current_user = Depends(get_current_user),
):
    """
    Parse an uploaded XLSX, XLS, or CSV file and return a list of job objects.
    Expected columns (case-insensitive): Job Title, Company, Job Description,
    Location, URL / Website  (all except Job Title are optional).
    """
    filename = (file.filename or "").lower()
    content  = await file.read()

    jobs: list[dict] = []

    if filename.endswith(".csv"):
        # ── CSV ────────────────────────────────────────────────────────────────
        try:
            text = content.decode("utf-8-sig")   # handle BOM
        except UnicodeDecodeError:
            text = content.decode("latin-1")
        reader = csv.reader(io.StringIO(text))
        rows   = list(reader)
        if not rows:
            raise HTTPException(status_code=422, detail="CSV file is empty.")
        headers = rows[0]
        col_map = _normalize_header(headers)
        if "title" not in col_map:
            raise HTTPException(
                status_code=422,
                detail="Could not find a 'Job Title' column. "
                       "Please include a column named 'Job Title', 'Title', or 'Position'.",
            )
        for row in rows[1:]:
            job = _row_to_job(row, col_map)
            if job:
                jobs.append(job)

    elif filename.endswith((".xlsx", ".xls")):
        # ── Excel ──────────────────────────────────────────────────────────────
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
            ws = wb.active
            rows = list(ws.iter_rows(values_only=True))
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Could not read Excel file: {exc}")

        if not rows:
            raise HTTPException(status_code=422, detail="Excel file is empty.")

        headers = [str(c) if c is not None else "" for c in rows[0]]
        col_map = _normalize_header(headers)
        if "title" not in col_map:
            raise HTTPException(
                status_code=422,
                detail="Could not find a 'Job Title' column. "
                       "Please include a column named 'Job Title', 'Title', or 'Position'.",
            )
        for row in rows[1:]:
            row_strs = [str(c) if c is not None else "" for c in row]
            job = _row_to_job(row_strs, col_map)
            if job:
                jobs.append(job)
    else:
        raise HTTPException(
            status_code=422,
            detail="Unsupported file type. Please upload a .xlsx, .xls, or .csv file.",
        )

    if not jobs:
        raise HTTPException(status_code=422, detail="No jobs found in the spreadsheet. Check that rows have a Job Title.")

    return {"jobs": jobs, "count": len(jobs)}
