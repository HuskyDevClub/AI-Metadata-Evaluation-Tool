# AI Metadata Evaluation Tool

A **React + FastAPI** app for evaluating dataset metadata quality. It can:

- **Validate existing human-written metadata** — score the description published
  live on data.wa.gov, or the curated metadata you exported from the
  [AI Metadata Improvement Tool](https://github.com/HuskyDevClub/AI-Metadata-Improvement-Tool),
  on the judge rubric (absolute scores, no comparison).
- **Compare models** — generate metadata with several models and score them side
  by side.
- **Compare prompts** — define named prompt variants and score them side by side
  (one model, many prompts).
- **Compare against gold** — judge each generated description head-to-head against
  the live data.wa.gov description and pick a winner.

A judge LLM scores every candidate; comparison appears automatically whenever a
run has more than one candidate (multiple models or prompt variants) or the
"compare against gold" toggle is on. Results stream into the browser as each
dataset finishes, with per-model cost estimates and a run summary.

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
npm run dev:all   # backend on :8001, Vite dev server on :5174
```

Then open **http://localhost:5174**. Vite proxies `/api/*` to the backend, so the
frontend and backend share an origin (the same as in production). You can also
run them separately with `npm run dev:backend` and `npm run dev`.

## Production build

```bash
npm run build:databricks   # outputs the SPA into backend/static
python -m backend.main     # serves API + SPA on :8001
```

Open **http://localhost:8001** — the backend serves the built frontend and the
API at the same origin. (`npm run build` outputs to `dist/` instead, for a
standalone frontend bundle.)

## Deploy to Databricks

The app deploys to Databricks Apps via GitHub Actions (build → push a
`release-databricks` branch → deploy). See [DEPLOYMENT.md](./DEPLOYMENT.md) for
the one-time workspace + secrets setup. Start from
`cp .env.databricks.example .env.databricks`.

## Prompts (shared with the main tool)

The metadata-generation prompts (`system`, `dataset`, `column`) are the same
templates the main tool ships, so the eval scores the prompts that actually run
in production rather than a drifting copy. The main tool exposes them at
`GET /api/prompts`; set `PROMPTS_SOURCE_URL` to its base URL and the eval fetches
them at the start of each run (recorded as `prompts_source` in the run metadata).
When unset or unreachable, it falls back to the bundled copies in
`backend/prompts/`. The judge prompts are eval-only and live in `backend/router.py`.

## Dataset sources

Every dataset is loaded live from Socrata by its UID (columns, sample rows, row
count, and the live description). The **Run new eval** panel offers three ways to
supply the UIDs:

1. **Benchmark CSV** — the bundled `backend/DatasetsWithSolidMetadata.csv`. This
   file is git-ignored by default (the `*.csv` rule); place your own benchmark
   CSV there, or remove the rule in `.gitignore` to commit it. Each row needs at
   least a `UID` column.
2. **Socrata UIDs** — paste UIDs directly (one per line).
3. **Import JSON** — upload one or more metadata exports from the AI Metadata
   Improvement Tool. Each export's `socrataDatasetId` is used as the UID
   ("import through UID"), and its curated `metadata` (`datasetDescription` +
   `columnDescriptions`) becomes the "imported" metadata you can score.

`scripts/fetch_dataset_descriptions.ipynb` fetches dataset/column descriptions
from a Socrata portal to build fine-tuning datasets.

## Run modes

A run scores one or more **candidates** per dataset:

- **Score existing metadata** — tick *evaluate live* and/or *evaluate imported*
  to validate the published / curated metadata on its own (absolute rubric
  score). With no generator model selected, this is a pure "validate my
  datasets" run.
- **Generate** — add generator models (2+ compares models) and/or prompt
  variants (2+ compares prompts). Each generated candidate is scored on the
  rubric, and additionally judged head-to-head against the live gold when
  *compare against gold* is on.
