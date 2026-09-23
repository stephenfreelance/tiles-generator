import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import { pieceFeatures } from '@/core/fixing/features'
import { checkMesh } from '@/core/geometry/meshChecks'
import { computeLayout, layoutInputOf } from '@/core/layout'
import type { DesignConfig, MeshData } from '@/core/types'
import { handleRequest, type HandlerContext } from './handleRequest'

// The whole-wall preview leaves the pockets out of the tiles' backs, which its camera never sees; the
// single tile keeps them for its Back view. Either way the top the viewer sees is the same.

const keyed: DesignConfig = {
  ...structuredClone(DEFAULT_CONFIG),
  surface: { width: 600, height: 450 },
  lock: 'keys',
  mount: 'clips',
}
const plan = computeLayout(layoutInputOf(keyed))

const context = (): HandlerContext => ({ isCancelled: () => false, progress: () => {} })

async function preview(backFeatures: boolean | undefined): Promise<Map<string, MeshData>> {
  const request = { kind: 'preview' as const, config: keyed, pieces: plan.pieces, cellMm: 3, normalMapTexelMm: 0 }
  const { result } = await handleRequest(backFeatures === undefined ? request : { ...request, backFeatures }, context())
  return new Map(result.pieces.map((p) => [p.pieceId, p.mesh]))
}

const topOf = (mesh: MeshData) => Array.from(mesh.indices.subarray(0, mesh.topIndexCount), (i) => mesh.positions[3 * i + 2])

describe('preview back features', () => {
  it('has pieces with key notches and clip pockets to leave out', () => {
    expect(plan.pieces.every((piece) => pieceFeatures(keyed, piece).length > 0)).toBe(true)
    const roles = new Set(plan.pieces.flatMap((piece) => pieceFeatures(keyed, piece).map((f) => f.role)))
    expect(roles).toEqual(new Set(['key-pocket', 'clip-pocket']))
  })

  it('cuts the pockets by default and when asked, and leaves them out for the whole wall', async () => {
    const [plain, cut, fallback] = await Promise.all([preview(false), preview(true), preview(undefined)])
    for (const piece of plan.pieces) {
      const without = plain.get(piece.id) as MeshData
      const withBacks = cut.get(piece.id) as MeshData
      expect(fallback.get(piece.id)?.indices.length).toBe(withBacks.indices.length)
      // A plain back: the four walls are fans and the bottom is two triangles.
      expect(without.indices.length).toBeLessThan(withBacks.indices.length)
      expect(checkMesh(without)).toMatchObject({ closed: true, manifold: true })
      // What the wall camera sees is the same surface.
      expect(without.topIndexCount).toBe(withBacks.topIndexCount)
      expect(topOf(without)).toEqual(topOf(withBacks))
    }
  })

  it('changes nothing for a design with no pockets', async () => {
    const pieces = computeLayout(layoutInputOf(DEFAULT_CONFIG)).pieces
    const base = { kind: 'preview' as const, config: DEFAULT_CONFIG, pieces, cellMm: 3, normalMapTexelMm: 0 }
    const [off, on] = await Promise.all([handleRequest({ ...base, backFeatures: false }, context()), handleRequest(base, context())])
    expect(Array.from(off.result.pieces[0].mesh.indices)).toEqual(Array.from(on.result.pieces[0].mesh.indices))
    expect(Array.from(off.result.pieces[0].mesh.positions)).toEqual(Array.from(on.result.pieces[0].mesh.positions))
  })
})
