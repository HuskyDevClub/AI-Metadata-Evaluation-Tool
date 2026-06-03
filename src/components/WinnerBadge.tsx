export function WinnerBadge({ winner }: { winner?: string }) {
    if (winner === '1') return <span className="winner-badge winner-1">Gold wins</span>
    if (winner === '2') return <span className="winner-badge winner-2">AI wins</span>
    if (winner === 'tie') return <span className="winner-badge winner-tie">Tie</span>
    return <span className="winner-badge winner-tie">{winner ?? '?'}</span>
}
