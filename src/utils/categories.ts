import type {Category, EvalMeta} from '@/types/eval'

// Used when a result file predates the metadata that lists scoring categories.
export const CATS_FALLBACK: Category[] = [
    {key: 'completeness', label: 'Completeness'},
    {key: 'accuracy', label: 'Accuracy'},
    {key: 'conciseness', label: 'Conciseness'},
    {key: 'plainLanguage', label: 'Plain Language'},
    {key: 'readability', label: 'Readability'},
    {key: 'guidelineCompliance', label: 'Guideline Compliance'},
    {key: 'consistency', label: 'Consistency'},
    {key: 'usefulness', label: 'Usefulness / Public Value'},
]

// Dataset and column scoring categories for a run, preferring the run's own
// metadata and falling back to the static list (columns drop "consistency").
export function categoriesFor(meta: EvalMeta): { dsCats: Category[]; colCats: Category[] } {
    const ds = meta.scoring_categories_dataset || []
    const col = meta.scoring_categories_column || []
    return {
        dsCats: ds.length ? ds : CATS_FALLBACK,
        colCats: col.length ? col : CATS_FALLBACK.filter((c) => c.key !== 'consistency'),
    }
}
