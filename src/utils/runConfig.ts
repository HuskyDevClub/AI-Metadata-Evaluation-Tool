// Per-run prompt library + judge-metric overrides edited in the Run panel and
// Settings drawer. Stored in localStorage (under the evalViewer.* prefix so a
// reset clears them) and merged into the run request when an eval is launched.

import type {EvalDefaults, EvalRunRequest, PromptVariant, ScoringCategory} from '@/types/eval'
import {getApiBaseUrl} from '@/utils/config'
import {RUN_DEFAULTS, RUN_LS} from '@/utils/runDefaults'

export type ScoringLevel = 'dataset' | 'column'

const LS = {
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

// --- Prompt library (compare prompts) ---------------------------------------
// An ordered list of named prompt sets the run compares side by side. Each entry
// is one candidate prompt; `enabled` includes it in the run. Any blank override
// falls back to the backend's resolved default template, so a pristine "Default"
// set (no overrides) means "use the backend default prompt".
export interface PromptSet {
    id: string
    name: string
    enabled: boolean
    system?: string
    dataset?: string
    column?: string
}

let idSeq = 0

// Unique enough for React keys / drag identity within a session.
export function newPromptId(): string {
    idSeq += 1
    return `ps_${Date.now().toString(36)}_${idSeq}`
}

function normalizeSet(v: Partial<PromptSet>): PromptSet {
    return {
        id: typeof v.id === 'string' && v.id ? v.id : newPromptId(),
        name: typeof v.name === 'string' ? v.name : '',
        enabled: v.enabled !== false,
        system: v.system,
        dataset: v.dataset,
        column: v.column,
    }
}

// One-time migration: fold the legacy standalone "Default" toggle plus the old
// `variants` list into the unified, reorderable prompt library.
function migratePromptSets(): PromptSet[] {
    const defRaw = localStorage.getItem(RUN_LS.defaultVariant)
    const defaultOn = defRaw === null ? RUN_DEFAULTS.defaultVariant : defRaw === '1'
    const list: PromptSet[] = [normalizeSet({name: 'Default', enabled: defaultOn})]
    const legacy = readJson<Partial<PromptSet>[]>(RUN_LS.variants)
    if (Array.isArray(legacy)) {
        for (const v of legacy) list.push(normalizeSet(v))
    }
    return list
}

export function getPromptSets(): PromptSet[] {
    const raw = localStorage.getItem(RUN_LS.promptSets)
    if (raw === null) {
        const migrated = migratePromptSets()
        setPromptSets(migrated)
        return migrated
    }
    const arr = readJson<Partial<PromptSet>[]>(RUN_LS.promptSets)
    if (!Array.isArray(arr)) return []
    return arr.map(normalizeSet)
}

export function setPromptSets(list: PromptSet[]): void {
    localStorage.setItem(RUN_LS.promptSets, JSON.stringify(list))
}

// Every enabled, named prompt set as a run payload (no collapsing). Pair mode
// needs the full list so each pairing's variant name resolves on the backend.
export function promptVariantPayload(sets: PromptSet[]): PromptVariant[] {
    const out: PromptVariant[] = []
    for (const v of sets) {
        const name = v.name.trim()
        if (!v.enabled || !name) continue
        const variant: PromptVariant = {name}
        for (const k of ['system', 'dataset', 'column'] as const) {
            const text = (v[k] ?? '').trim()
            if (text) variant[k] = v[k]
        }
        out.push(variant)
    }
    return out
}

// The promptVariants payload for cross mode. Returns undefined when only a
// pristine Default is active (so the backend runs its single default prompt and
// doesn't tag candidates with a variant name).
export function promptVariantsFrom(sets: PromptSet[]): PromptVariant[] | undefined {
    const out = promptVariantPayload(sets)
    if (out.length === 0) return undefined
    if (
        out.length === 1 &&
        out[0].name === 'Default' &&
        !out[0].system &&
        !out[0].dataset &&
        !out[0].column
    ) {
        return undefined
    }
    return out
}

export function buildPromptVariants(): PromptVariant[] | undefined {
    return promptVariantsFrom(getPromptSets())
}

// The single-prompt payload for "compare models" mode, where one prompt is held
// fixed across every model. Returns the one named prompt the user picked, or
// undefined for the backend default (a blank/"Default" pick, or a pristine
// "Default" card) so the run uses its built-in prompt and tags no variant.
export function variantPayloadByName(
    sets: PromptSet[],
    name: string,
): PromptVariant[] | undefined {
    const target = name.trim()
    if (!target || target.toLowerCase() === 'default') {
        const def = sets.find((s) => s.name.trim().toLowerCase() === 'default')
        return def ? promptVariantsFrom([def]) : undefined
    }
    const chosen = sets.find((s) => s.name.trim() === target)
    return chosen ? promptVariantsFrom([chosen]) : undefined
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
// the user hasn't customized so the backend keeps using its defaults. Prompt
// customization now travels with the prompt library (promptVariants), not here.
export function runOverrides(): Partial<EvalRunRequest> {
    const out: Partial<EvalRunRequest> = {}

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
