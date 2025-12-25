import os

# set server mode before any internal imports
os.environ["IS_SERVER"] = "true"

from fastapi import FastAPI, Header, HTTPException, Depends
from typing import List, Dict, Optional

app = FastAPI(title="testudot API", description="UMD Course Monitoring API")

async def verify_api_key(x_api_key: Optional[str] = Header(None)):
    from src.config import settings
    if settings.api_key and x_api_key != settings.api_key:
        raise HTTPException(status_code=403, detail="Invalid or missing API Key")
    return x_api_key


@app.get("/api/mappings", response_model=Dict[str, List[str]], dependencies=[Depends(verify_api_key)])
async def list_mappings_api():
    """List all bundled user-course mappings."""
    from src.utils import get_mappings
    return get_mappings()


@app.post("/api/monitor", dependencies=[Depends(verify_api_key)])
async def trigger_monitor():
    """Trigger a single monitoring cycle for all courses."""
    from src.scraper import get_current_term_id
    from src.monitor import monitor_all_courses

    term_id = get_current_term_id()
    await monitor_all_courses(term_id=term_id)
    return {
        "status": "success",
        "message": f"Monitoring cycle completed for term {term_id}",
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}
