import type {Category, ColumnEvaluation} from '@/types/eval'
import {DescPair} from '@/components/DescPair'
import {ReasoningBlock} from '@/components/ReasoningBlock'
import {ScoresBlock} from '@/components/ScoresBlock'
import {WinnerBadge} from '@/components/WinnerBadge'

export function ColumnCard({col, categories}: { col: ColumnEvaluation; categories: Category[] }) {
    const j = col.judgment ?? {}
    return (
        <div className="column-eval">
            <h3>
                {col.display_name} <span className="column-type">— {col.data_type}</span>{' '}
                <WinnerBadge winner={j.winner}/>
            </h3>
            <DescPair gold={col.gold_description} gen={col.generated_description}/>
            <ScoresBlock judgment={j} categories={categories}/>
            <ReasoningBlock judgment={j}/>
        </div>
    )
}
