from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import RequestResponseEndpoint

# Importing config first triggers dotenv loading for the whole package.
from .config import FRONTEND_URL, PORT
from .models import HealthResponse
from .router import router as eval_router

app = FastAPI(
    title="AI Metadata Evaluation Tool API",
    description="Backend for metadata generation + judge evaluation",
    version="1.0.0",
)

# CORS: the eval tool has no cookies/auth, so credentials are off. In production
# the backend serves the built frontend at the same origin (Databricks Apps), so
# no preflight fires; in dev the Vite proxy forwards /api/* same-origin. This
# mainly guards direct cross-origin calls. FRONTEND_URL is the canonical origin.
_cors_origins = (
    [FRONTEND_URL]
    if FRONTEND_URL
    else ["http://localhost:5174", "http://localhost:8001"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Requested-With"],
)


@app.middleware("http")
async def add_security_headers(
    request: Request, call_next: RequestResponseEndpoint
) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; frame-ancestors 'self'"
    )
    return response


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )


# Register API routers before the SPA catch-all so /api/* paths are not shadowed.
app.include_router(eval_router)


# Serve the built React frontend. In Databricks Apps, static files are served
# from backend/static (produced by `npm run build:databricks`).
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static_assets")
    _STATIC_ROOT = static_dir.resolve()

    @app.get("/")
    async def serve_root() -> FileResponse:
        index_path = static_dir / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="Frontend not built")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str) -> FileResponse:
        # Don't interfere with API routes.
        if full_path.startswith("api/") or full_path == "health":
            raise HTTPException(status_code=404, detail="Not found")

        # Resolve the requested path and confirm it stays inside static_dir.
        # Prevents path-traversal (e.g. "../../etc/passwd") from escaping root.
        file_path = (static_dir / full_path).resolve()
        if file_path.is_relative_to(_STATIC_ROOT) and file_path.is_file():
            return FileResponse(file_path)

        # Fall back to index.html for SPA routing.
        index_path = _STATIC_ROOT / "index.html"
        if index_path.is_file():
            return FileResponse(index_path)

        raise HTTPException(status_code=404, detail="Not found")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
