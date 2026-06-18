import type {CandidateKind} from '@/types/eval'
import {DEFAULT_DATASET_DOMAIN} from '@/utils/runDefaults'

// DescPair label for a candidate's "generated/existing" side. The live label
// names the portal the description is published on (defaulting to the WA portal)
// so cross-portal runs read correctly instead of always saying data.wa.gov.
export function candidateGenLabel(kind: CandidateKind, domain?: string): string {
    if (kind === 'existing-live') return `Live (${domain || DEFAULT_DATASET_DOMAIN})`
    if (kind === 'existing-imported') return 'Imported (curated)'
    return 'AI-generated'
}

export function fmtTokens(n: number): string {
    if (typeof n !== 'number' || !isFinite(n)) return '0'
    return n.toLocaleString()
}

export function fmtCost(usd: number, estimate?: boolean): string {
    if (!isFinite(usd) || usd <= 0) return '—'
    const prefix = estimate ? '≈' : ''
    if (usd < 0.01) return prefix + '<$0.01'
    return prefix + '$' + usd.toFixed(usd < 1 ? 4 : 2)
}

export function fmtDate(iso?: string): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return String(iso)
    return d.toLocaleString()
}

export function avg(nums: Array<number | null | undefined>): number | null {
    const filtered = nums.filter((n): n is number => typeof n === 'number')
    if (!filtered.length) return null
    return filtered.reduce((a, b) => a + b, 0) / filtered.length
}

export function slugify(s: string | undefined | null): string {
    return String(s ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 40)
        .replace(/^-+|-+$/g, '')
}
