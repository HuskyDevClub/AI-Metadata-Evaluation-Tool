import logging
from dataclasses import dataclass

import httpx

from .config import (
    DATABRICKS_CLIENT_ID,
    DATABRICKS_CLIENT_SECRET,
    DATABRICKS_HOST,
    PROMPTS_SOURCE_URL,
)

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


async def _databricks_auth_headers(client: httpx.AsyncClient) -> dict[str, str]:
    """Mint an OAuth machine-to-machine Bearer token from this app's injected
    service-principal credentials, so the cross-app GET passes the target app's
    Databricks front door (which 401s unauthenticated requests).

    Returns {} when the credentials aren't present (local dev), where the prompt
    source has no auth proxy and an Authorization header isn't needed.
    """
    host = DATABRICKS_HOST.strip().rstrip("/")
    if not (host and DATABRICKS_CLIENT_ID and DATABRICKS_CLIENT_SECRET):
        return {}
    if not host.startswith("http"):
        host = f"https://{host}"
    resp = await client.post(
        f"{host}/oidc/v1/token",
        auth=(DATABRICKS_CLIENT_ID, DATABRICKS_CLIENT_SECRET),
        data={"grant_type": "client_credentials", "scope": "all-apis"},
        timeout=10.0,
    )
    resp.raise_for_status()
    token = (resp.json().get("access_token") or "").strip()
    return {"Authorization": f"Bearer {token}"} if token else {}


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
        headers = await _databricks_auth_headers(client)
        resp = await client.get(f"{url}/api/prompts", headers=headers, timeout=10.0)
        resp.raise_for_status()
        served = resp.json().get("prompts", {})
    except httpx.HTTPStatusError as exc:
        hint = ""
        if exc.response.status_code in (401, 403):
            hint = (
                " — the Databricks front door rejected the request. Check that "
                "PROMPTS_SOURCE_URL points at the Improvement Tool (not this app) "
                "and that this app's service principal has CAN USE on it."
            )
        raise PromptSourceError(
            f"Failed to fetch canonical prompts from {url}/api/prompts: {exc}{hint}"
        ) from exc
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
