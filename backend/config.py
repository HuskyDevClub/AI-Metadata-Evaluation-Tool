import os
from pathlib import Path

from dotenv import load_dotenv

# Env load order: .env.databricks fills baseline values for the deployed app,
# then local .env files override for local dev (backend/.env, then cwd .env).
# Importing this module is what triggers env loading for the whole package.
_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR.parent / ".env.databricks")
load_dotenv(_BACKEND_DIR / ".env", override=True)
load_dotenv(override=True)

# --- LLM -------------------------------------------------------------------
LLM_ENDPOINT = os.getenv("LLM_ENDPOINT", "")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "")
JUDGE_LLM_MODEL = os.getenv("JUDGE_LLM_MODEL", "") or LLM_MODEL

# --- Socrata ---------------------------------------------------------------
SOCRATA_APP_TOKEN = os.getenv("SOCRATA_APP_TOKEN", "")

# --- Prompts ---------------------------------------------------------------
# Base URL of the AI-Metadata-Improvement-Tool backend (e.g. its Databricks App
# URL). REQUIRED: the eval fetches the canonical prompt templates from
# {PROMPTS_SOURCE_URL}/api/prompts so it scores the exact prompts that tool
# ships. There is no bundled fallback — if this is unset or unreachable, eval
# runs (and the Settings-drawer defaults) fail with a clear error.
PROMPTS_SOURCE_URL = os.getenv("PROMPTS_SOURCE_URL", "")

# --- Server ----------------------------------------------------------------
# Canonical allowed CORS origin. In production the frontend and backend are
# same-origin (Databricks Apps), so no preflight fires; in dev the Vite proxy
# forwards /api/* same-origin. Falls back to the Vite dev server origins.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5174")

# For Databricks Apps, the port is provided via the PORT environment variable.
# Local default is 8001 so this app can run alongside the Improvement Tool,
# whose backend takes :8000.
PORT = int(os.getenv("PORT", "8001"))
