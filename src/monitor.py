import asyncio
from typing import List, Any, Optional
from src.scraper import scrape_course_data
from src.notifier import send_notification
from src.utils import load_sections_state, save_sections_state, get_mappings, console
from src.models import CourseSection


def compare_data(existing_data: List[dict], new_data: List[dict]) -> List[dict]:
    console.print(f"[cyan]Comparing existing and new data[/cyan]")
    changes = []

    # check for new sections and seat changes
    for new_section in new_data:
        existing_section = next(
            (s for s in existing_data if s["section_id"] == new_section["section_id"]),
            None,
        )

        if not existing_section:
            console.print(
                f"  [cyan] found new section: {new_section['section_id']}[/cyan]"
            )
            changes.append({"type": "new_section", "data": new_section})
        elif existing_section.get("open_seats") != new_section["open_seats"]:
            console.print(
                f"  [cyan] seats changed for section {new_section['section_id']}: {existing_section.get('open_seats')} → {new_section['open_seats']}[/cyan]"
            )
            changes.append(
                {
                    "type": "seats_changed",
                    "sectionId": new_section["section_id"],
                    "from": existing_section.get("open_seats"),
                    "to": new_section["open_seats"],
                    "instructor": new_section["instructor"],
                }
            )

    # check for removed sections
    for existing_section in existing_data:
        still_exists = any(
            s["section_id"] == existing_section["section_id"] for s in new_data
        )
        if not still_exists and existing_section.get("removed") is not True:
            console.print(
                f"  [cyan] section removed: {existing_section['section_id']}[/cyan]"
            )
            changes.append(
                {
                    "type": "section_removed",
                    "sectionId": existing_section["section_id"],
                    "custom_course_id": existing_section.get("custom_course_id"),
                }
            )

    console.print(f"[cyan]Comparison complete: {len(changes)} total changes[/cyan]")
    return changes


async def monitor_course(course_name: str, term_id: Optional[str] = None):
    console.print(f"[magenta]Monitoring course: {course_name}[/magenta]")
    try:
        existing_data = load_sections_state(course_name)
        scraped_data = await scrape_course_data(course_name, term_id=term_id)

        changes = compare_data(existing_data, scraped_data)

        if changes:
            await send_notification(changes, course_name)

        # update state (mark removed sections)
        # for simplicity, we just save the latest scraped data as the new state.
        # if we wanted to keep removed sections in state, we'd need more complex logic.
        # the ts version upserted each section. here we replace the whole course file.
        save_sections_state(course_name, scraped_data)

        console.print(f"[magenta]Completed monitoring for {course_name}[/magenta]")
    except Exception as e:
        console.print(f"[red]Monitoring failed for {course_name}:[/red] {e}")


async def monitor_all_courses(term_id: Optional[str] = None):
    mappings = get_mappings()
    all_courses = list(
        set([course for courses in mappings.values() for course in courses])
    )
    if not all_courses:
        console.print("[yellow]No courses to monitor.[/yellow]")
        return

    await asyncio.gather(
        *(monitor_course(course, term_id=term_id) for course in all_courses)
    )
