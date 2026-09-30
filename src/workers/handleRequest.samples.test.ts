// The sample plates through the worker's own export: every sample meshes as a sound solid, its STL is the
// size of its pieces, and a plate put together from those files stays on the plate. Here rather than beside
// samplePlates.ts because only core/ and workers/ may name the tile mesher.
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import { checkMesh } from '@/core/geometry/meshChecks'
import { buildPieceMesh } from '@/core/geometry/tileMesh'
import { createHeightField } from '@/core/textures/registry'
import type { DesignConfig } from '@/core/types'
import { stlBounds, stlPlate, stlTriangleCount } from '@/features/samples/plateStl'
import { PLATE_MARGIN_MM, SAMPLE_QUALITY, sampleJob, samplePlates, sampleSet } from '@/features/samples/samplePlates'
import { handleRequest, type HandlerContext } from './handleRequest'

const context: HandlerContext = { isCancelled: () => false, progress: () => {} }

const design = (over: Partial<DesignConfig> = {}): DesignConfig => ({ ...structuredClone(DEFAULT_CONFIG), ...over })

describe('sample plates in the worker', () => {
  it('meshes every sample a design can print as a closed, oriented solid', () => {
    for (const config of [design(), design({ perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'frame' }, layout: { origin: 'corner', rowOffset: 0.5 } })]) {
      const { core, extras } = sampleSet(config)
      for (const sample of [...core, ...extras]) {
        const field = createHeightField(sample.config)
        for (const { spec } of sample.pieces) {
          const check = checkMesh(buildPieceMesh(sample.config, field, spec, { cellMm: 1 }))
          expect(check, `${sample.key} ${spec.id}`).toMatchObject({ closed: true, manifold: true, oriented: true })
          expect(check.volume, sample.key).toBeGreaterThan(0)
        }
      }
    }
  })

  it('writes one STL a piece, and a plate of them that stays inside its margins', async () => {
    const plates = samplePlates(design(), { width: 256, depth: 256 })
    if (!plates) throw new Error('no plate')
    const parts = []
    for (const sample of plates.samples) {
      const job = sampleJob(sample)
      const { result } = await handleRequest(
        { kind: 'export', ...job, format: 'stl', quality: SAMPLE_QUALITY, accessories: false, zip: false },
        context,
      )
      expect(result.files.map((f) => f.pieceId)).toEqual(job.pieceIds)
      for (const [i, file] of result.files.entries()) {
        const piece = sample.pieces[i]
        const { min, max } = stlBounds(file.data)
        expect(min[0]).toBeCloseTo(0, 3)
        expect(min[1]).toBeCloseTo(0, 3)
        expect(min[2]).toBeCloseTo(0, 3)
        expect(max[0]).toBeCloseTo(piece.spec.width, 3)
        expect(max[1]).toBeCloseTo(piece.spec.height, 3)
        parts.push({ data: file.data, x: sample.x + piece.x, y: sample.y + piece.y })
      }
    }
    const plate = stlPlate('Tessera test plate', parts)
    expect(stlTriangleCount(plate)).toBe(parts.reduce((sum, part) => sum + stlTriangleCount(part.data), 0))
    const { min, max } = stlBounds(plate)
    expect(min[0]).toBeGreaterThanOrEqual(PLATE_MARGIN_MM - 1e-3)
    expect(min[1]).toBeGreaterThanOrEqual(PLATE_MARGIN_MM - 1e-3)
    expect(max[0]).toBeLessThanOrEqual(256 - PLATE_MARGIN_MM + 1e-3)
    expect(max[1]).toBeLessThanOrEqual(256 - PLATE_MARGIN_MM + 1e-3)
    expect(min[2]).toBeCloseTo(0, 3)
  }, 60_000)
})
