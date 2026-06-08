// Per-run prompt + judge-metric overrides edited in the Settings drawer. Stored
// in localStorage (under the evalViewer.* prefix so a reset clears them) and
// merged into the run request when an eval is launched from the Run panel.

import type {EvalDefaults, EvalRunRequest, PromptOverrides, PromptVariant, ScoringCategory,} from '@/types/eval'
import {getApiBaseUrl} from '@/utils/config'
import {RUN_DEFAULTS, RUN_LS} from '@/utils/runDefaults'

export type ScoringLevel = 'dataset' | 'column'

const LS = {
    prompts: 'evalViewer.promptOverrides',
    scoringDataset: 'evalViewer.scoringDataset',
    scoringColumn: 'evalViewer.scoringColumn',
}

const scoringKey = (level: ScoringLevel) =>
    level === 'dataset' ? LS.scoringDataset : LS.scoringColumn

function readJson<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as T) : null
    } catch {
        return null
    }
}

// --- Prompt overrides -------------------------------------------------------
export function getPromptOverrides(): PromptOverrides {
    return readJson<PromptOverrides>(LS.prompts) ?? {}
}

export function setPromptOverrides(overrides: PromptOverrides): void {
    // Drop blank fields so an empty edit means "use the default".
    const cleaned: PromptOverrides = {}
    for (const k of ['system', 'dataset', 'column'] as const) {
        const v = (overrides[k] ?? '').trim()
        if (v) cleaned[k] = overrides[k]
    }
    if (Object.keys(cleaned).length) localStorage.setItem(LS.prompts, JSON.stringify(cleaned))
    else localStorage.removeItem(LS.prompts)
}

// --- Judge metrics ----------------------------------------------------------
// Returns null when the user hasn't customized the level (use backend defaults).
// Fills any missing score range with 0–10 so editor inputs stay controlled.
export function getScoring(level: ScoringLevel): ScoringCategory[] | null {
    const arr = readJson<ScoringCategory[]>(scoringKey(level))
    if (!arr) return null
    return arr.map((c) => ({
        key: c.key,
        label: c.label,
        description: c.description ?? '',
        min: Number.isFinite(c.min) ? c.min : 0,
        max: Number.isFinite(c.max) ? c.max : 10,
    }))
}

export function setScoring(level: ScoringLevel, cats: ScoringCategory[] | null): void {
    if (cats) localStorage.setItem(scoringKey(level), JSON.stringify(cats))
    else localStorage.removeItem(scoringKey(level))
}

// Keep only well-formed metrics (key matches the backend's safe-identifier rule,
// a label is present, and the score range is valid), so a half-typed row never
// reaches the API. A non-positive or inverted range falls back to 0–10.
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]*$/

export function validScoring(cats: ScoringCategory[]): ScoringCategory[] {
    return cats
        .map((c) => {
            const min = Number.isFinite(c.min) ? Math.trunc(c.min) : 0
            const max = Number.isFinite(c.max) ? Math.trunc(c.max) : 10
            const ok = max > min && min >= 0
            return {
                key: c.key.trim(),
                label: c.label.trim(),
                description: c.description ?? '',
                min: ok ? min : 0,
                max: ok ? max : 10,
            }
        })
        .filter((c) => KEY_RE.test(c.key) && c.label.length > 0)
}

// --- Prompt variants (compare prompts) --------------------------------------
// A named prompt set the run can compare. `enabled` selects it for the run; any
// blank override falls back to the resolved default template. The implicit
// "Default" variant (the Settings prompts) is tracked by its own on/off flag.
export interface StoredVariant {
    name: string
    enabled: boolean
    system?: string
    dataset?: string
    column?: string
}

export function getVariants(): StoredVariant[] {
    const arr = readJson<StoredVariant[]>(RUN_LS.variants)
    if (!Array.isArray(arr)) return []
    return arr.map((v) => ({
        name: typeof v.name === 'string' ? v.name : '',
        enabled: v.enabled !== false,
        system: v.system,
        dataset: v.dataset,
        column: v.column,
    }))
}

export function setVariants(list: StoredVariant[]): void {
    if (list.length) localStorage.setItem(RUN_LS.variants, JSON.stringify(list))
    else localStorage.removeItem(RUN_LS.variants)
}

export function getDefaultVariantOn(): boolean {
    const raw = localStorage.getItem(RUN_LS.defaultVariant)
    return raw === null ? RUN_DEFAULTS.defaultVariant : raw === '1'
}

export function setDefaultVariantOn(on: boolean): void {
    localStorage.setItem(RUN_LS.defaultVariant, on ? '1' : '0')
}

// Build the promptVariants run payload from the stored selection. Returns
// undefined when only the Default variant is active (so the backend runs its
// single default prompt and doesn't tag candidates with a variant name).
export function buildPromptVariants(): PromptVariant[] | undefined {
    const out: PromptVariant[] = []
    if (getDefaultVariantOn()) out.push({name: 'Default'})
    for (const v of getVariants()) {
        const name = v.name.trim()
        if (!v.enabled || !name) continue
        const variant: PromptVariant = {name}
        for (const k of ['system', 'dataset', 'column'] as const) {
            const text = (v[k] ?? '').trim()
            if (text) variant[k] = v[k]
        }
        out.push(variant)
    }
    // A lone Default → let the backend use its single default prompt.
    if (out.length <= 1 && (out.length === 0 || out[0].name === 'Default')) {
        return undefined
    }
    return out
}

// --- Fetch defaults ---------------------------------------------------------
export async function fetchEvalDefaults(): Promise<EvalDefaults> {
    const resp = await fetch(`${getApiBaseUrl()}/api/eval/defaults`, {
        headers: {'X-Requested-With': 'fetch'},
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
    return (await resp.json()) as EvalDefaults
}

// --- Merge into a run request ----------------------------------------------
// Returns the override slice to spread onto the base run body. Omits anything
// the user hasn't customized so the backend keeps using its defaults.
export function runOverrides(): Partial<EvalRunRequest> {
    const out: Partial<EvalRunRequest> = {}

    const prompts = getPromptOverrides()
    if (Object.keys(prompts).length) out.prompts = prompts

    const ds = getScoring('dataset')
    if (ds) {
        const valid = validScoring(ds)
        if (valid.length) out.scoringCategoriesDataset = valid
    }
    const col = getScoring('column')
    if (col) {
        const valid = validScoring(col)
        if (valid.length) out.scoringCategoriesColumn = valid
    }
    return out
}
