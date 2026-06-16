// Return a new array with the item at `from` moved to index `to`. Out-of-range
// or no-op moves return the original array unchanged. Used by the drag-to-reorder
// chips/cards in the Run panel.
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
    if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) {
        return arr
    }
    const next = arr.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
}
