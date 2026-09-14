/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // three.js itself is the largest chunk that can legitimately exist here, so the warning sits
    // just above it and still fires on anything new that grows fat.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/](three|three-stdlib|camera-controls|@monogrid)[\\/]/ },
            // Nothing but the lazy import in Scene.tsx reaches this group, so a tier-0 machine
            // never downloads the composer. Keep @react-three/fiber out of it or the whole group
            // becomes eager again and deferring PostFx buys nothing.
            { name: 'postfx', test: /node_modules[\\/](postprocessing|n8ao|@react-three[\\/]postprocessing)[\\/]/ },
            { name: 'r3f', test: /node_modules[\\/]@react-three[\\/](fiber|drei)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
  },
})
