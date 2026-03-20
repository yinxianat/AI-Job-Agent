import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..models.user import User
from ..models.password_reset import PasswordResetToken
from ..config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, username: str, email: str, password: str) -> User:
    user = User(
        username=username,
        email=email,
        hashed_password=hash_password(password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# ── Password reset ────────────────────────────────────────────────────────────

RESET_TOKEN_EXPIRE_HOURS = 1   # token valid for 1 hour


async def create_reset_token(db: AsyncSession, user_id: int) -> str:
    """Generate a secure single-use reset token, persist it, and return the raw value."""
    # Invalidate any existing unused tokens for this user
    existing = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user_id,
            PasswordResetToken.used == False,  # noqa: E712
        )
    )
    for old in existing.scalars().all():
        old.used = True   # mark old tokens as consumed

    raw_token = secrets.token_urlsafe(48)  # 64-char URL-safe string
    reset_token = PasswordResetToken(
        user_id    = user_id,
        token      = raw_token,
        expires_at = datetime.now(timezone.utc) + timedelta(hours=RESET_TOKEN_EXPIRE_HOURS),
        used       = False,
    )
    db.add(reset_token)
    await db.commit()
    return raw_token


async def get_valid_reset_token(db: AsyncSession, raw_token: str) -> Optional[PasswordResetToken]:
    """Return the PasswordResetToken if valid (exists, unused, not expired); else None."""
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == raw_token)
    )
    record = result.scalar_one_or_none()
    if not record:
        return None
    if record.used:
        return None
    # Compare as offset-aware datetimes
    now = datetime.now(timezone.utc)
    expires = record.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now > expires:
        return None
    return record


async def consume_reset_token(db: AsyncSession, record: PasswordResetToken, new_password: str):
    """Update user password and mark the token as used — atomically."""
    user = await get_user_by_id(db, record.user_id)
    if not user:
        return None
    user.hashed_password = hash_password(new_password)
    record.used = True
    await db.commit()
    return user
