import type {CandidateKind, Category, ColumnEvaluation} from '@/types/eval'
import {ChecksBlock} from '@/components/ChecksBlock'
import {DescPair} from '@/components/DescPair'
import {ReasoningBlock} from '@/components/ReasoningBlock'
import {ScoresBlock} from '@/components/ScoresBlock'
import {WinnerBadge} from '@/components/WinnerBadge'

const GEN_LABEL: Record<CandidateKind, string> = {
    generated: 'AI-generated',
    'existing-live': 'Live (data.wa.gov)',
    'existing-imported': 'Imported (curated)',
}

// Shown when an existing-metadata candidate has no description for a column.
const MISSING_NOTE: Record<CandidateKind, string> = {
    generated: 'No description for this column.',
    'existing-live':
        'No description published on data.wa.gov for this column. Add one so it can be evaluated.',
    'existing-imported':
        'No description in the imported metadata for this column. Add one so it can be evaluated.',
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
    if (col.missing_description) {
        return (
            <div className="column-eval column-missing">
                <h3>
                    {col.display_name} <span className="column-type">— {col.data_type}</span>
                    <span className="missing-badge">no description</span>
                </h3>
                <p className="missing-note">{MISSING_NOTE[kind]}</p>
            </div>
        )
    }
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
            <ChecksBlock checks={col.deterministic_checks}/>
            <ReasoningBlock judgment={j}/>
        </div>
    )
}
