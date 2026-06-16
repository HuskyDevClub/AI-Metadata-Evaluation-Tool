import {type ChangeEvent, useEffect, useState} from 'react'
import type {EvalDefaults, ScoringCategory} from '@/types/eval'
import {API_BASE_URL_KEY, ENV_API_BASE_URL} from '@/utils/config'
import {
    clearAllSettings,
    type CustomRate,
    exportSettings,
    getCustomPricing,
    importSettings,
    setCustomPricing,
} from '@/utils/settingsStore'
import {downloadJsonAs, readJsonFile} from '@/utils/fileIo'
import {MODEL_PRICING} from '@/utils/pricing'
import {RUN_DEFAULTS, RUN_LS} from '@/utils/runDefaults'
import {fetchEvalDefaults, getScoring, type ScoringLevel, setScoring,} from '@/utils/runConfig'

const METRIC_KEY_RE = /^[A-Za-z][A-Za-z0-9_]*$/

// Derive a safe metric key from a label, e.g. "Plain Language" → "plain_language".
function metricKeyFromLabel(label: string): string {
    const slug = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    if (!slug) return ''
    return /^[a-z]/.test(slug) ? slug : `m_${slug}`
}

// --- Judge metrics ----------------------------------------------------------
function MetricsList({
                         level,
                         defaults,
                     }: {
    level: ScoringLevel
    defaults: ScoringCategory[] | null
}) {
    // null = "use backend defaults"; an array = a customized override.
    const [override, setOverride] = useState<ScoringCategory[] | null>(() => getScoring(level))
    const list = override ?? defaults ?? []
    const isCustom = override !== null

    const persist = (next: ScoringCategory[]) => {
        setOverride(next)
        setScoring(level, next)
    }
    const update = (i: number, patch: Partial<ScoringCategory>) =>
        persist(list.map((c, idx) => (idx === i ? {...c, ...patch} : c)))
    const editLabel = (i: number, label: string) => {
        const c = list[i]
        // Auto-fill an empty key from the label so quick adds stay valid.
        const patch: Partial<ScoringCategory> = {label}
        if (!c.key.trim()) patch.key = metricKeyFromLabel(label)
        update(i, patch)
    }
    const remove = (i: number) => persist(list.filter((_, idx) => idx !== i))
    const add = () => persist([...list, {key: '', label: '', description: '', min: 0, max: 10}])
    const reset = () => {
        setOverride(null)
        setScoring(level, null)
    }

    return (
        <div className="metrics-block">
            <div className="metrics-head">
                <span className="metrics-title">
                    {level === 'dataset' ? 'Dataset metrics' : 'Column metrics'}
                    {isCustom && <span className="edited-badge">custom</span>}
                </span>
                {isCustom && (
                    <button type="button" className="reset-btn" onClick={reset}>
                        Reset to defaults
                    </button>
                )}
            </div>
            {!defaults && !isCustom ? (
                <p className="section-hint">Loading defaults…</p>
            ) : (
                <>
                    {list.map((c, i) => {
                        const keyInvalid = !METRIC_KEY_RE.test(c.key.trim())
                        const rangeInvalid = !(c.max > c.min && c.min >= 0)
                        return (
                            <div className="metric-row" key={i}>
                                <input
                                    type="text"
                                    className={`metric-label-input${
                                        !c.label.trim() ? ' invalid' : ''
                                    }`}
                                    placeholder="Label"
                                    value={c.label}
                                    onChange={(e) => editLabel(i, e.target.value)}
                                />
                                <input
                                    type="text"
                                    className={`metric-key-input${keyInvalid ? ' invalid' : ''}`}
                                    placeholder="key"
                                    value={c.key}
                                    onChange={(e) => update(i, {key: e.target.value})}
                                />
                                <input
                                    type="number"
                                    className={`metric-range-input${rangeInvalid ? ' invalid' : ''}`}
                                    aria-label="Minimum score"
                                    title="Min score"
                                    value={c.min}
                                    onChange={(e) =>
                                        update(i, {min: parseInt(e.target.value, 10) || 0})
                                    }
                                />
                                <span className="metric-range-sep">–</span>
                                <input
                                    type="number"
                                    className={`metric-range-input${rangeInvalid ? ' invalid' : ''}`}
                                    aria-label="Maximum score"
                                    title="Max score"
                                    value={c.max}
                                    onChange={(e) =>
                                        update(i, {max: parseInt(e.target.value, 10) || 0})
                                    }
                                />
                                <button
                                    type="button"
                                    className="reset-btn"
                                    aria-label="Remove metric"
                                    onClick={() => remove(i)}
                                >
                                    ✕
                                </button>
                                <textarea
                                    className="metric-desc-input"
                                    rows={2}
                                    placeholder="What the judge should assess"
                                    value={c.description}
                                    onChange={(e) => update(i, {description: e.target.value})}
                                />
                            </div>
                        )
                    })}
                    <button type="button" className="run-btn add-metric" onClick={add}>
                        + Add metric
                    </button>
                </>
            )}
        </div>
    )
}

// Slide-in drawer for app settings: backend URL, run defaults, generation
// prompts, judge metrics, custom model pricing, and a reset. Every field
// persists to the localStorage keys the rest of the app reads.
export function SettingsPanel({onClose}: { onClose: () => void }) {
    // --- Backend / API URL ---------------------------------------------------
    const [apiUrl, setApiUrl] = useState(() => localStorage.getItem(API_BASE_URL_KEY) ?? '')
    useEffect(() => {
        const v = apiUrl.trim()
        if (v) localStorage.setItem(API_BASE_URL_KEY, v)
        else localStorage.removeItem(API_BASE_URL_KEY)
    }, [apiUrl])

    // --- Run defaults (shared with the Run panel) ---------------------------
    const [judgeModel, setJudgeModel] = useState(() => localStorage.getItem(RUN_LS.judge) || '')
    const [limit, setLimit] = useState(
        () => localStorage.getItem(RUN_LS.limit) || String(RUN_DEFAULTS.limit),
    )
    const [evalCols, setEvalCols] = useState(() => {
        const s = localStorage.getItem(RUN_LS.evalCols)
        return s === null ? RUN_DEFAULTS.evalColumns : s === '1'
    })
    const [maxCols, setMaxCols] = useState(
        () => localStorage.getItem(RUN_LS.maxCols) || String(RUN_DEFAULTS.maxCols),
    )
    useEffect(() => localStorage.setItem(RUN_LS.judge, judgeModel), [judgeModel])
    useEffect(() => localStorage.setItem(RUN_LS.limit, limit), [limit])
    useEffect(() => localStorage.setItem(RUN_LS.evalCols, evalCols ? '1' : '0'), [evalCols])
    useEffect(() => localStorage.setItem(RUN_LS.maxCols, maxCols), [maxCols])

    // --- Defaults from the backend (judge metrics) --------------------------
    const [defaults, setDefaults] = useState<EvalDefaults | null>(null)
    // Fetch once on open. setState runs only in the async continuations (after
    // await), never synchronously in the effect body, so renders don't cascade.
    useEffect(() => {
        let cancelled = false
        fetchEvalDefaults()
            .then((d) => !cancelled && setDefaults(d))
            .catch(() => undefined)
        return () => {
            cancelled = true
        }
    }, [])

    // --- Custom model pricing ------------------------------------------------
    const [pricing, setPricing] = useState<Record<string, CustomRate>>(() => getCustomPricing())
    const [newKey, setNewKey] = useState('')
    const [newIn, setNewIn] = useState('')
    const [newOut, setNewOut] = useState('')

    const persistPricing = (next: Record<string, CustomRate>) => {
        setPricing(next)
        setCustomPricing(next) // notifies the cost UI to re-resolve rates
    }
    const addPricing = () => {
        const k = newKey.trim().toLowerCase()
        if (!k) return
        persistPricing({
            ...pricing,
            [k]: {input: parseFloat(newIn) || 0, output: parseFloat(newOut) || 0},
        })
        setNewKey('')
        setNewIn('')
        setNewOut('')
    }
    const removePricing = (k: string) => {
        const next = {...pricing}
        delete next[k]
        persistPricing(next)
    }

    // Bumped after a reset/import so this panel re-reads localStorage: the
    // run-default/pricing fields are re-synced and the prompt/metric editors
    // (keyed by this nonce) remount fresh.
    const [resetNonce, setResetNonce] = useState(0)
    const [ioStatus, setIoStatus] = useState<{ msg: string; error: boolean } | null>(null)

    const syncFromStorage = () => {
        setApiUrl(localStorage.getItem(API_BASE_URL_KEY) ?? '')
        setJudgeModel(localStorage.getItem(RUN_LS.judge) || '')
        setLimit(localStorage.getItem(RUN_LS.limit) || String(RUN_DEFAULTS.limit))
        const s = localStorage.getItem(RUN_LS.evalCols)
        setEvalCols(s === null ? RUN_DEFAULTS.evalColumns : s === '1')
        setMaxCols(localStorage.getItem(RUN_LS.maxCols) || String(RUN_DEFAULTS.maxCols))
        setPricing(getCustomPricing())
        setResetNonce((n) => n + 1)
    }

    // --- Import / export -----------------------------------------------------
    const onExport = () => {
        const stamp = new Date().toISOString().slice(0, 10)
        downloadJsonAs(exportSettings(), `eval-settings_${stamp}.json`)
        setIoStatus({msg: 'Settings exported.', error: false})
    }
    const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        e.target.value = '' // allow re-importing the same file
        if (!f) return
        try {
            const count = importSettings(await readJsonFile(f))
            syncFromStorage()
            setIoStatus({msg: `Imported ${count} setting${count === 1 ? '' : 's'}.`, error: false})
        } catch (err) {
            setIoStatus({msg: `Import failed: ${(err as Error).message}`, error: true})
        }
    }

    // --- Reset ---------------------------------------------------------------
    const resetAll = () => {
        if (
            !window.confirm(
                'Clear all saved settings (cost rates, run defaults, prompts, judge metrics, custom pricing, API URL)? This cannot be undone.',
            )
        )
            return
        clearAllSettings()
        syncFromStorage()
        setIoStatus({msg: 'All settings cleared.', error: false})
    }

    // Close on Escape for keyboard parity with the backdrop click.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const customKeys = Object.keys(pricing)

    return (
        <>
            <div className="drawer-backdrop" onClick={onClose}/>
            <aside className="settings-drawer" role="dialog" aria-label="Settings">
                <div className="settings-drawer-head">
                    <h2>Settings</h2>
                    <button
                        type="button"
                        className="drawer-close"
                        aria-label="Close settings"
                        onClick={onClose}
                    >
                        ✕
                    </button>
                </div>

                <section className="settings-section">
                    <h3>Backend / API URL</h3>
                    <p className="section-hint">
                        Override the eval backend the viewer calls. Leave blank to use the build
                        default
                        {ENV_API_BASE_URL ? (
                            <>
                                {' '}
                                (<code>{ENV_API_BASE_URL}</code>)
                            </>
                        ) : (
                            <> (same origin)</>
                        )}
                        .
                    </p>
                    <label className="settings-field">
                        Base URL
                        <input
                            type="text"
                            placeholder="https://my-backend.example.com"
                            value={apiUrl}
                            onChange={(e) => setApiUrl(e.target.value)}
                        />
                    </label>
                </section>

                <section className="settings-section">
                    <h3>Run defaults</h3>
                    <p className="section-hint">
                        Defaults the <b>Run new eval…</b> panel starts from. Generator models and
                        prompts now live in that panel. A blank judge model uses the backend env
                        default.
                    </p>
                    <label className="settings-field">
                        Judge model
                        <input
                            type="text"
                            placeholder="(env default)"
                            value={judgeModel}
                            onChange={(e) => setJudgeModel(e.target.value)}
                        />
                    </label>
                    <label className="settings-field">
                        Datasets
                        <input
                            type="number"
                            min={1}
                            max={200}
                            value={limit}
                            onChange={(e) => setLimit(e.target.value)}
                        />
                    </label>
                    <label className="settings-field row">
                        <input
                            type="checkbox"
                            checked={evalCols}
                            onChange={(e) => setEvalCols(e.target.checked)}
                        />
                        Evaluate columns
                    </label>
                    <label className="settings-field">
                        Max columns / dataset (-1 = all)
                        <input
                            type="number"
                            min={-1}
                            max={100}
                            value={maxCols}
                            disabled={!evalCols}
                            onChange={(e) => setMaxCols(e.target.value)}
                        />
                    </label>
                </section>

                <section className="settings-section">
                    <h3>Judge metrics</h3>
                    <p className="section-hint">
                        Categories the judge scores each candidate on. Edit, remove, or add rows;
                        keys must start with a letter (letters, digits, underscores only). The two
                        number boxes set each metric’s integer score range (default 0–10).
                    </p>
                    <MetricsList
                        key={`metrics-dataset-${resetNonce}`}
                        level="dataset"
                        defaults={defaults?.scoring_categories_dataset ?? null}
                    />
                    <MetricsList
                        key={`metrics-column-${resetNonce}`}
                        level="column"
                        defaults={defaults?.scoring_categories_column ?? null}
                    />
                </section>

                <section className="settings-section">
                    <h3>Model pricing</h3>
                    <p className="section-hint">
                        Custom $/1M-token rates, matched by case-insensitive model-name substring.
                        These extend or override the built-in table and drive the auto cost
                        estimates.
                    </p>
                    {customKeys.length > 0 && (
                        <div className="pricing-list">
                            {customKeys.map((k) => (
                                <div className="pricing-row" key={k}>
                                    <code className="pricing-key" title={k}>
                                        {k}
                                    </code>
                                    <span className="pricing-rate">
                                        in {pricing[k].input} · out {pricing[k].output}
                                    </span>
                                    <button
                                        type="button"
                                        className="reset-btn"
                                        onClick={() => removePricing(k)}
                                    >
                                        remove
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="pricing-add">
                        <input
                            type="text"
                            placeholder="model key (e.g. gpt-5.4)"
                            value={newKey}
                            onChange={(e) => setNewKey(e.target.value)}
                        />
                        <input
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder="in"
                            value={newIn}
                            onChange={(e) => setNewIn(e.target.value)}
                        />
                        <input
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder="out"
                            value={newOut}
                            onChange={(e) => setNewOut(e.target.value)}
                        />
                        <button
                            type="button"
                            className="run-btn"
                            disabled={!newKey.trim()}
                            onClick={addPricing}
                        >
                            Add
                        </button>
                    </div>
                    <details className="pricing-builtin">
                        <summary>Built-in rates ({Object.keys(MODEL_PRICING).length})</summary>
                        <div className="pricing-list">
                            {Object.entries(MODEL_PRICING).map(([k, r]) => (
                                <div className="pricing-row" key={k}>
                                    <code className="pricing-key" title={k}>
                                        {k}
                                    </code>
                                    <span className="pricing-rate">
                                        in {r.input} · out {r.output}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </details>
                </section>

                <section className="settings-section">
                    <h3>Import / export</h3>
                    <p className="section-hint">
                        Save all settings (API URL, run defaults, prompts, judge metrics, pricing,
                        cost rates) to a file, or restore them on another machine. Importing
                        replaces the current settings.
                    </p>
                    <div className="io-actions">
                        <button type="button" className="run-btn" onClick={onExport}>
                            Export settings…
                        </button>
                        <label className="run-btn io-import">
                            Import settings…
                            <input type="file" accept=".json,application/json" hidden onChange={onImport}/>
                        </label>
                    </div>
                    {ioStatus && (
                        <p className={`io-status${ioStatus.error ? ' io-error' : ''}`}>
                            {ioStatus.msg}
                        </p>
                    )}
                </section>

                <section className="settings-section">
                    <h3>Reset</h3>
                    <p className="section-hint">
                        Remove all saved settings stored in this browser.
                    </p>
                    <button type="button" className="run-btn danger-btn" onClick={resetAll}>
                        Clear all saved settings
                    </button>
                </section>
            </aside>
        </>
    )
}
