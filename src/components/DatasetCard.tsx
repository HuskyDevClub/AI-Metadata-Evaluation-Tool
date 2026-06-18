import type {Category, DatasetResult, EvalMeta} from '@/types/eval'
import type {UseRates} from '@/hooks/useRates'
import {modelEvalsOf} from '@/utils/resultShape'
import {DEFAULT_DATASET_DOMAIN} from '@/utils/runDefaults'
import {ModelEvalBlock} from '@/components/ModelEvalBlock'

export function DatasetCard({
                                r,
                                dsCats,
                                colCats,
                                meta,
                                rates,
                            }: {
    r: DatasetResult
    dsCats: Category[]
    colCats: Category[]
    meta: EvalMeta
    rates: UseRates
}) {
    // Only non-default portals are worth calling out; data.wa.gov is the implied default.
    const portal = r.domain && r.domain !== DEFAULT_DATASET_DOMAIN ? r.domain : null
    if (r.error) {
        return (
            <div className="card">
                <h2>
                    {r.dataset_id} {r.name ? '— ' + r.name : ''}
                </h2>
                {portal && (
                    <div className="sub">
                        <span className="portal-tag">{portal}</span>
                    </div>
                )}
                <div className="error">{r.error}</div>
            </div>
        )
    }
    const modelEvals = modelEvalsOf(r, meta)
    return (
        <div className="card">
            <h2>{r.name || r.dataset_id}</h2>
            <div className="sub">
                <code>{r.dataset_id}</code>
                {portal && <span className="portal-tag">{portal}</span>}
                <span>{r.total_rows?.toLocaleString() ?? '?'} rows</span>
                <span>{r.column_count ?? '?'} columns</span>
                <span>{r.elapsed_seconds ?? '?'}s</span>
                {modelEvals.length > 1 && <span>{modelEvals.length} generator models</span>}
            </div>
            {modelEvals.length > 0 ? (
                modelEvals.map((me, i) => (
                    <ModelEvalBlock
                        key={i}
                        me={me}
                        dsCats={dsCats}
                        colCats={colCats}
                        judgeModel={meta.judge_model}
                        rates={rates}
                        domain={r.domain}
                    />
                ))
            ) : (
                <div className="error">No model evaluations in this result.</div>
            )}
        </div>
    )
}
