import os
from pathlib import Path

from dotenv import load_dotenv

# Load configuration from a local .env file (see .env.example).
# Existing environment variables take precedence over .env values.
load_dotenv(Path(__file__).resolve().parent / ".env")

LLM_ENDPOINT = os.getenv("LLM_ENDPOINT", "")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "")
JUDGE_LLM_MODEL = os.getenv("JUDGE_LLM_MODEL", "") or LLM_MODEL

SOCRATA_APP_TOKEN = os.getenv("SOCRATA_APP_TOKEN", "")

PORT = int(os.getenv("EVAL_PORT", "8001"))
