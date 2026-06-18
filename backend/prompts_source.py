import logging
from dataclasses import dataclass

import httpx

from .config import PROMPTS_SOURCE_URL

logger = logging.getLogger(__name__)

# The templates the eval uses for metadata generation. Names match the file
# stems the main tool serves at GET /api/prompts.
_REQUIRED = ("system", "dataset", "column")


class PromptSourceError(RuntimeError):
    """Raised when the canonical prompts cannot be fetched from the main tool.

    The eval has no offline fallback by design: it must score the exact prompts
    the AI-Metadata-Improvement-Tool ships, so a missing/unreachable source is a
    hard error rather than a silent drift to a stale local copy.
    """


@dataclass
class Prompts:
    system: str
    dataset: str
    column: str
    source: str  # always "remote:<url>"


def _normalize(raw: str) -> str:
    # Mirror the frontend's fromFile(): normalize line endings and drop any
    # trailing newline, so the eval's template bytes match the main tool's.
    return raw.replace("\r\n", "\n").rstrip("\n")


async def load_prompts(client: httpx.AsyncClient) -> Prompts:
    """Fetch the canonical generation prompt templates from the main tool.

    The templates are always sourced live from the AI-Metadata-Improvement-Tool
    (PROMPTS_SOURCE_URL) so the eval scores the exact prompts that ship. There is
    no bundled fallback: if the source is unset, unreachable, or incomplete this
    raises PromptSourceError so the run fails loudly instead of scoring a stale
    or wrong copy.
    """
    url = PROMPTS_SOURCE_URL.strip().rstrip("/")
    if not url:
        raise PromptSourceError(
            "PROMPTS_SOURCE_URL is not set. Point it at the deployed "
            "AI-Metadata-Improvement-Tool so the eval can fetch its canonical "
            "prompts from {url}/api/prompts."
        )
    try:
        resp = await client.get(f"{url}/api/prompts", timeout=10.0)
        resp.raise_for_status()
        served = resp.json().get("prompts", {})
    except Exception as exc:
        raise PromptSourceError(
            f"Failed to fetch canonical prompts from {url}/api/prompts: {exc}"
        ) from exc
    missing = [n for n in _REQUIRED if not (served.get(n) or "").strip()]
    if missing:
        raise PromptSourceError(
            f"Prompt source {url}/api/prompts is missing prompts: {missing}"
        )
    return Prompts(
        system=_normalize(served["system"]),
        dataset=_normalize(served["dataset"]),
        column=_normalize(served["column"]),
        source=f"remote:{url}",
    )
