import type {DeterministicChecks} from '@/types/eval'

// Human labels for each deterministic-check flag (true = WA rule violated).
const FLAG_LABEL: Record<string, string> = {
    word_count_out_of_range: 'word count',
    long_sentences: 'long sentences',
    fk_grade_too_high: 'reading grade',
    unexpanded_acronyms: 'unexpanded acronyms',
    passive_voice: 'passive voice',
    deadly7_overuse: '“deadly 7” verbs',
    jargon: 'jargon',
    multi_paragraph: 'multi-paragraph',
    has_bullets: 'bullets',
    generic_opening: 'generic opening',
    sentence_count: 'sentence count',
}

// Deterministic, code-based WA compliance checks (backend/quality_checks.py).
// Scored without the LLM, so they're objective and reproducible — shown
// alongside the judge's subjective scores.
export function ChecksBlock({checks}: { checks?: DeterministicChecks }) {
    if (!checks || typeof checks.word_count !== 'number') return null
    const violations = Object.entries(checks.flags || {})
        .filter(([, bad]) => bad)
        .map(([k]) => k)
    const [lo, hi] = checks.word_target ?? [0, 0]
    return (
        <div className="checks">
            <span className="checks-head">
                Deterministic checks{' '}
                {violations.length === 0 ? (
                    <span className="checks-ok">✓ all pass</span>
                ) : (
                    <span className="checks-bad">
                        {violations.length} flag{violations.length === 1 ? '' : 's'}
                    </span>
                )}
            </span>
            <span className="checks-stats">
                {checks.word_count}w (target {lo}–{hi}) · grade {checks.flesch_kincaid_grade}
            </span>
            {violations.length > 0 && (
                <span className="checks-flags">
                    {violations.map((k) => (
                        <span key={k} className="check-flag">
                            {FLAG_LABEL[k] ?? k}
                        </span>
                    ))}
                </span>
            )}
        </div>
    )
}
