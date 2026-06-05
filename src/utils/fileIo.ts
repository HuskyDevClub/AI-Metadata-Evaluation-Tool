import type {EvalOutput} from '@/types/eval'
import {slugify} from '@/utils/format'

// Build a descriptive filename like
// eval_results_gpt-5-mini_vs_gpt-5_2026-06-02T10-00-00Z.json
export function buildSaveFilename(data: EvalOutput): string {
    const meta = data?.metadata ?? {}
    const parts = ['eval_results']
    const models = Array.isArray(meta.generator_models)
        ? meta.generator_models
        : meta.generator_model
            ? [meta.generator_model]
            : []
    if (models.length === 1) {
        const gen = slugify(models[0])
        if (gen) parts.push(gen)
    } else if (models.length > 1) {
        parts.push((slugify(models[0]) || 'multi') + `-and-${models.length - 1}-more`)
    }
    const judge = slugify(meta.judge_model)
    if (judge && !models.map(slugify).includes(judge)) parts.push('vs', judge)
    // Prefer the run's own timestamp; fall back to "now" so saves don't collide.
    const stamp = (meta.generated_at || new Date().toISOString())
        .replace(/[:.]/g, '-')
        .replace(/[^0-9A-Za-z\-T]/g, '')
    parts.push(stamp)
    return parts.join('_') + '.json'
}

// Serialize `data` to a pretty JSON file and trigger a browser download.
export function downloadJsonAs(data: unknown, filename: string): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadJson(data: EvalOutput): void {
    downloadJsonAs(data, buildSaveFilename(data))
}

export async function readJsonFile(file: File): Promise<unknown> {
    return JSON.parse(await file.text())
}

export async function loadJsonFile(file: File): Promise<EvalOutput> {
    return (await readJsonFile(file)) as EvalOutput
}
