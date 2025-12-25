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
        
        # 1. start with 'local' default
        mode_str = "local"
        
        # 2. check environment variable for override
        env_mode = os.getenv("PERSISTENCE_MODE")
        if env_mode:
            mode_str = env_mode.lower()
            
        # 3. override with .testudot file if it exists (higher precedence)
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, "r") as f:
                    file_config = json.load(f)
                    if "persistence_mode" in file_config:
                        mode_str = file_config["persistence_mode"].lower()
            except Exception:
                pass
        
        self.persistence_mode = PersistenceMode.REDIS if mode_str == "redis" else PersistenceMode.LOCAL

    def load_from_cf(self, env):
        """Update settings from Cloudflare Worker env object."""
        self.email_user = getattr(env, "EMAIL_USER", self.email_user)
        self.email_pass = getattr(env, "EMAIL_PASS", self.email_pass)
        self.redis_url = getattr(env, "REDIS_URL", self.redis_url)
        self.redis_token = getattr(env, "REDIS_TOKEN", self.redis_token)
        # cloudflare is always considered a server environment
        self.is_server = True
        self.persistence_mode = PersistenceMode.REDIS

settings = Config()
