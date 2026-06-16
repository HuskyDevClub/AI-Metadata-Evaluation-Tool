import {type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState} from 'react'
import type {EvalDefaults, EvalRunRequest, ImportedDataset} from '@/types/eval'
import {parseDatasetIds, RUN_DEFAULTS, RUN_LS as LS, type RunGoal, type RunSource,} from '@/utils/runDefaults'
import {
    fetchEvalDefaults,
    getPromptSets,
    newPromptId,
    type PromptSet,
    promptVariantPayload,
    promptVariantsFrom,
    runOverrides,
    setPromptSets,
} from '@/utils/runConfig'
import {getModelSuggestions} from '@/utils/pricing'
import {moveItem} from '@/utils/array'
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

// One explicit model→prompt pairing row in pair mode (each = one candidate).
interface PairRow {
    id: string
    model: string
    variant: string
}

function readPairs(): PairRow[] {
    try {
        const raw = localStorage.getItem(LS.pairs)
        const parsed = raw ? JSON.parse(raw) : []
        if (!Array.isArray(parsed)) return []
        return parsed.map((p) => ({
            id: typeof p?.id === 'string' && p.id ? p.id : newPromptId(),
            model: typeof p?.model === 'string' ? p.model : '',
            variant: typeof p?.variant === 'string' ? p.variant : '',
        }))
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

// --- Drag-to-reorder --------------------------------------------------------
// Native HTML5 drag reorder over an in-memory list. Returns per-index handlers
// plus an `active` flag for styling the item currently being dragged. Items move
// live as the pointer enters a new slot, so the list reads in run order.
interface DragHandlers {
    active: boolean
    onDragStart: (e: DragEvent) => void
    onDragEnter: () => void
    onDragOver: (e: DragEvent) => void
    onDragEnd: () => void
}

function useDragReorder<T>(list: T[], setList: (next: T[]) => void) {
    const from = useRef<number | null>(null)
    const [active, setActive] = useState<number | null>(null)
    const onDragOver = (e: DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }
    const dragProps = (i: number): DragHandlers => ({
        active: active === i,
        onDragStart: (e) => {
            from.current = i
            setActive(i)
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', String(i)) // Firefox needs data set
        },
        onDragEnter: () => {
            const f = from.current
            if (f === null || f === i) return
            setList(moveItem(list, f, i))
            from.current = i
            setActive(i)
        },
        onDragOver,
        onDragEnd: () => {
            from.current = null
            setActive(null)
        },
    })
    return {dragProps}
}

// One editable prompt set in the library (a named prompt the run compares).
function PromptSetCard({
                           v,
                           defaults,
                           drag,
                           onChange,
                           onRemove,
                       }: {
    v: PromptSet
    defaults: EvalDefaults['prompts'] | null
    drag: DragHandlers
    onChange: (patch: Partial<PromptSet>) => void
    onRemove: () => void
}) {
    const [open, setOpen] = useState(false)
    const edited = !!(v.system || v.dataset || v.column)
    return (
        <div
            className={`prompt-set${drag.active ? ' dragging' : ''}${v.enabled ? '' : ' off'}`}
            onDragEnter={drag.onDragEnter}
            onDragOver={drag.onDragOver}
            onDragEnd={drag.onDragEnd}
        >
            <div className="ps-head">
                <span
                    className="drag-handle"
                    draggable
                    onDragStart={drag.onDragStart}
                    title="Drag to reorder"
                    aria-label="Reorder prompt"
                >
                    ⠿
                </span>
                <input
                    type="checkbox"
                    checked={v.enabled}
                    title="Include in this run"
                    onChange={(e) => onChange({enabled: e.target.checked})}
                />
                <input
                    type="text"
                    className="ps-name"
                    placeholder="Prompt name"
                    value={v.name}
                    onChange={(e) => onChange({name: e.target.value})}
                />
                {edited && <span className="edited-badge">edited</span>}
                <button type="button" className="reset-btn" onClick={() => setOpen((o) => !o)}>
                    {open ? 'Hide' : 'Edit'}
                </button>
                <button
                    type="button"
                    className="reset-btn"
                    aria-label="Remove prompt"
                    onClick={onRemove}
                >
                    ✕
                </button>
            </div>
            {open && (
                <div className="ps-body">
                    <p className="section-hint">
                        Blank fields use the backend default prompt. Keep the placeholders shown in
                        each field.
                    </p>
                    {(['system', 'dataset', 'column'] as const).map((k) => (
                        <label className="settings-field" key={k}>
                            {k} prompt
                            <textarea
                                rows={4}
                                placeholder={defaults?.[k] || '(default)'}
                                value={v[k] ?? ''}
                                onChange={(e) => onChange({[k]: e.target.value})}
                            />
                        </label>
                    ))}
                </div>
            )}
        </div>
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

    // --- Generator models (dropdown + draggable chips) ----------------------
    const [models, setModels] = useState<string[]>(() => {
        const raw = localStorage.getItem(LS.gen) || ''
        const seen: string[] = []
        for (const line of raw.split('\n')) {
            const m = line.trim()
            if (m && !seen.includes(m)) seen.push(m)
        }
        return seen
    })
    const [customModel, setCustomModel] = useState('')
    const [addingCustom, setAddingCustom] = useState(false)
    const modelDrag = useDragReorder(models, setModels)
    const suggestions = useMemo(
        () => getModelSuggestions().filter((m) => !models.includes(m)),
        [models],
    )

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

    // --- Prompt library (dropdown to add + draggable, editable cards) -------
    const [promptSets, setPromptSetsState] = useState<PromptSet[]>(getPromptSets)
    const promptDrag = useDragReorder(promptSets, setPromptSetsState)
    const [defaults, setDefaults] = useState<EvalDefaults['prompts'] | null>(null)

    // --- Candidate combination: cross every model×prompt, or explicit pairs --
    const [pairMode, setPairMode] = useState(() => readBool(LS.pairMode, false))
    const [pairs, setPairs] = useState<PairRow[]>(readPairs)

    useEffect(() => {
        let cancelled = false
        fetchEvalDefaults()
            .then((d) => !cancelled && setDefaults(d.prompts))
            .catch(() => undefined)
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => localStorage.setItem(LS.goal, goal), [goal])
    useEffect(() => localStorage.setItem(LS.source, source), [source])
    useEffect(() => localStorage.setItem(LS.ids, datasetIds), [datasetIds])
    useEffect(() => localStorage.setItem(LS.imported, JSON.stringify(imported)), [imported])
    useEffect(() => localStorage.setItem(LS.gen, models.join('\n')), [models])
    useEffect(() => localStorage.setItem(LS.judge, judgeModel), [judgeModel])
    useEffect(() => localStorage.setItem(LS.compareGold, compareGold ? '1' : '0'), [compareGold])
    useEffect(() => localStorage.setItem(LS.evalLive, evalLive ? '1' : '0'), [evalLive])
    useEffect(() => localStorage.setItem(LS.evalImported, evalImported ? '1' : '0'), [evalImported])
    useEffect(() => localStorage.setItem(LS.limit, limit), [limit])
    useEffect(() => localStorage.setItem(LS.evalCols, evalCols ? '1' : '0'), [evalCols])
    useEffect(() => localStorage.setItem(LS.maxCols, maxCols), [maxCols])
    useEffect(() => setPromptSets(promptSets), [promptSets])
    useEffect(() => localStorage.setItem(LS.pairMode, pairMode ? '1' : '0'), [pairMode])
    useEffect(() => localStorage.setItem(LS.pairs, JSON.stringify(pairs)), [pairs])

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

    // --- Model helpers ------------------------------------------------------
    const addModel = (m: string) => {
        const t = m.trim()
        if (t && !models.includes(t)) setModels([...models, t])
    }
    const removeModel = (m: string) => setModels(models.filter((x) => x !== m))
    const onPickModel = (e: ChangeEvent<HTMLSelectElement>) => {
        const v = e.target.value
        e.target.value = ''
        if (v === '__custom__') setAddingCustom(true)
        else if (v) addModel(v)
    }
    const commitCustomModel = () => {
        addModel(customModel)
        setCustomModel('')
        setAddingCustom(false)
    }

    // --- Prompt helpers -----------------------------------------------------
    const updateSet = (id: string, patch: Partial<PromptSet>) =>
        setPromptSetsState(promptSets.map((s) => (s.id === id ? {...s, ...patch} : s)))
    const removeSet = (id: string) =>
        setPromptSetsState(promptSets.filter((s) => s.id !== id))
    const hasDefault = promptSets.some((s) => s.name.trim().toLowerCase() === 'default')
    const onPickPrompt = (e: ChangeEvent<HTMLSelectElement>) => {
        const v = e.target.value
        e.target.value = ''
        if (v === 'default') {
            setPromptSetsState([...promptSets, {id: newPromptId(), name: 'Default', enabled: true}])
        } else if (v === 'custom') {
            setPromptSetsState([
                ...promptSets,
                {id: newPromptId(), name: `Prompt ${promptSets.length + 1}`, enabled: true},
            ])
        }
    }

    // --- Pairing helpers (pair mode) ----------------------------------------
    // Enabled, named prompts are the variants available to pair against.
    const promptNames = useMemo(
        () => promptSets.filter((s) => s.enabled && s.name.trim()).map((s) => s.name.trim()),
        [promptSets],
    )
    const addPair = () =>
        setPairs([
            ...pairs,
            {id: newPromptId(), model: models[0] ?? '', variant: promptNames[0] ?? ''},
        ])
    const updatePair = (id: string, patch: Partial<PairRow>) =>
        setPairs(pairs.map((p) => (p.id === id ? {...p, ...patch} : p)))
    const removePair = (id: string) => setPairs(pairs.filter((p) => p.id !== id))
    // Rows whose model + prompt both still exist; these become the candidates.
    const validPairs = pairs.filter(
        (p) => models.includes(p.model) && promptNames.includes(p.variant),
    )

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

    const modelName = models[0] || 'the default model'
    const modelCount = Math.max(models.length, 1)
    const variantCount = promptNames.length
    const crossCount = modelCount * Math.max(variantCount, 1)
    const candidateCount = pairMode ? validPairs.length : crossCount
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
    } else if (pairMode) {
        if (!models.length) {
            blockReason = 'Add a model to pair.'
        } else if (variantCount === 0) {
            blockReason = 'Add and enable a prompt to pair.'
        } else if (validPairs.length === 0) {
            blockReason = 'Add at least one model → prompt pairing.'
        } else {
            const gold = compareGold ? ' vs the live description' : ''
            summary = `Run ${validPairs.length} model→prompt pairing${
                validPairs.length === 1 ? '' : 's'
            }${gold}, across ${datasetPhrase}.`
        }
    } else {
        if (variantCount === 0) {
            blockReason = 'Add and enable at least one prompt.'
        } else {
            let subject: string
            if (modelCount > 1 && variantCount > 1) {
                subject = `Compare ${modelCount} models × ${variantCount} prompts`
            } else if (modelCount > 1) {
                subject = `Compare ${modelCount} models`
            } else if (variantCount > 1) {
                subject = `Compare ${variantCount} prompts on ${modelName}`
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
            if (pairMode) {
                // Pair mode: explicit model→prompt candidates. Send the unique
                // models (for meta/cost) and the full named prompt library so each
                // pairing's variant name resolves on the backend.
                body.generatorPairs = validPairs.map((p) => ({model: p.model, variant: p.variant}))
                const uniqueModels: string[] = []
                for (const p of validPairs) if (!uniqueModels.includes(p.model)) uniqueModels.push(p.model)
                if (uniqueModels.length) body.generatorModels = uniqueModels
                const pv = promptVariantPayload(promptSets)
                if (pv.length) body.promptVariants = pv
            } else {
                if (models.length) body.generatorModels = models // else omit → env default
                const pv = promptVariantsFrom(promptSets)
                if (pv) body.promptVariants = pv
            }
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

                        {/* Models: pick from a dropdown, reorder draggable chips */}
                        <div className="builder-head">
                            <span className="metrics-title">Generator models</span>
                            <span className="section-hint"> — drag to reorder; first is primary</span>
                        </div>
                        <div className="picker-row">
                            <select className="add-select" value="" onChange={onPickModel}>
                                <option value="" disabled>
                                    + Add model…
                                </option>
                                {suggestions.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                                <option value="__custom__">Custom…</option>
                            </select>
                            {addingCustom && (
                                <span className="custom-add">
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder="model name"
                                        value={customModel}
                                        onChange={(e) => setCustomModel(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && commitCustomModel()}
                                    />
                                    <button
                                        type="button"
                                        className="run-btn"
                                        disabled={!customModel.trim()}
                                        onClick={commitCustomModel}
                                    >
                                        Add
                                    </button>
                                </span>
                            )}
                        </div>
                        {models.length > 0 ? (
                            <div className="chip-row">
                                {models.map((m, i) => {
                                    const d = modelDrag.dragProps(i)
                                    return (
                                        <span
                                            key={m}
                                            className={`chip${d.active ? ' dragging' : ''}`}
                                            draggable
                                            onDragStart={d.onDragStart}
                                            onDragEnter={d.onDragEnter}
                                            onDragOver={d.onDragOver}
                                            onDragEnd={d.onDragEnd}
                                        >
                                            <span className="drag-handle" aria-hidden>
                                                ⠿
                                            </span>
                                            <span className="chip-label">{m}</span>
                                            <button
                                                type="button"
                                                className="chip-x"
                                                aria-label={`Remove ${m}`}
                                                onClick={() => removeModel(m)}
                                            >
                                                ✕
                                            </button>
                                        </span>
                                    )
                                })}
                            </div>
                        ) : (
                            <p className="section-hint">
                                No models selected — the backend env default model is used.
                            </p>
                        )}

                        {/* Prompts: add from dropdown, reorder/edit draggable cards */}
                        <div className="builder-head" style={{marginTop: 16}}>
                            <span className="metrics-title">Prompts</span>
                            <span className="section-hint"> — add 2+ to compare prompt variants</span>
                        </div>
                        <div className="picker-row">
                            <select className="add-select" value="" onChange={onPickPrompt}>
                                <option value="" disabled>
                                    + Add prompt…
                                </option>
                                <option value="default" disabled={hasDefault}>
                                    Default (backend prompt)
                                </option>
                                <option value="custom">Custom prompt…</option>
                            </select>
                        </div>
                        <div className="prompt-list">
                            {promptSets.length === 0 && (
                                <p className="section-hint">
                                    Add a prompt to generate with. “Default” uses the backend’s built-in
                                    prompt.
                                </p>
                            )}
                            {promptSets.map((v, i) => (
                                <PromptSetCard
                                    key={v.id}
                                    v={v}
                                    defaults={defaults}
                                    drag={promptDrag.dragProps(i)}
                                    onChange={(patch) => updateSet(v.id, patch)}
                                    onRemove={() => removeSet(v.id)}
                                />
                            ))}
                        </div>

                        {/* Combine: cross every model×prompt, or pair manually */}
                        <div className="builder-head" style={{marginTop: 16}}>
                            <span className="metrics-title">Combine</span>
                        </div>
                        <div className="seg">
                            {(
                                [
                                    [false, 'Cross all'],
                                    [true, 'Pair manually'],
                                ] as [boolean, string][]
                            ).map(([val, label]) => (
                                <button
                                    key={label}
                                    type="button"
                                    className={`seg-btn${pairMode === val ? ' active' : ''}`}
                                    onClick={() => setPairMode(val)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {pairMode ? (
                            <div className="pair-build">
                                <p className="section-hint">
                                    Each row is one candidate — pick a model and the prompt it runs
                                    with. The same model can appear with different prompts.
                                </p>
                                {pairs.length > 0 && (
                                    <div className="pair-list">
                                        {pairs.map((p) => {
                                            const modelOpts =
                                                models.includes(p.model) || !p.model
                                                    ? models
                                                    : [p.model, ...models]
                                            const promptOpts =
                                                promptNames.includes(p.variant) || !p.variant
                                                    ? promptNames
                                                    : [p.variant, ...promptNames]
                                            const stale =
                                                !models.includes(p.model) ||
                                                !promptNames.includes(p.variant)
                                            return (
                                                <div
                                                    className={`pair-row${stale ? ' stale' : ''}`}
                                                    key={p.id}
                                                >
                                                    <select
                                                        value={p.model}
                                                        onChange={(e) =>
                                                            updatePair(p.id, {model: e.target.value})
                                                        }
                                                    >
                                                        <option value="" disabled>
                                                            model…
                                                        </option>
                                                        {modelOpts.map((m) => (
                                                            <option key={m} value={m}>
                                                                {m}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <span className="pair-sep">·</span>
                                                    <select
                                                        value={p.variant}
                                                        onChange={(e) =>
                                                            updatePair(p.id, {variant: e.target.value})
                                                        }
                                                    >
                                                        <option value="" disabled>
                                                            prompt…
                                                        </option>
                                                        {promptOpts.map((n) => (
                                                            <option key={n} value={n}>
                                                                {n}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        type="button"
                                                        className="reset-btn"
                                                        aria-label="Remove pairing"
                                                        onClick={() => removePair(p.id)}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                                <button
                                    type="button"
                                    className="run-btn add-metric"
                                    disabled={!models.length || variantCount === 0}
                                    onClick={addPair}
                                >
                                    + Add pairing
                                </button>
                                {(!models.length || variantCount === 0) && (
                                    <p className="section-hint">
                                        Add at least one model and one prompt above to pair them.
                                    </p>
                                )}
                                <p className="combo-count">
                                    <b>
                                        {candidateCount} candidate{candidateCount === 1 ? '' : 's'}
                                    </b>{' '}
                                    per dataset
                                </p>
                            </div>
                        ) : (
                            <p className="combo-count">
                                {modelCount} model{modelCount === 1 ? '' : 's'} ×{' '}
                                {Math.max(variantCount, 1)} prompt
                                {Math.max(variantCount, 1) === 1 ? '' : 's'} ={' '}
                                <b>
                                    {candidateCount} candidate{candidateCount === 1 ? '' : 's'}
                                </b>{' '}
                                per dataset
                            </p>
                        )}

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
