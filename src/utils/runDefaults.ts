// Persisted defaults for an eval run, shared by the Run panel (which launches a
// run) and the Settings drawer (which edits them as global defaults). Both read
// and write the same localStorage keys, so they stay in sync.

export const RUN_LS = {
    gen: 'evalViewer.runGeneratorModels',
    judge: 'evalViewer.runJudgeModel',
    limit: 'evalViewer.runLimit',
    evalCols: 'evalViewer.runEvalColumns',
    maxCols: 'evalViewer.runMaxCols',
}

export const RUN_DEFAULTS = {limit: 5, evalColumns: true, maxCols: 8}

// Parse the generator-models textarea into a deduped list (one model per line).
export function parseGeneratorModels(text: string): string[] {
    const seen: string[] = []
    for (const line of text.split('\n')) {
        const m = line.trim()
        if (m && !seen.includes(m)) seen.push(m)
    }
    return seen
}
