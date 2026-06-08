// Parse AI-Metadata-Improvement-Tool metadata exports into datasets the eval can
// validate "through UID". Each export envelope carries `socrataDatasetId` (the
// UID) plus the curated `metadata` (datasetDescription, columnDescriptions, …).
// We keep the UID (so the eval still loads columns + sample rows live from
// Socrata) and the curated text (so it can be scored as the existing metadata).
//
// Shape produced by the Improvement tool (src/utils/metadataIo.ts):
//   { formatVersion, exportedAt, fileName, socrataDatasetId?, socrataDomain?,
//     metadata: { datasetTitle, datasetDescription, columnDescriptions, … } }

import type {ImportedDataset} from '@/types/eval'

export interface ImportParseResult {
    datasets: ImportedDataset[]
    errors: string[]
}

function asString(v: unknown): string | undefined {
    return typeof v === 'string' ? v : undefined
}

function asStringRecord(v: unknown): Record<string, string> | undefined {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
    const out: Record<string, string> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === 'string' && val.trim()) out[k] = val
    }
    return Object.keys(out).length ? out : undefined
}

// Pull one ImportedDataset out of a single export envelope (or a bare object
// that still carries socrataDatasetId + metadata). Returns a reason string when
// the object isn't a usable, UID-bearing export.
function coerceOne(raw: unknown, label: string): ImportedDataset | string {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return `${label}: not a metadata object`
    }
    const root = raw as Record<string, unknown>
    const uid = (asString(root.socrataDatasetId) ?? '').trim()
    if (!uid) {
        return `${label}: no "socrataDatasetId" (UID) — can't import through UID`
    }
    const meta =
        root.metadata && typeof root.metadata === 'object'
            ? (root.metadata as Record<string, unknown>)
            : root
    const description = asString(meta.datasetDescription)?.trim()
    const name = asString(meta.datasetTitle)?.trim()
    const columnDescriptions = asStringRecord(meta.columnDescriptions)
    return {
        uid,
        ...(name ? {name} : {}),
        ...(description ? {description} : {}),
        ...(columnDescriptions ? {columnDescriptions} : {}),
        ...(asString(root.socrataDomain)?.trim()
            ? {domain: asString(root.socrataDomain)!.trim()}
            : {}),
    }
}

// Parse already-parsed JSON (one export, or an array of exports) into datasets.
export function parseImport(parsed: unknown, label: string): ImportParseResult {
    const datasets: ImportedDataset[] = []
    const errors: string[] = []
    const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed]
    items.forEach((item, i) => {
        const itemLabel = items.length > 1 ? `${label}[${i}]` : label
        const result = coerceOne(item, itemLabel)
        if (typeof result === 'string') errors.push(result)
        else datasets.push(result)
    })
    return {datasets, errors}
}

// Read + parse a list of uploaded files. De-dupes by UID (first file wins) and
// collects a human-readable error per unreadable / non-conforming file.
export async function importDatasetsFromFiles(
    files: File[],
): Promise<ImportParseResult> {
    const datasets: ImportedDataset[] = []
    const errors: string[] = []
    const seen = new Set<string>()
    for (const file of files) {
        let parsed: unknown
        try {
            parsed = JSON.parse(await file.text())
        } catch {
            errors.push(`${file.name}: not valid JSON`)
            continue
        }
        const res = parseImport(parsed, file.name)
        errors.push(...res.errors)
        for (const d of res.datasets) {
            if (seen.has(d.uid)) continue
            seen.add(d.uid)
            datasets.push(d)
        }
    }
    return {datasets, errors}
}
