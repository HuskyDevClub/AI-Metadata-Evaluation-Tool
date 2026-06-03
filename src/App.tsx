import { type ChangeEvent, useState } from 'react'
import { useEvalStream } from '@/hooks/useEvalStream'
import { useRates } from '@/hooks/useRates'
import { MetaStrip } from '@/components/MetaStrip'
import { ResultsView } from '@/components/ResultsView'
import { RunPanel } from '@/components/RunPanel'
import { downloadJson, loadJsonFile } from '@/utils/fileIo'

export default function App() {
    const { running, status, data, setData, setStatus, run, cancel } = useEvalStream()
    const rates = useRates()
    const [showPanel, setShowPanel] = useState(false)

    const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (!f) return
        try {
            const parsed = await loadJsonFile(f)
            setData(parsed)
            setStatus({ msg: '', error: false })
        } catch (err) {
            setStatus({ msg: `Failed to parse JSON: ${(err as Error).message}`, error: true })
        }
        e.target.value = '' // allow re-loading the same file
    }

    const hasResults = !!data?.results?.length
    const canSave = hasResults && !running

    return (
        <>
            <header>
                <h1>Metadata Eval Viewer</h1>
                <label className="file-btn">
                    Load results…
                    <input type="file" accept=".json" hidden onChange={onFile} />
                </label>
                <button type="button" className="run-btn" onClick={() => setShowPanel((s) => !s)}>
                    Run new eval…
                </button>
                <button
                    type="button"
                    className="run-btn"
                    disabled={!canSave}
                    onClick={() => data && downloadJson(data)}
                >
                    Save results…
                </button>
                {data && <MetaStrip data={data} />}
                {showPanel && <RunPanel running={running} onRun={run} onCancel={cancel} />}
                {(status.msg || running) && (
                    <div className={`run-status${status.error ? ' run-error' : ''}`}>
                        {status.msg}
                    </div>
                )}
            </header>
            <main>
                {hasResults ? (
                    <ResultsView data={data!} rates={rates} />
                ) : (
                    <div className="empty">
                        {running ? (
                            'Eval in progress — results will appear here as each dataset finishes.'
                        ) : (
                            <>
                                Load a result JSON file, or click <b>Run new eval…</b> to start one
                                against the backend.
                            </>
                        )}
                    </div>
                )}
            </main>
        </>
    )
}
