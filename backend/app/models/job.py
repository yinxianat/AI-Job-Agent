from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class Job(Base):
    __tablename__ = "jobs"

    id:           Mapped[int]  = mapped_column(Integer, primary_key=True, index=True)
    user_id:      Mapped[int]  = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    task_id:      Mapped[str]  = mapped_column(String(64), index=True)
    title:        Mapped[str]  = mapped_column(String(255))
    company:      Mapped[str]  = mapped_column(String(255))
    location:     Mapped[str]  = mapped_column(String(255))
    posted_date:  Mapped[str]  = mapped_column(String(100))
    job_url:      Mapped[str]  = mapped_column(Text)
    company_url:  Mapped[str]  = mapped_column(Text, nullable=True)
    description:  Mapped[str]  = mapped_column(Text, nullable=True)
    created_at:   Mapped[DateTime] = mapped_column(DateTime, server_default=func.now())


class ResumeEntry(Base):
    __tablename__ = "resume_entries"

    id:                  Mapped[int]  = mapped_column(Integer, primary_key=True, index=True)
    user_id:             Mapped[int]  = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    filename:            Mapped[str]  = mapped_column(String(255))
    job_title:           Mapped[str]  = mapped_column(String(255))
    company:             Mapped[str]  = mapped_column(String(255))
    location:            Mapped[str]  = mapped_column(String(255), nullable=True)
    job_url:             Mapped[str]  = mapped_column(Text, nullable=True)
    company_description: Mapped[str]  = mapped_column(Text, nullable=True)
    pdf_path:            Mapped[str]  = mapped_column(Text, nullable=True)
    docx_path:           Mapped[str]  = mapped_column(Text, nullable=True)
    created_at:          Mapped[DateTime] = mapped_column(DateTime, server_default=func.now())
