import type { DatasetResult, EvalMeta, ModelEvaluation } from '@/types/eval'

// A dataset result holds one evaluation per generator model. New runs nest these
// under `model_evaluations`; legacy single-model files keep the fields directly
// on the result, so we wrap them into a one-element list keyed by the run's model.
export function modelEvalsOf(r: DatasetResult, meta?: EvalMeta): ModelEvaluation[] {
    if (Array.isArray(r?.model_evaluations)) return r.model_evaluations
    if (r?.dataset_evaluation) {
        return [
            {
                generator_model:
                    meta?.generator_model || meta?.generator_models?.[0] || '(generator)',
                dataset_evaluation: r.dataset_evaluation,
                column_evaluations: r.column_evaluations || [],
                tokens: r.tokens || {},
                elapsed_seconds: r.elapsed_seconds,
            },
        ]
    }
    return []
}

// Distinct generator models across all results, in first-seen order.
export function generatorModelsIn(results: DatasetResult[], meta?: EvalMeta): string[] {
    const seen: string[] = []
    for (const r of results) {
        if (r?.error) continue
        for (const me of modelEvalsOf(r, meta)) {
            const m = me.generator_model || '(generator)'
            if (!seen.includes(m)) seen.push(m)
        }
    }
    if (!seen.length && Array.isArray(meta?.generator_models)) {
        return meta.generator_models.slice()
    }
    return seen
}
