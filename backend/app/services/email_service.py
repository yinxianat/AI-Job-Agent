"""
Async email sending via aiosmtplib (SMTP with STARTTLS).
Supports Gmail App Passwords and standard SMTP providers.
"""

import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from ..config import settings


async def send_password_reset_email(to_email: str, username: str, reset_url: str):
    """Send a password-reset link to the user's email address."""

    if not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
        # Dev mode: log to console so the developer can follow the link manually
        print(f"\n[EMAIL] Password reset for {to_email}\nLink → {reset_url}\n")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reset your JobAgent password"
    msg["From"]    = settings.SMTP_USERNAME
    msg["To"]      = to_email

    html_body = f"""
    <html><body style="font-family:Inter,sans-serif;color:#111;padding:24px;max-width:560px;margin:auto;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:24px;font-weight:800;color:#2563eb;">Job<span style="color:#1d4ed8;">Agent</span></span>
      </div>

      <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">Reset your password</h2>
      <p style="color:#4b5563;line-height:1.6;">Hi <strong>{username}</strong>,</p>
      <p style="color:#4b5563;line-height:1.6;">
        We received a request to reset the password for your JobAgent account.
        Click the button below to choose a new password.
        This link expires in <strong>1 hour</strong>.
      </p>

      <div style="text-align:center;margin:32px 0;">
        <a href="{reset_url}"
           style="display:inline-block;background:#2563eb;color:#fff;font-weight:600;
                  padding:14px 32px;border-radius:10px;text-decoration:none;font-size:15px;">
          Reset Password
        </a>
      </div>

      <p style="color:#6b7280;font-size:13px;line-height:1.6;">
        If you didn't request a password reset, you can safely ignore this email —
        your password will not be changed.
      </p>
      <p style="color:#9ca3af;font-size:12px;">
        Or copy this link: <a href="{reset_url}" style="color:#2563eb;">{reset_url}</a>
      </p>

      <hr style="margin:24px 0;border-color:#e5e7eb;" />
      <p style="color:#9ca3af;font-size:12px;text-align:center;">
        JobAgent · This is an automated message, please do not reply.
      </p>
    </body></html>
    """

    msg.attach(MIMEText(html_body, "html"))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USERNAME,
        password=settings.SMTP_PASSWORD,
        start_tls=True,
    )


async def send_contact_email(name: str, email: str, subject: str, message: str):
    """Forward a contact form submission to the support inbox."""

    if not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
        # Dev mode: just print to console
        print(f"[EMAIL] From: {name} <{email}> | Subject: {subject}\n{message}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[JobAgent Contact] {subject}"
    msg["From"]    = settings.SMTP_USERNAME
    msg["To"]      = settings.SUPPORT_EMAIL
    msg["Reply-To"] = f"{name} <{email}>"

    html_body = f"""
    <html><body style="font-family: Inter, sans-serif; color: #111; padding: 24px;">
      <h2 style="color: #2563eb;">New Contact Form Submission</h2>
      <table style="border-collapse:collapse; width:100%; max-width:560px;">
        <tr><td style="padding:6px 0; font-weight:600; width:100px;">Name</td><td>{name}</td></tr>
        <tr><td style="padding:6px 0; font-weight:600;">Email</td><td><a href="mailto:{email}">{email}</a></td></tr>
        <tr><td style="padding:6px 0; font-weight:600;">Subject</td><td>{subject}</td></tr>
      </table>
      <hr style="margin:16px 0; border-color:#e5e7eb;" />
      <p style="white-space:pre-wrap; line-height:1.6;">{message}</p>
    </body></html>
    """

    msg.attach(MIMEText(html_body, "html"))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USERNAME,
        password=settings.SMTP_PASSWORD,
        start_tls=True,
    )
