import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config'
import { computeLayout, layoutInputOf } from '../layout'
import type { DesignConfig, PieceSpec } from '../types'
import { keyAccessories, keyGeometry, keyNotchSites } from './joins'
import { POCKET_DEPTH } from './mechanism'
import { buildClipMesh, clipSites, clipSpec, mountParts } from './mount'
import { seatedParts } from './seated'

const design = (over: Partial<DesignConfig> = {}): DesignConfig => ({ ...structuredClone(DEFAULT_CONFIG), ...over })
const planOf = (config: DesignConfig) => computeLayout(layoutInputOf(config))

describe('seatedParts', () => {
  it('seats nothing in a glued piece without keys', () => {
    for (const p of planOf(DEFAULT_CONFIG).pieces) expect(seatedParts(DEFAULT_CONFIG, p)).toEqual([])
  })

  it('seats a clip in every pocket, its back level with the tile back, as the download holds it', () => {
    const config = design({ mount: 'clips', fit: 'snug' })
    const plan = planOf(config)
    const [part] = mountParts(config, plan)
    for (const p of plan.pieces) {
      const seated = seatedParts(config, p)
      const sites = clipSites(config, p)
      expect(seated.map((s) => [s.x, s.y])).toEqual(sites.map((s) => [s.x, s.y]))
      for (const [i, s] of seated.entries()) {
        expect(s).toMatchObject({ kind: 'clip', accessoryId: part.id, z: 0, turns: sites[i].axis === 'h' ? 0 : 1 })
      }
    }
    // Its stops then reach the pocket's ceiling exactly.
    const mesh = buildClipMesh(clipSpec('snug'))
    let top = 0
    for (let i = 2; i < mesh.positions.length; i += 3) top = Math.max(top, mesh.positions[i])
    expect(top).toBeCloseTo(POCKET_DEPTH, 4)
  })

  it('turns the clip of a narrow piece a quarter turn', () => {
    const config = design({ mount: 'clips' })
    const narrow: PieceSpec = { id: 'p', mark: 'B', kind: 'edge', label: 'Right edge', crop: { x0: 0, y0: 0, x1: 30, y1: 150 }, width: 30, height: 150, count: 1, edges: { boundary: 0, tabs: 0, profiled: {} } }
    expect(seatedParts(config, narrow)).toEqual([{ kind: 'clip', accessoryId: clipSpec('standard').id, x: 15, y: 75, z: 0, turns: 1 }])
  })

  it('seats a key half in every notch, across the joint, pressed home against the notch ceiling', () => {
    const config = design({ lock: 'keys', joint: 2 })
    const plan = planOf(config)
    const [key] = keyAccessories(config, plan)
    const g = keyGeometry(config)
    if (!g) throw new Error('expected keys')
    for (const p of plan.pieces) {
      const keys = seatedParts(config, p).filter((s) => s.kind === 'key')
      const notches = keyNotchSites(config, p)
      expect(keys).toHaveLength(notches.length)
      notches.forEach(({ side, along }, i) => {
        const s = keys[i]
        expect(s.accessoryId).toBe(key.id)
        expect(s.z).toBeCloseTo(g.depth - g.thickness, 9)
        expect(s.turns).toBe(side === 1 || side === 3 ? 0 : 1)
        // Centred on the middle of the joint beyond the side: half in this piece, half in the next.
        const [x, y] = side === 0 ? [along, -1] : side === 1 ? [p.width + 1, along] : side === 2 ? [along, p.height + 1] : [-1, along]
        expect([s.x, s.y]).toEqual([x, y])
      })
    }
  })

  it('seats both on a keyed wall on clips, in pockets that never meet', () => {
    const config = design({ lock: 'keys', mount: 'clips' })
    const whole = planOf(config).pieces.find((p) => p.id.startsWith('full')) as PieceSpec
    const seated = seatedParts(config, whole)
    expect(new Set(seated.map((s) => s.kind))).toEqual(new Set(['clip', 'key']))
    expect(seated.filter((s) => s.kind === 'clip')).toHaveLength(clipSites(config, whole).length)
  })
})
