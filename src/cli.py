import typer
import asyncio
import schedule
import time
import json
from typing import Optional
from src.config import settings, PersistenceMode
from rich.console import Console
from src.utils import get_mappings, add_mapping, remove_mapping
from src.monitor import monitor_all_courses

app = typer.Typer(help="CLI to manage and run UMD Testudo course monitoring")
console = Console()


@app.command()
def monitor(
    interval: int = typer.Option(
        15, "--interval", "-i", help="Poll interval in minutes"
    ),
    term: Optional[str] = typer.Option(None, "--term", "-t", help="Term ID to use"),
    no_prompt: bool = typer.Option(False, "--no-prompt", help="Skip interactive prompts"),
    once: bool = typer.Option(False, "--once", help="Run a single cycle and exit"),
):
    """Start course monitoring (continuous by default, or once with --once)"""
    from src.scraper import get_current_term_id

    detected_term = get_current_term_id()
    term_id = term
    if not term_id:
        if no_prompt or once:
            term_id = detected_term
        else:
            term_id = typer.prompt(f"Confirm or change detected Term ID", default=detected_term)

    console.print(
        f"[green]Starting monitor (Term: {term_id})[/green]"
    )

    async def run_cycle():
        from src.monitor import monitor_all_courses
        await monitor_all_courses(term_id=term_id)
        
        if not once:
            next_run = schedule.next_run()
            if next_run:
                console.print(
                    f"[grey50]Next check at {next_run.strftime('%I:%M:%S %p')}[/grey50]"
                )

    if once:
        asyncio.run(run_cycle())
        return

    # schedule first to ensure next_run() has value during initial run
    schedule.every(interval).minutes.do(lambda: asyncio.run(run_cycle()))

    # initial run
    asyncio.run(run_cycle())

    while True:
        schedule.run_pending()
        time.sleep(1)


@app.command()
def add():
    """Add or update a user -> courses mapping"""
    email = typer.prompt("Email address")
    courses_str = typer.prompt("Courses (comma-separated)")
    courses = [c.strip().upper() for c in courses_str.split(",") if c.strip()]
    add_mapping(email, courses)


@app.command()
def list_mappings():
    """List all user -> courses mappings"""
    mappings = get_mappings()
    console.print("[yellow]Current mappings:[/yellow]")
    for email, courses in mappings.items():
        console.print(f"  [cyan]{email}[/cyan]: {', '.join(courses)}")


@app.command()
def remove(email: str):
    """Remove a mapping for a given email"""
    remove_mapping(email)


@app.command()
def config(
    mode: str = typer.Option(..., "--mode", "-m", help="Set persistence mode (local or redis)")
):
    """Set global configuration in .testudot"""
    from src.config import CONFIG_FILE, PersistenceMode
    
    mode = mode.lower()
    if mode not in ["local", "redis"]:
        console.print("[red]Invalid mode. Use 'local' or 'redis'.[/red]")
        raise typer.Exit(code=1)
        
    config_data = {}
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r") as f:
                config_data = json.load(f)
        except Exception:
            pass
            
    config_data["persistence_mode"] = mode
    
    with open(CONFIG_FILE, "w") as f:
        json.dump(config_data, f, indent=2)
        
    console.print(f"[green]Configuration saved. Default mode is now: {mode}[/green]")


@app.command()
def serve(
    host: str = typer.Option("0.0.0.0", help="Host to bind correctly"),
    port: int = typer.Option(8000, help="Port to listen on"),
):
    """Start the FastAPI server"""
    import uvicorn

    console.print(f"[green]Starting FastAPI server at http://{host}:{port}[/green]")
    uvicorn.run("api.index:app", host=host, port=port, reload=True)


if __name__ == "__main__":
    app()
