from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class ClassTime(BaseModel):
    days: str
    startTime: str
    endTime: str


class CourseSection(BaseModel):
    course_name: str
    section_id: str
    instructor: str
    total_seats: int
    open_seats: int
    waitlist_count: int
    class_times: List[ClassTime]
    custom_course_id: str
    last_updated: Optional[datetime] = None
    removed: bool = False
