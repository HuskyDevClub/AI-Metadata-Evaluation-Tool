// Persisted defaults for an eval run, shared by the Run panel (which launches a
// run) and the Settings drawer (which edits them as global defaults). Both read
// and write the same localStorage keys, so they stay in sync.

export const RUN_LS = {
    gen: 'evalViewer.runGeneratorModels',
    judge: 'evalViewer.runJudgeModel',
    limit: 'evalViewer.runLimit',
    evalCols: 'evalViewer.runEvalColumns',
    maxCols: 'evalViewer.runMaxCols',
    // Dataset source + candidate/comparison knobs.
    source: 'evalViewer.runSource',
    ids: 'evalViewer.runDatasetIds',
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

// Parse a UID textarea (one per line, commas tolerated) into a deduped list.
export function parseDatasetIds(text: string): string[] {
    const seen: string[] = []
    for (const chunk of text.split(/[\n,]/)) {
        const id = chunk.trim()
        if (id && !seen.includes(id)) seen.push(id)
    }
    return seen
}
