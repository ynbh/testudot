import httpx
from datetime import datetime
from bs4 import BeautifulSoup
from typing import List, Optional
from rich.console import Console
from .models import CourseSection, ClassTime

console = Console()


def get_current_term_id() -> str:
    """
    Generates UMD term ID based on current date.
    01 -> Spring
    08 -> Fall

    Simple heuristic:
    - Oct - Feb: Spring (01)
    - March - Sept: Fall (08)
    """
    now = datetime.now()
    year = now.year
    month = now.month

    if month >= 10:
        return f"{year + 1}01"
    elif month <= 2:
        return f"{year}01"
    else:
        return f"{year}08"


async def get_testudo_course_html(
    course_name: str, term_id: Optional[str] = None
) -> str:
    if not term_id:
        term_id = get_current_term_id()

    console.print(f"[blue]Fetching HTML for {course_name} (Term: {term_id})[/blue]")
    url = f"https://app.testudo.umd.edu/soc/search?courseId={course_name}&sectionId=&termId={term_id}&creditCompare=&credits=&courseLevelFilter=ALL&instructor=&_facetoface=on&_blended=on&_online=on&courseStartCompare=&courseStartHour=&courseStartMin=&courseStartAM=&courseEndHour=&courseEndMin=&courseEndAM=&teachingCenter=ALL&_classDay1=on&_classDay2=on&_classDay3=on&_classDay4=on&_classDay5=on"

    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers={"User-Agent": "testudot/0.0.0"})
        response.raise_for_status()
        console.print(f"[blue]Received response: {response.status_code}[/blue]")
        return response.text


async def scrape_course_data(
    course_name: str, term_id: Optional[str] = None
) -> List[dict]:
    console.print(f"[green]Scraping data for {course_name}[/green]")
    html = await get_testudo_course_html(course_name, term_id)
    soup = BeautifulSoup(html, "html.parser")

    sections_elements = soup.select(".section")
    sections_data = []

    for section in sections_elements:
        section_id = ""
        sid_el = section.select_one(".section-id")
        if sid_el:
            section_id = sid_el.get_text(strip=True)

        instructor = ""
        inst_el = section.select_one(".section-instructor")
        if inst_el:
            instructor = inst_el.get_text(strip=True)

        total_seats = 0
        ts_el = section.select_one(".total-seats-count")
        if ts_el:
            total_seats = int(ts_el.get_text(strip=True) or 0)

        open_seats = 0
        os_el = section.select_one(".open-seats-count")
        if os_el:
            open_seats = int(os_el.get_text(strip=True) or 0)

        waitlist_count = 0
        wc_el = section.select_one(".waitlist-count")
        if wc_el:
            waitlist_count = int(wc_el.get_text(strip=True) or 0)

        class_times = []
        time_groups = section.select(".section-day-time-group")
        for tg in time_groups:
            days = ""
            days_el = tg.select_one(".section-days")
            if days_el:
                days = days_el.get_text(strip=True)

            start_time = ""
            start_el = tg.select_one(".class-start-time")
            if start_el:
                start_time = start_el.get_text(strip=True)

            end_time = ""
            end_el = tg.select_one(".class-end-time")
            if end_el:
                end_time = end_el.get_text(strip=True)

            class_times.append(
                {"days": days, "startTime": start_time, "endTime": end_time}
            )

        sections_data.append(
            {
                "course_name": course_name,
                "section_id": section_id,
                "instructor": instructor,
                "total_seats": total_seats,
                "open_seats": open_seats,
                "waitlist_count": waitlist_count,
                "class_times": class_times,
                "custom_course_id": f"{course_name}-{section_id}",
            }
        )

    console.print(
        f"[green]Found {len(sections_data)} sections for {course_name}[/green]"
    )
    return sections_data
