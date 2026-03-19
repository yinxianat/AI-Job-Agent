import os
import json
import uuid
import asyncio
from typing import Annotated, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse, Response, StreamingResponse
from starlette.datastructures import UploadFile as StarletteUploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models.job import ResumeEntry
from ..schemas.resume import TailorResponse
from ..services import resume_service, claude_service, excel_service
from .auth import get_current_user

router = APIRouter(prefix="/api/resume", tags=["resume"])

ALLOWED_EXTENSIONS     = {".pdf", ".docx", ".doc"}
JOB_LOG_EXTENSIONS     = {".pdf", ".docx", ".doc", ".xlsx", ".xls", ".txt", ".csv"}

# ── In-memory batch task store ────────────────────────────────────────────────
# Structure: { task_id: { status, total, done, jobs: [...] } }
_batch_tasks: Dict[str, dict] = {}


# ── Single/multi resume tailor endpoint ───────────────────────────────────────

@router.post("/tailor", response_model=TailorResponse)
async def tailor_resume(
    # No Form()/File() params here — we read the entire multipart body ourselves
    # below via request.form(). Mixing Request with Form() causes FastAPI to
    # pre-consume the body, making file entries invisible in a second .form() call.
    request:     Request,
    db:          AsyncSession = Depends(get_db),
    current_user              = Depends(get_current_user),
):
    try:
        # Parse the entire multipart body once.
        # multi_items() returns every (key, value) pair; UploadFile objects are
        # file entries, strings are regular form fields.
        form = await request.form()
        items = list(form.multi_items())

        def fget(key: str, default: str = "") -> str:
            """Return the first string value for a form key."""
            for k, v in items:
                if k == key and isinstance(v, str):
                    return v
            return default

        def ffiles(key: str):
            """Return all UploadFile values for a form key.
            Must check StarletteUploadFile (the base class) not fastapi.UploadFile
            (a subclass) — Starlette's form parser instantiates the base class,
            so isinstance(..., fastapi.UploadFile) would incorrectly return False."""
            return [v for k, v in items if k == key and isinstance(v, StarletteUploadFile) and (v.filename or "").strip()]

        output_folder = fget("output_folder")
        job_title     = fget("job_title")
        company       = fget("company")
        location      = fget("location")
        job_url       = fget("job_url")
        description   = fget("description")
        extra_skills  = fget("extra_skills")
        home_location = fget("home_location")
        job_log_text  = fget("job_log_text")
        resume_files  = ffiles("resume_files")
        job_log_files = ffiles("job_log_files")

        # Manual validation of required fields
        if not resume_files:
            raise HTTPException(status_code=422, detail="Please upload at least one resume file")
        if not description.strip():
            raise HTTPException(status_code=422, detail="description is required")

        # Validate resume file extensions
        for rf in resume_files:
            ext = os.path.splitext(rf.filename or "")[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                raise HTTPException(status_code=400, detail=f"Unsupported resume file: {rf.filename} ({ext})")

        # Extract text from each uploaded resume
        resume_texts = []
        for rf in resume_files:
            file_bytes = await rf.read()
            text = resume_service.extract_resume_text(file_bytes, rf.filename or "")
            if text.strip():
                resume_texts.append(text)

        if not resume_texts:
            raise HTTPException(status_code=422, detail="Could not extract text from any of the uploaded resumes.")

        # Build combined job log text from typed text + uploaded files
        job_log_parts = [job_log_text.strip()] if job_log_text.strip() else []
        for jf in job_log_files:
            # Skip sentinel/empty entries (browser may send empty UploadFile)
            fname = (jf.filename or "").strip()
            if not fname or fname == "undefined":
                continue
            ext = os.path.splitext(fname)[1].lower()
            if ext not in JOB_LOG_EXTENSIONS:
                continue
            jf_bytes = await jf.read()
            if not jf_bytes:
                continue
            jf_text = resume_service.extract_job_log_text(jf_bytes, fname)
            if jf_text.strip():
                job_log_parts.append(f"[From file: {fname}]\n{jf_text.strip()}")
        job_log = "\n\n".join(job_log_parts)

        # Tailor: combine multiple resumes or tailor a single one
        if len(resume_texts) == 1:
            tailored_text = await claude_service.tailor_resume(
                resume_texts[0], job_title, company, location, description,
                extra_skills, job_log, home_location,
            )
        else:
            tailored_text = await claude_service.tailor_resume_from_multiple(
                resume_texts, job_title, company, location, description,
                extra_skills, job_log, home_location,
            )

        # If the user didn't supply title/company, ask Claude to infer them
        if not job_title.strip() or not company.strip():
            inferred = await claude_service.infer_job_info(description)
            if not job_title.strip():
                job_title = inferred["job_title"]
            if not company.strip():
                company = inferred["company"]

        # Run company research + cover letter generation concurrently
        async def _gen_cover_letter() -> str:
            if not description.strip():
                return ""
            return await claude_service.generate_cover_letter(
                tailored_text, job_title, company, location, description,
                company_description="", extra_skills=extra_skills,
            )

        company_description, cover_letter_text = await asyncio.gather(
            claude_service.research_company(company, job_title),
            _gen_cover_letter(),
        )

        filename = resume_service.build_filename(job_title, location, company)

        # Only save files to disk when an output folder is specified
        cover_letter_pdf_path  = None
        cover_letter_docx_path = None
        if output_folder.strip():
            docx_path, pdf_path = resume_service.save_tailored_resume(
                tailored_text, output_folder.strip(), job_title, location, company
            )
            if cover_letter_text:
                cover_letter_docx_path, cover_letter_pdf_path = resume_service.save_cover_letter(
                    cover_letter_text, output_folder.strip(), job_title, location, company
                )
        else:
            docx_path, pdf_path = None, None

        db.add(ResumeEntry(
            user_id=current_user.id, filename=filename, job_title=job_title,
            company=company, location=location, job_url=job_url,
            company_description=company_description, pdf_path=pdf_path or "", docx_path=docx_path or "",
        ))
        await db.commit()

        return TailorResponse(
            filename=filename,
            job_url=job_url or None,
            company_description=company_description,
            pdf_path=pdf_path,
            docx_path=docx_path,
            tailored_text=tailored_text,
            cover_letter_text=cover_letter_text or None,
            cover_letter_pdf_path=cover_letter_pdf_path,
            cover_letter_docx_path=cover_letter_docx_path,
        )

    except HTTPException:
        raise   # re-raise FastAPI HTTP errors as-is
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Unhandled error in /tailor: %s", exc)
        raise HTTPException(status_code=500, detail=f"Server error: {exc}")


# ── Batch generation ──────────────────────────────────────────────────────────

@router.post("/batch-start")
async def batch_start(
    request:    Request,
    background: BackgroundTasks,
    db:         AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Start an async batch job to tailor resumes + generate cover letters
    for a list of selected job postings.
    Accepts multiple resume files, optional job description context, and
    optional job log (text + files) via multipart/form-data.
    """
    form  = await request.form()
    items = list(form.multi_items())

    def fget(key: str, default: str = "") -> str:
        for k, v in items:
            if k == key and isinstance(v, str):
                return v
        return default

    def ffiles(key: str):
        return [
            v for k, v in items
            if k == key and isinstance(v, StarletteUploadFile) and (v.filename or "").strip()
        ]

    output_folder    = fget("output_folder")
    extra_skills     = fget("extra_skills")
    home_location    = fget("home_location")      # optional: candidate's city, state
    jobs_json        = fget("jobs_json")
    job_description  = fget("job_description")   # optional: supplemental JD context
    job_log_text     = fget("job_log_text")       # optional: work history notes

    resume_files  = ffiles("resume_files")
    job_log_files = ffiles("job_log_files")

    if not resume_files:
        raise HTTPException(status_code=422, detail="Please upload at least one resume file.")
    if not output_folder.strip():
        raise HTTPException(status_code=422, detail="output_folder is required.")

    # Extract text from all resume files
    resume_texts: List[str] = []
    for rf in resume_files:
        ext = os.path.splitext(rf.filename or "")[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Unsupported resume file: {ext}")
        file_bytes = await rf.read()
        text = resume_service.extract_resume_text(file_bytes, rf.filename or "")
        if text.strip():
            resume_texts.append(text)

    if not resume_texts:
        raise HTTPException(status_code=422, detail="Could not extract text from resume(s).")

    # Build job log from text + uploaded files
    job_log_parts: List[str] = []
    if job_log_text.strip():
        job_log_parts.append(job_log_text.strip())
    for lf in job_log_files:
        try:
            lf_bytes = await lf.read()
            lf_text  = resume_service.extract_job_log_text(lf_bytes, lf.filename or "")
            if lf_text.strip():
                job_log_parts.append(lf_text.strip())
        except Exception:
            pass
    job_log = "\n\n".join(job_log_parts)

    # Append any supplemental job description context to extra_skills block
    if job_description.strip():
        extra_skills = (extra_skills + "\n\n=== SUPPLEMENTAL JOB DESCRIPTION CONTEXT ===\n" + job_description.strip()).strip()

    try:
        jobs = json.loads(jobs_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid jobs JSON")

    if not jobs:
        raise HTTPException(status_code=400, detail="No jobs provided")

    task_id = str(uuid.uuid4())
    _batch_tasks[task_id] = {
        "status":  "running",
        "total":   len(jobs),
        "done":    0,
        "jobs":    [
            {
                "title":          j.get("title",       ""),
                "company":        j.get("company",     ""),
                "location":       j.get("location",    ""),
                "job_url":        j.get("job_url",     ""),
                "description":    j.get("description", ""),
                "status":         "pending",   # pending | processing | done | error
                "resume_filename":         "",
                "cover_letter_filename":   "",
                "company_description":     "",
                "resume_pdf_path":         "",
                "resume_docx_path":        "",
                "cover_letter_pdf_path":   "",
                "cover_letter_docx_path":  "",
                "error":          "",
            }
            for j in jobs
        ],
    }

    background.add_task(
        _run_batch,
        task_id=task_id,
        resume_texts=resume_texts,
        output_folder=output_folder,
        extra_skills=extra_skills,
        job_log=job_log,
        home_location=home_location,
        user_id=current_user.id,
    )

    return {"task_id": task_id, "total": len(jobs)}


@router.get("/batch-status/{task_id}")
async def batch_status(task_id: str, current_user=Depends(get_current_user)):
    task = _batch_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Batch task not found")
    return task


@router.get("/batch-export/{task_id}")
async def batch_export_excel(task_id: str, current_user=Depends(get_current_user)):
    """Download an Excel tracker for a completed batch task."""
    task = _batch_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    data = [
        {
            "filename":                   j.get("resume_filename", ""),
            "cover_letter_filename":      j.get("cover_letter_filename", ""),
            "job_title":                  j.get("title",   ""),
            "company":                    j.get("company", ""),
            "location":                   j.get("location",""),
            "job_url":                    j.get("job_url", ""),
            "company_description":        j.get("company_description", ""),
            "status":                     j.get("status",  ""),
        }
        for j in task.get("jobs", [])
    ]

    xlsx_bytes = excel_service.batch_tracker_to_excel(data)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=resume_batch_{task_id[:8]}.xlsx"},
    )


# ── Background worker ─────────────────────────────────────────────────────────

async def _run_batch(
    task_id: str,
    resume_texts: List[str],
    output_folder: str,
    extra_skills: str,
    job_log: str,
    home_location: str = "",
    user_id: int = 0,
):
    """Process each job sequentially: tailor resume + cover letter + save files."""
    task = _batch_tasks[task_id]
    for i, job in enumerate(task["jobs"]):
        job["status"] = "processing"
        try:
            title       = job["title"]
            company     = job["company"]
            location    = job["location"]
            description = job["description"]
            job_url     = job["job_url"]

            # Choose single vs multi-resume tailor
            async def _tailor():
                if len(resume_texts) == 1:
                    return await claude_service.tailor_resume(
                        resume_texts[0], title, company, location, description,
                        extra_skills, job_log, home_location,
                    )
                return await claude_service.tailor_resume_from_multiple(
                    resume_texts, title, company, location, description,
                    extra_skills, job_log, home_location,
                )

            async def _cover(rt: str):
                if not description:
                    return ""
                return await claude_service.generate_cover_letter(
                    rt, title, company, location, description,
                    company_description="", extra_skills=extra_skills,
                )

            # Run research + tailoring concurrently for speed
            company_desc, tailored = await asyncio.gather(
                claude_service.research_company(company, title),
                _tailor(),
            )
            cover = await _cover(tailored)

            # Save resume (DOCX + PDF)
            resume_docx, resume_pdf = resume_service.save_tailored_resume(
                tailored, output_folder, title, location, company
            )
            # Save cover letter (DOCX + PDF)
            cl_docx, cl_pdf = resume_service.save_cover_letter(
                cover, output_folder, title, location, company
            )

            base = resume_service.build_filename(title, location, company)

            job.update({
                "status":                  "done",
                "company_description":     company_desc,
                "resume_filename":         base,
                "cover_letter_filename":   f"CoverLetter_{base}",
                "resume_pdf_path":         resume_pdf,
                "resume_docx_path":        resume_docx,
                "cover_letter_pdf_path":   cl_pdf,
                "cover_letter_docx_path":  cl_docx,
            })
        except Exception as exc:
            job["status"] = "error"
            job["error"]  = str(exc)

        task["done"] = i + 1
        await asyncio.sleep(0.1)   # yield to event loop

    task["status"] = "completed"


# ── Extract text from uploaded file (for job description upload) ──────────────

@router.post("/extract-text")
async def extract_text(
    file: UploadFile = File(...),
    current_user = Depends(get_current_user),
):
    """Extract plain text from an uploaded PDF, DOCX, DOC, or TXT file."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".pdf", ".docx", ".doc", ".txt"}:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
    try:
        file_bytes = await file.read()
        text = resume_service.extract_job_log_text(file_bytes, file.filename or "")
        return {"text": text.strip()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to extract text: {exc}")


# ── Existing endpoints ────────────────────────────────────────────────────────

@router.get("/download")
async def download_resume(path: str, current_user=Depends(get_current_user)):
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, filename=os.path.basename(path))


@router.post("/save-preview")
async def save_preview(
    text:             str  = Form(...),
    output_folder:    str  = Form(...),
    filename:         str  = Form("tailored_resume"),
    is_cover_letter:  bool = Form(False),
    current_user      = Depends(get_current_user),
):
    """Save edited preview text as well-formatted DOCX + PDF to the given folder."""
    if not output_folder.strip():
        raise HTTPException(status_code=400, detail="output_folder is required")
    try:
        folder = output_folder.strip()
        if is_cover_letter:
            import tempfile
            safe_name = (filename.strip() or "cover_letter").replace("/", "_")
            os.makedirs(folder, exist_ok=True)
            docx_path = os.path.join(folder, f"{safe_name}.docx")
            pdf_path  = os.path.join(folder, f"{safe_name}.pdf")
            resume_service.write_docx(text, docx_path, is_cover_letter=True)
            resume_service.write_pdf(text,  pdf_path,  is_cover_letter=True)
        else:
            docx_path, pdf_path = resume_service.save_from_preview(
                text, folder, filename.strip() or "tailored_resume"
            )
        return {"docx_path": docx_path, "pdf_path": pdf_path}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/render-pdf")
async def render_pdf_preview(
    text:            str  = Form(...),
    filename:        str  = Form("tailored_resume"),
    disposition:     str  = Form("inline"),    # "inline" for preview, "attachment" for download
    is_cover_letter: bool = Form(False),
    current_user     = Depends(get_current_user),
):
    """Generate a well-formatted PDF from resume (or cover letter) text and return the bytes (no file saved)."""
    import io
    import tempfile

    safe_name = (filename.strip() or "tailored_resume").replace("/", "_")
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, f"{safe_name}.pdf")
            resume_service.write_pdf(text, pdf_path, is_cover_letter=is_cover_letter)
            with open(pdf_path, "rb") as f:
                pdf_bytes = f.read()

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f"{disposition}; filename={safe_name}.pdf"},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/render-docx")
async def render_docx_download(
    text:            str  = Form(...),
    filename:        str  = Form("tailored_resume"),
    is_cover_letter: bool = Form(False),
    current_user     = Depends(get_current_user),
):
    """Generate a well-formatted DOCX from resume (or cover letter) text and return the bytes for download (no file saved)."""
    import io
    import tempfile

    safe_name = (filename.strip() or "tailored_resume").replace("/", "_")
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            docx_path = os.path.join(tmpdir, f"{safe_name}.docx")
            resume_service.write_docx(text, docx_path, is_cover_letter=is_cover_letter)
            with open(docx_path, "rb") as f:
                docx_bytes = f.read()

        return StreamingResponse(
            io.BytesIO(docx_bytes),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={safe_name}.docx"},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/tracker")
async def download_tracker(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result  = await db.execute(select(ResumeEntry).where(ResumeEntry.user_id == current_user.id))
    entries = result.scalars().all()
    data = [
        {
            "filename": e.filename, "job_title": e.job_title,
            "company": e.company,   "location": e.location,
            "job_url": e.job_url,   "company_description": e.company_description,
            "created_at": e.created_at,
        }
        for e in entries
    ]
    xlsx_bytes = excel_service.resume_tracker_to_excel(data)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=resume_tracker.xlsx"},
    )
