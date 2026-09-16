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
          // A group takes only the modules its own test matches. With the default (true) the first
          // group also swallows everything its members import, so `three` claimed react, `postfx`
          // claimed @react-three/fiber and react-dom, and the entry had to preload all four groups:
          // 549 kB gzip of renderer before the router could resolve any route, the landing included.
          includeDependenciesRecursively: false,
          // Order is priority: react is claimed first so no renderer group can take it with them.
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'r3f', test: /node_modules[\\/]@react-three[\\/](fiber|drei)[\\/]/ },
            { name: 'three', test: /node_modules[\\/](three|three-stdlib|camera-controls|@monogrid)[\\/]/ },
            // Nothing but the lazy import in Scene.tsx reaches this group, so a tier-0 machine
            // never downloads the composer. Keep @react-three/fiber out of it or the whole group
            // becomes eager again and deferring PostFx buys nothing.
            { name: 'postfx', test: /node_modules[\\/](postprocessing|n8ao|@react-three[\\/]postprocessing)[\\/]/ },
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
