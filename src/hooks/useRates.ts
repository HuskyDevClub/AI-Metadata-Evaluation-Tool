import {useCallback, useSyncExternalStore} from 'react'
import {lookupModelRate} from '@/utils/pricing'
import {getSettingsVersion, notifySettingsChanged, subscribeSettings,} from '@/utils/settingsStore'

const LS_PREFIX = 'evalViewer.rate.'

export interface RateInfo {
    rate: number // parsed numeric rate, used for cost math
    display: string // raw string for the input value (preserves "0." while typing)
    autoFrom: string // pricing-table key the auto value came from, else ""
    userSet: boolean
}

export interface UseRates {
    // Resolve a rate key. `model` supplies the MODEL_PRICING auto value, `dir`
    // selects input vs output pricing.
    resolve: (key: string, model: string | undefined, dir: 'input' | 'output') => RateInfo
    setRate: (key: string, value: string) => void
    clearRate: (key: string) => void
}

// Per-rate state lives in localStorage (keyed by rate key), matching the vanilla
// viewer so saved rates survive reloads. Subscribing to the settings store forces
// a re-render after any rate or custom-pricing change so dependent components
// re-resolve — wherever the change originated (cost controls or Settings drawer).
export function useRates(): UseRates {
    useSyncExternalStore(subscribeSettings, getSettingsVersion, getSettingsVersion)

    const setRate = useCallback((key: string, value: string) => {
        localStorage.setItem(LS_PREFIX + key, value)
        localStorage.setItem(LS_PREFIX + key + '.userSet', '1')
        notifySettingsChanged()
    }, [])

    const clearRate = useCallback((key: string) => {
        localStorage.removeItem(LS_PREFIX + key)
        localStorage.removeItem(LS_PREFIX + key + '.userSet')
        notifySettingsChanged()
    }, [])

    const resolve = useCallback(
        (key: string, model: string | undefined, dir: 'input' | 'output'): RateInfo => {
            const userSet = localStorage.getItem(LS_PREFIX + key + '.userSet') === '1'
            if (userSet) {
                const raw = localStorage.getItem(LS_PREFIX + key) ?? ''
                return {rate: parseFloat(raw) || 0, display: raw, autoFrom: '', userSet: true}
            }
            // Auto-derive from the model's pricing entry when available.
            const src = lookupModelRate(model)
            if (src) {
                const value = src[dir]
                return {
                    rate: value,
                    display: value ? String(value) : '',
                    autoFrom: src.key,
                    userSet: false,
                }
            }
            const raw = localStorage.getItem(LS_PREFIX + key) ?? ''
            return {rate: parseFloat(raw) || 0, display: raw, autoFrom: '', userSet: false}
        },
        [],
    )

    return {resolve, setRate, clearRate}
}
