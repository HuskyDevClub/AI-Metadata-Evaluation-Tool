# AI Metadata Evaluation Tool

A **React + FastAPI** app for evaluating dataset metadata quality. It can:

- **Validate existing human-written metadata** — score the live published description (on data.wa.gov or any Socrata portal), or the curated metadata you exported from the [AI Metadata Improvement Tool](https://github.com/HuskyDevClub/AI-Metadata-Improvement-Tool), on the judge rubric (absolute scores, no comparison).
- **Compare models** — generate metadata with several models and score them side by side.
- **Compare prompts** — define named prompt variants and score them side by side (one model, many prompts).
- **Compare against gold** — judge each generated description head-to-head against the live published description and pick a winner.

A judge LLM scores every candidate; comparison appears automatically whenever a run has more than one candidate (multiple models or prompt variants) or the "compare against gold" toggle is on. Results stream into the browser as each dataset finishes, with per-model cost estimates and a run summary.

The frontend (Vite/React) builds into `backend/static`, and the FastAPI backend serves it as a single same-origin app. It runs locally and deploys to **Databricks Apps**, mirroring the [AI Metadata Improvement Tool](https://github.com/HuskyDevClub/AI-Metadata-Improvement-Tool) it was extracted from.

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

At minimum set `LLM_ENDPOINT`, `LLM_API_KEY`, and `LLM_MODEL` (an OpenAI-compatible endpoint) in `backend/.env`. `SOCRATA_APP_TOKEN` raises Socrata rate limits when fetching dataset metadata.

Run both servers together:

```bash
npm run dev:all   # backend on :8001, Vite dev server on :5174
```

Then open **http://localhost:5174**. Vite proxies `/api/*` to the backend, so the frontend and backend share an origin (the same as in production). You can also run them separately with `npm run dev:backend` and `npm run dev`.

## Production build

```bash
npm run build:databricks   # outputs the SPA into backend/static
python -m backend.main     # serves API + SPA on :8001
```

Open **http://localhost:8001** — the backend serves the built frontend and the API at the same origin. (`npm run build` outputs to `dist/` instead, for a standalone frontend bundle.)

## Deploy to Databricks

The app deploys to Databricks Apps via GitHub Actions (build → push a `release-databricks` branch → deploy). See [DEPLOYMENT.md](./DEPLOYMENT.md) for the one-time workspace + secrets setup. Start from `cp .env.databricks.example .env.databricks`.

## Prompts (shared with the main tool)

The metadata-generation prompts (`system`, `dataset`, `column`) are the same templates the main tool ships, so the eval scores the prompts that actually run in production rather than a drifting copy. The main tool exposes them at `GET /api/prompts`; set `PROMPTS_SOURCE_URL` to its base URL and the eval fetches them at the start of each run (recorded as `prompts_source` in the run metadata). This is required and has no offline fallback — if `PROMPTS_SOURCE_URL` is unset or unreachable, eval runs fail with a clear error rather than scoring a stale local copy. The judge prompts are eval-only and live in `backend/router.py`.

## Dataset sources

Every dataset is loaded live from Socrata by its UID (columns, sample rows, row count, and the live description). The **Run new eval** panel offers three ways to supply the UIDs:

1. **Benchmark CSV** — choose a `.csv` file with a `UID` column; its UIDs are read in the browser and evaluated. (The backend also bundles `backend/DatasetsWithSolidMetadata.csv` as the default for direct API calls without UIDs; it's git-ignored by the `*.csv` rule, so drop your own in, or remove the rule to commit it.)
2. **Paste UIDs** — add a UID or a full dataset URL, one at a time. URLs are converted to their UID automatically; a URL from another Socrata portal keeps its domain, so the dataset is loaded from there rather than data.wa.gov.
3. **Import JSON** — upload one or more metadata exports from the AI Metadata Improvement Tool. Each export's `socrataDatasetId` is used as the UID ("import through UID"), and its curated `metadata` (`datasetDescription` + `columnDescriptions`) becomes the "imported" metadata you can score. Available for validation only (see Run modes).

`scripts/fetch_dataset_descriptions.ipynb` fetches dataset/column descriptions from a Socrata portal to build fine-tuning datasets.

## Run modes

A run scores one or more **candidates** per dataset:

- **Validate existing metadata** — score the published / curated metadata on its own (absolute rubric score, no generation). For Benchmark CSV and Paste UIDs the live portal metadata is scored automatically; for Import JSON you pick the live and/or imported (curated) metadata.
- **Evaluate AI generation** — generate metadata and score it. Vary **Prompts** (one model, 2+ prompts), **Models** (2+ models, one prompt), or **Models × Prompts** (every model with every prompt, or hand-picked model↔prompt pairings). Each generated candidate is scored on the rubric, and additionally judged head-to-head against the live description when *compare against gold* is on. (Runs from Benchmark CSV or Paste UIDs — Import JSON is validation-only.)
