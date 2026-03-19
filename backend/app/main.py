"""
JobAgent — FastAPI Backend
Run with:  uvicorn app.main:app --reload --port 8000
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from .config import settings
from .database import init_db
from .routers import auth, jobs, resume, contact, files


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run on startup / shutdown."""
    await init_db()
    yield


app = FastAPI(
    title       = "JobAgent API",
    description = "AI-powered job search and resume tailoring backend",
    version     = "1.0.0",
    docs_url    = "/api/docs",
    redoc_url   = "/api/redoc",
    openapi_url = "/api/openapi.json",
    lifespan    = lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins     = settings.cors_origins_list,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(resume.router)
app.include_router(contact.router)
app.include_router(files.router)


@app.get("/api/health", tags=["health"])
async def health():
    return {"status": "ok", "service": "JobAgent API"}
