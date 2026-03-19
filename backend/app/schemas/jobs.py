from pydantic import BaseModel, field_validator
from typing import Any, Dict, List, Optional


class JobSearchRequest(BaseModel):
    categories: List[str] = []   # optional — empty = general search
    location:   str = ""
    date_range: str = "7"
    radius:     int = 25
    remote:     str = "no"       # "no" | "only" | "include"

    @field_validator("categories", mode="before")
    @classmethod
    def normalize_categories(cls, v):
        """Accept a single string or list; always return a list (may be empty)."""
        if isinstance(v, str):
            v = [v]
        return [c.strip() for c in (v or []) if c.strip()]


class JobResult(BaseModel):
    title:           str
    company:         str
    location:        str
    posted_date:     str
    job_url:         str
    company_url:     Optional[str] = None
    description:     Optional[str] = None
    search_category: Optional[str] = None


class SearchTaskResponse(BaseModel):
    task_id: str
    status:  str = "pending"


class TaskStatusResponse(BaseModel):
    task_id: str
    status:  str
    results: Optional[List[Dict[str, Any]]] = None  # dict so extra fields pass through
    error:   Optional[str] = None


# ── AI job matching ───────────────────────────────────────────────────────────

class JobMatchRequest(BaseModel):
    """
    Score a list of jobs against the candidate's profile.
    All fields are optional — at least one of profile/wishes should be provided
    for meaningful scores.
    """
    jobs:    List[Dict[str, Any]]   # raw job dicts (title, company, description …)
    profile: str = ""               # resume text or pasted bio / skills
    wishes:  str = ""               # what the user is looking for in their next role


class MatchedJobResult(BaseModel):
    job_index:   int
    score:       int               # 0–100
    reason:      str               # 1-2 sentence explanation


class JobMatchResponse(BaseModel):
    results:    List[MatchedJobResult]
    error:      Optional[str] = None
    error_type: Optional[str] = None   # "overloaded" | "rate_limit" | "api_error" | None
