import {useEffect, useState} from 'react'
import type {EvalRunRequest} from '@/types/eval'
import {parseGeneratorModels, RUN_DEFAULTS, RUN_LS as LS} from '@/utils/runDefaults'
import {runOverrides} from '@/utils/runConfig'

const DEFAULTS = {limit: RUN_DEFAULTS.limit, evalColumns: RUN_DEFAULTS.evalColumns, maxCols: RUN_DEFAULTS.maxCols}

export function RunPanel({
                             running,
                             onRun,
                             onCancel,
                         }: {
    running: boolean
    onRun: (body: EvalRunRequest) => void
    onCancel: () => void
}) {
    const [genModels, setGenModels] = useState(() => localStorage.getItem(LS.gen) || '')
    const [judgeModel, setJudgeModel] = useState(() => localStorage.getItem(LS.judge) || '')
    const [limit, setLimit] = useState(
        () => localStorage.getItem(LS.limit) || String(DEFAULTS.limit),
    )
    const [evalCols, setEvalCols] = useState(() => {
        const s = localStorage.getItem(LS.evalCols)
        return s === null ? DEFAULTS.evalColumns : s === '1'
    })
    const [maxCols, setMaxCols] = useState(
        () => localStorage.getItem(LS.maxCols) || String(DEFAULTS.maxCols),
    )

    useEffect(() => localStorage.setItem(LS.gen, genModels), [genModels])
    useEffect(() => localStorage.setItem(LS.judge, judgeModel), [judgeModel])
    useEffect(() => localStorage.setItem(LS.limit, limit), [limit])
    useEffect(() => localStorage.setItem(LS.evalCols, evalCols ? '1' : '0'), [evalCols])
    useEffect(() => localStorage.setItem(LS.maxCols, maxCols), [maxCols])

    const start = () => {
        const body: EvalRunRequest = {
            datasetLimit: parseInt(limit, 10) || DEFAULTS.limit,
            evalColumns: evalCols,
            maxColumnsPerDataset: parseInt(maxCols, 10) || DEFAULTS.maxCols,
        }
        // Blank model fields → backend uses its LLM_MODEL / JUDGE_LLM_MODEL defaults.
        const gen = parseGeneratorModels(genModels)
        const judge = judgeModel.trim()
        if (gen.length) body.generatorModels = gen
        if (judge) body.judgeModel = judge
        // Fold in prompt + judge-metric overrides configured in Settings.
        onRun({...body, ...runOverrides()})
    }

    return (
        <div className="run-panel">
            <label>
                Generator models (one per line)
                <textarea
                    rows={3}
                    placeholder="(env default)"
                    value={genModels}
                    onChange={(e) => setGenModels(e.target.value)}
                />
            </label>
            <label>
                Judge model
                <input
                    type="text"
                    placeholder="(env default)"
                    value={judgeModel}
                    onChange={(e) => setJudgeModel(e.target.value)}
                />
            </label>
            <label>
                Datasets
                <input
                    type="number"
                    min={1}
                    max={200}
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                />
            </label>
            <label className="run-check">
                <input
                    type="checkbox"
                    checked={evalCols}
                    onChange={(e) => setEvalCols(e.target.checked)}
                />
                evaluate columns
            </label>
            <label>
                Max cols/dataset
                <input
                    type="number"
                    min={1}
                    max={100}
                    value={maxCols}
                    disabled={!evalCols}
                    onChange={(e) => setMaxCols(e.target.value)}
                />
            </label>
            <button type="button" className="run-btn run-go" disabled={running} onClick={start}>
                {running ? 'Running…' : 'Run'}
            </button>
            {running && (
                <button type="button" className="run-btn run-cancel" onClick={onCancel}>
                    Cancel
                </button>
            )}
        </div>
    )
}
