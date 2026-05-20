const CATS_FALLBACK = [
  ["completeness", "Completeness"],
  ["accuracy", "Accuracy"],
  ["conciseness", "Conciseness"],
  ["plainLanguage", "Plain Language"],
  ["readability", "Readability"],
  ["guidelineCompliance", "Guideline Compliance"],
  ["consistency", "Consistency"],
  ["usefulness", "Usefulness / Public Value"],
];

// Pre-configured $/1M-token rates keyed by model name (case-insensitive substring match).
// Each entry is { input, output, note } — input is for prompt tokens, output is for completion tokens.
// Match uses the LONGEST key first, so "gpt-5.4-mini" beats "gpt-5.4" beats "gpt-5".
// GPT-5 series rates come from https://developers.openai.com/api/docs/pricing as of 2026-05-13.
// Edit freely — pricing may change, and not every model name shows up on the public page.
const MODEL_PRICING = {
  // --- OpenAI GPT-5 series (https://developers.openai.com/api/docs/pricing, 2026-05-13) ---
  "gpt-5.5-pro": {input: 30.00, output: 180.00, note: "OpenAI gpt-5.5-pro"},
  "gpt-5.5": {input: 5.00, output: 30.00, note: "OpenAI gpt-5.5"},
  "gpt-5.4-pro": {input: 30.00, output: 180.00, note: "OpenAI gpt-5.4-pro"},
  "gpt-5.4-nano": {input: 0.20, output: 1.25, note: "OpenAI gpt-5.4-nano"},
  "gpt-5.4-mini": {input: 0.75, output: 4.50, note: "OpenAI gpt-5.4-mini"},
  "gpt-5.4": {input: 2.50, output: 15.00, note: "OpenAI gpt-5.4"},
  // Older GPT-5.x variants (not on the current page, listed here for legacy runs)
  "gpt-5.2-pro": {input: 21.00, output: 126.00, note: "OpenAI gpt-5.2-pro (legacy)"},
  "gpt-5.2": {input: 1.75, output: 14.00, note: "OpenAI gpt-5.2 (legacy)"},
  "gpt-5.1": {input: 1.25, output: 10.00, note: "OpenAI gpt-5.1 (legacy)"},
  "gpt-5-nano": {input: 0.05, output: 0.40, note: "OpenAI gpt-5-nano (legacy)"},
  "gpt-5-mini": {input: 0.25, output: 2.00, note: "OpenAI gpt-5-mini (legacy)"},
  "gpt-5": {input: 0.625, output: 5.00, note: "OpenAI gpt-5 (legacy)"},
  // --- Local / open-weight (assume free) ---
  "ollama": {input: 0, output: 0, note: "local"},
  "qwen": {input: 0, output: 0, note: "local"},
  "mistral": {input: 0, output: 0, note: "local"},
  "llama": {input: 0, output: 0, note: "local"},
};

function lookupModelRate(modelName) {
  if (!modelName) return null;
  const lower = String(modelName).toLowerCase();
  // Sort by descending key length so "gpt-5.4-mini" beats "gpt-5.4" beats "gpt-5".
  const keys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (lower.includes(k.toLowerCase())) {
      return {...MODEL_PRICING[k], key: k};
    }
  }
  return null;
}

const fileInput = document.getElementById("file");
const main = document.getElementById("main");
const metaEl = document.getElementById("meta");
const saveBtn = document.getElementById("save-results");

fileInput.addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const text = await f.text();
    const data = JSON.parse(text);
    render(data);
  } catch (err) {
    main.innerHTML = `<div class="error">Failed to parse JSON: ${escapeHtml(err.message)}</div>`;
  }
});

// --- Run-new-eval panel (talks to /api/eval/run on the backend) ----------------
const RUN_DEFAULTS = {
  backend: "http://localhost:8001",
  limit: 5,
  evalColumns: true,
  maxCols: 8,
};

const runToggle = document.getElementById("run-toggle");
const runPanel = document.getElementById("run-panel");
const runBackend = document.getElementById("run-backend");
const runGeneratorModels = document.getElementById("run-generator-models");
const runJudgeModel = document.getElementById("run-judge-model");
const runLimit = document.getElementById("run-limit");
const runEvalColumns = document.getElementById("run-eval-columns");
const runMaxCols = document.getElementById("run-max-cols");
const runStart = document.getElementById("run-start");
const runCancel = document.getElementById("run-cancel");
const runStatus = document.getElementById("run-status");

// Restore persisted run-panel inputs.
runBackend.value = localStorage.getItem("evalViewer.runBackend") || RUN_DEFAULTS.backend;
runGeneratorModels.value = localStorage.getItem("evalViewer.runGeneratorModels") || "";
runJudgeModel.value = localStorage.getItem("evalViewer.runJudgeModel") || "";
const savedLimit = localStorage.getItem("evalViewer.runLimit");
if (savedLimit) runLimit.value = savedLimit;
const savedEvalCols = localStorage.getItem("evalViewer.runEvalColumns");
if (savedEvalCols !== null) runEvalColumns.checked = savedEvalCols === "1";
const savedMaxCols = localStorage.getItem("evalViewer.runMaxCols");
if (savedMaxCols) runMaxCols.value = savedMaxCols;

function persistRunInputs() {
  localStorage.setItem("evalViewer.runBackend", runBackend.value.trim());
  localStorage.setItem("evalViewer.runGeneratorModels", runGeneratorModels.value);
  localStorage.setItem("evalViewer.runJudgeModel", runJudgeModel.value.trim());
  localStorage.setItem("evalViewer.runLimit", String(runLimit.value));
  localStorage.setItem("evalViewer.runEvalColumns", runEvalColumns.checked ? "1" : "0");
  localStorage.setItem("evalViewer.runMaxCols", String(runMaxCols.value));
}

[runBackend, runGeneratorModels, runJudgeModel, runLimit, runEvalColumns, runMaxCols].forEach((el) => {
  el.addEventListener("change", persistRunInputs);
});

// Parse the generator-models textarea into a deduped list (one model per line).
function parseGeneratorModels() {
  const seen = [];
  for (const line of runGeneratorModels.value.split("\n")) {
    const m = line.trim();
    if (m && !seen.includes(m)) seen.push(m);
  }
  return seen;
}

function updateMaxColsState() {
  runMaxCols.disabled = !runEvalColumns.checked;
}

runEvalColumns.addEventListener("change", updateMaxColsState);
updateMaxColsState();

runToggle.addEventListener("click", () => {
  runPanel.hidden = !runPanel.hidden;
});

let _runController = null;

function setRunStatus(msg, isError) {
  runStatus.textContent = msg;
  runStatus.classList.toggle("run-error", !!isError);
}

function setRunning(running) {
  runStart.disabled = running;
  runStart.textContent = running ? "Running…" : "Run";
  runCancel.hidden = !running;
  updateSaveButton();
}

function updateSaveButton() {
  saveBtn.disabled = !(_lastData?.results?.length) || _runController !== null;
}

runCancel.addEventListener("click", () => {
  if (_runController) _runController.abort();
});

runStart.addEventListener("click", async () => {
  if (_runController) return; // already running
  persistRunInputs();

  const backend = (runBackend.value || RUN_DEFAULTS.backend).trim().replace(/\/+$/, "");
  const body = {
    datasetLimit: parseInt(runLimit.value, 10) || RUN_DEFAULTS.limit,
    evalColumns: runEvalColumns.checked,
    maxColumnsPerDataset: parseInt(runMaxCols.value, 10) || RUN_DEFAULTS.maxCols,
  };
  // Blank model fields → backend uses its LLM_MODEL / JUDGE_LLM_MODEL env defaults.
  const genModels = parseGeneratorModels();
  const judgeModel = runJudgeModel.value.trim();
  if (genModels.length) body.generatorModels = genModels;
  if (judgeModel) body.judgeModel = judgeModel;

  _runController = new AbortController();
  setRunning(true);
  setRunStatus("Connecting…");
  main.innerHTML = `<div class="empty">Eval in progress — results will appear here as each dataset finishes.</div>`;

  let resp;
  try {
    resp = await fetch(backend + "/api/eval/run", {
      method: "POST",
      headers: {"Content-Type": "application/json", "X-Requested-With": "fetch"},
      body: JSON.stringify(body),
      signal: _runController.signal,
    });
  } catch (err) {
    setRunStatus(`Network error: ${err.message}. Is the eval backend running? (python -m eval.main)`, true);
    _runController = null;
    setRunning(false);
    return;
  }

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => "");
    setRunStatus(`HTTP ${resp.status}: ${text || resp.statusText}`, true);
    _runController = null;
    setRunning(false);
    return;
  }

  // Stream NDJSON: one JSON object per newline. Buffer partial lines.
  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  const runState = {results: [], meta: {}, currentDatasetLabel: ""};

  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream: true});
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const rawLine = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!rawLine) continue;
        let evt;
        try {
          evt = JSON.parse(rawLine);
        } catch {
          continue; // ignore malformed line
        }
        handleRunEvent(evt, runState);
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      setRunStatus("Cancelled.", false);
    } else {
      setRunStatus(`Stream error: ${err.message}`, true);
    }
  } finally {
    _runController = null;
    setRunning(false);
  }
});

function handleRunEvent(evt, state) {
  switch (evt.type) {
    case "start":
      state.meta = {
        generator_models: evt.generator_models,
        judge_model: evt.judge_model,
        generated_at: evt.started_at,
        scoring_categories_dataset: evt.scoring_categories_dataset,
        scoring_categories_column: evt.scoring_categories_column,
      };
      setRunStatus(`Starting — ${evt.total} dataset${evt.total === 1 ? "" : "s"}`
        + ((evt.generator_models?.length ?? 0) > 1 ? ` × ${evt.generator_models.length} models` : ""));
      break;
    case "dataset_start":
      state.currentDatasetLabel = `[${evt.i}/${evt.total}] ${evt.id}`;
      setRunStatus(`${state.currentDatasetLabel} — fetching…`);
      break;
    case "stage": {
      // Prefix the per-model position only when more than one model is in play.
      const modelPart = (evt.model_total > 1 && evt.model)
        ? `[model ${evt.model_i}/${evt.model_total} ${evt.model}] ` : "";
      const suffix =
        evt.stage === "generating" ? "generating dataset description…"
          : evt.stage === "judging" ? "judging dataset description…"
            : evt.stage === "column" ? `column ${evt.i}/${evt.total}: ${evt.col}`
              : evt.stage;
      setRunStatus(`${state.currentDatasetLabel} — ${modelPart}${suffix}`);
      break;
    }
    case "dataset_done":
      state.results.push(evt.result);
      // Re-render with the partial output, so the user sees results stream in.
      render({metadata: state.meta, results: state.results.slice()});
      break;
    case "complete":
      // Final payload — includes scoring categories. Replace the partial render.
      render(evt.output);
      setRunStatus(`Done — ${evt.output.results?.length ?? 0} dataset${(evt.output.results?.length ?? 0) === 1 ? "" : "s"} evaluated.`);
      break;
    case "error":
      setRunStatus(`Server error: ${evt.error}`, true);
      break;
  }
}


function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function bar(score, max, klass) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  return `<div class="bar ${klass}"><div class="bar-fill" style="width:${pct}%"></div></div>`;
}

function scoresBlock(judgment, categories) {
  if (!judgment || !judgment.candidate1 || !judgment.candidate2) {
    return `<div class="error">Judgment data missing or malformed.</div>`;
  }
  const c1 = judgment.candidate1;
  const c2 = judgment.candidate2;
  const rows = categories.map(([key, label]) => {
    const s1 = typeof c1[key] === "number" ? c1[key] : null;
    const s2 = typeof c2[key] === "number" ? c2[key] : null;
    if (s1 === null && s2 === null) return "";
    return `
      <div class="cat">${escapeHtml(label)}</div>
      <div class="bar-pair">
        ${s1 !== null ? bar(s1, 10, "bar-1") : '<div class="bar bar-1"></div>'}
        ${s2 !== null ? bar(s2, 10, "bar-2") : '<div class="bar bar-2"></div>'}
      </div>
      <div class="nums">
        <div><b>${s1 ?? "–"}</b>/10</div>
        <div><b>${s2 ?? "–"}</b>/10</div>
      </div>
    `;
  }).join("");
  return `<div class="scores">${rows}</div>`;
}

function winnerBadge(winner) {
  if (winner === "1") return `<span class="winner-badge winner-1">Gold wins</span>`;
  if (winner === "2") return `<span class="winner-badge winner-2">AI wins</span>`;
  if (winner === "tie") return `<span class="winner-badge winner-tie">Tie</span>`;
  return `<span class="winner-badge winner-tie">${escapeHtml(winner ?? "?")}</span>`;
}

function descPair(gold, gen) {
  return `
    <div class="descs">
      <div class="desc-block">
        <div class="label"><span class="dot dot-1"></span>Gold (existing)</div>
        <p>${escapeHtml(gold || "(empty)")}</p>
      </div>
      <div class="desc-block">
        <div class="label"><span class="dot dot-2"></span>AI-generated</div>
        <p>${escapeHtml(gen || "(empty)")}</p>
      </div>
    </div>
  `;
}

function reasoningBlock(judgment) {
  const c1r = judgment.candidate1?.reasoning;
  const c2r = judgment.candidate2?.reasoning;
  const wr = judgment.winnerReasoning;
  let out = "";
  if (wr) out += `<div class="reasoning"><div class="label">Winner reasoning</div>${escapeHtml(wr)}</div>`;
  if (c1r) out += `<div class="reasoning"><div class="label"><span class="dot dot-1"></span> Gold reasoning</div>${escapeHtml(c1r)}</div>`;
  if (c2r) out += `<div class="reasoning"><div class="label"><span class="dot dot-2"></span> AI reasoning</div>${escapeHtml(c2r)}</div>`;
  return out;
}

function avg(nums) {
  const filtered = nums.filter((n) => typeof n === "number");
  if (!filtered.length) return null;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

function fmtTokens(n) {
  if (typeof n !== "number" || !isFinite(n)) return "0";
  return n.toLocaleString();
}

function fmtCost(usd, estimate) {
  if (!isFinite(usd) || usd <= 0) return "—";
  const prefix = estimate ? "≈" : "";
  if (usd < 0.01) return prefix + "<$0.01";
  return prefix + "$" + usd.toFixed(usd < 1 ? 4 : 2);
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

// --- Result-shape normalization -------------------------------------------------
// A dataset result holds one evaluation per generator model. New runs nest these
// under `model_evaluations`; legacy single-model files keep the fields directly on
// the result, so we wrap them into a one-element list keyed by the run's model.
function modelEvalsOf(r, meta) {
  if (Array.isArray(r?.model_evaluations)) return r.model_evaluations;
  if (r?.dataset_evaluation) {
    return [{
      generator_model:
        meta?.generator_model || meta?.generator_models?.[0] || "(generator)",
      dataset_evaluation: r.dataset_evaluation,
      column_evaluations: r.column_evaluations || [],
      tokens: r.tokens || {},
      elapsed_seconds: r.elapsed_seconds,
    }];
  }
  return [];
}

// Distinct generator models across all results, in first-seen order.
function generatorModelsIn(results, meta) {
  const seen = [];
  for (const r of results) {
    if (r?.error) continue;
    for (const me of modelEvalsOf(r, meta)) {
      const m = me.generator_model || "(generator)";
      if (!seen.includes(m)) seen.push(m);
    }
  }
  if (!seen.length && Array.isArray(meta?.generator_models)) {
    return meta.generator_models.slice();
  }
  return seen;
}

// --- Cost / token rates ---------------------------------------------------------
// Rates are keyed dynamically: judge uses "judgeIn"/"judgeOut"; each generator
// model uses "genIn:<slug>"/"genOut:<slug>" so several models can be priced apart.
// `*_USER_SET` distinguishes "user typed this rate" (sticky) from "auto-derived
// from MODEL_PRICING" (refreshed when models change).
const RATES = {};
const RATE_USER_SET = {};
const RATE_AUTO_FROM = {};

function rateLSKey(key) {
  return "evalViewer.rate." + key;
}

// Lazily load a rate key from localStorage the first time it is referenced.
function ensureRate(key) {
  if (key in RATES) return;
  RATES[key] = parseFloat(localStorage.getItem(rateLSKey(key)) || "0") || 0;
  RATE_USER_SET[key] = localStorage.getItem(rateLSKey(key) + ".userSet") === "1";
  RATE_AUTO_FROM[key] = "";
}

function genRateKey(model, dir) {
  return "gen" + dir + ":" + (slugify(model) || "model");
}

function applyAutoPricing(generatorModels, judgeModel) {
  const setAuto = (key, sourceRate, sourceField) => {
    ensureRate(key);
    if (RATE_USER_SET[key] || !sourceRate) {
      RATE_AUTO_FROM[key] = "";
      return;
    }
    RATES[key] = sourceRate[sourceField];
    RATE_AUTO_FROM[key] = sourceRate.key ?? "";
  };

  const jm = lookupModelRate(judgeModel);
  setAuto("judgeIn", jm, "input");
  setAuto("judgeOut", jm, "output");

  for (const model of generatorModels) {
    const gm = lookupModelRate(model);
    setAuto(genRateKey(model, "In"), gm, "input");
    setAuto(genRateKey(model, "Out"), gm, "output");
  }
}

function setRate(key, value) {
  RATES[key] = parseFloat(value) || 0;
  RATE_USER_SET[key] = true;
  localStorage.setItem(rateLSKey(key), String(RATES[key]));
  localStorage.setItem(rateLSKey(key) + ".userSet", "1");
}

function clearRate(key) {
  RATE_USER_SET[key] = false;
  localStorage.removeItem(rateLSKey(key));
  localStorage.removeItem(rateLSKey(key) + ".userSet");
}

// Split a per-bucket token record into {prompt, completion}.
// Supports the new shape ({prompt, completion, total}) and the legacy shape (a bare integer for total).
// When only total is available, assume a 50/50 prompt/completion split so the math still produces a number.
function splitTokens(entry) {
  if (entry == null) return {prompt: 0, completion: 0, total: 0, exact: true};
  if (typeof entry === "number") {
    const half = Math.round(entry / 2);
    return {prompt: half, completion: entry - half, total: entry, exact: false};
  }
  const p = Number(entry.prompt || 0);
  const c = Number(entry.completion || 0);
  const t = Number(entry.total || (p + c));
  return {prompt: p, completion: c, total: t || (p + c), exact: (p + c) > 0};
}

// Per-call cost helper.
function callCost(promptTok, completionTok, inRate, outRate) {
  return (promptTok / 1_000_000) * inRate + (completionTok / 1_000_000) * outRate;
}

// Aggregate token usage: generator tokens summed per model, judge tokens pooled.
function totalsFromResults(results, meta) {
  const perModel = new Map(); // model -> {prompt, completion}
  const judge = {prompt: 0, completion: 0};
  let anyLegacy = false;
  const bump = (target, s) => {
    target.prompt += s.prompt;
    target.completion += s.completion;
  };
  for (const r of results) {
    if (r?.error) continue;
    for (const me of modelEvalsOf(r, meta)) {
      const model = me.generator_model || "(generator)";
      if (!perModel.has(model)) perModel.set(model, {prompt: 0, completion: 0});
      const tok = me.tokens || {};
      for (const bucket of ["dataset_generation", "column_generation"]) {
        const s = splitTokens(tok[bucket]);
        bump(perModel.get(model), s);
        if (!s.exact) anyLegacy = true;
      }
      for (const bucket of ["dataset_judge", "column_judge"]) {
        const s = splitTokens(tok[bucket]);
        bump(judge, s);
        if (!s.exact) anyLegacy = true;
      }
    }
  }
  return {perModel, judge, anyLegacy};
}

function rateInput(key, label, autoFrom, userSet) {
  const hint = autoFrom
    ? `<span class="auto-hint">auto: ${escapeHtml(autoFrom)}</span>`
    : (userSet ? `<button type="button" class="reset-btn" data-reset="${escapeHtml(key)}">use auto</button>` : "");
  return `
    <label>${label}
      <input type="number" data-rate="${escapeHtml(key)}" min="0" step="0.01" value="${RATES[key] || ""}" placeholder="0.00">
      ${hint}
    </label>
  `;
}

function tokenRow(label, prompt, completion, cost, estimate) {
  return `
    <div class="summary-row">
      <span class="label">${label}</span>
      <span class="nums">
        <b>${fmtTokens(prompt + completion)} tok</b>
        <span class="muted"> (${fmtTokens(prompt)} in + ${fmtTokens(completion)} out)</span>
        <span class="cost-amount">${fmtCost(cost, estimate)}</span>
      </span>
    </div>
  `;
}

function costBlock(results, meta) {
  const t = totalsFromResults(results, meta);

  const modelRows = [];
  let genPrompt = 0;
  let genCompletion = 0;
  let genCost = 0;
  for (const [model, tok] of t.perModel) {
    const inKey = genRateKey(model, "In");
    const outKey = genRateKey(model, "Out");
    ensureRate(inKey);
    ensureRate(outKey);
    const cost = callCost(tok.prompt, tok.completion, RATES[inKey], RATES[outKey]);
    genPrompt += tok.prompt;
    genCompletion += tok.completion;
    genCost += cost;
    modelRows.push({model, inKey, outKey, tok, cost});
  }

  const judgeCost = callCost(t.judge.prompt, t.judge.completion, RATES.judgeIn, RATES.judgeOut);
  const totalCost = genCost + judgeCost;
  const grandPrompt = genPrompt + t.judge.prompt;
  const grandCompletion = genCompletion + t.judge.completion;
  const grandTotal = grandPrompt + grandCompletion;

  const legacyWarning = t.anyLegacy
    ? `<div class="legacy-warn">⚠ One or more datasets only recorded <code>total_tokens</code>. Cost was computed by assuming a 50/50 prompt/completion split. Re-run the notebook to record exact prompt + completion counts.</div>`
    : "";

  const rateGroups = modelRows.map(({model, inKey, outKey}) => `
    <div class="rate-group">
      <div class="rate-group-label" title="${escapeHtml(model)}">${escapeHtml(model)} $/1M</div>
      ${rateInput(inKey, "input", RATE_AUTO_FROM[inKey], RATE_USER_SET[inKey])}
      ${rateInput(outKey, "output", RATE_AUTO_FROM[outKey], RATE_USER_SET[outKey])}
    </div>
  `).join("");

  const modelTokenRows = modelRows.map(({model, tok, cost}) =>
    tokenRow(
      `Generator · <span class="model-name">${escapeHtml(model)}</span>`,
      tok.prompt, tok.completion, cost, t.anyLegacy,
    )
  ).join("");

  return `
    <h2 class="cost-heading">Token usage</h2>
    <div class="cost-controls">
      ${rateGroups}
      <div class="rate-group">
        <div class="rate-group-label">Judge $/1M</div>
        ${rateInput("judgeIn", "input", RATE_AUTO_FROM.judgeIn, RATE_USER_SET.judgeIn)}
        ${rateInput("judgeOut", "output", RATE_AUTO_FROM.judgeOut, RATE_USER_SET.judgeOut)}
      </div>
      <span class="muted">Input rate × prompt tokens + output rate × completion tokens. Edit <code>MODEL_PRICING</code> in <code>eval_viewer.js</code> to add models.</span>
    </div>
    ${legacyWarning}
    <div class="summary-grid">
      ${modelTokenRows}
      ${tokenRow("Judge", t.judge.prompt, t.judge.completion, judgeCost, t.anyLegacy)}
      <div class="summary-row total-row">
        <span class="label"><b>Total</b></span>
        <span class="nums">
          <b>${fmtTokens(grandTotal)} tok</b>
          <span class="muted"> (${fmtTokens(grandPrompt)} in + ${fmtTokens(grandCompletion)} out)</span>
          <span class="cost-amount"><b>${fmtCost(totalCost, t.anyLegacy)}</b></span>
        </span>
      </div>
    </div>
  `;
}

function summaryBlock(results, categories, meta) {
  const models = generatorModelsIn(results, meta);

  // Per model: winner counts and per-category gold/AI score lists.
  const perModel = new Map();
  for (const m of models) {
    perModel.set(m, {
      winners: {"1": 0, "2": 0, "tie": 0, "unknown": 0},
      gold: Object.fromEntries(categories.map(([k]) => [k, []])),
      gen: Object.fromEntries(categories.map(([k]) => [k, []])),
    });
  }

  let datasetCount = 0;
  for (const r of results) {
    if (r?.error) continue;
    datasetCount++;
    for (const me of modelEvalsOf(r, meta)) {
      const acc = perModel.get(me.generator_model || "(generator)");
      if (!acc) continue;
      const j = me.dataset_evaluation?.judgment;
      if (!j) continue;
      const w = j.winner ?? "unknown";
      acc.winners[w] = (acc.winners[w] ?? 0) + 1;
      for (const [k] of categories) {
        if (typeof j.candidate1?.[k] === "number") acc.gold[k].push(j.candidate1[k]);
        if (typeof j.candidate2?.[k] === "number") acc.gen[k].push(j.candidate2[k]);
      }
    }
  }

  // Gold column = average of the gold score across every model's judgments.
  const goldAvg = {};
  for (const [k] of categories) {
    const all = [];
    for (const acc of perModel.values()) all.push(...acc.gold[k]);
    goldAvg[k] = avg(all);
  }

  const headerCells = models
    .map((m) => `<th class="model-name col-gen">${escapeHtml(m)}</th>`)
    .join("");

  const bodyRows = categories.map(([key, label]) => {
    const g = goldAvg[key];
    const modelAvgs = models.map((m) => avg(perModel.get(m).gen[key]));
    if (g === null && modelAvgs.every((a) => a === null)) return "";
    const cells = modelAvgs.map((a) => {
      const delta = (g !== null && a !== null) ? a - g : null;
      const dClass = delta === null ? "delta-zero"
        : delta > 0 ? "delta-pos" : delta < 0 ? "delta-neg" : "delta-zero";
      const dStr = delta === null ? ""
        : ` <span class="delta ${dClass}">(${delta > 0 ? "+" : ""}${delta.toFixed(2)})</span>`;
      return `<td>${a !== null ? a.toFixed(2) : "–"}${dStr}</td>`;
    }).join("");
    return `<tr><td>${escapeHtml(label)}</td><td class="col-gold">${g !== null ? g.toFixed(2) : "–"}</td>${cells}</tr>`;
  }).join("");

  const winnerRows = models.map((m) => {
    const w = perModel.get(m).winners;
    return `
      <div class="model-winners-row">
        <span class="model-name">${escapeHtml(m)}</span>
        ${winnerBadge("1")} ${w["1"]}
        ${winnerBadge("2")} ${w["2"]}
        ${winnerBadge("tie")} ${w["tie"]}
        ${w["unknown"] ? `<span class="winner-badge winner-tie">Unknown</span> ${w["unknown"]}` : ""}
      </div>
    `;
  }).join("");

  const modelNote = models.length > 1 ? `, ${models.length} generator models` : "";

  return `
    <div class="summary">
      <h2>Run summary — dataset-level averages (${datasetCount} dataset${datasetCount === 1 ? "" : "s"}${modelNote})</h2>
      <div class="model-winners">${winnerRows}</div>
      <table class="summary-table">
        <thead><tr><th>Category</th><th class="col-gold">Gold</th>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      ${costBlock(results, meta)}
    </div>
  `;
}

function columnCard(col, categories) {
  const j = col.judgment ?? {};
  return `
    <div class="column-eval">
      <h3>${escapeHtml(col.display_name)} <span class="column-type">— ${escapeHtml(col.data_type)}</span> ${winnerBadge(j.winner)}</h3>
      ${descPair(col.gold_description, col.generated_description)}
      ${scoresBlock(j, categories)}
      ${reasoningBlock(j)}
    </div>
  `;
}

// One generator model's evaluation of a dataset (gold vs that model's output).
function modelEvalBlock(me, dsCats, colCats) {
  const j = me.dataset_evaluation?.judgment ?? {};
  const cols = me.column_evaluations ?? [];
  const tok = me.tokens || {};
  const dsGen = splitTokens(tok.dataset_generation);
  const colGen = splitTokens(tok.column_generation);
  const dsJud = splitTokens(tok.dataset_judge);
  const colJud = splitTokens(tok.column_judge);
  const rowEstimate = [dsGen, colGen, dsJud, colJud].some((s) => s.total > 0 && !s.exact);
  const genPrompt = dsGen.prompt + colGen.prompt;
  const genCompletion = dsGen.completion + colGen.completion;
  const judgePrompt = dsJud.prompt + colJud.prompt;
  const judgeCompletion = dsJud.completion + colJud.completion;
  const genTokens = genPrompt + genCompletion;
  const judgeTokens = judgePrompt + judgeCompletion;
  const model = me.generator_model || "(generator)";
  const inKey = genRateKey(model, "In");
  const outKey = genRateKey(model, "Out");
  ensureRate(inKey);
  ensureRate(outKey);
  const rowCost = callCost(genPrompt, genCompletion, RATES[inKey], RATES[outKey])
    + callCost(judgePrompt, judgeCompletion, RATES.judgeIn, RATES.judgeOut);
  return `
    <div class="model-eval">
      <h3 class="model-eval-head">
        <span class="model-eval-name">${escapeHtml(model)}</span>
        ${winnerBadge(j.winner)}
        <span class="tokens-strip">gen <b>${fmtTokens(genTokens)}</b> + judge <b>${fmtTokens(judgeTokens)}</b> = <b>${fmtTokens(genTokens + judgeTokens)}</b> tok${rowCost > 0 ? ` · <b>${fmtCost(rowCost, rowEstimate)}</b>` : ""}</span>
        ${typeof me.elapsed_seconds === "number" ? `<span class="muted">${me.elapsed_seconds}s</span>` : ""}
      </h3>
      ${descPair(me.dataset_evaluation?.gold_description, me.dataset_evaluation?.generated_description)}
      ${scoresBlock(j, dsCats)}
      ${reasoningBlock(j)}
      ${cols.length ? `
        <details class="columns">
          <summary>${cols.length} column evaluation${cols.length === 1 ? "" : "s"}</summary>
          ${cols.map((c) => columnCard(c, colCats)).join("")}
        </details>
      ` : ""}
    </div>
  `;
}

function datasetCard(r, dsCats, colCats, meta) {
  if (r.error) {
    return `<div class="card"><h2>${escapeHtml(r.dataset_id)} ${r.name ? "— " + escapeHtml(r.name) : ""}</h2><div class="error">${escapeHtml(r.error)}</div></div>`;
  }
  const modelEvals = modelEvalsOf(r, meta);
  return `
    <div class="card">
      <h2>${escapeHtml(r.name || r.dataset_id)}</h2>
      <div class="sub">
        <code>${escapeHtml(r.dataset_id)}</code>
        <span>${r.total_rows?.toLocaleString() ?? "?"} rows</span>
        <span>${r.column_count ?? "?"} columns</span>
        <span>${(r.elapsed_seconds ?? "?")}s</span>
        ${modelEvals.length > 1 ? `<span>${modelEvals.length} generator models</span>` : ""}
      </div>
      ${modelEvals.length
    ? modelEvals.map((me) => modelEvalBlock(me, dsCats, colCats)).join("")
    : `<div class="error">No model evaluations in this result.</div>`}
    </div>
  `;
}

let _lastData = null;

function slugify(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
}

function buildSaveFilename(data) {
  const meta = data?.metadata ?? {};
  const parts = ["eval_results"];
  const models = Array.isArray(meta.generator_models)
    ? meta.generator_models
    : (meta.generator_model ? [meta.generator_model] : []);
  if (models.length === 1) {
    const gen = slugify(models[0]);
    if (gen) parts.push(gen);
  } else if (models.length > 1) {
    parts.push((slugify(models[0]) || "multi") + `-and-${models.length - 1}-more`);
  }
  const judge = slugify(meta.judge_model);
  if (judge && !models.map(slugify).includes(judge)) parts.push("vs", judge);
  // Prefer the run's own timestamp; fall back to "now" so two saves don't collide.
  const stamp = (meta.generated_at || new Date().toISOString())
    .replace(/[:.]/g, "-")
    .replace(/[^0-9A-Za-z\-T]/g, "");
  parts.push(stamp);
  return parts.join("_") + ".json";
}

saveBtn.addEventListener("click", () => {
  if (!_lastData) return;
  const blob = new Blob([JSON.stringify(_lastData, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildSaveFilename(_lastData);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});

function render(data) {
  _lastData = data;
  updateSaveButton();
  const meta = data.metadata ?? {};
  const results = data.results ?? [];
  const genModels = generatorModelsIn(results, meta);
  applyAutoPricing(genModels, meta.judge_model);
  const dsCats = (meta.scoring_categories_dataset || []).map((c) => [c.key, c.label]);
  const colCats = (meta.scoring_categories_column || []).map((c) => [c.key, c.label]);
  const useDsCats = dsCats.length ? dsCats : CATS_FALLBACK;
  const useColCats = colCats.length ? colCats : CATS_FALLBACK.filter(([k]) => k !== "consistency");

  metaEl.innerHTML = `
    <span><b>Generator${genModels.length === 1 ? "" : "s"}:</b> ${genModels.length ? escapeHtml(genModels.join(", ")) : "?"}</span>
    <span><b>Judge:</b> ${escapeHtml(meta.judge_model || "?")}</span>
    <span><b>Datasets:</b> ${results.length}</span>
    ${meta.generated_at ? `<span><b>Started:</b> ${escapeHtml(fmtDate(meta.generated_at))}</span>` : ""}
  `;

  if (!results.length) {
    main.innerHTML = `<div class="empty">No results found in this file.</div>`;
    return;
  }

  // Preserve focus and caret position on rate inputs across re-renders (matters during streaming).
  const active = document.activeElement;
  const focusKey = active?.getAttribute?.("data-rate") || null;
  const caret = focusKey && typeof active.selectionStart === "number" ? active.selectionStart : null;

  main.innerHTML = summaryBlock(results, useDsCats, meta)
    + results.map((r) => datasetCard(r, useDsCats, useColCats, meta)).join("");
  wireRateInputs();

  if (focusKey) {
    const restored = main.querySelector(`input[data-rate="${focusKey}"]`);
    if (restored) {
      restored.focus();
      if (caret !== null) {
        try {
          restored.setSelectionRange(caret, caret);
        } catch { /* number inputs may not support */
        }
      }
    }
  }
}

function wireRateInputs() {
  for (const input of document.querySelectorAll("input[data-rate]")) {
    input.addEventListener("input", (e) => {
      setRate(input.getAttribute("data-rate"), e.target.value);
      if (_lastData) render(_lastData);
    });
  }
  for (const btn of document.querySelectorAll(".reset-btn")) {
    btn.addEventListener("click", () => {
      clearRate(btn.getAttribute("data-reset"));
      if (_lastData) render(_lastData);
    });
  }
}
