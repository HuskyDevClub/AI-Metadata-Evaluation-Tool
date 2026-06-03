// Default to relative URLs. In dev, Vite's server.proxy forwards /api/* to the
// backend on :8000 (same origin). In prod, the backend serves the built
// frontend at the same origin, so relative paths just work.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
