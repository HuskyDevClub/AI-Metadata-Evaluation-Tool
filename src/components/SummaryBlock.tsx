import type {Category, DatasetResult, EvalMeta} from '@/types/eval'
import type {UseRates} from '@/hooks/useRates'
import {avg} from '@/utils/format'
import {generatorModelsIn, modelEvalsOf} from '@/utils/resultShape'
import {CostBlock} from '@/components/CostBlock'
import {WinnerBadge} from '@/components/WinnerBadge'

interface ModelAccumulator {
    winners: Record<string, number>
    gold: Record<string, number[]>
    gen: Record<string, number[]>
}

export function SummaryBlock({
                                 results,
                                 categories,
                                 meta,
                                 rates,
                             }: {
    results: DatasetResult[]
    categories: Category[]
    meta: EvalMeta
    rates: UseRates
}) {
    const models = generatorModelsIn(results, meta)

    // Per model: winner counts and per-category gold/AI score lists.
    const perModel = new Map<string, ModelAccumulator>()
    for (const m of models) {
        const gold: Record<string, number[]> = {}
        const gen: Record<string, number[]> = {}
        for (const c of categories) {
            gold[c.key] = []
            gen[c.key] = []
        }
        perModel.set(m, {winners: {'1': 0, '2': 0, tie: 0, unknown: 0}, gold, gen})
    }

    let datasetCount = 0
    // Gold column + winner tallies only apply to head-to-head (compare-vs-gold)
    // candidates. Pure absolute-scoring runs have no candidate1.
    let hasGold = false
    for (const r of results) {
        if (r?.error) continue
        datasetCount++
        for (const me of modelEvalsOf(r, meta)) {
            const acc = perModel.get(me.generator_model || '(generator)')
            if (!acc) continue
            const j = me.dataset_evaluation?.judgment
            if (!j) continue
            if (j.candidate1) {
                hasGold = true
                const w = j.winner ?? 'unknown'
                acc.winners[w] = (acc.winners[w] ?? 0) + 1
            }
            for (const c of categories) {
                const v1 = j.candidate1?.[c.key]
                const v2 = j.candidate2?.[c.key]
                if (typeof v1 === 'number') acc.gold[c.key].push(v1)
                if (typeof v2 === 'number') acc.gen[c.key].push(v2)
            }
        }
    }

    // Gold column = average of the gold score across every model's judgments.
    const goldAvg: Record<string, number | null> = {}
    for (const c of categories) {
        const all: number[] = []
        for (const acc of perModel.values()) all.push(...acc.gold[c.key])
        goldAvg[c.key] = avg(all)
    }

    const variants = meta.prompt_variants ?? []
    const notes: string[] = []
    if (models.length > 1) notes.push(`${models.length} candidates`)
    if (variants.length > 1) notes.push(`${variants.length} prompt variants`)
    const modelNote = notes.length ? `, ${notes.join(', ')}` : ''
    const colSpanLabel = hasGold ? 'col-gen' : 'model-name'

    return (
        <div className="summary">
            <h2>
                Run summary — dataset-level averages ({datasetCount} dataset
                {datasetCount === 1 ? '' : 's'}
                {modelNote})
            </h2>
            {hasGold && (
                <div className="model-winners">
                    {models.map((m) => {
                        const w = perModel.get(m)!.winners
                        // Existing-metadata candidates have no winner tally; skip them.
                        if (!w['1'] && !w['2'] && !w['tie'] && !w['unknown']) return null
                        return (
                            <div className="model-winners-row" key={m}>
                                <span className="model-name">{m}</span>
                                <WinnerBadge winner="1"/> {w['1']}
                                <WinnerBadge winner="2"/> {w['2']}
                                <WinnerBadge winner="tie"/> {w['tie']}
                                {w['unknown'] ? (
                                    <>
                                        <span className="winner-badge winner-tie">Unknown</span>{' '}
                                        {w['unknown']}
                                    </>
                                ) : null}
                            </div>
                        )
                    })}
                </div>
            )}
            <table className="summary-table">
                <thead>
                <tr>
                    <th>Category</th>
                    {hasGold && <th className="col-gold">Gold</th>}
                    {models.map((m) => (
                        <th className={`model-name ${colSpanLabel}`} key={m}>
                            {m}
                        </th>
                    ))}
                </tr>
                </thead>
                <tbody>
                {categories.map((c) => {
                    const g = goldAvg[c.key]
                    const modelAvgs = models.map((m) => avg(perModel.get(m)!.gen[c.key]))
                    if (g === null && modelAvgs.every((a) => a === null)) return null
                    return (
                        <tr key={c.key}>
                            <td>{c.label}</td>
                            {hasGold && (
                                <td className="col-gold">{g !== null ? g.toFixed(2) : '–'}</td>
                            )}
                            {modelAvgs.map((a, i) => {
                                const delta = hasGold && g !== null && a !== null ? a - g : null
                                const dClass =
                                    delta === null
                                        ? 'delta-zero'
                                        : delta > 0
                                            ? 'delta-pos'
                                            : delta < 0
                                                ? 'delta-neg'
                                                : 'delta-zero'
                                return (
                                    <td key={i}>
                                        {a !== null ? a.toFixed(2) : '–'}
                                        {delta !== null && (
                                            <span className={`delta ${dClass}`}>
                                                    {' '}
                                                ({delta > 0 ? '+' : ''}
                                                {delta.toFixed(2)})
                                                </span>
                                        )}
                                    </td>
                                )
                            })}
                        </tr>
                    )
                })}
                </tbody>
            </table>
            <CostBlock results={results} meta={meta} rates={rates}/>
        </div>
    )
}
