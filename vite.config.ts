import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
    plugins: [react()],
    resolve: {
        alias: {
            '~': fileURLToPath(new URL('./', import.meta.url)),
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        // Proxy /api/* to the backend so the SPA can call it same-origin in dev,
        // matching the production layout where the backend serves the frontend.
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
            },
        },
    },
    build: {
        // For Databricks, output to backend/static so the FastAPI app serves it.
        outDir: mode === 'databricks' ? 'backend/static' : 'dist',
        emptyOutDir: true,
    },
}))
