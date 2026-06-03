import type { Category, DatasetResult, EvalMeta } from '@/types/eval'
import type { UseRates } from '@/hooks/useRates'
import { modelEvalsOf } from '@/utils/resultShape'
import { ModelEvalBlock } from '@/components/ModelEvalBlock'

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
    if (r.error) {
        return (
            <div className="card">
                <h2>
                    {r.dataset_id} {r.name ? '— ' + r.name : ''}
                </h2>
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
                    />
                ))
            ) : (
                <div className="error">No model evaluations in this result.</div>
            )}
        </div>
    )
}
