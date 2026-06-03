import type { EvalOutput } from '@/types/eval'
import { fmtDate } from '@/utils/format'
import { generatorModelsIn } from '@/utils/resultShape'

export function MetaStrip({ data }: { data: EvalOutput }) {
    const meta = data.metadata ?? {}
    const results = data.results ?? []
    const genModels = generatorModelsIn(results, meta)
    return (
        <div className="meta-strip">
            <span>
                <b>Generator{genModels.length === 1 ? '' : 's'}:</b>{' '}
                {genModels.length ? genModels.join(', ') : '?'}
            </span>
            <span>
                <b>Judge:</b> {meta.judge_model || '?'}
            </span>
            <span>
                <b>Datasets:</b> {results.length}
            </span>
            {meta.generated_at && (
                <span>
                    <b>Started:</b> {fmtDate(meta.generated_at)}
                </span>
            )}
        </div>
    )
}
