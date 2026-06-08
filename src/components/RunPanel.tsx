import {type ChangeEvent, useEffect, useState} from 'react'
import type {EvalRunRequest, ImportedDataset} from '@/types/eval'
import {
    parseDatasetIds,
    parseGeneratorModels,
    RUN_DEFAULTS,
    RUN_LS as LS,
    type RunGoal,
    type RunSource,
} from '@/utils/runDefaults'
import {
    buildPromptVariants,
    getDefaultVariantOn,
    getVariants,
    runOverrides,
    setDefaultVariantOn,
    setVariants,
    type StoredVariant,
} from '@/utils/runConfig'
import {importDatasetsFromFiles} from '@/utils/datasetImport'

function readBool(key: string, fallback: boolean): boolean {
    const s = localStorage.getItem(key)
    return s === null ? fallback : s === '1'
}

function readImported(): ImportedDataset[] {
    try {
        const raw = localStorage.getItem(LS.imported)
        const parsed = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? (parsed as ImportedDataset[]) : []
    } catch {
        return []
    }
}

const GOALS: { key: RunGoal; icon: string; title: string; blurb: string }[] = [
    {
        key: 'validate',
        icon: '🔍',
        title: 'Validate existing metadata',
        blurb: 'Score metadata that already exists.',
    },
    {
        key: 'generate',
        icon: '✨',
        title: 'Evaluate AI generation',
        blurb: 'Generate metadata and score it.',
    },
]

// One editable prompt-variant row (used to compare prompts side by side).
function VariantRow({
                        v,
                        onChange,
                        onRemove,
                    }: {
    v: StoredVariant
    onChange: (patch: Partial<StoredVariant>) => void
    onRemove: () => void
}) {
    return (
        <details className="variant-row">
            <summary>
                <input
                    type="checkbox"
                    checked={v.enabled}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onChange({enabled: e.target.checked})}
                />
                <input
                    type="text"
                    className="variant-name"
                    placeholder="Variant name"
                    value={v.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onChange({name: e.target.value})}
                />
                <button
                    type="button"
                    className="reset-btn"
                    aria-label="Remove variant"
                    onClick={(e) => {
                        e.preventDefault()
                        onRemove()
                    }}
                >
                    ✕
                </button>
            </summary>
            <p className="section-hint">
                Overrides for this variant. Blank fields use the default prompt (Settings →
                Generation prompts).
            </p>
            {(['system', 'dataset', 'column'] as const).map((k) => (
                <label className="settings-field" key={k}>
                    {k} prompt
                    <textarea
                        rows={3}
                        placeholder="(default)"
                        value={v[k] ?? ''}
                        onChange={(e) => onChange({[k]: e.target.value})}
                    />
                </label>
            ))}
        </details>
    )
}

export function RunPanel({
                             running,
                             onRun,
                             onCancel,
                             onClose,
                         }: {
    running: boolean
    onRun: (body: EvalRunRequest) => void
    onCancel: () => void
    onClose: () => void
}) {
    const [goal, setGoal] = useState<RunGoal>(
        () => (localStorage.getItem(LS.goal) as RunGoal) || RUN_DEFAULTS.goal,
    )
    const [source, setSource] = useState<RunSource>(
        () => (localStorage.getItem(LS.source) as RunSource) || RUN_DEFAULTS.source,
    )
    const [datasetIds, setDatasetIds] = useState(() => localStorage.getItem(LS.ids) || '')
    const [imported, setImported] = useState<ImportedDataset[]>(readImported)
    const [importErrors, setImportErrors] = useState<string[]>([])

    const [genModels, setGenModels] = useState(() => localStorage.getItem(LS.gen) || '')
    const [judgeModel, setJudgeModel] = useState(() => localStorage.getItem(LS.judge) || '')
    const [compareGold, setCompareGold] = useState(() =>
        readBool(LS.compareGold, RUN_DEFAULTS.compareGold),
    )

    const [evalLive, setEvalLive] = useState(() => readBool(LS.evalLive, RUN_DEFAULTS.evalLive))
    const [evalImported, setEvalImported] = useState(() =>
        readBool(LS.evalImported, RUN_DEFAULTS.evalImported),
    )

    const [limit, setLimit] = useState(
        () => localStorage.getItem(LS.limit) || String(RUN_DEFAULTS.limit),
    )
    const [evalCols, setEvalCols] = useState(() => readBool(LS.evalCols, RUN_DEFAULTS.evalColumns))
    const [maxCols, setMaxCols] = useState(
        () => localStorage.getItem(LS.maxCols) || String(RUN_DEFAULTS.maxCols),
    )

    const [defaultVariant, setDefaultVariant] = useState(getDefaultVariantOn)
    const [variants, setVariantsState] = useState<StoredVariant[]>(getVariants)

    useEffect(() => localStorage.setItem(LS.goal, goal), [goal])
    useEffect(() => localStorage.setItem(LS.source, source), [source])
    useEffect(() => localStorage.setItem(LS.ids, datasetIds), [datasetIds])
    useEffect(() => localStorage.setItem(LS.imported, JSON.stringify(imported)), [imported])
    useEffect(() => localStorage.setItem(LS.gen, genModels), [genModels])
    useEffect(() => localStorage.setItem(LS.judge, judgeModel), [judgeModel])
    useEffect(() => localStorage.setItem(LS.compareGold, compareGold ? '1' : '0'), [compareGold])
    useEffect(() => localStorage.setItem(LS.evalLive, evalLive ? '1' : '0'), [evalLive])
    useEffect(() => localStorage.setItem(LS.evalImported, evalImported ? '1' : '0'), [evalImported])
    useEffect(() => localStorage.setItem(LS.limit, limit), [limit])
    useEffect(() => localStorage.setItem(LS.evalCols, evalCols ? '1' : '0'), [evalCols])
    useEffect(() => localStorage.setItem(LS.maxCols, maxCols), [maxCols])
    useEffect(() => setDefaultVariantOn(defaultVariant), [defaultVariant])
    useEffect(() => setVariants(variants), [variants])

    // Close on Escape, matching the Settings drawer.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const onImportFiles = async (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ''
        if (!files.length) return
        const {datasets, errors} = await importDatasetsFromFiles(files)
        const byUid = new Map(imported.map((d) => [d.uid, d]))
        for (const d of datasets) byUid.set(d.uid, d)
        setImported([...byUid.values()])
        setImportErrors(errors)
    }

    const updateVariant = (i: number, patch: Partial<StoredVariant>) =>
        setVariantsState(variants.map((v, idx) => (idx === i ? {...v, ...patch} : v)))
    const addVariant = () =>
        setVariantsState([
            ...variants,
            {name: `Variant ${variants.length + 1}`, enabled: true},
        ])
    const removeVariant = (i: number) =>
        setVariantsState(variants.filter((_, idx) => idx !== i))

    // --- Derived: how many datasets, and a plain-language run summary --------
    const idCount = parseDatasetIds(datasetIds).length
    const limitNum = parseInt(limit, 10) || RUN_DEFAULTS.limit
    const sourceReady =
        source === 'csv' || (source === 'ids' && idCount > 0) || (source === 'import' && imported.length > 0)

    const datasetPhrase = (() => {
        if (source === 'csv') return `up to ${limitNum} benchmark dataset${limitNum === 1 ? '' : 's'}`
        const n = Math.min(source === 'ids' ? idCount : imported.length, limitNum)
        return `${n} dataset${n === 1 ? '' : 's'}`
    })()

    const models = parseGeneratorModels(genModels)
    const modelName = models[0] || 'the default model'
    const variantCount =
        (defaultVariant ? 1 : 0) + variants.filter((v) => v.enabled && v.name.trim()).length
    const liveOn = evalLive
    const importedOn = source === 'import' && evalImported

    // Validation + the summary sentence shown in the footer.
    let blockReason = ''
    let summary = ''
    if (!sourceReady) {
        blockReason =
            source === 'ids' ? 'Enter at least one dataset UID.' : 'Import at least one metadata JSON file.'
    } else if (goal === 'validate') {
        const parts: string[] = []
        if (liveOn) parts.push('live data.wa.gov')
        if (importedOn) parts.push('imported')
        if (!parts.length) {
            blockReason =
                source === 'import'
                    ? 'Pick the live and/or imported metadata to score.'
                    : 'Tick “live data.wa.gov metadata” to score it.'
        } else {
            summary = `Score the ${parts.join(' and ')} metadata of ${datasetPhrase}.`
        }
    } else {
        if (variantCount === 0) {
            blockReason = 'Enable the Default prompt or at least one variant.'
        } else {
            const mc = Math.max(models.length, 1)
            let subject: string
            if (mc > 1 && variantCount > 1) {
                subject = `Compare ${mc} models × ${variantCount} prompts`
            } else if (mc > 1) {
                subject = `Compare ${mc} models`
            } else if (variantCount > 1) {
                subject = `Compare ${variantCount} prompt variants on ${modelName}`
            } else {
                subject = `Generate with ${modelName}`
            }
            const gold = compareGold ? ' vs the live description' : ''
            summary = `${subject}${gold}, across ${datasetPhrase}.`
        }
    }

    const start = () => {
        if (blockReason) return
        const body: EvalRunRequest = {
            datasetLimit: limitNum,
            evalColumns: evalCols,
            maxColumnsPerDataset: parseInt(maxCols, 10) || RUN_DEFAULTS.maxCols,
        }
        if (source === 'ids') body.datasetIds = parseDatasetIds(datasetIds)
        if (source === 'import') body.importedDatasets = imported

        if (goal === 'generate') {
            const gen = parseGeneratorModels(genModels)
            if (gen.length) body.generatorModels = gen // else omit → env default
            const pv = buildPromptVariants()
            if (pv) body.promptVariants = pv
            body.compareGold = compareGold
            body.evaluateLive = false
            body.evaluateImported = false
        } else {
            body.generatorModels = [] // no generation — score existing only
            body.compareGold = false
            body.evaluateLive = liveOn
            body.evaluateImported = importedOn
        }

        const judge = judgeModel.trim()
        if (judge) body.judgeModel = judge

        onRun({...body, ...runOverrides()})
        onClose()
    }

    return (
        <>
            <div className="run-modal-backdrop" onClick={onClose}/>
            <div className="run-modal" role="dialog" aria-label="Run new eval">
                <div className="run-modal-head">
                    <h2>Run new eval</h2>
                    <button type="button" className="drawer-close" aria-label="Close" onClick={onClose}>
                        ✕
                    </button>
                </div>

                {/* --- Goal --------------------------------------------------- */}
                <section className="settings-section">
                    <h3>What do you want to do?</h3>
                    <div className="goal-cards">
                        {GOALS.map((g) => (
                            <button
                                key={g.key}
                                type="button"
                                className={`goal-card${goal === g.key ? ' active' : ''}`}
                                aria-pressed={goal === g.key}
                                onClick={() => setGoal(g.key)}
                            >
                                <span className="goal-icon">{g.icon}</span>
                                <span className="goal-title">{g.title}</span>
                                <span className="goal-blurb">{g.blurb}</span>
                            </button>
                        ))}
                    </div>
                </section>

                {/* --- Datasets ---------------------------------------------- */}
                <section className="settings-section">
                    <h3>Datasets</h3>
                    <div className="seg">
                        {(
                            [
                                ['csv', 'Benchmark CSV'],
                                ['ids', 'Paste UIDs'],
                                ['import', 'Import JSON'],
                            ] as [RunSource, string][]
                        ).map(([val, label]) => (
                            <button
                                key={val}
                                type="button"
                                className={`seg-btn${source === val ? ' active' : ''}`}
                                onClick={() => setSource(val)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {source === 'csv' && (
                        <p className="section-hint">
                            Uses the bundled <code>DatasetsWithSolidMetadata.csv</code> on the backend.
                        </p>
                    )}
                    {source === 'ids' && (
                        <label className="settings-field">
                            Dataset UIDs (one per line)
                            <textarea
                                rows={4}
                                placeholder="abcd-1234&#10;wxyz-5678"
                                value={datasetIds}
                                onChange={(e) => setDatasetIds(e.target.value)}
                            />
                        </label>
                    )}
                    {source === 'import' && (
                        <div className="settings-field">
                            <div className="import-row">
                                <label className="run-btn io-import">
                                    Add metadata JSON…
                                    <input
                                        type="file"
                                        accept=".json,application/json"
                                        multiple
                                        hidden
                                        onChange={onImportFiles}
                                    />
                                </label>
                                {imported.length > 0 && (
                                    <button
                                        type="button"
                                        className="reset-btn"
                                        onClick={() => {
                                            setImported([])
                                            setImportErrors([])
                                        }}
                                    >
                                        clear {imported.length}
                                    </button>
                                )}
                            </div>
                            <p className="section-hint">
                                Exports from the AI-Metadata-Improvement-Tool. Each file's{' '}
                                <code>socrataDatasetId</code> is the UID; its curated metadata is what
                                “imported” scores.
                            </p>
                            {imported.length > 0 && (
                                <ul className="import-list">
                                    {imported.map((d) => (
                                        <li key={d.uid}>
                                            <code>{d.uid}</code> {d.name || ''}
                                            {d.description ? '' : ' (no dataset description)'}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {importErrors.map((err, i) => (
                                <p className="settings-error" key={i}>
                                    {err}
                                </p>
                            ))}
                        </div>
                    )}

                    <div className="field-grid">
                        <label className="settings-field">
                            Max datasets
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
                            Max columns / dataset
                            <input
                                type="number"
                                min={1}
                                max={100}
                                value={maxCols}
                                disabled={!evalCols}
                                onChange={(e) => setMaxCols(e.target.value)}
                            />
                        </label>
                    </div>
                </section>

                {/* --- Goal-specific ----------------------------------------- */}
                {goal === 'validate' ? (
                    <section className="settings-section">
                        <h3>Score which metadata?</h3>
                        <p className="section-hint">
                            The judge gives an absolute rubric score for each — no comparison.
                        </p>
                        <label className="settings-field row">
                            <input
                                type="checkbox"
                                checked={evalLive}
                                onChange={(e) => setEvalLive(e.target.checked)}
                            />
                            Live data.wa.gov metadata
                        </label>
                        <label className="settings-field row">
                            <input
                                type="checkbox"
                                checked={evalImported}
                                disabled={source !== 'import'}
                                onChange={(e) => setEvalImported(e.target.checked)}
                            />
                            Imported (curated) metadata
                            {source !== 'import' && <span className="muted"> — needs Import JSON</span>}
                        </label>
                    </section>
                ) : (
                    <section className="settings-section">
                        <h3>Generation</h3>
                        <label className="settings-field">
                            Models to compare (one per line)
                            <textarea
                                rows={3}
                                placeholder="(env default)"
                                value={genModels}
                                onChange={(e) => setGenModels(e.target.value)}
                            />
                            <span className="section-hint">Add 2+ to compare models.</span>
                        </label>

                        <div className="variants-head">
                            <span className="metrics-title">Prompt variants</span>
                            <span className="section-hint"> — add 2+ to compare prompts</span>
                        </div>
                        <label className="settings-field row">
                            <input
                                type="checkbox"
                                checked={defaultVariant}
                                onChange={(e) => setDefaultVariant(e.target.checked)}
                            />
                            Default (Settings prompts)
                        </label>
                        {variants.map((v, i) => (
                            <VariantRow
                                key={i}
                                v={v}
                                onChange={(patch) => updateVariant(i, patch)}
                                onRemove={() => removeVariant(i)}
                            />
                        ))}
                        <button type="button" className="run-btn add-metric" onClick={addVariant}>
                            + Add prompt variant
                        </button>

                        <label className="settings-field row" style={{marginTop: 12}}>
                            <input
                                type="checkbox"
                                checked={compareGold}
                                onChange={(e) => setCompareGold(e.target.checked)}
                            />
                            Compare against the live description (head-to-head winner)
                        </label>
                    </section>
                )}

                {/* --- Advanced ---------------------------------------------- */}
                <section className="settings-section">
                    <details className="advanced">
                        <summary>Advanced</summary>
                        <label className="settings-field" style={{marginTop: 10}}>
                            Judge model
                            <input
                                type="text"
                                placeholder="(env default)"
                                value={judgeModel}
                                onChange={(e) => setJudgeModel(e.target.value)}
                            />
                        </label>
                    </details>
                </section>

                <div className="run-modal-foot">
                    <span className="run-plan">
                        {blockReason ? <span className="run-plan-warn">{blockReason}</span> : summary}
                    </span>
                    <div className="run-modal-actions">
                        {running && (
                            <button type="button" className="run-btn run-cancel" onClick={onCancel}>
                                Cancel
                            </button>
                        )}
                        <button
                            type="button"
                            className="run-btn run-go"
                            disabled={running || !!blockReason}
                            onClick={start}
                        >
                            {running ? 'Running…' : 'Run ▶'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}
