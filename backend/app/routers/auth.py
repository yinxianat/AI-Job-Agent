import logging

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas.auth import (
    SignupRequest, LoginRequest, TokenResponse, UserOut,
    ForgotPasswordRequest, ResetPasswordRequest, MessageResponse,
)
from ..services import auth_service
from ..services import email_service
from ..config import settings

log = logging.getLogger(__name__)

router  = APIRouter(prefix="/api/auth", tags=["auth"])
# auto_error=False means missing/invalid token returns None instead of 403
# Protected routes handle the 401 themselves via get_current_user
bearer  = HTTPBearer(auto_error=False)


# ── Dependency: resolve current user from JWT ──────────────────────────────────
async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db:    AsyncSession                        = Depends(get_db),
):
    if not creds:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = auth_service.decode_token(creds.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user = await auth_service.get_user_by_id(db, int(payload.get("sub", 0)))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)):
    if await auth_service.get_user_by_email(db, payload.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    if await auth_service.get_user_by_username(db, payload.username):
        raise HTTPException(status_code=400, detail="Username already taken")

    user  = await auth_service.create_user(db, payload.username, payload.email, payload.password)
    token = auth_service.create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await auth_service.get_user_by_email(db, payload.email)
    if not user or not auth_service.verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = auth_service.create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(current_user=Depends(get_current_user)):
    return current_user


# ── Password reset ─────────────────────────────────────────────────────────────

@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    payload:    ForgotPasswordRequest,
    background: BackgroundTasks,
    db:         AsyncSession = Depends(get_db),
):
    """
    Request a password-reset link.

    Always returns 200 with the same message regardless of whether the email
    exists — this prevents user-enumeration attacks.
    """
    GENERIC_OK = MessageResponse(
        message="If that email is registered, a reset link has been sent. Check your inbox (and spam folder)."
    )

    user = await auth_service.get_user_by_email(db, payload.email)
    if not user:
        return GENERIC_OK   # don't reveal non-existence

    raw_token = await auth_service.create_reset_token(db, user.id)
    reset_url = f"{settings.APP_BASE_URL}/reset-password?token={raw_token}"

    # Send email in background so the response is instant
    background.add_task(
        email_service.send_password_reset_email,
        user.email,
        user.username,
        reset_url,
    )

    return GENERIC_OK


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    payload: ResetPasswordRequest,
    db:      AsyncSession = Depends(get_db),
):
    """
    Validate a reset token and set a new password.

    Returns 400 if the token is invalid, expired, or already used.
    """
    record = await auth_service.get_valid_reset_token(db, payload.token)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired. Please request a new one.",
        )

    user = await auth_service.consume_reset_token(db, record, payload.password)
    if not user:
        raise HTTPException(status_code=500, detail="Password update failed")

    log.info("Password reset successful for user_id=%s", user.id)
    return MessageResponse(message="Password updated successfully. You can now log in with your new password.")
