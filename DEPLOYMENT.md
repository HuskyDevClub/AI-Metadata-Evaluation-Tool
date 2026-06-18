# Deployment Guide — Databricks Apps via Git-Linked Workspace

This guide sets up **automatic deployment to your Databricks workspace** whenever
you push to `main`. The workflow uses a dedicated `release-databricks` branch to
store build artifacts, which is pulled into a **Databricks Git Folder (Repo)** and
deployed to your App.

## How It Works

On every push to `main`, the workflow:

1. Checks out the code and installs Node.js.
2. Runs `npm install`.
3. Writes `.env.databricks` from the `DATABRICKS_ENV_FILE` secret.
4. Syncs each line of `.env.databricks` into a Databricks secret scope
   (`metadata-eval-tool`) and registers app-level resources referencing those secrets.
5. Builds the frontend (`npm run build:databricks`) with `VITE_API_BASE_URL` empty
   so the bundle uses relative paths.
6. Pushes the artifacts (`backend/`, `app.yaml`, and the built `backend/static/`)
   to a **`release-databricks`** branch via **`deploy.sh`**.
7. Updates the **Git Folder** in your workspace to the latest commit on that branch.
8. Deploys the Databricks App from that workspace path. At runtime, `app.yaml`'s
   `valueFrom` entries pull each env var from the registered secret resources.

## Setup (GitHub Actions CI/CD)

### 1. Fork the repo

Fork this repository into your own GitHub account or organization.

### 2. Create the Databricks Git Folder (Repo)

1. Log into your Databricks workspace.
2. In the left sidebar, go to **Workspace**.
3. Right-click your user folder and select **Create → Git folder**.
4. Enter the URL of your forked repository.
5. Set the **Branch** to `release-databricks`. (If it doesn't exist yet, run the
   GitHub Action once to create it, or create it manually.)
6. Copy the path to this folder (e.g.
   `/Workspace/Users/you@example.com/ai-metadata-evaluation-tool`). This is your
   `DATABRICKS_WORKSPACE_PATH`.

### 3. Create the Databricks App

**Web UI:** **Compute → Apps → Create app**, choose **Custom app**, give it a name
(e.g. `metadata-eval-tool`), finish the wizard, and copy its public URL.

**CLI:** `databricks apps create metadata-eval-tool`

### 4. Prepare your `.env.databricks`

Clone your fork locally and start from the template:

```bash
cp .env.databricks.example .env.databricks
```

Fill in:
- `DATABRICKS_APP_NAME` — your app name.
- `DATABRICKS_WORKSPACE_PATH` — the path from Step 2.
- `FRONTEND_URL` — the public app URL (used as the canonical CORS origin).
- `LLM_ENDPOINT`, `LLM_API_KEY`, `LLM_MODEL`, `JUDGE_LLM_MODEL`, `SOCRATA_APP_TOKEN`.
- `PROMPTS_SOURCE_URL` *(required)* — the public URL of the deployed
  AI-Metadata-Improvement-Tool app. Each eval run fetches that app's canonical
  prompt templates from `{PROMPTS_SOURCE_URL}/api/prompts` (a server-side,
  backend-to-backend call — no CORS involved) so it scores the exact prompts that
  tool ships. There is no offline fallback: if this is unset or unreachable, eval
  runs and the Settings-drawer defaults fail with a clear error.

### 5. Add GitHub Repository Secrets

In **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `DATABRICKS_HOST` | Your workspace URL (e.g. `https://dbc-xxxx.cloud.databricks.com`). |
| `DATABRICKS_TOKEN` | A Databricks Personal Access Token. |
| `DATABRICKS_ENV_FILE` | The entire contents of your `.env.databricks`. |

### 6. Push to `main`

Any push to `main` triggers a deploy. You can also run it on demand via
**Actions → Deploy to Databricks → Run workflow**.

## Troubleshooting

**`Failed to resolve host metadata` / token rejection in the workflow log.**
`DATABRICKS_HOST` is pointing at the app's `*.databricksapps.com` URL instead of
the workspace URL. Set it to the URL you use to log into Databricks.

**`invalid access token` / `401 Unauthorized` from the CLI.** The PAT expired, was
revoked, or was created in a different workspace than `DATABRICKS_HOST`. Regenerate
it inside the same workspace and update the `DATABRICKS_TOKEN` secret.

**`app … not found` during `databricks apps deploy`.** You skipped Step 3 — the app
must exist before the workflow can deploy to it.

**CORS errors in the browser after a successful deploy.** `FRONTEND_URL` in
`.env.databricks` doesn't match the URL you're visiting, so the backend rejects the
origin. Update `FRONTEND_URL` to the exact Databricks App URL and redeploy.

**Deploy "succeeds" but the app shows a blank page or 404s on static assets.** The
frontend build didn't land in the synced `backend/static/`. Check that
`npm run build:databricks` ran cleanly and that `backend/static/index.html` shows
up in the workspace path from Step 2.

**Deploy fails with "pending deployment in progress" after the app was auto-stopped.**
`databricks apps start` itself consumes a deployment slot, so calling
`databricks apps deploy` immediately after hits Databricks' ~20-minute per-app rate
limit. `deploy.sh` avoids this by skipping the explicit deploy when it had to start
the app (the Git Folder update already synced the latest commit).

**Changed a secret but CI still uses the old value.** GitHub reads secrets at the
start of each run. Re-run the workflow after updating the secret.

**Eval runs fail with a 502 / "Failed to fetch canonical prompts" error.**
The cross-app fetch of `{PROMPTS_SOURCE_URL}/api/prompts` failed, and there is no
offline fallback by design (so the eval never scores stale prompts). Check, in order:

1. **`PROMPTS_SOURCE_URL` points at the wrong app.** It must be the **Improvement
   Tool's** app URL — not this Eval app's own URL. A `401` whose URL contains
   `ai-metadata-evaluation-tool` is this mistake.
2. **The 401/403 is the Databricks front door.** Every Databricks App is gated by
   Databricks OAuth, so the Eval app authenticates app-to-app: it mints a Bearer
   token from its injected service-principal credentials (`DATABRICKS_CLIENT_ID` /
   `DATABRICKS_CLIENT_SECRET` / `DATABRICKS_HOST`, all auto-provided) and sends it on
   the GET. For this to be accepted, **grant the Eval app's service principal
   `CAN USE` on the Improvement Tool app** (Improvement app → Permissions). Without
   that grant the front door returns `401`/`403` even with a valid token.
3. **The Improvement Tool app is stopped or unreachable.** Start it and confirm it
   serves `GET /api/prompts`.

When the fetch succeeds, the run's `start`/`metadata` event records `prompts_source`
as `"remote:https://…"`.
