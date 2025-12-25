import json
import os
import re
from pathlib import Path
from typing import Dict, List, Optional
from src.config import settings, PersistenceMode

from rich.console import Console

console = Console()

PROJECT_ROOT = Path(__file__).parent.parent
MAPPINGS_FILE = PROJECT_ROOT / "user-course-map.json"
STATE_DIR = PROJECT_ROOT / "state"

# redis setup
_redis_client = None

def get_redis_client():
    global _redis_client
    if _redis_client is None and settings.redis_url:
        try:
            from upstash_redis import Redis
            _redis_client = Redis(url=settings.redis_url, token=settings.redis_token)
            console.print("[green]Upstash Redis persistence initialized.[/green]")
        except Exception as e:
            console.print(f"[yellow]Failed to initialize Upstash Redis: {e}[/yellow]")
    return _redis_client

# mapping functions
def get_mappings() -> Dict[str, List[str]]:
    if not MAPPINGS_FILE.exists():
        return {}
    try:
        with open(MAPPINGS_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        console.print(f"[red]Failed to read mappings:[/red] {e}")
        return {}


def save_mappings(mappings: Dict[str, List[str]]):
    try:
        with open(MAPPINGS_FILE, "w") as f:
            json.dump(mappings, f, indent=2)
    except Exception as e:
        console.print(
            f"[yellow]Warning: Could not save mappings (read-only filesystem?): {e}[/yellow]"
        )


def add_mapping(email: str, courses: List[str]):
    mappings = get_mappings()
    if email not in mappings:
        mappings[email] = []

    for course in courses:
        course = course.strip().upper()
        if course not in mappings[email]:
            mappings[email].append(course)
    save_mappings(mappings)
    console.print(f"[blue]Saved mapping: {email} -> {', '.join(courses)}[/blue]")


def remove_mapping(email: str):
    mappings = get_mappings()
    if email in mappings:
        del mappings[email]
        save_mappings(mappings)
        console.print(f"[red]Removed mapping for {email}[/red]")
    else:
        console.print(f"[grey50]No mapping found for {email}[/grey50]")


# persistence functions: redis

def load_sections_state_redis(course_name: str) -> List[dict]:
    client = get_redis_client()
    if not client:
        return []
    key = f"testudot:state:{course_name.upper()}"
    try:
        data = client.get(key)
        if data:
            # upstash_redis might return a string or already parsed JSON depending on how it's used
            # but usually it's a string from .get()
            return json.loads(data) if isinstance(data, str) else data
    except Exception as e:
        console.print(f"[yellow]Redis load failed for {course_name}: {e}[/yellow]")
    return []


def save_sections_state_redis(course_name: str, sections: List[dict]):
    client = get_redis_client()
    if client:
        key = f"testudot:state:{course_name.upper()}"
        try:
            client.set(key, json.dumps(sections))
        except Exception as e:
            console.print(f"[yellow]Redis save failed for {course_name}: {e}[/yellow]")


# persistence functions: local

def get_state_file(course_name: str) -> Optional[Path]:
    try:
        if not STATE_DIR.exists():
            STATE_DIR.mkdir(parents=True, exist_ok=True)
        return STATE_DIR / f"sections-{course_name.upper()}.json"
    except Exception:
        return None

def load_sections_state_local(course_name: str) -> List[dict]:
    state_file = get_state_file(course_name)
    if not state_file or not state_file.exists():
        return []
    try:
        with open(state_file, "r") as f:
            return json.load(f)
    except Exception:
        return []

def save_sections_state_local(course_name: str, sections: List[dict]):
    state_file = get_state_file(course_name)
    if state_file:
        try:
            with open(state_file, "w") as f:
                json.dump(sections, f, indent=2)
        except Exception:
            pass


# unified dispatcher
def load_sections_state(course_name: str) -> List[dict]:
    if settings.persistence_mode == PersistenceMode.REDIS:
        return load_sections_state_redis(course_name)
    return load_sections_state_local(course_name)


def save_sections_state(course_name: str, sections: List[dict]):
    if settings.persistence_mode == PersistenceMode.REDIS:
        save_sections_state_redis(course_name, sections)
    else:
        save_sections_state_local(course_name, sections)
