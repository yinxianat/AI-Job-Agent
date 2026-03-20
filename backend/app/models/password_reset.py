from datetime import datetime

from sqlalchemy import Integer, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class PasswordResetToken(Base):
    """
    Single-use, time-limited token for password resets.

    Flow:
      1. POST /api/auth/forgot-password  →  create row, email token URL to user
      2. POST /api/auth/reset-password   →  validate token, update password, mark used=True
    """
    __tablename__ = "password_reset_tokens"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    user_id:    Mapped[int]      = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token:      Mapped[str]      = mapped_column(String(128), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used:       Mapped[bool]     = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
