import type { EvalOutput } from '@/types/eval'
import type { UseRates } from '@/hooks/useRates'
import { categoriesFor } from '@/utils/categories'
import { DatasetCard } from '@/components/DatasetCard'
import { SummaryBlock } from '@/components/SummaryBlock'

export function ResultsView({ data, rates }: { data: EvalOutput; rates: UseRates }) {
    const meta = data.metadata ?? {}
    const results = data.results ?? []
    const { dsCats, colCats } = categoriesFor(meta)

    if (!results.length) {
        return <div className="empty">No results found in this file.</div>
    }

    return (
        <>
            <SummaryBlock results={results} categories={dsCats} meta={meta} rates={rates} />
            {results.map((r, i) => (
                <DatasetCard
                    key={i}
                    r={r}
                    dsCats={dsCats}
                    colCats={colCats}
                    meta={meta}
                    rates={rates}
                />
            ))}
        </>
    )
}
