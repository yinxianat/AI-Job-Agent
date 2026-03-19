from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from ..services.email_service import send_contact_email

router = APIRouter(prefix="/api/contact", tags=["contact"])


class ContactPayload(BaseModel):
    name:    str
    email:   EmailStr
    subject: str
    message: str


@router.post("/send", status_code=status.HTTP_200_OK)
async def send_message(payload: ContactPayload):
    if len(payload.message.strip()) < 20:
        raise HTTPException(status_code=422, detail="Message too short (min 20 characters)")
    try:
        await send_contact_email(
            name    = payload.name,
            email   = payload.email,
            subject = payload.subject,
            message = payload.message,
        )
        return {"detail": "Message sent successfully"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {exc}")
