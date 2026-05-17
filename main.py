from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import PORT
from .router import router

app = FastAPI(
    title="AI Metadata Eval API",
    description="Dev-only metadata generation + judge evaluation backend",
    version="1.0.0",
)

# The eval viewer is a standalone HTML in eval/, usually opened either via
# `python -m http.server 5500` from the eval/ directory, or directly off disk
# (file://). Allow those origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "null",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
