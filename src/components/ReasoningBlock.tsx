import type {Judgment} from '@/types/eval'

export function ReasoningBlock({
                                   judgment,
                                   genLabel = 'AI reasoning',
                               }: {
    judgment?: Judgment
    genLabel?: string
}) {
    const goldReasoning = judgment?.candidate1?.reasoning
    const aiReasoning = judgment?.candidate2?.reasoning
    const winnerReasoning = judgment?.winnerReasoning
    // With no gold candidate (absolute scoring), drop the colored dot so the
    // single reasoning block doesn't imply a comparison.
    const solo = !judgment?.candidate1
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
                        <span className="dot dot-1"/> Gold reasoning
                    </div>
                    {goldReasoning}
                </div>
            )}
            {aiReasoning && (
                <div className="reasoning">
                    <div className="label">
                        {!solo && <span className="dot dot-2"/>} {solo ? 'Reasoning' : genLabel}
                    </div>
                    {aiReasoning}
                </div>
            )}
        </>
    )
}
