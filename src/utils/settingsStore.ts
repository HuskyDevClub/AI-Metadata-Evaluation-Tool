// Lightweight pub/sub over the evalViewer.* localStorage keys so React views
// re-render when settings change from anywhere — including the Settings panel.
// The cost/rate UI subscribes via useRates (see useSyncExternalStore there).

const listeners = new Set<() => void>()
let version = 0

export function subscribeSettings(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

// Monotonic counter used as the external-store snapshot. Stable between renders
// until a write bumps it, which is exactly what useSyncExternalStore wants.
export function getSettingsVersion(): number {
    return version
}

// Bump the version and notify subscribers. Call after any write to an
// evalViewer.* key that affects rendering.
export function notifySettingsChanged(): void {
    version += 1
    for (const l of listeners) l()
}

// --- Custom model pricing ---------------------------------------------------
// User-defined $/1M-token rates that extend (or override) the built-in
// MODEL_PRICING table. Keyed by a case-insensitive model-name substring, same
// matching rule as the built-in entries.
export interface CustomRate {
    input: number
    output: number
    note?: string
}

export const CUSTOM_PRICING_KEY = 'evalViewer.customPricing'

export function getCustomPricing(): Record<string, CustomRate> {
    try {
        const raw = localStorage.getItem(CUSTOM_PRICING_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, CustomRate>) : {}
    } catch {
        return {}
    }
}

export function setCustomPricing(map: Record<string, CustomRate>): void {
    localStorage.setItem(CUSTOM_PRICING_KEY, JSON.stringify(map))
    notifySettingsChanged()
}

// --- Clear everything -------------------------------------------------------
export const SETTINGS_PREFIX = 'evalViewer.'

// Collect every persisted setting key (under the evalViewer.* prefix).
function settingsKeys(): string[] {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(SETTINGS_PREFIX)) keys.push(k)
    }
    return keys
}

// Remove every persisted setting (rates, run defaults, custom pricing, API URL).
export function clearAllSettings(): void {
    for (const k of settingsKeys()) localStorage.removeItem(k)
    notifySettingsChanged()
}

// --- Import / export --------------------------------------------------------
export const SETTINGS_EXPORT_TYPE = 'ai-metadata-eval-settings'

export interface SettingsExport {
    type: string
    version: number
    exportedAt: string
    settings: Record<string, string>
}

// Snapshot all evalViewer.* settings into a portable, versioned envelope.
export function exportSettings(): SettingsExport {
    const settings: Record<string, string> = {}
    for (const k of settingsKeys()) {
        const v = localStorage.getItem(k)
        if (v !== null) settings[k] = v
    }
    return {
        type: SETTINGS_EXPORT_TYPE,
        version: 1,
        exportedAt: new Date().toISOString(),
        settings,
    }
}

// Restore settings from an exported envelope (or a bare evalViewer.* map).
// Replaces the current settings; returns the number of keys imported. Throws
// (without touching storage) when the file has no recognizable settings.
export function importSettings(data: unknown): number {
    const obj = (data ?? {}) as Record<string, unknown>
    const raw =
        obj.settings && typeof obj.settings === 'object'
            ? (obj.settings as Record<string, unknown>)
            : obj
    const entries = Object.entries(raw).filter(
        ([k, v]) => k.startsWith(SETTINGS_PREFIX) && typeof v === 'string',
    ) as [string, string][]
    if (!entries.length) {
        throw new Error('No recognizable settings found in this file.')
    }
    for (const k of settingsKeys()) localStorage.removeItem(k)
    for (const [k, v] of entries) localStorage.setItem(k, v)
    notifySettingsChanged()
    return entries.length
}
