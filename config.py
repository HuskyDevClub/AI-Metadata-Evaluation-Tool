import os
from pathlib import Path

from dotenv import load_dotenv

# Eval runs as its own process, separate from the main backend. Load order:
# 1. .env.databricks (shared credentials)
# 2. backend/.env (LLM API config)
# 3. eval/.env (eval-specific overrides)
# 4. Local environment (highest priority)
_REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_REPO_ROOT / ".env.databricks")
load_dotenv(_REPO_ROOT / "backend" / ".env")
load_dotenv(_REPO_ROOT / "eval" / ".env", override=True)
load_dotenv(override=True)

LLM_ENDPOINT = os.getenv("LLM_ENDPOINT", "")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "")
JUDGE_LLM_MODEL = os.getenv("JUDGE_LLM_MODEL", "") or LLM_MODEL

SOCRATA_APP_TOKEN = os.getenv("SOCRATA_APP_TOKEN", "")

PORT = int(os.getenv("EVAL_PORT", "8001"))
