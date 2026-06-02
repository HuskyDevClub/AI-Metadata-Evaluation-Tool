# AI Metadata Evaluation Tool

A standalone backend + viewer for evaluating LLM-generated dataset metadata. It
generates metadata suggestions for a set of benchmark datasets, scores them with
a judge LLM, and renders the results side by side in a browser viewer. Supports
comparing multiple generator models in a single run.

This tool was extracted from the
[AI Metadata Improvement Tool](https://github.com/) and runs independently.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # then fill in your LLM credentials
```

See `.env.example` for all configuration options. At minimum you need
`LLM_ENDPOINT`, `LLM_API_KEY`, and `LLM_MODEL` for an OpenAI-compatible endpoint.

## Running

Start the evaluation backend (defaults to port `8001`):

```bash
python main.py
# or: uvicorn main:app --host 0.0.0.0 --port 8001
```

Then open the viewer. The viewer expects the backend at `http://localhost:8001`.
Serve it over HTTP so the browser can reach the backend:

```bash
python -m http.server 5500
# then open http://localhost:5500/eval_viewer.html
```

(Opening `eval_viewer.html` directly off disk via `file://` also works — the
backend allows that origin.)

## Benchmark dataset

The eval reads `DatasetsWithSolidMetadata.csv` from the repo root. This file is
git-ignored by default — place your own benchmark CSV there, or remove the
`*.csv` rule in `.gitignore` if you want to commit it.

`fetch_dataset_descriptions.ipynb` regenerates dataset/column descriptions used
for analysis.
