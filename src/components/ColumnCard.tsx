import type {CandidateKind, Category, ColumnEvaluation} from '@/types/eval'
import {candidateGenLabel} from '@/utils/format'
import {DEFAULT_DATASET_DOMAIN} from '@/utils/runDefaults'
import {ChecksBlock} from '@/components/ChecksBlock'
import {DescPair} from '@/components/DescPair'
import {ReasoningBlock} from '@/components/ReasoningBlock'
import {ScoresBlock} from '@/components/ScoresBlock'
import {WinnerBadge} from '@/components/WinnerBadge'

// Shown when an existing-metadata candidate has no description for a column.
function missingNote(kind: CandidateKind, domain?: string): string {
    if (kind === 'existing-live')
        return `No description published on ${domain || DEFAULT_DATASET_DOMAIN} for this column. Add one so it can be evaluated.`
    if (kind === 'existing-imported')
        return 'No description in the imported metadata for this column. Add one so it can be evaluated.'
    return 'No description for this column.'
}

export function ColumnCard({
                               col,
                               categories,
                               kind = 'generated',
                               domain,
                           }: {
    col: ColumnEvaluation
    categories: Category[]
    kind?: CandidateKind
    domain?: string
}) {
    if (col.missing_description) {
        return (
            <div className="column-eval column-missing">
                <h3>
                    {col.display_name} <span className="column-type">— {col.data_type}</span>
                    <span className="missing-badge">no description</span>
                </h3>
                <p className="missing-note">{missingNote(kind, domain)}</p>
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
                genLabel={candidateGenLabel(kind, domain)}
            />
            <ScoresBlock judgment={j} categories={categories}/>
            <ChecksBlock checks={col.deterministic_checks}/>
            <ReasoningBlock judgment={j}/>
        </div>
    )
}
