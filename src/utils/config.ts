// Default to relative URLs. In dev, Vite's server.proxy forwards /api/* to the
// backend on :8000 (same origin). In prod, the backend serves the built
// frontend at the same origin, so relative paths just work.
export const ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

// A runtime override set from the Settings drawer, persisted in localStorage.
// Lets you point the viewer at a different backend without rebuilding.
export const API_BASE_URL_KEY = 'evalViewer.apiBaseUrl'

// Resolve the API base URL at call time (not module load) so a Settings change
// takes effect on the next request without a reload. Falls back to the env var.
export function getApiBaseUrl(): string {
    try {
        const override = localStorage.getItem(API_BASE_URL_KEY)
        if (override && override.trim()) return override.trim()
    } catch {
        /* localStorage unavailable — fall through to env default */
    }
    return ENV_API_BASE_URL
}
