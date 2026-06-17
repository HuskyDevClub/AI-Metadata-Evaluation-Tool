// Persisted defaults for an eval run, shared by the Run panel (which launches a
// run) and the Settings drawer (which edits them as global defaults). Both read
// and write the same localStorage keys, so they stay in sync.

import type {DatasetRef} from '@/types/eval'

export const RUN_LS = {
    gen: 'evalViewer.runGeneratorModels',
    judge: 'evalViewer.runJudgeModel',
    limit: 'evalViewer.runLimit',
    evalCols: 'evalViewer.runEvalColumns',
    maxCols: 'evalViewer.runMaxCols',
    // Dataset source + candidate/comparison knobs.
    source: 'evalViewer.runSource',
    ids: 'evalViewer.runDatasetIds',
    benchmarkCsv: 'evalViewer.runBenchmarkCsv',
    imported: 'evalViewer.runImportedDatasets',
    evalLive: 'evalViewer.runEvaluateLive',
    evalImported: 'evalViewer.runEvaluateImported',
    compareGold: 'evalViewer.runCompareGold',
    // Unified ordered prompt library (each entry compares as one prompt), built
    // in the Run panel. Supersedes the legacy `variants` + `defaultVariant` keys,
    // which are still read once to migrate older browsers.
    promptSets: 'evalViewer.promptSets',
    variants: 'evalViewer.promptVariants',
    defaultVariant: 'evalViewer.runDefaultVariantOn',
    // Generation builder: cross every model×prompt vs explicit model→prompt pairs.
    pairMode: 'evalViewer.runPairMode',
    pairs: 'evalViewer.runGeneratorPairs',
    // What the generation run compares, plus the single picks for the two modes
    // that hold one axis fixed (compare prompts → one model; compare models →
    // one prompt).
    compareMode: 'evalViewer.runCompareMode',
    soloModel: 'evalViewer.runSoloModel',
    soloVariant: 'evalViewer.runSoloVariant',
    // Which goal the Run panel starts on.
    goal: 'evalViewer.runGoal',
}

export type RunSource = 'csv' | 'ids' | 'import'
// The two top-level intents: score metadata that already exists, or generate
// new metadata and score it.
export type RunGoal = 'validate' | 'generate'
// What an "evaluate AI generation" run varies. `prompts`: one model, many
// prompts. `models`: many models, one prompt. `both`: every model × every prompt
// (or explicit pairings).
export type CompareMode = 'prompts' | 'models' | 'both'

export const RUN_DEFAULTS = {
    limit: 5,
    evalColumns: true,
    maxCols: -1, // -1 = evaluate every column the dataset has
    source: 'csv' as RunSource,
    goal: 'generate' as RunGoal,
    evalLive: true, // when validating, the live description is the obvious target
    evalImported: true, // when importing, validating the curated text is the point
    compareGold: true, // preserve the head-to-head experience by default
    defaultVariant: true,
}

// Parse the generator-models textarea into a deduped list (one model per line).
export function parseGeneratorModels(text: string): string[] {
    const seen: string[] = []
    for (const line of text.split('\n')) {
        const m = line.trim()
        if (m && !seen.includes(m)) seen.push(m)
    }
    return seen
}

// The portal these UIDs resolve to unless a pasted URL says otherwise; matches
// the backend default. A ref on this portal is stored bare (no domain).
export const DEFAULT_DATASET_DOMAIN = 'data.wa.gov'

// A Socrata UID is two 4-char alphanumeric blocks; it can appear bare or as the
// last path segment of a dataset URL (…/data.wa.gov/d/abcd-1234, …?foo=bar).
const DATASET_ID_PATTERN = /(?:^|\/)([a-z0-9]{4}-[a-z0-9]{4})(?:$|\/|\?|#)/i

// Pull a UID out of one pasted token — a bare id or a full dataset URL. Returns
// null when the token has a path/scheme (so it's URL-shaped) but no UID in it;
// a slash-free token with no match is kept as-is so hand-typed ids still pass.
export function extractDatasetId(input: string): string | null {
    const raw = input.trim()
    if (!raw) return null
    const m = raw.match(DATASET_ID_PATTERN)
    if (m) return m[1].toLowerCase()
    return raw.includes('/') ? null : raw
}

// Pull the portal host out of a pasted dataset URL. Null for a bare UID (which
// has no host) so it falls back to the default portal.
export function extractDomain(input: string): string | null {
    const raw = input.trim()
    // A bare UID has no path; only URL-shaped tokens carry a portal host.
    if (!raw || !raw.includes('/')) return null
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    try {
        const host = new URL(withScheme).hostname.toLowerCase()
        return host.includes('.') ? host : null
    } catch {
        return null
    }
}

// Parse a UID blob (one dataset per line; bare ids or dataset URLs) into deduped
// {uid, domain?} refs. Lines are not split on commas, so a dataset URL carrying
// a comma (e.g. a query param) stays intact. A URL on the default portal
// collapses to a bare UID; only non-default portals keep their domain, so the
// same UID typed bare and as a default-portal URL dedupe together.
export function parseDatasetRefs(text: string): DatasetRef[] {
    const out: DatasetRef[] = []
    const seen = new Set<string>()
    for (const chunk of text.split(/\r?\n/)) {
        const uid = extractDatasetId(chunk)
        if (!uid) continue
        const host = extractDomain(chunk)
        const domain = host && host !== DEFAULT_DATASET_DOMAIN ? host : undefined
        const key = `${domain ?? ''}|${uid}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push(domain ? {uid, domain} : {uid})
    }
    return out
}

// Render a ref back to a single storable/displayable token, the inverse of
// `parseDatasetRefs` (so persisted text round-trips). Bare UID on the default
// portal; `domain/uid` otherwise.
export function datasetRefToken(ref: DatasetRef): string {
    return ref.domain ? `${ref.domain}/${ref.uid}` : ref.uid
}
