export function DescPair({gold, gen}: { gold?: string; gen?: string }) {
    return (
        <div className="descs">
            <div className="desc-block">
                <div className="label">
                    <span className="dot dot-1"/>
                    Gold (existing)
                </div>
                <p>{gold || '(empty)'}</p>
            </div>
            <div className="desc-block">
                <div className="label">
                    <span className="dot dot-2"/>
                    AI-generated
                </div>
                <p>{gen || '(empty)'}</p>
            </div>
        </div>
    )
}
