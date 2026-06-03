import type { Judgment } from '@/types/eval'

export function ReasoningBlock({ judgment }: { judgment?: Judgment }) {
    const goldReasoning = judgment?.candidate1?.reasoning
    const aiReasoning = judgment?.candidate2?.reasoning
    const winnerReasoning = judgment?.winnerReasoning
    return (
        <>
            {winnerReasoning && (
                <div className="reasoning">
                    <div className="label">Winner reasoning</div>
                    {winnerReasoning}
                </div>
            )}
            {goldReasoning && (
                <div className="reasoning">
                    <div className="label">
                        <span className="dot dot-1" /> Gold reasoning
                    </div>
                    {goldReasoning}
                </div>
            )}
            {aiReasoning && (
                <div className="reasoning">
                    <div className="label">
                        <span className="dot dot-2" /> AI reasoning
                    </div>
                    {aiReasoning}
                </div>
            )}
        </>
    )
}
