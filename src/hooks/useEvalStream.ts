import {useCallback, useRef, useState} from 'react'
import {getApiBaseUrl} from '@/utils/config'
import type {DatasetResult, EvalMeta, EvalOutput, EvalRunRequest, RunEvent,} from '@/types/eval'

export interface RunStatus {
    msg: string
    error: boolean
}

export interface UseEvalStream {
    running: boolean
    status: RunStatus
    data: EvalOutput | null
    setData: (data: EvalOutput | null) => void
    setStatus: (status: RunStatus) => void
    run: (body: EvalRunRequest) => Promise<void>
    cancel: () => void
}

// Drives POST /api/eval/run, decoding the NDJSON event stream into React state
// so results render as each dataset finishes. Mirrors the vanilla viewer's
// run loop (start / dataset_start / stage / dataset_done / complete / error).
export function useEvalStream(): UseEvalStream {
    const [running, setRunning] = useState(false)
    const [status, setStatus] = useState<RunStatus>({msg: '', error: false})
    const [data, setData] = useState<EvalOutput | null>(null)
    const controllerRef = useRef<AbortController | null>(null)

    const cancel = useCallback(() => {
        controllerRef.current?.abort()
    }, [])

    const run = useCallback(async (body: EvalRunRequest) => {
        if (controllerRef.current) return // already running
        const controller = new AbortController()
        controllerRef.current = controller
        setRunning(true)
        setStatus({msg: 'Connecting…', error: false})
        setData(null)

        let resp: Response
        try {
            resp = await fetch(`${getApiBaseUrl()}/api/eval/run`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'X-Requested-With': 'fetch'},
                body: JSON.stringify(body),
                signal: controller.signal,
            })
        } catch (err) {
            setStatus({
                msg: `Network error: ${(err as Error).message}. Is the eval backend running?`,
                error: true,
            })
            controllerRef.current = null
            setRunning(false)
            return
        }

        if (!resp.ok || !resp.body) {
            const text = await resp.text().catch(() => '')
            setStatus({msg: `HTTP ${resp.status}: ${text || resp.statusText}`, error: true})
            controllerRef.current = null
            setRunning(false)
            return
        }

        // Stream NDJSON: one JSON object per newline. Buffer partial lines.
        const reader = resp.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''
        const runState = {
            results: [] as DatasetResult[],
            meta: {} as EvalMeta,
            currentDatasetLabel: '',
        }

        const handle = (evt: RunEvent) => {
            switch (evt.type) {
                case 'start':
                    runState.meta = {
                        generator_models: evt.generator_models,
                        judge_model: evt.judge_model,
                        generated_at: evt.started_at,
                        prompts_source: evt.prompts_source,
                        scoring_categories_dataset: evt.scoring_categories_dataset,
                        scoring_categories_column: evt.scoring_categories_column,
                    }
                    setStatus({
                        msg:
                            `Starting — ${evt.total} dataset${evt.total === 1 ? '' : 's'}` +
                            ((evt.generator_models?.length ?? 0) > 1
                                ? ` × ${evt.generator_models!.length} models`
                                : ''),
                        error: false,
                    })
                    break
                case 'dataset_start':
                    runState.currentDatasetLabel = `[${evt.i}/${evt.total}] ${evt.id}`
                    setStatus({msg: `${runState.currentDatasetLabel} — fetching…`, error: false})
                    break
                case 'stage': {
                    // Prefix the per-model position only when >1 model is in play.
                    const modelPart =
                        (evt.model_total ?? 0) > 1 && evt.model
                            ? `[model ${evt.model_i}/${evt.model_total} ${evt.model}] `
                            : ''
                    const suffix =
                        evt.stage === 'generating'
                            ? 'generating dataset description…'
                            : evt.stage === 'judging'
                                ? 'judging dataset description…'
                                : evt.stage === 'column'
                                    ? `column ${evt.i}/${evt.total}: ${evt.col}`
                                    : evt.stage
                    setStatus({
                        msg: `${runState.currentDatasetLabel} — ${modelPart}${suffix}`,
                        error: false,
                    })
                    break
                }
                case 'dataset_done':
                    runState.results.push(evt.result)
                    // Re-render with partial output so results stream in.
                    setData({metadata: runState.meta, results: runState.results.slice()})
                    break
                case 'complete':
                    // Final payload — includes scoring categories.
                    setData(evt.output)
                    setStatus({
                        msg: `Done — ${evt.output.results?.length ?? 0} dataset${
                            (evt.output.results?.length ?? 0) === 1 ? '' : 's'
                        } evaluated.`,
                        error: false,
                    })
                    break
                case 'error':
                    setStatus({msg: `Server error: ${evt.error}`, error: true})
                    break
            }
        }

        try {
            for (; ;) {
                const {value, done} = await reader.read()
                if (done) break
                buffer += decoder.decode(value, {stream: true})
                let nl: number
                while ((nl = buffer.indexOf('\n')) >= 0) {
                    const rawLine = buffer.slice(0, nl).trim()
                    buffer = buffer.slice(nl + 1)
                    if (!rawLine) continue
                    let evt: RunEvent
                    try {
                        evt = JSON.parse(rawLine) as RunEvent
                    } catch {
                        continue // ignore malformed line
                    }
                    handle(evt)
                }
            }
        } catch (err) {
            if ((err as Error).name === 'AbortError') {
                setStatus({msg: 'Cancelled.', error: false})
            } else {
                setStatus({msg: `Stream error: ${(err as Error).message}`, error: true})
            }
        } finally {
            controllerRef.current = null
            setRunning(false)
        }
    }, [])

    return {running, status, data, setData, setStatus, run, cancel}
}
