import type {DatasetResult, EvalMeta, TokenEntry} from '@/types/eval'
import {slugify} from '@/utils/format'
import {modelEvalsOf} from '@/utils/resultShape'
import {getCustomPricing} from '@/utils/settingsStore'

export interface ModelRate {
    input: number
    output: number
    note: string
}

// Pre-configured $/1M-token rates keyed by model name (case-insensitive substring
// match). Match uses the LONGEST key first, so "gpt-5.4-mini" beats "gpt-5.4"
// beats "gpt-5". GPT-5 series rates from https://developers.openai.com/api/docs/pricing
// as of 2026-05-13. Edit freely — pricing may change.
export const MODEL_PRICING: Record<string, ModelRate> = {
    // --- OpenAI GPT-5 series ---
    'gpt-5.5-pro': {input: 30.0, output: 180.0, note: 'OpenAI gpt-5.5-pro'},
    'gpt-5.5': {input: 5.0, output: 30.0, note: 'OpenAI gpt-5.5'},
    'gpt-5.4-pro': {input: 30.0, output: 180.0, note: 'OpenAI gpt-5.4-pro'},
    'gpt-5.4-nano': {input: 0.2, output: 1.25, note: 'OpenAI gpt-5.4-nano'},
    'gpt-5.4-mini': {input: 0.75, output: 4.5, note: 'OpenAI gpt-5.4-mini'},
    'gpt-5.4': {input: 2.5, output: 15.0, note: 'OpenAI gpt-5.4'},
    // Older GPT-5.x variants (listed for legacy runs)
    'gpt-5.2-pro': {input: 21.0, output: 126.0, note: 'OpenAI gpt-5.2-pro (legacy)'},
    'gpt-5.2': {input: 1.75, output: 14.0, note: 'OpenAI gpt-5.2 (legacy)'},
    'gpt-5.1': {input: 1.25, output: 10.0, note: 'OpenAI gpt-5.1 (legacy)'},
    'gpt-5-nano': {input: 0.05, output: 0.4, note: 'OpenAI gpt-5-nano (legacy)'},
    'gpt-5-mini': {input: 0.25, output: 2.0, note: 'OpenAI gpt-5-mini (legacy)'},
    'gpt-5': {input: 0.625, output: 5.0, note: 'OpenAI gpt-5 (legacy)'},
    // --- Local / open-weight (assume free) ---
    ollama: {input: 0, output: 0, note: 'local'},
    qwen: {input: 0, output: 0, note: 'local'},
    mistral: {input: 0, output: 0, note: 'local'},
    llama: {input: 0, output: 0, note: 'local'},
}

export function lookupModelRate(modelName?: string): (ModelRate & { key: string }) | null {
    if (!modelName) return null
    const lower = String(modelName).toLowerCase()
    // Custom entries from the Settings drawer extend / override the built-in
    // table; a custom key wins when it matches the same model name.
    const merged: Record<string, ModelRate> = {...MODEL_PRICING}
    for (const [k, v] of Object.entries(getCustomPricing())) {
        merged[k] = {input: v.input, output: v.output, note: v.note || `custom: ${k}`}
    }
    // Longest key first so "gpt-5.4-mini" beats "gpt-5.4" beats "gpt-5".
    const keys = Object.keys(merged).sort((a, b) => b.length - a.length)
    for (const k of keys) {
        if (lower.includes(k.toLowerCase())) {
            return {...merged[k], key: k}
        }
    }
    return null
}

export function genRateKey(model: string, dir: 'In' | 'Out'): string {
    return 'gen' + dir + ':' + (slugify(model) || 'model')
}

export interface SplitTokens {
    prompt: number
    completion: number
    total: number
    exact: boolean
}

// Split a per-bucket token record into {prompt, completion}. Supports the new
// shape ({prompt, completion, total}) and the legacy shape (a bare integer for
// total). When only total is available, assume a 50/50 split so the math works.
export function splitTokens(entry: TokenEntry): SplitTokens {
    if (entry == null) return {prompt: 0, completion: 0, total: 0, exact: true}
    if (typeof entry === 'number') {
        const half = Math.round(entry / 2)
        return {prompt: half, completion: entry - half, total: entry, exact: false}
    }
    const p = Number(entry.prompt || 0)
    const c = Number(entry.completion || 0)
    const t = Number(entry.total || p + c)
    return {prompt: p, completion: c, total: t || p + c, exact: p + c > 0}
}

// Per-call cost in USD from token counts and $/1M-token rates.
export function callCost(
    promptTok: number,
    completionTok: number,
    inRate: number,
    outRate: number,
): number {
    return (promptTok / 1_000_000) * inRate + (completionTok / 1_000_000) * outRate
}

export interface Totals {
    perModel: Map<string, { prompt: number; completion: number }>
    judge: { prompt: number; completion: number }
    anyLegacy: boolean
}

// Aggregate token usage: generator tokens summed per model, judge tokens pooled.
export function totalsFromResults(results: DatasetResult[], meta: EvalMeta): Totals {
    const perModel = new Map<string, { prompt: number; completion: number }>()
    const judge = {prompt: 0, completion: 0}
    let anyLegacy = false
    const bump = (target: { prompt: number; completion: number }, s: SplitTokens) => {
        target.prompt += s.prompt
        target.completion += s.completion
    }
    for (const r of results) {
        if (r?.error) continue
        for (const me of modelEvalsOf(r, meta)) {
            const model = me.generator_model || '(generator)'
            if (!perModel.has(model)) perModel.set(model, {prompt: 0, completion: 0})
            const tok = me.tokens || {}
            for (const bucket of ['dataset_generation', 'column_generation'] as const) {
                const s = splitTokens(tok[bucket])
                bump(perModel.get(model)!, s)
                if (!s.exact) anyLegacy = true
            }
            for (const bucket of ['dataset_judge', 'column_judge'] as const) {
                const s = splitTokens(tok[bucket])
                bump(judge, s)
                if (!s.exact) anyLegacy = true
            }
        }
    }
    return {perModel, judge, anyLegacy}
}
