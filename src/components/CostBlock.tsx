import type {ReactNode} from 'react'
import type {DatasetResult, EvalMeta} from '@/types/eval'
import type {RateInfo, UseRates} from '@/hooks/useRates'
import {callCost, genRateKey, totalsFromResults} from '@/utils/pricing'
import {fmtCost, fmtTokens} from '@/utils/format'

function RateInput({
                       label,
                       info,
                       onSet,
                       onClear,
                   }: {
    label: string
    info: RateInfo
    onSet: (value: string) => void
    onClear: () => void
}) {
    return (
        <label>
            {label}
            <input
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={info.display}
                onChange={(e) => onSet(e.target.value)}
            />
            {info.autoFrom ? (
                <span className="auto-hint">auto: {info.autoFrom}</span>
            ) : info.userSet ? (
                <button type="button" className="reset-btn" onClick={onClear}>
                    use auto
                </button>
            ) : null}
        </label>
    )
}

function TokenRow({
                      label,
                      prompt,
                      completion,
                      cost,
                      estimate,
                  }: {
    label: ReactNode
    prompt: number
    completion: number
    cost: number
    estimate: boolean
}) {
    return (
        <div className="summary-row">
            <span className="label">{label}</span>
            <span className="nums">
                <b>{fmtTokens(prompt + completion)} tok</b>
                <span className="muted">
                    {' '}
                    ({fmtTokens(prompt)} in + {fmtTokens(completion)} out)
                </span>
                <span className="cost-amount">{fmtCost(cost, estimate)}</span>
            </span>
        </div>
    )
}

export function CostBlock({
                              results,
                              meta,
                              rates,
                          }: {
    results: DatasetResult[]
    meta: EvalMeta
    rates: UseRates
}) {
    const t = totalsFromResults(results, meta)
    const judgeModel = meta.judge_model

    // Per generator model: resolve rates and accumulate cost.
    const modelRows: Array<{
        model: string
        tok: { prompt: number; completion: number }
        cost: number
        inInfo: RateInfo
        outInfo: RateInfo
    }> = []
    let genPrompt = 0
    let genCompletion = 0
    let genCost = 0
    for (const [model, tok] of t.perModel) {
        // Existing-metadata candidates aren't generated, so they have no
        // generation tokens and no generator rate to set — skip them here.
        if (tok.prompt + tok.completion === 0) continue
        const inInfo = rates.resolve(genRateKey(model, 'In'), model, 'input')
        const outInfo = rates.resolve(genRateKey(model, 'Out'), model, 'output')
        const cost = callCost(tok.prompt, tok.completion, inInfo.rate, outInfo.rate)
        genPrompt += tok.prompt
        genCompletion += tok.completion
        genCost += cost
        modelRows.push({model, tok, cost, inInfo, outInfo})
    }

    const judgeInInfo = rates.resolve('judgeIn', judgeModel, 'input')
    const judgeOutInfo = rates.resolve('judgeOut', judgeModel, 'output')
    const judgeCost = callCost(
        t.judge.prompt,
        t.judge.completion,
        judgeInInfo.rate,
        judgeOutInfo.rate,
    )
    const totalCost = genCost + judgeCost
    const grandPrompt = genPrompt + t.judge.prompt
    const grandCompletion = genCompletion + t.judge.completion
    const grandTotal = grandPrompt + grandCompletion

    return (
        <>
            <h2 className="cost-heading">Token usage</h2>
            <div className="cost-controls">
                {modelRows.map(({model, inInfo, outInfo}) => (
                    <div className="rate-group" key={model}>
                        <div className="rate-group-label" title={model}>
                            {model} $/1M
                        </div>
                        <RateInput
                            label="input"
                            info={inInfo}
                            onSet={(v) => rates.setRate(genRateKey(model, 'In'), v)}
                            onClear={() => rates.clearRate(genRateKey(model, 'In'))}
                        />
                        <RateInput
                            label="output"
                            info={outInfo}
                            onSet={(v) => rates.setRate(genRateKey(model, 'Out'), v)}
                            onClear={() => rates.clearRate(genRateKey(model, 'Out'))}
                        />
                    </div>
                ))}
                <div className="rate-group">
                    <div className="rate-group-label">Judge $/1M</div>
                    <RateInput
                        label="input"
                        info={judgeInInfo}
                        onSet={(v) => rates.setRate('judgeIn', v)}
                        onClear={() => rates.clearRate('judgeIn')}
                    />
                    <RateInput
                        label="output"
                        info={judgeOutInfo}
                        onSet={(v) => rates.setRate('judgeOut', v)}
                        onClear={() => rates.clearRate('judgeOut')}
                    />
                </div>
                <span className="muted">
                    Input rate × prompt tokens + output rate × completion tokens. Edit{' '}
                    <code>MODEL_PRICING</code> in <code>src/utils/pricing.ts</code> to add models.
                </span>
            </div>
            {t.anyLegacy && (
                <div className="legacy-warn">
                    ⚠ One or more datasets only recorded <code>total_tokens</code>. Cost was
                    computed by assuming a 50/50 prompt/completion split. Re-run the notebook to
                    record exact prompt + completion counts.
                </div>
            )}
            <div className="summary-grid">
                {modelRows.map(({model, tok, cost}) => (
                    <TokenRow
                        key={model}
                        label={
                            <>
                                Generator · <span className="model-name">{model}</span>
                            </>
                        }
                        prompt={tok.prompt}
                        completion={tok.completion}
                        cost={cost}
                        estimate={t.anyLegacy}
                    />
                ))}
                <TokenRow
                    label="Judge"
                    prompt={t.judge.prompt}
                    completion={t.judge.completion}
                    cost={judgeCost}
                    estimate={t.anyLegacy}
                />
                <div className="summary-row total-row">
                    <span className="label">
                        <b>Total</b>
                    </span>
                    <span className="nums">
                        <b>{fmtTokens(grandTotal)} tok</b>
                        <span className="muted">
                            {' '}
                            ({fmtTokens(grandPrompt)} in + {fmtTokens(grandCompletion)} out)
                        </span>
                        <span className="cost-amount">
                            <b>{fmtCost(totalCost, t.anyLegacy)}</b>
                        </span>
                    </span>
                </div>
            </div>
        </>
    )
}
