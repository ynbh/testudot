import os
import json
from enum import Enum
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).parent.parent
CONFIG_FILE = PROJECT_ROOT / ".testudot"

class PersistenceMode(str, Enum):
    REDIS = "redis"
    LOCAL = "local"

class Config:
    def __init__(self):
        self.email_user = os.getenv("EMAIL_USER")
        self.email_pass = os.getenv("EMAIL_PASS")
        self.redis_url = os.getenv("REDIS_URL")
        self.redis_token = os.getenv("REDIS_TOKEN")
        
        # 1. default for CLI is always local
        mode_str = "local"
        
        # 2. check environment variable for override
        env_mode = os.getenv("PERSISTENCE_MODE")
        if env_mode:
            mode_str = env_mode.lower()
            
        # 3. override with .testudot file if it exists
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, "r") as f:
                    file_config = json.load(f)
                    if "persistence_mode" in file_config:
                        mode_str = file_config["persistence_mode"].lower()
            except Exception:
                pass
        
        self.persistence_mode = PersistenceMode.REDIS if mode_str == "redis" else PersistenceMode.LOCAL
        
        # 4. force redis for server environments (overrides everything)
        self.is_server = os.getenv("VERCEL") is not None or os.getenv("IS_SERVER") == "true"
        if self.is_server:
            self.persistence_mode = PersistenceMode.REDIS

settings = Config()
