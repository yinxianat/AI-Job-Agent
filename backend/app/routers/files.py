"""
Local filesystem browser (directories only).
Used by the frontend folder-picker UI to let users navigate
to their desired output folder without typing a path manually.
"""

import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional

from .auth import get_current_user

router = APIRouter(prefix="/api/files", tags=["files"])


class DirEntry(BaseModel):
    name: str
    path: str
    has_children: bool


class BrowseResponse(BaseModel):
    current_path: str
    parent_path:  Optional[str]
    entries:      List[DirEntry]
    breadcrumbs:  List[dict]   # [{name, path}]
    shortcuts:    Optional[List[dict]] = None


def _home() -> str:
    return str(Path.home())


def _shortcuts() -> List[dict]:
    home = Path.home()
    candidates = [
        {"name": "🏠  Home",      "path": str(home)},
        {"name": "🖥️  Desktop",   "path": str(home / "Desktop")},
        {"name": "📄  Documents", "path": str(home / "Documents")},
        {"name": "⬇️  Downloads", "path": str(home / "Downloads")},
    ]
    return [s for s in candidates if Path(s["path"]).is_dir()]


def _breadcrumbs(path: str) -> List[dict]:
    parts = Path(path).parts
    crumbs = []
    for i, part in enumerate(parts):
        crumbs.append({
            "name": part,
            "path": str(Path(*parts[:i + 1])),
        })
    return crumbs


def _list_dirs(path: str) -> List[DirEntry]:
    try:
        entries = []
        for entry in sorted(Path(path).iterdir(), key=lambda e: e.name.lower()):
            if not entry.is_dir():
                continue
            # Skip hidden folders (dotfiles)
            if entry.name.startswith("."):
                continue
            try:
                has_children = any(
                    e.is_dir() and not e.name.startswith(".")
                    for e in entry.iterdir()
                )
            except PermissionError:
                has_children = False
            entries.append(DirEntry(
                name=entry.name,
                path=str(entry),
                has_children=has_children,
            ))
        return entries
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied: {path}")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Path not found: {path}")


@router.get("/browse", response_model=BrowseResponse)
async def browse(
    path: str = Query(default=None),
    current_user = Depends(get_current_user),
):
    """Return directories at the given path (defaults to home directory)."""
    target = path if path else _home()

    # Resolve and validate
    resolved = str(Path(target).resolve())
    if not Path(resolved).is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {resolved}")

    parent = str(Path(resolved).parent) if Path(resolved).parent != Path(resolved) else None

    return BrowseResponse(
        current_path = resolved,
        parent_path  = parent,
        entries      = _list_dirs(resolved),
        breadcrumbs  = _breadcrumbs(resolved),
        shortcuts    = _shortcuts(),
    )


@router.post("/mkdir")
async def make_dir(
    path: str,
    current_user = Depends(get_current_user),
):
    """Create a new folder at the given path."""
    try:
        Path(path).mkdir(parents=True, exist_ok=True)
        return {"detail": "Folder created", "path": path}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
