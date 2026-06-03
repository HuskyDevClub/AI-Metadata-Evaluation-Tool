import logging
from dataclasses import dataclass
from pathlib import Path

import httpx

from .config import PROMPTS_SOURCE_URL

logger = logging.getLogger(__name__)

# Bundled fallback copies of the canonical templates. Used when no remote source
# is configured or the source is unreachable. Keep these in sync with the main
# tool's prompts/ (they are the offline safety net, not the source of truth).
_BUNDLED_DIR = Path(__file__).resolve().parent / "prompts"

# The templates the eval uses for metadata generation. Names match the file
# stems the main tool serves at GET /api/prompts.
_REQUIRED = ("system", "dataset", "column")


@dataclass
class Prompts:
    system: str
    dataset: str
    column: str
    source: str  # "remote:<url>" or "bundled"


def _normalize(raw: str) -> str:
    # Mirror the frontend's fromFile(): normalize line endings and drop any
    # trailing newline, so the eval's template bytes match the main tool's.
    return raw.replace("\r\n", "\n").rstrip("\n")


def _bundled() -> Prompts:
    def read(name: str) -> str:
        return _normalize((_BUNDLED_DIR / f"{name}.md").read_text(encoding="utf-8"))

    return Prompts(
        system=read("system"),
        dataset=read("dataset"),
        column=read("column"),
        source="bundled",
    )


async def load_prompts(client: httpx.AsyncClient) -> Prompts:
    """Resolve the generation prompt templates for a run.

    Prefers the canonical templates served by the main tool (PROMPTS_SOURCE_URL)
    so the eval scores the exact prompts that ship; falls back to the bundled
    copies when the source is unset or unreachable.
    """
    url = PROMPTS_SOURCE_URL.strip().rstrip("/")
    if not url:
        return _bundled()
    try:
        resp = await client.get(f"{url}/api/prompts", timeout=10.0)
        resp.raise_for_status()
        served = resp.json().get("prompts", {})
        missing = [n for n in _REQUIRED if not (served.get(n) or "").strip()]
        if missing:
            raise ValueError(f"source is missing prompts: {missing}")
        return Prompts(
            system=_normalize(served["system"]),
            dataset=_normalize(served["dataset"]),
            column=_normalize(served["column"]),
            source=f"remote:{url}",
        )
    except Exception as exc:
        logger.warning("Falling back to bundled prompts (%s failed: %s)", url, exc)
        return _bundled()
