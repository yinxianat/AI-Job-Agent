from pydantic import BaseModel
from typing import Optional


class TailorResponse(BaseModel):
    filename:               str
    job_url:                Optional[str] = None
    company_description:    Optional[str] = None
    pdf_path:               Optional[str] = None
    docx_path:              Optional[str] = None
    tailored_text:          Optional[str] = None   # plain-text resume for in-app preview
    cover_letter_text:      Optional[str] = None   # plain-text cover letter for in-app preview
    cover_letter_pdf_path:  Optional[str] = None
    cover_letter_docx_path: Optional[str] = None


class ContactRequest(BaseModel):
    name:    str
    email:   str
    subject: str
    message: str
