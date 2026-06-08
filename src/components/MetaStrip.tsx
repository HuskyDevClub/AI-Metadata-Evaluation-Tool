import type {EvalOutput} from '@/types/eval'
import {fmtDate} from '@/utils/format'
import {generatorModelsIn} from '@/utils/resultShape'

export function MetaStrip({data}: { data: EvalOutput }) {
    const meta = data.metadata ?? {}
    const results = data.results ?? []
    // Prefer the run's declared models; fall back to labels seen in results.
    const models =
        meta.generator_models?.length ? meta.generator_models : generatorModelsIn(results, meta)
    const variants = meta.prompt_variants ?? []
    const mode = meta.compare_gold ? 'vs gold' : 'absolute'
    return (
        <div className="meta-strip">
            {models.length > 0 && (
                <span>
                    <b>Model{models.length === 1 ? '' : 's'}:</b> {models.join(', ')}
                </span>
            )}
            {variants.length > 1 && (
                <span>
                    <b>Prompts:</b> {variants.join(', ')}
                </span>
            )}
            <span>
                <b>Judge:</b> {meta.judge_model || '?'}
            </span>
            <span>
                <b>Datasets:</b> {results.length}
            </span>
            <span>
                <b>Scoring:</b> {mode}
            </span>
            {meta.generated_at && (
                <span>
                    <b>Started:</b> {fmtDate(meta.generated_at)}
                </span>
            )}
            {meta.prompts_source && (
                <span>
                    <b>Source:</b> {meta.prompts_source}
                </span>
            )}
        </div>
    )
}
