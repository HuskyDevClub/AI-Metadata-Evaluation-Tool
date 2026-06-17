// Minimal RFC 4180 CSV parser. Splitting on "," and "\n" the naive way breaks
// the moment a field contains a comma or a newline — Socrata description columns
// routinely do, which used to push description text into neighbouring columns.
// This walks the text as a small state machine so quoted fields keep their
// commas, newlines, and escaped quotes ("") intact.
//
// Returns rows of raw field strings (callers trim as needed). Tolerates LF and
// CRLF line endings and a leading UTF-8 BOM; a trailing newline does not produce
// a spurious empty final row.
export function parseCsv(input: string): string[][] {
    const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
    const rows: string[][] = []
    let row: string[] = []
    let field = ''
    let inQuotes = false

    const endField = () => {
        row.push(field)
        field = ''
    }
    const endRow = () => {
        endField()
        rows.push(row)
        row = []
    }

    for (let i = 0; i < text.length; i++) {
        const c = text[i]
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"'
                    i++ // skip the escaped quote
                } else {
                    inQuotes = false
                }
            } else {
                field += c
            }
            continue
        }
        if (c === '"') {
            inQuotes = true
        } else if (c === ',') {
            endField()
        } else if (c === '\n') {
            endRow()
        } else if (c === '\r') {
            endRow()
            if (text[i + 1] === '\n') i++ // consume the LF of a CRLF pair
        } else {
            field += c
        }
    }
    // Flush the last field/row unless the input ended cleanly on a row break.
    if (field !== '' || row.length > 0) endRow()
    return rows
}
