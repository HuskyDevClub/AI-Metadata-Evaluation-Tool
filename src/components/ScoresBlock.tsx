import {Fragment} from 'react'
import type {Category, Judgment} from '@/types/eval'

function Bar({
                 score,
                 min,
                 max,
                 klass,
             }: {
    score: number
    min: number
    max: number
    klass: string
}) {
    const span = max - min
    const pct = span > 0 ? Math.max(0, Math.min(100, ((score - min) / span) * 100)) : 0
    return (
        <div className={`bar ${klass}`}>
            <div className="bar-fill" style={{width: `${pct}%`}}/>
        </div>
    )
}

export function ScoresBlock({judgment, categories}: { judgment?: Judgment; categories: Category[] }) {
    if (!judgment || !judgment.candidate1 || !judgment.candidate2) {
        return <div className="error">Judgment data missing or malformed.</div>
    }
    const c1 = judgment.candidate1
    const c2 = judgment.candidate2
    return (
        <div className="scores">
            {categories.map(({key, label, min, max}) => {
                const lo = min ?? 0
                const hi = max ?? 10
                const v1 = c1[key]
                const v2 = c2[key]
                const s1 = typeof v1 === 'number' ? v1 : null
                const s2 = typeof v2 === 'number' ? v2 : null
                if (s1 === null && s2 === null) return null
                return (
                    <Fragment key={key}>
                        <div className="cat">{label}</div>
                        <div className="bar-pair">
                            {s1 !== null ? (
                                <Bar score={s1} min={lo} max={hi} klass="bar-1"/>
                            ) : (
                                <div className="bar bar-1"/>
                            )}
                            {s2 !== null ? (
                                <Bar score={s2} min={lo} max={hi} klass="bar-2"/>
                            ) : (
                                <div className="bar bar-2"/>
                            )}
                        </div>
                        <div className="nums">
                            <div>
                                <b>{s1 ?? '–'}</b>/{hi}
                            </div>
                            <div>
                                <b>{s2 ?? '–'}</b>/{hi}
                            </div>
                        </div>
                    </Fragment>
                )
            })}
        </div>
    )
}
