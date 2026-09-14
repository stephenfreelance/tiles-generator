// Integration over the real texture catalog. Skipped until the registry lands, so the mesh work and the
// texture work can proceed in parallel.

import { describe, expect, it } from 'vitest'
import { computeLayout } from '../layout'
import type { DesignConfig } from '../types'
import { checkMesh } from './meshChecks'
import { buildPieceMesh, QUALITY_CELL_MM, STEP_QUALITY } from './tileMesh'
import { testConfig } from './testFields'

const registry = import.meta.glob('../textures/registry.ts')
const hasRegistry = Object.keys(registry).length > 0

interface RegistryModule {
  TEXTURES: { id: string; name: string; defaults: { depth: number; scale: number } }[]
  createHeightField: (config: DesignConfig) => {
    (x: number, y: number): number
    periodX: number
    periodY: number
    depth: number
    repeatsX: number
    repeatsY: number
  }
}

const plan = computeLayout({
  surface: { width: 1000, height: 800 },
  tile: { width: 150, height: 150 },
  joint: 0,
  layout: { origin: 'corner', rowOffset: 0 },
})

describe.skipIf(!hasRegistry)('every catalog texture', () => {
  it('meshes watertight at draft quality, uniform and adaptive', async () => {
    const loader = Object.values(registry)[0] as () => Promise<RegistryModule>
    const { TEXTURES, createHeightField } = await loader()
    expect(TEXTURES.length).toBeGreaterThan(0)
    for (const texture of TEXTURES) {
      const config = testConfig({
        texture: {
          id: texture.id,
          depth: texture.defaults.depth,
          scale: texture.defaults.scale,
          params: {},
          seed: 1,
          invert: false,
          rotate: false,
        },
      })
      const field = createHeightField(config)
      for (const piece of [plan.pieces[0], plan.pieces[plan.pieces.length - 1]]) {
        for (const options of [
          { cellMm: QUALITY_CELL_MM.draft },
          { cellMm: STEP_QUALITY.draft.cellMm, adaptive: { toleranceMm: STEP_QUALITY.draft.toleranceMm } },
        ]) {
          const mesh = buildPieceMesh(config, field, piece, options)
          const check = checkMesh(mesh)
          expect({ texture: texture.id, piece: piece.id, ...check, volume: undefined }).toEqual({
            texture: texture.id,
            piece: piece.id,
            closed: true,
            manifold: true,
            oriented: true,
            boundaryEdges: 0,
            volume: undefined,
          })
          expect(check.volume).toBeGreaterThan(0)
        }
      }
    }
  }, 300_000)
})
