import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, MIN_FIXING_THICKNESS, normalizeConfig } from '../config'
import { pieceTopSampler } from '../geometry/heightfield'
import { checkMesh, componentCount, downwardArea, pinchedVertices } from '../geometry/meshChecks'
import { pointInRing, ringBounds, ringSelfIntersects, ringsTouch, signedArea } from '../geometry/polygon'
import { resolveJointEdge } from '../geometry/profiles'
import { meshDigest } from '../geometry/testDigest'
import { computeLayout, layoutInputOf } from '../layout'
import { hasSide } from '../sides'
import { createHeightField } from '../textures/registry'
import type { DesignConfig, FitClass, LayoutPlan, MeshData, PieceSpec, Side } from '../types'
import { digitRing, FIT_DIGIT } from './fitDigit'
import {
  buildKeyMesh,
  joinPlan,
  keyAccessories,
  keyCoverageNote,
  keyGeometry,
  keyNotchAt,
  keyNotchSites,
  keyPockets,
  keySpecForFit,
  type KeyGeometry,
  wallKeySpec,
} from './joins'
import type { AccessorySpec, BackFeature } from './types'

// Keys only work when two neighbours' notches meet, so these pin the lattice, the notch rules and the
// counts from the placements, plus the solids the mesher and the printer receive.

interface Wall {
  surface?: { width: number; height: number }
  tile?: number | { width: number; height: number }
  joint?: number
  origin?: DesignConfig['layout']['origin']
  rowOffset?: DesignConfig['layout']['rowOffset']
  thickness?: number
  over?: Partial<DesignConfig>
}

function design({ surface, tile, joint = 0, origin = 'corner', rowOffset = 0, thickness = 4, over = {} }: Wall = {}): DesignConfig {
  const size = typeof tile === 'number' ? { width: tile, height: tile } : (tile ?? { width: 150, height: 150 })
  return normalizeConfig({
    ...DEFAULT_CONFIG,
    surface: surface ?? DEFAULT_CONFIG.surface,
    tile: { ...size, thickness },
    joint,
    layout: { origin, rowOffset },
    lock: 'keys',
    ...over,
  })
}

const layoutOf = (config: DesignConfig): LayoutPlan => computeLayout(layoutInputOf(config))

const geometryOf = (config: DesignConfig): KeyGeometry => {
  const g = keyGeometry(config)
  if (!g) throw new Error('expected keys')
  return g
}

/** Surface position of each notch's centre, per side of a placed piece. */
function notchCentres(config: DesignConfig, piece: PieceSpec, at: { x: number; y: number }): { side: Side; x: number; y: number }[] {
  return keyPockets(config, piece).map((f) => {
    const b = ringBounds(f.levels[1].ring)
    const side = f.side as Side
    const alongX = side === 0 || side === 2
    const along = alongX ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2
    return {
      side,
      x: alongX ? at.x + along : at.x + (side === 1 ? piece.width : 0),
      y: alongX ? at.y + (side === 2 ? piece.height : 0) : at.y + along,
    }
  })
}

const VARIANTS: Record<string, Wall> = {
  straight: {},
  'straight, 3 mm joint': { joint: 3 },
  'half bond': { rowOffset: 0.5 },
  'half bond, 4 mm joint': { rowOffset: 0.5, joint: 4, surface: { width: 1000, height: 700 } },
  'third bond': { rowOffset: 0.3333 },
  'third bond, 2.5 mm joint': { rowOffset: 0.3333, joint: 2.5, surface: { width: 1330, height: 910 } },
  'third bond, wide tiles': { rowOffset: 0.3333, tile: { width: 400, height: 100 }, surface: { width: 2000, height: 600 } },
  'balanced, cuts all round': { origin: 'balanced', surface: { width: 1000, height: 700 }, joint: 2 },
  'centred, tall tiles': { origin: 'center', tile: { width: 100, height: 300 }, surface: { width: 1250, height: 1000 } },
  'small tiles': { tile: 40, surface: { width: 410, height: 330 } },
}

describe('keyGeometry', () => {
  it('sizes the default notch and key from the plate and the joint edge', () => {
    const g = geometryOf(design())
    // t 4, chamfer 0.5: min(3, 4 - 0.5 - 1.6) = 1.9, down to the layer: 1.8.
    expect(g).toMatchObject({ depth: 1.8, thickness: 1.4, reach: 8, neck: 3, headWidth: 12, neckWidth: 6 })
    expect(g.lattice).toEqual({ x: [37.5, 112.5], y: [37.5, 112.5] })
  })

  it('keeps 1.6 mm of plate over the notch under the rim, in whole layers, 3 mm at most', () => {
    for (const thickness of [4, 4.5, 5, 6, 8, 12]) {
      for (const jointEdge of ['square', 'chamfer', 'round', 'pillow'] as const) {
        for (const bevel of [0, 0.5, 1.5, 3]) {
          const config = design({ thickness, over: { jointEdge, bevel } })
          const g = keyGeometry(config)
          const s = resolveJointEdge(config).size
          const room = Math.min(3, thickness - s - 1.6)
          if (room < 1.2) {
            expect(g, `${thickness} ${jointEdge} ${bevel}`).toBeNull()
            continue
          }
          expect(g).not.toBeNull()
          const depth = (g as KeyGeometry).depth
          expect(thickness - s - depth).toBeGreaterThanOrEqual(1.6 - 1e-9)
          expect(depth).toBeLessThanOrEqual(3)
          expect(room - depth).toBeLessThan(0.2)
          expect(Math.abs(depth * 5 - Math.round(depth * 5))).toBeLessThan(1e-9)
          expect((g as KeyGeometry).thickness).toBeCloseTo(depth - 0.4, 9)
        }
      }
    }
    expect(geometryOf(design({ thickness: 6 })).depth).toBe(3)
  })

  it('has no keys under the fixing plate, or when the joint edge eats the plate', () => {
    expect(keyGeometry(design({ thickness: 3 }))).toBeNull()
    expect(keyGeometry(design({ thickness: MIN_FIXING_THICKNESS - 0.1 }))).toBeNull()
    // A 2 mm round on a 4 mm plate leaves 0.4 mm: no notch.
    expect(keyGeometry(design({ over: { jointEdge: 'round', bevel: 3 } }))).toBeNull()
    expect(keyGeometry(design({ over: { jointEdge: 'square', bevel: 3 } }))?.depth).toBe(2.4)
  })

  it('lays the lattice set out under Fixings in docs/architecture.md: 2 per side, 4 from 240 mm, 3 or 6 on a third bond', () => {
    expect(geometryOf(design({ tile: { width: 300, height: 240 } })).lattice).toEqual({
      x: [37.5, 112.5, 187.5, 262.5],
      y: [30, 90, 150, 210],
    })
    expect(geometryOf(design({ rowOffset: 0.3333 })).lattice.x).toEqual([25, 75, 125])
    expect(geometryOf(design({ rowOffset: 0.3333, tile: { width: 360, height: 150 } })).lattice.x).toEqual([30, 90, 150, 210, 270, 330])
    // A straight grid does not need the joint: the lattice is the one Fixings in docs/architecture.md gives.
    expect(geometryOf(design({ joint: 6 })).lattice.x).toEqual([37.5, 112.5])
  })

  it('spaces a running bond by the pitch, so the row shift maps the lattice onto itself', () => {
    const half = geometryOf(design({ rowOffset: 0.5, joint: 4 })).lattice.x
    expect(half[1] - half[0]).toBeCloseTo(154 / 2, 9)
    expect((half[0] + half[1]) / 2).toBeCloseTo(75, 9)
    const third = geometryOf(design({ rowOffset: 0.3333, joint: 3 })).lattice.x
    expect(third.map((x) => Math.round(x * 1000) / 1000)).toEqual([75 - 51, 75, 75 + 51])
  })

  it('narrows the head on small tiles and moves a crowded vertical joint to one key', () => {
    const g40 = geometryOf(design({ tile: 40 }))
    expect(g40.headWidth).toBe(12)
    expect(g40.lattice.y).toEqual([20])
    expect(g40.lattice.x).toEqual([10, 30])
    const g32 = geometryOf(design({ tile: 32 }))
    expect(g32.headWidth).toBe(10)
    expect(geometryOf(design({ tile: 20 })).headWidth).toBe(8)
  })

  it('calls a corner crowded by the same footprint the notches are cut with, mouths included', () => {
    // From 68 to 71.2 mm the two notches at a quarter of each side come within 3 mm of each other once
    // their mouths are counted: the vertical joint takes one key at mid-height, so the row keys stay.
    for (const size of [68, 69, 70, 71]) {
      const config = design({ tile: size, surface: { width: 1200, height: 600 } })
      expect(geometryOf(config).lattice.y, `${size}`).toEqual([size / 2])
      const whole = layoutOf(config).pieces.find((p) => p.kind === 'full' && p.edges.boundary === 0) as PieceSpec
      const sides = keyPockets(config, whole).map((f) => f.side)
      expect(sides.filter((side) => side === 0 || side === 2), `${size}`).toHaveLength(4)
      expect(sides.filter((side) => side === 1 || side === 3), `${size}`).toHaveLength(2)
    }
    expect(geometryOf(design({ tile: 72 })).lattice.y).toEqual([18, 54])
  })

  it('pairs each row notch with the one it meets a row up: the shift in lattice steps', () => {
    expect(geometryOf(design()).rowShift).toBe(0)
    expect(geometryOf(design({ rowOffset: 0.5 })).rowShift).toBe(1)
    expect(geometryOf(design({ rowOffset: 0.3333 })).rowShift).toBe(1)
    expect(geometryOf(design({ rowOffset: 0.3333, tile: { width: 360, height: 150 } })).rowShift).toBe(2)
    expect(geometryOf(design({ rowOffset: 0.5, tile: { width: 300, height: 150 } })).rowShift).toBe(2)
    // Every position fits a 150 mm tile, so every one has its twin.
    expect(geometryOf(design({ rowOffset: 0.3333 })).rowIndices).toEqual({ bottom: [0, 1, 2], top: [0, 1, 2] })
    // A 40 mm third bond fits only its middle position, whose twin a row up would be an outer one.
    expect(geometryOf(design({ rowOffset: 0.3333, tile: 40 })).rowIndices).toEqual({ bottom: [], top: [] })
  })
})

describe('keyPockets', () => {
  it('is empty for a default design, and when keys are off or the plate is too thin', () => {
    const plan = layoutOf(DEFAULT_CONFIG)
    for (const piece of plan.pieces) expect(keyPockets(DEFAULT_CONFIG, piece)).toEqual([])
    const thin = design({ thickness: 3 })
    for (const piece of layoutOf(thin).pieces) expect(keyPockets(thin, piece)).toEqual([])
  })

  it('notches every interior side of the default wall twice and no boundary side at all', () => {
    const config = design()
    const plan = layoutOf(config)
    expect(plan.pieces).toHaveLength(9)
    for (const piece of plan.pieces) {
      const features = keyPockets(config, piece)
      for (const side of [0, 1, 2, 3] as Side[]) {
        const count = features.filter((f) => f.side === side).length
        expect(count, `${piece.id} side ${side}`).toBe(hasSide(piece.edges.boundary, side) ? 0 : 2)
      }
    }
  })

  it('never notches a boundary or a cut side, whatever the bond and the origin', () => {
    for (const [name, wall] of Object.entries(VARIANTS)) {
      const config = design(wall)
      for (const piece of layoutOf(config).pieces) {
        const W = config.tile.width
        const H = config.tile.height
        const cut = [piece.crop.y0 > 0.01, piece.crop.x1 < W - 0.01, piece.crop.y1 < H - 0.01, piece.crop.x0 > 0.01]
        for (const f of keyPockets(config, piece)) {
          const side = f.side as Side
          expect(hasSide(piece.edges.boundary, side), `${name} ${piece.id}`).toBe(false)
          expect(cut[side], `${name} ${piece.id}`).toBe(false)
        }
      }
    }
  })

  it('gives the pockets of one piece the same answer whatever the fit', () => {
    const plan = layoutOf(design())
    for (const piece of plan.pieces) {
      const snug = keyPockets(design({ over: { fit: 'snug' } }), piece)
      const loose = keyPockets(design({ over: { fit: 'loose' } }), piece)
      expect(snug).toEqual(loose)
    }
  })

  it('leaves a thin cut unkeyed and keys a cut deep enough, measured across the side', () => {
    // 1000 wide from the corner with 150 tiles: 6 whole columns and a 100 mm cut; 910 leaves 10 mm.
    const deep = design({ surface: { width: 1000, height: 600 } })
    const cut100 = layoutOf(deep).pieces.find((p) => p.width === 100)
    expect(cut100).toBeDefined()
    expect(keyPockets(deep, cut100 as PieceSpec).filter((f) => f.side === 3)).toHaveLength(2)

    const thin = design({ surface: { width: 910, height: 600 } })
    const cut10 = layoutOf(thin).pieces.find((p) => p.width === 10)
    expect(keyPockets(thin, cut10 as PieceSpec).filter((f) => f.side === 3)).toHaveLength(0)

    // 11 mm is enough when the far side is the boundary.
    const eleven = design({ surface: { width: 911, height: 600 } })
    const cut11 = layoutOf(eleven).pieces.find((p) => p.width === 11 && p.kind !== 'full')
    expect(keyPockets(eleven, cut11 as PieceSpec).filter((f) => f.side === 3)).toHaveLength(2)
  })

  it('needs the footprint and its margins along the side: a short row keeps only the keys that fit', () => {
    // 650 high from the top-left corner: the bottom row is 50 mm of the tile's top (y 100 to 150).
    const config = design({ surface: { width: 1200, height: 650 } })
    const plan = layoutOf(config)
    const strip = plan.pieces.find((p) => p.height === 50 && p.kind === 'edge')
    expect(strip).toBeDefined()
    const sides = keyPockets(config, strip as PieceSpec).map((f) => f.side)
    // Only y = 112.5 lies 9 mm clear of both ends of 100..150; its top side is whole and takes both.
    expect(sides.filter((s) => s === 1 || s === 3).length).toBeGreaterThan(0)
    for (const f of keyPockets(config, strip as PieceSpec)) {
      if (f.side === 1 || f.side === 3) {
        const b = ringBounds(f.levels[1].ring)
        expect((b.minY + b.maxY) / 2).toBeCloseTo(12.5, 9)
      }
    }
  })

  it('cuts no row notch that no key could ever fill', () => {
    // 40 mm tiles in a third bond: the middle notch of a top side would meet a row up one lattice step
    // along, where no notch fits. Those empty pockets are left out; the joints along each row keep theirs.
    const config = design({ tile: 40, rowOffset: 0.3333, surface: { width: 1200, height: 600 } })
    for (const piece of layoutOf(config).pieces) {
      expect(keyPockets(config, piece).filter((f) => f.side === 0 || f.side === 2), piece.id).toEqual([])
    }
    expect(joinPlan(config, layoutOf(config)).sites.every((s) => s.seam === 'vertical')).toBe(true)
    // 50 mm tiles fit all three positions, so their rows key.
    const wider = design({ tile: 50, rowOffset: 0.3333, surface: { width: 1200, height: 600 } })
    expect(joinPlan(wider, layoutOf(wider)).sites.some((s) => s.seam === 'horizontal')).toBe(true)
  })

  it('keeps notches clear of a dropping border profile, and of each other', () => {
    // 920 wide: a 20 mm cut column that a 30 mm bullnose spills across onto the whole tile beside it.
    const config = design({
      surface: { width: 920, height: 600 },
      over: { perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'bullnose', width: 30, drop: 2 } },
    })
    const plan = layoutOf(config)
    const beside = plan.pieces.filter((p) => p.edges.profiled.right === 20)
    expect(beside.length).toBeGreaterThan(0)
    for (const piece of beside) expect(keyPockets(config, piece).filter((f) => f.side === 1)).toEqual([])
    for (const piece of plan.pieces) {
      const features = keyPockets(config, piece)
      for (let i = 0; i < features.length; i++) {
        for (let k = i + 1; k < features.length; k++) {
          expect(ringsTouch(features[i].levels[0].ring, features[k].levels[0].ring)).toBe(false)
        }
      }
    }
    // A flat margin never sinks below the plate, so it keeps its keys.
    const margin = design({
      surface: { width: 920, height: 600 },
      over: { perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'margin', width: 30 } },
    })
    const kept = layoutOf(margin).pieces.filter((p) => p.edges.profiled.right === 20)
    expect(kept.some((p) => keyPockets(margin, p).some((f) => f.side === 1))).toBe(true)
  })

  it('makes rings the tile mesher can cut: counter-clockwise, one edge on the side line, inside the piece', () => {
    for (const [name, wall] of Object.entries(VARIANTS)) {
      const config = design(wall)
      const g = geometryOf(config)
      for (const piece of layoutOf(config).pieces) {
        const features = keyPockets(config, piece)
        for (const f of features) expectNotch(f, piece, g, `${name} ${piece.id}`)
        // Notches of one piece never meet, mouths included.
        for (let i = 0; i < features.length; i++) {
          for (let k = i + 1; k < features.length; k++) {
            expect(ringsTouch(features[i].levels[0].ring, features[k].levels[0].ring), `${name} ${piece.id}`).toBe(false)
          }
        }
      }
    }
  })

  it('keeps 1.6 mm of the printed top over every notch, joint edges and border profiles included', () => {
    const walls: Wall[] = [
      {},
      { over: { jointEdge: 'round', bevel: 1.5 }, thickness: 5 },
      { over: { jointEdge: 'pillow', bevel: 0.8 } },
      { over: { jointEdge: 'square', bevel: 0 } },
      {
        surface: { width: 920, height: 600 },
        over: { perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'bullnose', width: 30, drop: 2 } },
      },
      {
        surface: { width: 1210, height: 610 },
        thickness: 6,
        over: { perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'ogee', width: 20, drop: 3, land: 'valleys' } },
      },
      { surface: { width: 1000, height: 700 }, over: { perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'chamfer', width: 12, drop: 2 } } },
    ]
    for (const wall of walls) {
      // A deep relief, a stepped one, and none at all, where the top is the plate itself.
      const textures = [
        { ...DEFAULT_CONFIG.texture },
        { ...DEFAULT_CONFIG.texture, id: 'fluted', depth: 4 },
        { ...DEFAULT_CONFIG.texture, depth: 0 },
      ]
      for (const texture of textures) {
        const textureId = `${texture.id}/${texture.depth}`
        const config = design({ ...wall, over: { ...wall.over, texture } })
        const g = geometryOf(config)
        const field = createHeightField(config)
        for (const piece of layoutOf(config).pieces) {
          const top = pieceTopSampler(config, field, piece)
          for (const f of keyPockets(config, piece)) {
            const b = ringBounds(f.levels[0].ring)
            let lowest = Infinity
            for (let i = 0; i <= 24; i++) {
              for (let k = 0; k <= 24; k++) lowest = Math.min(lowest, top(b.minX + ((b.maxX - b.minX) * i) / 24, b.minY + ((b.maxY - b.minY) * k) / 24))
            }
            expect(lowest - g.depth, `${JSON.stringify(wall).slice(0, 60)} ${textureId} ${piece.id}`).toBeGreaterThanOrEqual(1.6 - 1e-6)
          }
        }
      }
    }
  })

  it('puts a chosen notch where the fit test asks, and none on a thin plate', () => {
    const config = design()
    const g = geometryOf(config)
    const f = keyNotchAt(config, 1, 20, { width: 40, height: 40 }) as BackFeature
    expectNotch(f, { width: 40, height: 40 }, g, 'coupon')
    const b = ringBounds(f.levels[1].ring)
    expect((b.minY + b.maxY) / 2).toBeCloseTo(20, 9)
    expect(b.maxX).toBe(40)
    expect(keyNotchAt(design({ thickness: 3 }), 1, 20, { width: 40, height: 40 })).toBeNull()
  })
})

/** The contract of a notch (fixing/types.ts), checked on one feature. */
function expectNotch(f: BackFeature, piece: { width: number; height: number }, g: KeyGeometry, name: string) {
  expect(f.role).toBe('key-pocket')
  expect(f.side).not.toBeNull()
  const side = f.side as Side
  expect(f.levels.map((l) => [l.z0, l.z1])).toEqual([
    [0, g.mouth],
    [g.mouth, g.depth],
  ])
  const onLine = (x: number, y: number) =>
    side === 0 ? y === 0 : side === 1 ? x === piece.width : side === 2 ? y === piece.height : x === 0
  const rings = [f.levels[0].ring, f.levels[0].ringTop as Float64Array, f.levels[1].ring]
  expect(f.levels[1].ring).toEqual(f.levels[0].ringTop)
  for (const ring of rings) {
    expect(ring.length).toBe(rings[0].length)
    expect(signedArea(ring), name).toBeGreaterThan(0)
    expect(ringSelfIntersects(ring), name).toBe(false)
    const n = ring.length / 2
    let edgesOnLine = 0
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n
      const [x, y] = [ring[2 * k], ring[2 * k + 1]]
      if (onLine(x, y) && onLine(ring[2 * j], ring[2 * j + 1])) edgesOnLine++
      if (!onLine(x, y)) {
        expect(x > 0 && x < piece.width && y > 0 && y < piece.height, `${name}: ${x}, ${y} inside`).toBe(true)
      }
    }
    expect(edgesOnLine, name).toBe(1)
    // The opening is the first edge.
    expect(onLine(ring[0], ring[1]) && onLine(ring[2], ring[3]), name).toBe(true)
  }
  // The mouth holds the notch: every notch vertex is inside it or on its opening.
  const mouth = f.levels[0].ring
  const nominal = f.levels[1].ring
  for (let k = 0; k < nominal.length; k += 2) expect(pointInRing(mouth, nominal[k], nominal[k + 1])).toBeGreaterThanOrEqual(0)
}

describe('joinPlan', () => {
  it('is empty with keys off, and when the plate cannot hold a notch', () => {
    expect(joinPlan(DEFAULT_CONFIG, layoutOf(DEFAULT_CONFIG))).toEqual({ keys: 0, sites: [], unkeyedSeams: 0, unkeyedPieceIds: [], blocks: 0 })
    const thin = design({ thickness: 3 })
    expect(joinPlan(thin, layoutOf(thin)).keys).toBe(0)
  })

  it('counts the default wall: 8 x 4 tiles, 2 keys on each of 52 joints', () => {
    const config = design()
    const plan = layoutOf(config)
    expect(plan.columns).toBe(8)
    expect(plan.rows).toBe(4)
    const joins = joinPlan(config, plan)
    // 7 joints in each of 4 rows and 8 in each of 3 row joints.
    expect(joins.keys).toBe(2 * (7 * 4 + 8 * 3))
    expect(joins.sites.filter((s) => s.seam === 'vertical')).toHaveLength(56)
    expect(joins.sites.filter((s) => s.seam === 'horizontal')).toHaveLength(48)
    expect(joins.unkeyedSeams).toBe(0)
    expect(joins.unkeyedPieceIds).toEqual([])
    expect(joins.blocks).toBe(1)
    const xs = new Set(joins.sites.filter((s) => s.seam === 'vertical').map((s) => s.x))
    expect([...xs].sort((a, b) => a - b)).toEqual([150, 300, 450, 600, 750, 900, 1050])
    expect(new Set(joins.sites.filter((s) => s.seam === 'horizontal').map((s) => s.y))).toEqual(new Set([150, 300, 450]))
  })

  it('counts a half bond: every row joint keeps its keys across the shifted rows', () => {
    const config = design({ rowOffset: 0.5 })
    const joins = joinPlan(config, layoutOf(config))
    // Rows of 8 whole tiles (7 joints) and rows of 7 whole tiles between two 75 mm ends (8 joints).
    expect(joins.sites.filter((s) => s.seam === 'vertical')).toHaveLength(2 * (7 * 2 + 8 * 2))
    expect(joins.sites.filter((s) => s.seam === 'horizontal')).toHaveLength(16 * 3)
    expect(joins.unkeyedSeams).toBe(0)
    const along = joins.sites.filter((s) => s.seam === 'horizontal').map((s) => s.x % 75)
    expect(new Set(along)).toEqual(new Set([37.5]))
  })

  it('puts every key on a joint line, half a joint from both pieces', () => {
    for (const [name, wall] of Object.entries(VARIANTS)) {
      const config = design(wall)
      const plan = layoutOf(config)
      const joins = joinPlan(config, plan)
      expect(joins.keys, name).toBe(joins.sites.length)
      const byId = new Map(plan.pieces.map((p) => [p.id, p]))
      const rights = new Set(plan.placements.map((p) => Math.round((p.x + (byId.get(p.pieceId) as PieceSpec).width + config.joint / 2) * 100) / 100))
      const tops = new Set(plan.placements.map((p) => Math.round((p.y + (byId.get(p.pieceId) as PieceSpec).height + config.joint / 2) * 100) / 100))
      for (const site of joins.sites) {
        if (site.seam === 'vertical') expect(rights.has(site.x), `${name} x ${site.x}`).toBe(true)
        else expect(tops.has(site.y), `${name} y ${site.y}`).toBe(true)
      }
      expect(new Set(joins.sites.map((s) => `${s.x}:${s.y}`)).size, name).toBe(joins.sites.length)
    }
  })

  it('agrees across neighbours: a notch facing a neighbour meets its twin wherever both could carry it', () => {
    for (const [name, wall] of Object.entries(VARIANTS)) {
      const config = design(wall)
      const g = geometryOf(config)
      const plan = layoutOf(config)
      const byId = new Map(plan.pieces.map((p) => [p.id, p]))
      const reach = g.headWidth / 2 + g.margin
      const placed = plan.placements.map((p) => ({ p, piece: byId.get(p.pieceId) as PieceSpec }))
      for (const lower of placed) {
        if (lower.piece.kind !== 'full') continue
        const tops = notchCentres(config, lower.piece, lower.p).filter((n) => n.side === 2)
        for (const upper of placed) {
          if (upper.piece.kind !== 'full' || upper.p.row !== lower.p.row + 1) continue
          const x0 = Math.max(lower.p.x, upper.p.x)
          const x1 = Math.min(lower.p.x + lower.piece.width, upper.p.x + upper.piece.width)
          if (x1 - x0 <= 0.01) continue
          const bottoms = notchCentres(config, upper.piece, upper.p).filter((n) => n.side === 0)
          // A notch well inside the shared stretch has its twin across the joint.
          for (const n of tops) {
            if (n.x - reach < upper.p.x - 0.01 || n.x + reach > upper.p.x + upper.piece.width + 0.01) continue
            expect(bottoms.some((m) => Math.abs(m.x - n.x) < 0.05), `${name}: row ${lower.p.row} x ${n.x}`).toBe(true)
          }
          for (const m of bottoms) {
            if (m.x - reach < lower.p.x - 0.01 || m.x + reach > lower.p.x + lower.piece.width + 0.01) continue
            expect(tops.some((n) => Math.abs(m.x - n.x) < 0.05), `${name}: row ${upper.p.row} x ${m.x}`).toBe(true)
          }
        }
      }
    }
  })

  it('keys the cut pieces of a running bond: row ends carry the same lattice', () => {
    for (const rowOffset of [0.5, 0.3333] as const) {
      for (const joint of [0, 2, 5]) {
        const config = design({ rowOffset, joint, surface: { width: 1210, height: 640 } })
        const plan = layoutOf(config)
        const joins = joinPlan(config, plan)
        expect(joins.keys, `${rowOffset} ${joint}`).toBeGreaterThan(0)
        // Every pair of whole neighbours in adjacent rows shares at least one key.
        expect(joins.unkeyedPieceIds.filter((id) => id.startsWith('full')), `${rowOffset} ${joint}`).toEqual([])
      }
    }
  })

  it('reports the joints a thin cut leaves unkeyed, and the pieces that are then glued', () => {
    const config = design({ surface: { width: 910, height: 600 } })
    const plan = layoutOf(config)
    const joins = joinPlan(config, plan)
    // The 10 mm column meets 4 whole tiles beside it and its own strips above and below: 7 joints, no key.
    expect(joins.unkeyedSeams).toBe(7)
    const strips = plan.pieces.filter((p) => p.width === 10).map((p) => p.id)
    expect(joins.unkeyedPieceIds.length).toBeGreaterThan(0)
    expect(joins.unkeyedPieceIds.every((id) => strips.includes(id))).toBe(true)
  })

  it('keys 20 mm tiles only along their rows: one 8 mm key at mid-height, the row joints glued', () => {
    const config = design({ tile: 20, surface: { width: 200, height: 100 } })
    const plan = layoutOf(config)
    const joins = joinPlan(config, plan)
    expect(joins.keys).toBe(9 * 5)
    expect(joins.sites.every((s) => s.seam === 'vertical' && (s.y - 10) % 20 === 0)).toBe(true)
    expect(joins.unkeyedSeams).toBe(10 * 4)
    // Five rows, each one keyed strip, none keyed to the next.
    expect(joins.blocks).toBe(5)
  })

  it('makes every wall of 68 to 71 mm tiles one block, whatever the bond', () => {
    for (const size of [68, 69, 70, 71]) {
      for (const rowOffset of [0, 0.5, 0.3333] as const) {
        const config = design({ tile: size, rowOffset, surface: { width: 1200, height: 600 } })
        const joins = joinPlan(config, layoutOf(config))
        expect(joins.blocks, `${size} ${rowOffset}`).toBe(1)
        expect(joins.sites.some((s) => s.seam === 'horizontal'), `${size} ${rowOffset}`).toBe(true)
      }
    }
  })

  it('counts the separate groups the keys hold together, a piece keyed to nothing being none', () => {
    // A 10 mm column keyed to nothing beside a wall the keys hold in one block.
    const config = design({ surface: { width: 910, height: 600 } })
    const joins = joinPlan(config, layoutOf(config))
    expect(joins.unkeyedPieceIds.length).toBeGreaterThan(0)
    expect(joins.blocks).toBe(1)
    // One row of a whole tile and a 10 mm cut: no key anywhere, so no group.
    const bare = design({ surface: { width: 160, height: 150 } })
    expect(joinPlan(bare, layoutOf(bare)).blocks).toBe(0)
  })

  it('keys small tiles both ways once the vertical joints take one key each', () => {
    const config = design(VARIANTS['small tiles'])
    const joins = joinPlan(config, layoutOf(config))
    expect(joins.sites.some((s) => s.seam === 'vertical')).toBe(true)
    expect(joins.sites.some((s) => s.seam === 'horizontal')).toBe(true)
  })
})

describe('keyCoverageNote', () => {
  const noteOf = (config: DesignConfig) => keyCoverageNote(config, layoutOf(config))
  const wall = { surface: { width: 1200, height: 600 } }

  it('says nothing when the keys make one block, are off, or cannot be cut', () => {
    expect(noteOf(design())).toBeNull()
    expect(noteOf(DEFAULT_CONFIG)).toBeNull()
    expect(noteOf(design({ ...wall, tile: 20, thickness: 3 }))).toBeNull()
    expect(noteOf(design({ ...wall, tile: 20, over: { jointEdge: 'round', bevel: 3 } }))).toBeNull()
  })

  it('is never the tabs to fire: nothing of theirs crosses a row joint, so a strip per row is the design', () => {
    // Every tile size and pattern that leaves the keys in strips leaves the tabs in strips too, by design:
    // this note would then report the row count as a fault on every tabbed wall there is.
    for (const tile of [20, 40, 150]) {
      for (const rowOffset of [0, 0.3333, 0.5] as const) {
        const keyed = design({ ...wall, tile, rowOffset })
        const tabbed = design({ ...wall, tile, rowOffset, over: { lock: 'tabs' } })
        expect(noteOf(tabbed), `${tile} ${rowOffset}`).toBeNull()
        // The keys' own plan is empty there too, so no piece is reported keyless either.
        expect(joinPlan(tabbed, layoutOf(tabbed)).keys, `${tile} ${rowOffset}`).toBe(0)
        expect(keyCoverageNote(keyed, layoutOf(keyed), joinPlan(tabbed, layoutOf(tabbed))), `${tile} ${rowOffset}`).toBeNull()
      }
    }
  })

  it('names the strips of a wall whose rows no key joins, and the patterns and sizes that would', () => {
    const third = design({ ...wall, tile: 40, rowOffset: 0.3333 })
    const joins = joinPlan(third, layoutOf(third))
    expect(joins.blocks).toBe(15)
    expect(keyCoverageNote(third, layoutOf(third), joins)).toBe(
      'Keys hold this wall in 15 separate strips: at this tile size and brick pattern, no key fits across the joints between rows. ' +
        'Glue between the rows to make one panel. The Straight or Half brick pattern would key the rows, and so would tiles of at least 42 × 42 mm.',
    )
    expect(noteOf(design({ ...wall, tile: 20 }))).toBe(
      'Keys hold this wall in 30 separate strips: at this tile size, no key fits across the joints between rows. ' +
        'Glue between the rows to make one panel. Tiles of at least 36 × 36 mm would key the rows.',
    )
  })

  it('only suggests what really keys the rows, at every larger size too', () => {
    // The suggested patterns, and the suggested size and a few above it, each make one block.
    for (const rowOffset of [0.5, 0] as const) expect(joinPlan(design({ ...wall, tile: 40, rowOffset }), layoutOf(design({ ...wall, tile: 40, rowOffset }))).blocks).toBe(1)
    for (const size of [42, 43, 45, 50, 64, 100]) {
      const config = design({ ...wall, tile: size, rowOffset: 0.3333 })
      expect(joinPlan(config, layoutOf(config)).blocks, `${size}`).toBe(1)
      expect(noteOf(config), `${size}`).toBeNull()
    }
    for (const size of [36, 37, 40, 60, 100]) expect(noteOf(design({ ...wall, tile: size })), `${size}`).toBeNull()
  })

  it('names separate groups when whole tiles do key their rows', () => {
    // Long flat tiles: the rows key, but a short edge row keys to nothing across the wall.
    const config = design({ tile: { width: 92, height: 26 }, joint: 5, surface: { width: 381, height: 481 }, over: { jointEdge: 'round' } })
    const joins = joinPlan(config, layoutOf(config))
    expect(joins.blocks).toBeGreaterThan(1)
    expect(keyCoverageNote(config, layoutOf(config), joins)).toBe(
      `Keys hold this wall in ${joins.blocks} separate groups that no key joins to each other: glue the joints between them to make one panel.`,
    )
  })
})

describe('keyAccessories', () => {
  it('prints nothing for a default design', () => {
    expect(keyAccessories(DEFAULT_CONFIG, layoutOf(DEFAULT_CONFIG))).toEqual([])
  })

  it('is one key file for the wall, counted with 5 % spares', () => {
    const config = design()
    const [key, ...rest] = keyAccessories(config, layoutOf(config))
    expect(rest).toEqual([])
    expect(key).toMatchObject({
      id: 'key-16x12x1.4-c0.1',
      kind: 'key',
      mark: 'K1',
      label: 'Key, 15.8 mm',
      count: 104 + 6,
      group: 'join',
      size: { x: 15.8, y: 11.8, z: 1.4 },
    })
    expect(key.shape).toMatchObject({ clearance: 0.1, thickness: 1.4, joint: 0, headWidth: 12, neckWidth: 6 })
  })

  it('takes the clearance from the fit and the length from the joint, never the pockets', () => {
    const snug = design({ over: { fit: 'snug' } })
    expect(keyAccessories(snug, layoutOf(snug))[0].shape.clearance).toBe(0.05)
    const open = design({ joint: 3, over: { fit: 'loose' } })
    const key = keyAccessories(open, layoutOf(open))[0]
    expect(key.size.x).toBeCloseTo(16 + 3 - 0.3, 9)
    expect(key.id).toBe('key-19x12x1.4-c0.15')
  })

  it('has no file when keys are on but no joint takes one', () => {
    // One row: a whole tile and a 10 mm cut, whose one joint cannot hold a notch.
    const config = design({ surface: { width: 160, height: 150 } })
    expect(joinPlan(config, layoutOf(config))).toMatchObject({ keys: 0, unkeyedSeams: 1 })
    expect(keyAccessories(config, layoutOf(config))).toEqual([])
  })

  it('makes the fit-test keys with their own clearance and digit', () => {
    const config = design()
    const specs = ([1, 2, 3] as const).map((m, i) => keySpecForFit(config, (['snug', 'standard', 'loose'] as const)[i], m))
    expect(specs.map((s) => s?.shape.clearance)).toEqual([0.05, 0.1, 0.15])
    expect(specs.map((s) => s?.shape.marks)).toEqual([1, 2, 3])
    expect(specs.every((s) => s?.group === 'fit-test' && s.count === 1)).toBe(true)
    expect(new Set(specs.map((s) => s?.id)).size).toBe(3)
    expect(keySpecForFit(design({ thickness: 3 }), 'standard', 2)).toBeNull()
  })
})

const FITS: FitClass[] = ['snug', 'standard', 'loose']
/** Grid cells each digit fills (fitDigit.test.ts pins them). */
const CELLS = { 1: 8, 2: 11, 3: 10 } as const

/** Least distance from (x, y) to the segment [ax, ay, bx, by]. */
function toSegment(x: number, y: number, [ax, ay, bx, by]: number[]): number {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - ax - t * dx, y - ay - t * dy)
}

/**
 * What a key's mesh shows of a digit: the heights of its floors (flat faces looking up below the top face),
 * their area and box, and the least gap between the digit and the edge of the flat top face around it.
 */
function digitOf(mesh: MeshData) {
  const p = mesh.positions
  let top = 0
  for (let i = 2; i < p.length; i += 3) top = Math.max(top, p[i])
  const floors = new Set<number>()
  const floorPoints = new Set<string>()
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  let floorArea = 0
  const edges = new Map<string, { uses: number; edge: number[] }>()
  const at = (i: number) => `${p[i]},${p[i + 1]}`
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const v = [0, 1, 2].map((k) => 3 * mesh.indices[t + k])
    const z = p[v[0] + 2]
    if (p[v[1] + 2] !== z || p[v[2] + 2] !== z) continue
    const area = ((p[v[1]] - p[v[0]]) * (p[v[2] + 1] - p[v[0] + 1]) - (p[v[1] + 1] - p[v[0] + 1]) * (p[v[2]] - p[v[0]])) / 2
    if (!(area > 0)) continue
    if (z < top) {
      floors.add(z)
      floorArea += area
      for (const i of v) {
        floorPoints.add(at(i))
        box.minX = Math.min(box.minX, p[i])
        box.maxX = Math.max(box.maxX, p[i])
        box.minY = Math.min(box.minY, p[i + 1])
        box.maxY = Math.max(box.maxY, p[i + 1])
      }
      continue
    }
    for (let k = 0; k < 3; k++) {
      const a = v[k]
      const b = v[(k + 1) % 3]
      const key = [at(a), at(b)].sort().join(' ')
      const seen = edges.get(key)
      if (seen) seen.uses++
      else edges.set(key, { uses: 1, edge: [p[a], p[a + 1], p[b], p[b + 1]] })
    }
  }
  // The top face's boundary: the edges only one of its triangles uses, around the digit or around the key.
  const hole: number[][] = []
  const rim: number[][] = []
  for (const { uses, edge } of edges.values()) {
    if (uses !== 1) continue
    if (floorPoints.has(`${edge[0]},${edge[1]}`) && floorPoints.has(`${edge[2]},${edge[3]}`)) hole.push(edge)
    else rim.push(edge)
  }
  let gap = Infinity
  for (const [from, to] of [
    [hole, rim],
    [rim, hole],
  ]) {
    for (const e of from) for (const s of to) gap = Math.min(gap, toSegment(e[0], e[1], s), toSegment(e[2], e[3], s))
  }
  // The floor's corners, to a ten-thousandth of a mm: what tells a digit from its mirror or a turned one.
  const corners = new Set([...floorPoints].map((point) => point.split(',').map((v) => Number(v).toFixed(4)).join(',')))
  return { floors: [...floors], floorArea, box, gap, corners }
}

describe('buildKeyMesh', () => {
  const expectPrintable = (config: DesignConfig, spec: ReturnType<typeof keyAccessories>[number]) => {
    const mesh = buildKeyMesh(config, spec)
    const check = checkMesh(mesh)
    expect(check).toMatchObject({ closed: true, manifold: true, oriented: true, boundaryEdges: 0 })
    expect(componentCount(mesh)).toBe(1)
    expect(pinchedVertices(mesh)).toBe(0)
    // Flat on the bed: nothing faces down above it.
    expect(downwardArea(mesh, 1e-6)).toBe(0)
    let min = [Infinity, Infinity, Infinity]
    let max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < mesh.positions.length; i += 3) {
      min = min.map((v, a) => Math.min(v, mesh.positions[i + a]))
      max = max.map((v, a) => Math.max(v, mesh.positions[i + a]))
    }
    expect(min[0]).toBeCloseTo(0, 5)
    expect(min[1]).toBeCloseTo(0, 5)
    expect(min[2]).toBe(0)
    expect(max[0]).toBeCloseTo(spec.size.x, 4)
    expect(max[1]).toBeCloseTo(spec.size.y, 4)
    expect(max[2]).toBeCloseTo(spec.size.z, 5)
    // Between the outline's footprint at the top and at the bottom, times the thickness.
    expect(check.volume).toBeLessThan(spec.size.x * spec.size.y * spec.size.z)
    expect(check.volume).toBeGreaterThan(0.6 * spec.size.x * spec.size.y * spec.size.z)
    return mesh
  }

  it('builds a closed, flat-printable key for every design variant', () => {
    for (const [name, wall] of Object.entries({ ...VARIANTS, sturdy: { thickness: 6 }, 'wide joint': { joint: 10 } })) {
      const config = design(wall)
      const [spec] = keyAccessories(config, layoutOf(config))
      expect(spec, name).toBeDefined()
      expectPrintable(config, spec)
    }
  })

  it('engraves each fit-test key with its digit, sunk into the top of its +x head', () => {
    for (const config of [design(), design({ thickness: 6 }), design({ tile: 20 })]) {
      for (const fit of FITS) {
        const digit = FIT_DIGIT[fit]
        const spec = keySpecForFit(config, fit, digit) as AccessorySpec
        const mesh = expectPrintable(config, spec)
        const plain = buildKeyMesh(config, { ...spec, shape: { ...spec.shape, marks: 0 } })
        const name = `${spec.id} ${fit}`
        const cut = digitOf(mesh)
        // One 12-vertex pocket: 4 triangles a vertex, a single flat floor two layers down.
        expect(mesh.indices.length / 3, name).toBe(plain.indices.length / 3 + 48)
        expect(cut.floors, name).toHaveLength(1)
        expect(cut.floors[0], name).toBeCloseTo(spec.size.z - 0.4, 5)
        expect(cut.floorArea, name).toBeCloseTo(CELLS[digit] * 0.8 * 0.8, 4)
        expect(checkMesh(plain).volume - checkMesh(mesh).volume, name).toBeCloseTo(cut.floorArea * 0.4, 4)
        // 2.4 x 4 mm, centred on the +x head (5.5 mm out from the middle of a key for a closed joint), upright across it.
        expect(cut.box.maxX - cut.box.minX, name).toBeCloseTo(2.4, 4)
        expect(cut.box.maxY - cut.box.minY, name).toBeCloseTo(4, 4)
        expect((cut.box.minX + cut.box.maxX) / 2, name).toBeCloseTo(spec.size.x / 2 + 5.5, 4)
        expect((cut.box.minY + cut.box.maxY) / 2, name).toBeCloseTo(spec.size.y / 2, 4)
        // Read from above as printed: the digit's own corners, not its mirror or a turn of it.
        const ring = digitRing(digit, 0.8, spec.size.x / 2 + 5.5, spec.size.y / 2)
        const want = new Set(Array.from({ length: ring.length / 2 }, (_, k) => `${ring[2 * k].toFixed(4)},${ring[2 * k + 1].toFixed(4)}`))
        expect(cut.corners, name).toEqual(want)
      }
    }
    // At the default: the wall key's 356 triangles and the digit's 48.
    const config = design()
    expect(buildKeyMesh(config, keySpecForFit(config, 'standard', 2) as AccessorySpec).indices.length / 3).toBe(356 + 48)
  })

  it('centres the digit on the head whatever the joint the key spans', () => {
    const config = design({ joint: 4 })
    const wall = wallKeySpec(config) as AccessorySpec
    const spec = { ...wall, shape: { ...wall.shape, marks: 3 } }
    const g = geometryOf(config)
    const box = digitOf(expectPrintable(config, spec)).box
    expect((box.minX + box.maxX) / 2).toBeCloseTo(spec.size.x / 2 + (g.neck + g.reach + 4) / 2, 4)
  })

  it('keeps the digit 0.8 mm inside the flat top of the head, and 0.6 mm of key under it, on every key there is', () => {
    const thicknesses = new Set<number>()
    const heads = new Set<number>()
    for (const tile of [20, 30, 32, 34, 36]) {
      for (let k = 0; k <= 10; k++) {
        const config = design({ tile, thickness: 4 + k * 0.2, over: { jointEdge: 'chamfer', bevel: 1.2 } })
        for (const fit of FITS) {
          const spec = keySpecForFit(config, fit, FIT_DIGIT[fit])
          if (!spec) continue
          const name = `${spec.id} ${fit}`
          const thickness = spec.size.z
          thicknesses.add(thickness)
          heads.add(geometryOf(config).headWidth)
          const cut = digitOf(expectPrintable(config, spec))
          expect(cut.gap, name).toBeGreaterThanOrEqual(0.8 - 1e-4)
          expect(cut.gap, name).toBeLessThan(1)
          // Two layers deep, one on a key under 1.2 mm: a 0.8 mm key keeps 0.6 mm under it.
          const depth = thickness - cut.floors[0]
          expect(depth, name).toBeCloseTo(thickness < 1.2 - 1e-9 ? 0.2 : 0.4, 5)
          expect(cut.floors[0], name).toBeGreaterThanOrEqual(0.6 - 1e-5)
        }
      }
    }
    expect([...heads].sort((a, b) => a - b)).toEqual([8, 9, 10, 11, 12])
    expect([...thicknesses].sort((a, b) => a - b)).toEqual([0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6])
    // The thinnest key takes one layer, the default 1.4 mm key two.
    const thinConfig = design({ thickness: 4, over: { jointEdge: 'chamfer', bevel: 1.2 } })
    const thin = keySpecForFit(thinConfig, 'loose', 3) as AccessorySpec
    expect(thin.size.z).toBe(0.8)
    expect(thin.size.z - digitOf(buildKeyMesh(thinConfig, thin)).floors[0]).toBeCloseTo(0.2, 5)
    const standard = keySpecForFit(design(), 'standard', 2) as AccessorySpec
    expect(standard.size.z).toBe(1.4)
    expect(standard.size.z - digitOf(buildKeyMesh(design(), standard)).floors[0]).toBeCloseTo(0.4, 5)
  })

  it('leaves the wall key as it always was, with no digit', () => {
    const config = design()
    const mesh = buildKeyMesh(config, wallKeySpec(config) as AccessorySpec)
    // The triangles and the volume it had before the fit test's keys carried a digit.
    expect(mesh.indices.length / 3).toBe(356)
    expect(checkMesh(mesh).volume).toBeCloseTo(205.10327832526573, 9)
    expect(digitOf(mesh).floors).toEqual([])
    // Byte for byte, at every fit: the digests of the wall keys built before the fit test's keys took a digit.
    const before = { snug: '1635151a', standard: 'dc0f11be', loose: 'c89073bc' }
    for (const fit of ['snug', 'standard', 'loose'] as const) {
      const fitted = design({ over: { fit } })
      expect(meshDigest(buildKeyMesh(fitted, wallKeySpec(fitted) as AccessorySpec)), fit).toBe(before[fit])
    }
  })

  it('fits the key in the notches j apart with the clearance all round', () => {
    const config = design({ joint: 2 })
    const g = geometryOf(config)
    const [spec] = keyAccessories(config, layoutOf(config))
    expect(spec.size.x).toBeCloseTo(2 * g.reach + 2 - 2 * 0.1, 9)
    expect(spec.size.y).toBeCloseTo(g.headWidth - 2 * 0.1, 9)
    expect(spec.size.z).toBeCloseTo(g.depth - 0.4, 9)
  })

  it('names the notch sites keyPockets cuts, in the same order, and the wall key at the design fit', () => {
    for (const config of [design(), design({ joint: 2, origin: 'center', rowOffset: 0.5 }), design({ tile: 60 })]) {
      for (const p of layoutOf(config).pieces) {
        const sites = keyNotchSites(config, p)
        const pockets = keyPockets(config, p)
        expect(sites.map((s) => s.side)).toEqual(pockets.map((f) => f.side))
        sites.forEach((site, i) => {
          const b = ringBounds(pockets[i].levels[1].ring)
          const middle = site.side === 0 || site.side === 2 ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2
          expect(middle).toBeCloseTo(site.along, 9)
        })
      }
    }
    expect(keyNotchSites({ ...design(), lock: 'none' }, layoutOf(design()).pieces[0])).toEqual([])
    const config = design({ over: { fit: 'loose' } })
    const [spec] = keyAccessories(config, layoutOf(config))
    const { mark: _mark, count: _count, group: _group, ...wall } = spec
    expect(wallKeySpec(config)).toEqual(wall)
    expect(wallKeySpec(design({ thickness: 3 }))).toBeNull()
  })

  it('refuses a spec that is not a key or lacks its numbers', () => {
    const config = design()
    const [spec] = keyAccessories(config, layoutOf(config))
    expect(() => buildKeyMesh(config, { ...spec, kind: 'clip' })).toThrow()
    expect(() => buildKeyMesh(config, { ...spec, shape: { ...spec.shape, thickness: Number.NaN } })).toThrow()
  })
})
