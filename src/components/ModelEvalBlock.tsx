import type {CandidateKind, Category, ModelEvaluation} from '@/types/eval'
import type {UseRates} from '@/hooks/useRates'
import {callCost, genRateKey, splitTokens} from '@/utils/pricing'
import {candidateGenLabel, fmtCost, fmtTokens} from '@/utils/format'
import {ChecksBlock} from '@/components/ChecksBlock'
import {ColumnCard} from '@/components/ColumnCard'
import {DescPair} from '@/components/DescPair'
import {ReasoningBlock} from '@/components/ReasoningBlock'
import {ScoresBlock} from '@/components/ScoresBlock'
import {WinnerBadge} from '@/components/WinnerBadge'

const KIND_BADGE: Record<CandidateKind, string> = {
    generated: '',
    'existing-live': 'existing · live',
    'existing-imported': 'existing · imported',
}

// One candidate's evaluation of a dataset: a generated description judged against
// gold (head-to-head), or any description scored on its own (absolute).
export function ModelEvalBlock({
                                   me,
                                   dsCats,
                                   colCats,
                                   judgeModel,
                                   rates,
                                   domain,
                               }: {
    me: ModelEvaluation
    dsCats: Category[]
    colCats: Category[]
    judgeModel?: string
    rates: UseRates
    domain?: string
}) {
    const j = me.dataset_evaluation?.judgment ?? {}
    const cols = me.column_evaluations ?? []
    const missingCols = cols.filter((c) => c.missing_description).length
    const scoredCols = cols.length - missingCols
    const tok = me.tokens || {}
    const kind: CandidateKind = me.candidate_kind ?? 'generated'
    const isGenerated = kind === 'generated'
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
    const label = me.generator_model || '(candidate)'
    const genIn = rates.resolve(genRateKey(label, 'In'), me.base_model || label, 'input').rate
    const genOut = rates.resolve(genRateKey(label, 'Out'), me.base_model || label, 'output').rate
    const judgeIn = rates.resolve('judgeIn', judgeModel, 'input').rate
    const judgeOut = rates.resolve('judgeOut', judgeModel, 'output').rate
    const rowCost =
        callCost(genPrompt, genCompletion, genIn, genOut) +
        callCost(judgePrompt, judgeCompletion, judgeIn, judgeOut)
    return (
        <div className="model-eval">
            <h3 className="model-eval-head">
                <span className="model-eval-name">{label}</span>
                {KIND_BADGE[kind] && <span className="kind-badge">{KIND_BADGE[kind]}</span>}
                {j.winner && <WinnerBadge winner={j.winner}/>}
                <span className="tokens-strip">
                    {isGenerated ? (
                        <>
                            gen <b>{fmtTokens(genTokens)}</b> + judge <b>{fmtTokens(judgeTokens)}</b> ={' '}
                            <b>{fmtTokens(genTokens + judgeTokens)}</b> tok
                        </>
                    ) : (
                        <>
                            judge <b>{fmtTokens(judgeTokens)}</b> tok
                        </>
                    )}
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
                gold={me.dataset_evaluation?.gold_description ?? undefined}
                gen={me.dataset_evaluation?.generated_description}
                goldLabel="Gold (live)"
                genLabel={candidateGenLabel(kind, domain)}
            />
            <ScoresBlock judgment={j} categories={dsCats}/>
            <ChecksBlock checks={me.dataset_evaluation?.deterministic_checks}/>
            <ReasoningBlock judgment={j}/>
            {cols.length > 0 && (
                <details className="columns">
                    <summary>
                        {scoredCols} column evaluation{scoredCols === 1 ? '' : 's'}
                        {missingCols > 0 && (
                            <span className="missing-count">
                                {' '}· {missingCols} missing description{missingCols === 1 ? '' : 's'}
                            </span>
                        )}
                    </summary>
                    {cols.map((c, i) => (
                        <ColumnCard key={i} col={c} categories={colCats} kind={kind} domain={domain}/>
                    ))}
                </details>
            )}
        </div>
    )
}
