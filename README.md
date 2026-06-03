# AI Metadata Evaluation Tool

A **React + FastAPI** app for evaluating LLM-generated dataset metadata. It
generates metadata suggestions for a set of benchmark datasets, scores them with
a judge LLM, and renders the results side by side in the browser — including
live streaming progress, per-model cost estimates, and side-by-side comparison
of multiple generator models in a single run.

The frontend (Vite/React) builds into `backend/static`, and the FastAPI backend
serves it as a single same-origin app. It runs locally and deploys to
**Databricks Apps**, mirroring the
[AI Metadata Improvement Tool](https://github.com/HuskyDevClub/AI-Metadata-Improvement-Tool)
it was extracted from.

## Layout

```
backend/    FastAPI app — POST /api/eval/run (NDJSON stream) + serves the SPA
src/        React frontend (the eval viewer)
scripts/    fetch_dataset_descriptions.ipynb (fine-tuning data prep)
app.yaml, deploy.sh, .github/workflows/   Databricks Apps deployment
```

## Local development

Requires Node.js and Python 3.

```bash
# 1. Frontend deps
npm install

# 2. Backend deps (a virtualenv is recommended)
pip install -r backend/requirements.txt

# 3. Backend config — fill in your LLM credentials
cp backend/.env.example backend/.env
```

At minimum set `LLM_ENDPOINT`, `LLM_API_KEY`, and `LLM_MODEL` (an
OpenAI-compatible endpoint) in `backend/.env`. `SOCRATA_APP_TOKEN` raises Socrata
rate limits when fetching dataset metadata.

Run both servers together:

```bash
npm run dev:all   # backend on :8000, Vite dev server on :5173
```

Then open **http://localhost:5173**. Vite proxies `/api/*` to the backend, so the
frontend and backend share an origin (the same as in production). You can also
run them separately with `npm run dev:backend` and `npm run dev`.

## Production build

```bash
npm run build:databricks   # outputs the SPA into backend/static
python -m backend.main     # serves API + SPA on :8000
```

Open **http://localhost:8000** — the backend serves the built frontend and the
API at the same origin. (`npm run build` outputs to `dist/` instead, for a
standalone frontend bundle.)

## Deploy to Databricks

The app deploys to Databricks Apps via GitHub Actions (build → push a
`release-databricks` branch → deploy). See [DEPLOYMENT.md](./DEPLOYMENT.md) for
the one-time workspace + secrets setup. Start from
`cp .env.databricks.example .env.databricks`.

## Benchmark dataset

The eval reads `backend/DatasetsWithSolidMetadata.csv`. This file is git-ignored
by default (the `*.csv` rule) — place your own benchmark CSV there, or remove the
rule in `.gitignore` if you want to commit it. Each row needs at least a `UID`
column (and optionally a `Domain`).

`scripts/fetch_dataset_descriptions.ipynb` fetches dataset/column descriptions
from a Socrata portal to build fine-tuning datasets.
