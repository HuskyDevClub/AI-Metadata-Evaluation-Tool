// Side-by-side metadata blocks. In head-to-head runs both `gold` and `gen` are
// shown; for absolute scoring only the single scored description (`gen`) is
// passed, so the gold block is omitted and the remaining block spans full width.
export function DescPair({
                             gold,
                             gen,
                             goldLabel = 'Gold (existing)',
                             genLabel = 'AI-generated',
                         }: {
    gold?: string
    gen?: string
    goldLabel?: string
    genLabel?: string
}) {
    const showGold = gold !== undefined
    return (
        <div className={`descs${showGold ? '' : ' single'}`}>
            {showGold && (
                <div className="desc-block">
                    <div className="label">
                        <span className="dot dot-1"/>
                        {goldLabel}
                    </div>
                    <p>{gold || '(empty)'}</p>
                </div>
            )}
            <div className="desc-block">
                <div className="label">
                    <span className="dot dot-2"/>
                    {genLabel}
                </div>
                <p>{gen || '(empty)'}</p>
            </div>
        </div>
    )
}
