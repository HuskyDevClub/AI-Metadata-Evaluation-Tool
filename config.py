import os
from pathlib import Path

from dotenv import load_dotenv

# Eval runs as its own process, separate from the main backend. We still share
# the same .env files so credentials don't need to be duplicated — load order
# mirrors backend/config.py.
_REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_REPO_ROOT / ".env.databricks")
load_dotenv(_REPO_ROOT / "backend" / ".env", override=True)
load_dotenv(override=True)

LLM_ENDPOINT = os.getenv("LLM_ENDPOINT", "")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "")
JUDGE_LLM_MODEL = os.getenv("JUDGE_LLM_MODEL", "") or LLM_MODEL

SOCRATA_APP_TOKEN = os.getenv("SOCRATA_APP_TOKEN", "")

PORT = int(os.getenv("EVAL_PORT", "8001"))
