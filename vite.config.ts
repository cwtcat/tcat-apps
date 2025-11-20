import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Determine base path:
// - In development, Vite needs "/"  (served at http://localhost:5173/)
// - In production, we serve the app under "/apps/ridership/"
const isProd = process.env.NODE_ENV === 'production'
const base = isProd ? '/apps/ridership/' : '/'

export default defineConfig({
  plugins: [react()],
  base,
})
