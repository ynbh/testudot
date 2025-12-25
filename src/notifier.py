import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Dict
from src.utils import get_mappings, console


def get_emails_for_course(course_name: str) -> List[str]:
    mappings = get_mappings()
    emails = []
    for email, courses in mappings.items():
        if course_name in courses:
            emails.append(email)
    return emails


def generate_email_body(changes: List[dict], course_name: str) -> str:
    change_html = ""
    for c in changes:
        if c["type"] == "new_section":
            data = c["data"]
            change_html += f"""
            <div style="border-bottom: 1px solid #eee; padding: 20px 0;">
                <div style="display: table; width: 100%; margin-bottom: 4px;">
                    <div style="display: table-cell; vertical-align: middle;">
                        <span style="font-size: 16px; font-weight: 600;">Section {data["section_id"]}</span>
                    </div>
                    <div style="display: table-cell; vertical-align: middle; text-align: right;">
                        <span style="font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; background-color: #e6fffa; color: #234e52; line-height: 1;">New Section</span>
                    </div>
                </div>
                <div style="font-size: 14px; color: #4a4a4a;">{data["instructor"]}</div>
                <div style="font-size: 14px; color: #718096; margin-top: 4px;">{data["open_seats"]} / {data["total_seats"]} seats available{" · " + str(data["waitlist_count"]) + " waitlisted" if data["waitlist_count"] else ""}</div>
            </div>"""
        elif c["type"] == "seats_changed":
            diff = c["to"] - c["from"]
            diff_text = (
                f"{abs(diff)} new seats" if diff > 0 else f"{abs(diff)} seats fewer"
            )
            change_html += f"""
            <div style="border-bottom: 1px solid #eee; padding: 20px 0;">
                <div style="display: table; width: 100%; margin-bottom: 4px;">
                    <div style="display: table-cell; vertical-align: middle;">
                        <span style="font-size: 16px; font-weight: 600;">Section {c["sectionId"]}</span>
                    </div>
                    <div style="display: table-cell; vertical-align: middle; text-align: right;">
                        <span style="font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; background-color: #fffaf0; color: #7b341e; line-height: 1;">Seats Changed</span>
                    </div>
                </div>
                <div style="font-size: 14px; color: #4a4a4a;">{c["instructor"]}</div>
                <div style="font-size: 14px; color: #718096; margin-top: 4px;">{diff_text} (now {c["to"]} available)</div>
            </div>"""
        elif c["type"] == "section_removed":
            change_html += f"""
            <div style="border-bottom: 1px solid #eee; padding: 20px 0;">
                <div style="display: table; width: 100%; margin-bottom: 4px;">
                    <div style="display: table-cell; vertical-align: middle;">
                        <span style="font-size: 16px; font-weight: 600;">Section {c["sectionId"]}</span>
                    </div>
                    <div style="display: table-cell; vertical-align: middle; text-align: right;">
                        <span style="font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; background-color: #fff5f5; color: #742a2a; line-height: 1;">Removed</span>
                    </div>
                </div>
            </div>"""

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background-color: #ffffff;
                color: #1a1a1a;
                margin: 0;
                padding: 40px 20px;
                line-height: 1.5;
            }}
        </style>
    </head>
    <body>
        <div style="max-width: 500px; margin: 0 auto;">
            <div style="margin-bottom: 32px;">
                <div style="font-size: 13px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: #666;">{course_name} · UPDATES</div>
            </div>
            {change_html}
            <div style="margin-top: 48px; font-size: 12px; color: #a0aec0; text-align: center;">
                Automated notification from testudot
            </div>
        </div>
    </body>
    </html>"""


async def send_smtp_notification(changes: List[dict], course_name: str, recipients: List[str]):
    email_user = os.getenv("EMAIL_USER")
    email_pass = os.getenv("EMAIL_PASS")

    if not email_user or not email_pass:
        console.print("[yellow]EMAIL_USER or EMAIL_PASS not set. Skipping SMTP.[/yellow]")
        return

    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    body = generate_email_body(changes, course_name)
    msg = MIMEMultipart()
    msg["From"] = email_user
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = f"changes detected in {course_name.lower()} sections"
    msg.attach(MIMEText(body, "html"))

    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as server:
            server.starttls()
            server.login(email_user, email_pass)
            server.send_message(msg)
        console.print(f"[green]SMTP Notification sent for {course_name}[/green]")
    except Exception as e:
        console.print(f"[red]Failed to send SMTP notification for {course_name}:[/red] {e}")


import asyncio

# global lock to respect resend's 2 req/sec rate limit
_resend_lock = asyncio.Lock()

async def send_resend_notification(changes: List[dict], course_name: str, recipients: List[str], api_key: str):
    import resend
    
    resend.api_key = api_key
    body = generate_email_body(changes, course_name)
    
    # resend requires a verified sender. we use a default if not provided.
    from_email = os.getenv("EMAIL_FROM", "onboarding@resend.dev")
    
    params = {
        "from": from_email,
        "to": recipients,
        "subject": f"Changes detected in {course_name.lower()} sections",
        "html": body
    }
    
    async with _resend_lock:
        try:
            resend.Emails.send(params)
            console.print(f"[green]Resend Notification sent for {course_name}[/green]")
        except Exception as e:
            console.print(f"[red]Failed to send Resend notification for {course_name}:[/red] {e}")
            raise e
        finally:
            # always sleep for 0.5s after a Resend attempt to respect rate limits. we have 2 req/sec limit 
            await asyncio.sleep(0.5)

async def send_notification(changes: List[dict], course_name: str):
    console.print(f"[green]Sending notification for {course_name}[/green]")

    recipients = get_emails_for_course(course_name)
    if not recipients:
        console.print(
            f"[grey50]No recipients for {course_name}, skipping email.[/grey50]"
        )
        return

    resend_api_key = os.getenv("RESEND_TOKEN")
    if resend_api_key:
        try:
            await send_resend_notification(changes, course_name, recipients, resend_api_key)
        except Exception:
            console.print("[yellow]Falling back to SMTP notification.[/yellow]")
            await send_smtp_notification(changes, course_name, recipients)
    else:
        await send_smtp_notification(changes, course_name, recipients)
