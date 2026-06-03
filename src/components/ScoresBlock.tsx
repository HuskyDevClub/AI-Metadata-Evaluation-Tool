import { Fragment } from 'react'
import type { Category, Judgment } from '@/types/eval'

function Bar({ score, max, klass }: { score: number; max: number; klass: string }) {
    const pct = Math.max(0, Math.min(100, (score / max) * 100))
    return (
        <div className={`bar ${klass}`}>
            <div className="bar-fill" style={{ width: `${pct}%` }} />
        </div>
    )
}

export function ScoresBlock({ judgment, categories }: { judgment?: Judgment; categories: Category[] }) {
    if (!judgment || !judgment.candidate1 || !judgment.candidate2) {
        return <div className="error">Judgment data missing or malformed.</div>
    }
    const c1 = judgment.candidate1
    const c2 = judgment.candidate2
    return (
        <div className="scores">
            {categories.map(({ key, label }) => {
                const v1 = c1[key]
                const v2 = c2[key]
                const s1 = typeof v1 === 'number' ? v1 : null
                const s2 = typeof v2 === 'number' ? v2 : null
                if (s1 === null && s2 === null) return null
                return (
                    <Fragment key={key}>
                        <div className="cat">{label}</div>
                        <div className="bar-pair">
                            {s1 !== null ? <Bar score={s1} max={10} klass="bar-1" /> : <div className="bar bar-1" />}
                            {s2 !== null ? <Bar score={s2} max={10} klass="bar-2" /> : <div className="bar bar-2" />}
                        </div>
                        <div className="nums">
                            <div>
                                <b>{s1 ?? '–'}</b>/10
                            </div>
                            <div>
                                <b>{s2 ?? '–'}</b>/10
                            </div>
                        </div>
                    </Fragment>
                )
            })}
        </div>
    )
}
