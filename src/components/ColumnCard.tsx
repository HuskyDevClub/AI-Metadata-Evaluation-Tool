import type {CandidateKind, Category, ColumnEvaluation} from '@/types/eval'
import {DescPair} from '@/components/DescPair'
import {ReasoningBlock} from '@/components/ReasoningBlock'
import {ScoresBlock} from '@/components/ScoresBlock'
import {WinnerBadge} from '@/components/WinnerBadge'

const GEN_LABEL: Record<CandidateKind, string> = {
    generated: 'AI-generated',
    'existing-live': 'Live (data.wa.gov)',
    'existing-imported': 'Imported (curated)',
}

export function ColumnCard({
                               col,
                               categories,
                               kind = 'generated',
                           }: {
    col: ColumnEvaluation
    categories: Category[]
    kind?: CandidateKind
}) {
    const j = col.judgment ?? {}
    return (
        <div className="column-eval">
            <h3>
                {col.display_name} <span className="column-type">— {col.data_type}</span>{' '}
                {j.winner && <WinnerBadge winner={j.winner}/>}
            </h3>
            <DescPair
                gold={col.gold_description ?? undefined}
                gen={col.generated_description}
                goldLabel="Gold (live)"
                genLabel={GEN_LABEL[kind]}
            />
            <ScoresBlock judgment={j} categories={categories}/>
            <ReasoningBlock judgment={j}/>
        </div>
    )
}
