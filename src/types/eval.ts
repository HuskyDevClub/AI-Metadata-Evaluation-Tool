// Shapes for eval results and the NDJSON streaming protocol served by
// backend/router.py (POST /api/eval/run).

export interface Category {
    key: string
    label: string
    // Integer score range the judge uses for this metric (default 0–10). Older
    // result files omit these; renderers fall back to 0–10.
    min?: number
    max?: number
}

// A judge metric as edited in Settings / sent in a run request. Extends Category
// with the description that guides the judge and a required score range.
export interface ScoringCategory extends Category {
    description: string
    min: number
    max: number
}

// Generation prompt overrides; a blank/omitted field uses the backend default.
export interface PromptOverrides {
    system?: string
    dataset?: string
    column?: string
}

// A named generation-prompt set, used to compare prompts side by side. Blank
// fields fall back to the resolved default template.
export interface PromptVariant {
    name: string
    system?: string
    dataset?: string
    column?: string
}

// An explicit model↔prompt pairing — one generated candidate. `variant` names a
// PromptVariant; when omitted the run's Default variant is used. Supplying pairs
// replaces the default model × prompt cross.
export interface GeneratorPair {
    model: string
    variant?: string
}

// A dataset supplied by the client (e.g. parsed from an Improvement-tool export).
// The eval still loads it live from Socrata by `uid`; the description/column map
// carry the existing curated metadata to validate.
export interface ImportedDataset {
    uid: string
    name?: string
    description?: string
    columnDescriptions?: Record<string, string>
    domain?: string
}

// GET /api/eval/defaults — the resolved default prompts + judge metrics, used to
// pre-fill the Settings editors.
export interface EvalDefaults {
    prompts: { system: string; dataset: string; column: string; source: string }
    scoring_categories_dataset: ScoringCategory[]
    scoring_categories_column: ScoringCategory[]
}

export type TokenEntry =
    | number
    | { prompt?: number; completion?: number; total?: number }
    | null
    | undefined

export interface Tokens {
    dataset_generation?: TokenEntry
    column_generation?: TokenEntry
    dataset_judge?: TokenEntry
    column_judge?: TokenEntry
}

export interface CandidateScores {
    reasoning?: string

    // Per-category integer scores (0–10), keyed by Category.key.
    // Per-category max−min spread across self-consistency samples (judgeSamples
    // > 1), keyed by Category.key. A noise estimate: high spread = unstable.
    score_spread?: Record<string, number>

    [categoryKey: string]: number | string | Record<string, number> | undefined
}

export interface Judgment {
    winner?: string
    winnerReasoning?: string
    candidate1?: CandidateScores
    candidate2?: CandidateScores
    // Number of judge samples aggregated (median) when self-consistency is on.
    judge_samples?: number
    // Present only when nothing parsed.
    error?: string
}

// Deterministic, code-based quality metrics computed in backend/quality_checks.py
// — the objective WA plain-language / formatting rules, scored without the LLM.
// `flags` values are true when the rule is VIOLATED.
export interface DeterministicChecks {
    word_count: number
    word_target: [number, number]
    sentence_count: number
    avg_sentence_words: number
    max_sentence_words: number
    long_sentences: number
    flesch_reading_ease: number
    flesch_kincaid_grade: number
    unexpanded_acronyms: string[]
    deadly7_count: number
    deadly7_sentence_ratio: number
    passive_sentence_ratio: number
    jargon_hits: string[]
    paragraph_count: number
    has_bullets: boolean
    generic_opening: boolean
    flags: Record<string, boolean>
    violation_count: number
}

export interface DatasetEvaluation {
    // null in absolute (no-gold) scoring; a string only in head-to-head runs.
    gold_description?: string | null
    generated_description?: string
    judgment?: Judgment
    deterministic_checks?: DeterministicChecks
}

export interface ColumnEvaluation {
    display_name: string
    data_type: string
    gold_description?: string | null
    generated_description?: string
    judgment?: Judgment
    deterministic_checks?: DeterministicChecks
    // True when an existing-metadata candidate has no description for this
    // column. The column isn't judged; the UI flags it so the user can add one.
    missing_description?: boolean
}

// What a candidate's metadata came from: a fresh generation, or existing
// human metadata (live on the portal, or imported/curated).
export type CandidateKind = 'generated' | 'existing-live' | 'existing-imported'

export interface ModelEvaluation {
    // Display/grouping label for this candidate column. For generated candidates
    // it's the model name (or `model · variant` when prompts vary); for existing
    // metadata it's a fixed label like "data.wa.gov (live)".
    generator_model: string
    candidate_kind?: CandidateKind
    base_model?: string | null
    prompt_variant?: string | null
    dataset_evaluation?: DatasetEvaluation
    column_evaluations?: ColumnEvaluation[]
    tokens?: Tokens
    elapsed_seconds?: number
}

export interface DatasetResult {
    dataset_id: string
    name?: string
    total_rows?: number
    column_count?: number
    elapsed_seconds?: number
    error?: string
    // New runs nest one evaluation per generator model here.
    model_evaluations?: ModelEvaluation[]
    // Legacy single-model files keep these fields directly on the result.
    dataset_evaluation?: DatasetEvaluation
    column_evaluations?: ColumnEvaluation[]
    tokens?: Tokens
}

export interface EvalMeta {
    generator_models?: string[]
    generator_model?: string
    prompt_variants?: string[]
    judge_model?: string
    generated_at?: string
    prompts_source?: string
    compare_gold?: boolean
    evaluate_live?: boolean
    evaluate_imported?: boolean
    judge_samples?: number
    randomize_judge_order?: boolean
    dataset_source?: string
    scoring_categories_dataset?: Category[]
    scoring_categories_column?: Category[]
}

export interface EvalOutput {
    metadata?: EvalMeta
    results?: DatasetResult[]
}

// --- Run request -----------------------------------------------------------
export interface EvalRunRequest {
    datasetLimit: number
    evalColumns: boolean
    maxColumnsPerDataset: number
    // Dataset source: explicit Socrata UIDs, or imported datasets carrying their
    // UID + curated metadata. When both omitted, the backend uses its CSV.
    datasetIds?: string[]
    importedDatasets?: ImportedDataset[]
    // Generation axes. generatorModels may be empty (evaluate existing only).
    generatorModels?: string[]
    promptVariants?: PromptVariant[]
    // Explicit model↔prompt pairings. When non-empty, generated candidates are
    // exactly these pairs instead of the generatorModels × promptVariants cross.
    generatorPairs?: GeneratorPair[]
    judgeModel?: string
    // Judge reliability. judgeSamples > 1 runs the judge N times and takes the
    // per-category median (self-consistency); 1 (default) runs once at temp 0.
    // randomizeJudgeOrder blinds + shuffles candidate order in head-to-head.
    judgeSamples?: number
    randomizeJudgeOrder?: boolean
    // Candidate / comparison toggles.
    evaluateLive?: boolean
    evaluateImported?: boolean
    compareGold?: boolean
    // Per-run overrides from the Settings drawer; omitted → backend defaults.
    prompts?: PromptOverrides
    scoringCategoriesDataset?: ScoringCategory[]
    scoringCategoriesColumn?: ScoringCategory[]
}

// --- Streaming events ------------------------------------------------------
export interface StartEvent {
    type: 'start'
    total: number
    generator_models?: string[]
    prompt_variants?: string[]
    judge_model?: string
    started_at?: string
    prompts_source?: string
    compare_gold?: boolean
    evaluate_live?: boolean
    evaluate_imported?: boolean
    dataset_source?: string
    scoring_categories_dataset?: Category[]
    scoring_categories_column?: Category[]
}

export interface DatasetStartEvent {
    type: 'dataset_start'
    i: number
    total: number
    id: string
}

export interface StageEvent {
    type: 'stage'
    stage: string
    model?: string
    model_i?: number
    model_total?: number
    i?: number
    total?: number
    col?: string
}

export interface DatasetDoneEvent {
    type: 'dataset_done'
    result: DatasetResult
    elapsed_seconds?: number
}

export interface CompleteEvent {
    type: 'complete'
    output: EvalOutput
}

export interface ErrorEvent {
    type: 'error'
    error: string
}

export type RunEvent =
    | StartEvent
    | DatasetStartEvent
    | StageEvent
    | DatasetDoneEvent
    | CompleteEvent
    | ErrorEvent
