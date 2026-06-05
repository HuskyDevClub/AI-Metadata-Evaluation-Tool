import type {Category, ModelEvaluation} from '@/types/eval'
import type {UseRates} from '@/hooks/useRates'
import {callCost, genRateKey, splitTokens} from '@/utils/pricing'
import {fmtCost, fmtTokens} from '@/utils/format'
import {ColumnCard} from '@/components/ColumnCard'
import {DescPair} from '@/components/DescPair'
import {ReasoningBlock} from '@/components/ReasoningBlock'
import {ScoresBlock} from '@/components/ScoresBlock'
import {WinnerBadge} from '@/components/WinnerBadge'

// One generator model's evaluation of a dataset (gold vs that model's output).
export function ModelEvalBlock({
                                   me,
                                   dsCats,
                                   colCats,
                                   judgeModel,
                                   rates,
                               }: {
    me: ModelEvaluation
    dsCats: Category[]
    colCats: Category[]
    judgeModel?: string
    rates: UseRates
}) {
    const j = me.dataset_evaluation?.judgment ?? {}
    const cols = me.column_evaluations ?? []
    const tok = me.tokens || {}
    const dsGen = splitTokens(tok.dataset_generation)
    const colGen = splitTokens(tok.column_generation)
    const dsJud = splitTokens(tok.dataset_judge)
    const colJud = splitTokens(tok.column_judge)
    const rowEstimate = [dsGen, colGen, dsJud, colJud].some((s) => s.total > 0 && !s.exact)
    const genPrompt = dsGen.prompt + colGen.prompt
    const genCompletion = dsGen.completion + colGen.completion
    const judgePrompt = dsJud.prompt + colJud.prompt
    const judgeCompletion = dsJud.completion + colJud.completion
    const genTokens = genPrompt + genCompletion
    const judgeTokens = judgePrompt + judgeCompletion
    const model = me.generator_model || '(generator)'
    const genIn = rates.resolve(genRateKey(model, 'In'), model, 'input').rate
    const genOut = rates.resolve(genRateKey(model, 'Out'), model, 'output').rate
    const judgeIn = rates.resolve('judgeIn', judgeModel, 'input').rate
    const judgeOut = rates.resolve('judgeOut', judgeModel, 'output').rate
    const rowCost =
        callCost(genPrompt, genCompletion, genIn, genOut) +
        callCost(judgePrompt, judgeCompletion, judgeIn, judgeOut)
    return (
        <div className="model-eval">
            <h3 className="model-eval-head">
                <span className="model-eval-name">{model}</span>
                <WinnerBadge winner={j.winner}/>
                <span className="tokens-strip">
                    gen <b>{fmtTokens(genTokens)}</b> + judge <b>{fmtTokens(judgeTokens)}</b> ={' '}
                    <b>{fmtTokens(genTokens + judgeTokens)}</b> tok
                    {rowCost > 0 && (
                        <>
                            {' · '}
                            <b>{fmtCost(rowCost, rowEstimate)}</b>
                        </>
                    )}
                </span>
                {typeof me.elapsed_seconds === 'number' && (
                    <span className="muted">{me.elapsed_seconds}s</span>
                )}
            </h3>
            <DescPair
                gold={me.dataset_evaluation?.gold_description}
                gen={me.dataset_evaluation?.generated_description}
            />
            <ScoresBlock judgment={j} categories={dsCats}/>
            <ReasoningBlock judgment={j}/>
            {cols.length > 0 && (
                <details className="columns">
                    <summary>
                        {cols.length} column evaluation{cols.length === 1 ? '' : 's'}
                    </summary>
                    {cols.map((c, i) => (
                        <ColumnCard key={i} col={c} categories={colCats}/>
                    ))}
                </details>
            )}
        </div>
    )
}
