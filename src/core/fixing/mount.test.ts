import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, PERIMETER_PROFILES } from '../config'
import { pieceTopSampler } from '../geometry/heightfield'
import { checkMesh, componentCount, downwardArea, pinchedVertices } from '../geometry/meshChecks'
import { signedArea } from '../geometry/polygon'
import { resolveJointEdge, resolvePerimeter, shapingEdges } from '../geometry/profiles'
import { sineField } from '../geometry/testFields'
import { MIN_SKIN_MM } from '../geometry/solid'
import { buildPieceMesh } from '../geometry/tileMesh'
import { computeLayout, layoutInputOf } from '../layout'
import { printerById } from '../printers'
import { PART_PRINT_SETTINGS } from '../printSettings'
import { SIDE_NAMES, SIDES } from '../sides'
import type { DesignConfig, LayoutPlan, PieceSpec } from '../types'
import { CLIP_SIDE_WALL, clipBandOffset, KEY_CLEAR } from './capability'
import { keyPockets } from './joins'
import { pieceSockets } from './tabs'
import { CLIP_CLEARANCE, POCKET_DEPTH, POCKET_HALF_LONG, POCKET_HALF_SHORT } from './mechanism'
import {
  buildClipMesh,
  clipPocketAt,
  clipPockets,
  clipSites,
  clipSpec,
  clipSpecForFit,
  DOUBLE_AT,
  mountParts,
  mountPlan,
  PERIMETER_CLEAR,
  POCKET_GAP,
} from './mount'
import type { BackFeature } from './types'

const clips = (over: Partial<DesignConfig> = {}): DesignConfig => ({ ...structuredClone(DEFAULT_CONFIG), mount: 'clips', ...over })

const layoutOf = (config: DesignConfig): LayoutPlan => computeLayout(layoutInputOf(config, printerById(config.printerId)))

/** A synthetic piece of the design's tile, cut to a crop. */
function piece(crop: PieceSpec['crop'], edges: PieceSpec['edges'] = { boundary: 0, tabs: 0, profiled: {} }): PieceSpec {
  return { id: 'p', mark: 'A', kind: 'edge', label: 'Piece', crop, width: crop.x1 - crop.x0, height: crop.y1 - crop.y0, count: 1, edges }
}

const box = (f: BackFeature) => {
  const xs: number[] = []
  const ys: number[] = []
  for (const level of f.levels) {
    for (const ring of level.ringTop ? [level.ring, level.ringTop] : [level.ring]) {
      for (let k = 0; k < ring.length; k += 2) {
        xs.push(ring[k])
        ys.push(ring[k + 1])
      }
    }
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

/** Gap between two boxes: the larger of the x and y gaps (negative when they overlap). */
const boxGap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
  Math.max(Math.max(a.minX - b.maxX, b.minX - a.maxX), Math.max(a.minY - b.maxY, b.minY - a.maxY))

/**
 * Every pocket of a piece inside its side walls, past any profiled side's band, and KEY_CLEAR from every
 * recess the lock cuts into the same plate: a key notch, or the socket of a tab.
 */
function expectClear(config: DesignConfig, p: PieceSpec, where: string): void {
  const notches = [...keyPockets(config, p), ...pieceSockets(config, p)].map(box)
  const pockets = clipPockets(config, p).map(box)
  const wall = Math.max(CLIP_SIDE_WALL, resolveJointEdge(config).run)
  const perimeter = resolvePerimeter(config)
  const offsets = shapingEdges(config, p.edges)
  // What each side needs, in Side order: the wall, and past a profiled side's band (mount.ts's sideMargins).
  const need = SIDES.map((side) => {
    const offset = offsets[SIDE_NAMES[side]]
    return perimeter && offset !== undefined ? Math.max(wall, perimeter.band - offset + PERIMETER_CLEAR) : wall
  })
  for (const pocket of pockets) {
    const walls = [pocket.minY, p.width - pocket.maxX, p.height - pocket.maxY, pocket.minX]
    for (const side of SIDES) expect(walls[side], `${where} side ${side}`).toBeGreaterThanOrEqual(need[side] - 1e-9)
    for (const n of notches) expect(boxGap(pocket, n), where).toBeGreaterThanOrEqual(KEY_CLEAR - 1e-9)
  }
  for (let i = 0; i < pockets.length; i++) {
    for (let k = i + 1; k < pockets.length; k++) expect(boxGap(pockets[i], pockets[k]), where).toBeGreaterThanOrEqual(POCKET_GAP - 1e-9)
  }
}

describe('clip pockets', () => {
  it('leaves default designs untouched: no pockets when glued, or on a plate under 4 mm', () => {
    const full = piece({ x0: 0, y0: 0, x1: 150, y1: 150 })
    expect(clipSites(DEFAULT_CONFIG, full)).toEqual([])
    expect(clipPockets(DEFAULT_CONFIG, full)).toEqual([])
    expect(clipPockets(clips({ tile: { width: 150, height: 150, thickness: 3 } }), full)).toEqual([])
    expect(mountPlan(DEFAULT_CONFIG, layoutOf(DEFAULT_CONFIG))).toEqual({ clips: 0, sites: [], unmountedPieceIds: [] })
    expect(mountParts(DEFAULT_CONFIG, layoutOf(DEFAULT_CONFIG))).toEqual([])
    const thin = clips({ tile: { width: 150, height: 150, thickness: 3 } })
    expect(mountPlan(thin, layoutOf(thin))).toEqual({ clips: 0, sites: [], unmountedPieceIds: [] })
  })

  it('puts two clips on a whole tile, at the band offset from its bottom and top, in its middle', () => {
    const config = clips()
    const b = clipBandOffset(config)
    expect(b).toBeCloseTo(POCKET_HALF_SHORT + CLIP_SIDE_WALL, 0)
    expect(clipSites(config, piece({ x0: 0, y0: 0, x1: 150, y1: 150 }))).toEqual([
      { x: 75, y: b, axis: 'h' },
      { x: 75, y: 150 - b, axis: 'h' },
    ])
    const pockets = clipPockets(config, piece({ x0: 0, y0: 0, x1: 150, y1: 150 }))
    expect(pockets).toHaveLength(2)
    for (const p of pockets) {
      expect(p.role).toBe('clip-pocket')
      expect(p.side).toBeNull()
      expect(p.levels[p.levels.length - 1].z1).toBe(POCKET_DEPTH)
    }
    expect(clipPocketAt(75, b, 'h')).toEqual(pockets[0])
  })

  it('moves the bands in past the row-joint key slots with keys, and doubles the clips from DOUBLE_AT wide', () => {
    const keyed = clips({ lock: 'keys' })
    const b = clipBandOffset(keyed)
    expect(b).toBe(19.5)
    expect(clipSites(keyed, piece({ x0: 0, y0: 0, x1: 150, y1: 150 })).map((s) => s.y)).toEqual([b, 150 - b])
    const wide = clips({ tile: { width: DOUBLE_AT + 60, height: 150, thickness: 4 } })
    expect(clipSites(wide, piece({ x0: 0, y0: 0, x1: 300, y1: 150 })).map((s) => s.x)).toEqual([75, 225, 75, 225])
    expect(clipSites(wide, piece({ x0: 0, y0: 0, x1: 300, y1: 150 })).every((s) => s.axis === 'h')).toBe(true)
  })

  it('centres one band on a piece too short for two, and turns the clip on a piece too narrow for it', () => {
    const config = clips()
    const short = clipSites(config, piece({ x0: 0, y0: 0, x1: 150, y1: 30 }))
    expect(short).toEqual([{ x: 75, y: 15, axis: 'h' }])
    // A cut too narrow for a clip along it but tall enough: one turned clip, in its middle across.
    const narrow = clipSites(config, piece({ x0: 120, y0: 0, x1: 150, y1: 150 }))
    expect(narrow).toEqual([{ x: 15, y: 75, axis: 'v' }])
    const tall = clips({ tile: { width: 150, height: DOUBLE_AT + 60, thickness: 4 } })
    expect(clipSites(tall, piece({ x0: 0, y0: 0, x1: 40, y1: 300 })).map((s) => [s.y, s.axis])).toEqual([
      [75, 'v'],
      [225, 'v'],
    ])
  })

  it('moves a turned clip in from the middle of a framed edge column, rather than leaving it on glue', () => {
    // 150 mm tiles centred on a 564.6 mm wall leave 57.3 mm columns: the middle of one is 0.2 mm short of
    // the frame's band on its outer side, and a pocket moved in by that much keeps every rule.
    const frame = PERIMETER_PROFILES.frame
    const config = clips({
      surface: { width: 564.6, height: 600 },
      layout: { origin: 'center', rowOffset: 0 },
      perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'frame', width: frame.width, drop: frame.drop, land: frame.land },
    })
    const plan = layoutOf(config)
    const columns = plan.pieces.filter((p) => p.width < config.tile.width)
    expect(columns.length).toBeGreaterThan(0)
    for (const column of columns) {
      const sites = clipSites(config, column)
      expect(sites.map((s) => s.axis), column.id).toEqual(['v'])
      // Off the middle across, towards the framed side's neighbour.
      expect(Math.abs(sites[0].x - column.width / 2), column.id).toBeGreaterThan(0.1)
      expectClear(config, column, column.id)
    }
    expect(mountPlan(config, plan).unmountedPieceIds).toEqual([])
  })

  it('centres the clip of a keyed tile whose two bands both run into its key slots', () => {
    // 72 mm tiles in a third bond: the bands sit within KEY_CLEAR of the side slots, the middle does not.
    const config = clips({ lock: 'keys', tile: { width: 72, height: 72, thickness: 4 }, surface: { width: 600, height: 400 }, layout: { origin: 'corner', rowOffset: 0.3333 } })
    const plan = layoutOf(config)
    const whole = plan.pieces.find((p) => p.kind === 'full') as PieceSpec
    expect(clipSites(config, whole)).toEqual([{ x: 36, y: 36, axis: 'h' }])
    expectClear(config, whole, whole.id)
    expect(mountPlan(config, plan).unmountedPieceIds).not.toContain(whole.id)
  })

  it('scans for a clip height beside the key slots when the bands and the middle are all blocked', () => {
    // 124 mm keyed tiles in a half bond on a 459 mm wall: the rows at top and bottom are cut to 37.9 mm,
    // and the only height left between their key slots is half a millimetre off the middle.
    const config = clips({
      lock: 'keys',
      joint: 2.8,
      bevel: 2.3,
      jointEdge: 'square',
      tile: { width: 124, height: 124, thickness: 4 },
      surface: { width: 252, height: 459 },
      layout: { origin: 'center', rowOffset: 0.5 },
    })
    const plan = layoutOf(config)
    const rows = plan.pieces.filter((p) => p.height < config.tile.height)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      const sites = clipSites(config, row)
      expect(sites.map((s) => s.axis), row.id).toEqual(['h'])
      expect(Math.abs(sites[0].y - row.height / 2), row.id).toBeGreaterThan(0.2)
      expectClear(config, row, row.id)
    }
    expect(mountPlan(config, plan).unmountedPieceIds).toEqual([])
  })

  it('leaves a piece too small for any clip with none', () => {
    const config = clips()
    expect(clipSites(config, piece({ x0: 135, y0: 0, x1: 150, y1: 150 }))).toEqual([])
    expect(clipSites(config, piece({ x0: 0, y0: 0, x1: 150, y1: 18 }))).toEqual([])
    expect(clipSites(config, piece({ x0: 0, y0: 0, x1: 50, y1: 50 }))).toEqual([])
  })

  it('keeps pockets past a dropping perimeter profile and clear of a pillow joint edge', () => {
    for (const profile of ['chamfer', 'bullnose', 'ogee'] as const) {
      const config = clips({ perimeter: { ...DEFAULT_CONFIG.perimeter, profile, width: 6, drop: 2, land: 'cut' } })
      const band = resolvePerimeter(config)?.band ?? 0
      expect(band).toBeGreaterThan(0)
      const border = piece({ x0: 0, y0: 0, x1: 150, y1: 150 }, { boundary: 0, tabs: 0, profiled: { bottom: 0, left: 0 } })
      const sites = clipSites(config, border)
      expect(sites.length).toBeGreaterThan(0)
      for (const f of clipPockets(config, border)) {
        const b = box(f)
        expect(b.minY).toBeGreaterThanOrEqual(band + PERIMETER_CLEAR - 1e-9)
        expect(b.minX).toBeGreaterThanOrEqual(band + PERIMETER_CLEAR - 1e-9)
      }
      expect(sites[0].y).toBeCloseTo(clipBandOffset(config) + band, 2)
    }
    const pillow = clips({ jointEdge: 'pillow', bevel: 2 })
    const run = resolveJointEdge(pillow).run
    expect(run).toBeGreaterThan(CLIP_SIDE_WALL)
    for (const f of clipPockets(pillow, piece({ x0: 0, y0: 0, x1: 70, y1: 150 }))) {
      const b = box(f)
      expect(Math.min(b.minX, b.minY, 70 - b.maxX, 150 - b.maxY)).toBeGreaterThanOrEqual(run - 1e-9)
    }
  })

  it('keeps every pocket KEY_CLEAR from every key notch and within its walls, across cut pieces, bonds and sizes', () => {
    for (const lock of ['none', 'keys', 'tabs'] as const) {
      for (const rowOffset of [0, 0.5, 0.3333] as const) {
        for (const size of [60, 100, 150, 260]) {
          for (const joint of [0, 2]) {
            const config = clips({ lock, joint, tile: { width: size, height: size, thickness: 4 }, layout: { origin: 'center', rowOffset } })
            const plan = layoutOf({ ...config, surface: { width: 3.3 * size, height: 2.6 * size } })
            for (const p of plan.pieces) expectClear(config, p, `${lock} ${rowOffset} ${size} ${joint} ${p.id}`)
          }
        }
      }
    }
  })

  it('gives two placements of one piece id the same pockets', () => {
    const config = clips({ lock: 'keys', surface: { width: 1000, height: 700 } })
    for (const p of layoutOf(config).pieces) {
      expect(clipSites(config, { ...p, crop: { ...p.crop }, edges: structuredClone(p.edges) })).toEqual(clipSites(config, p))
    }
  })
})

describe('mount plan', () => {
  it('counts one clip per pocket over every placed tile, bottom to top then left to right', () => {
    for (const config of [clips(), clips({ lock: 'keys', surface: { width: 1250, height: 640 }, layout: { origin: 'corner', rowOffset: 0.5 } })]) {
      const plan = layoutOf(config)
      const mount = mountPlan(config, plan)
      const pieces = new Map(plan.pieces.map((p) => [p.id, p]))
      expect(mount.clips).toBe(plan.placements.reduce((n, pl) => n + clipSites(config, pieces.get(pl.pieceId) as PieceSpec).length, 0))
      expect(mount.sites).toHaveLength(mount.clips)
      for (let i = 1; i < mount.sites.length; i++) {
        const [a, b] = [mount.sites[i - 1], mount.sites[i]]
        expect(a.y < b.y || (a.y === b.y && a.x <= b.x)).toBe(true)
      }
      // Every clip lies on a placement of its own piece, where that piece has a pocket.
      for (const s of mount.sites) {
        const p = pieces.get(s.pieceId) as PieceSpec
        const on = plan.placements.some(
          (pl) => pl.pieceId === s.pieceId && clipSites(config, p).some((c) => Math.abs(pl.x + c.x - s.x) < 0.01 && Math.abs(pl.y + c.y - s.y) < 0.01 && c.axis === s.axis),
        )
        expect(on, `${s.pieceId} at ${s.x}, ${s.y}`).toBe(true)
      }
      expect(mount.unmountedPieceIds).toEqual(plan.pieces.filter((p) => clipSites(config, p).length === 0).map((p) => p.id))
    }
  })

  it('names the pieces too small for a clip, and still mounts the rest', () => {
    // A 1510 mm wall of 150 mm tiles from the corner leaves a 10 mm column on the right.
    const config = clips({ surface: { width: 1510, height: 600 }, layout: { origin: 'corner', rowOffset: 0 } })
    const plan = layoutOf(config)
    const mount = mountPlan(config, plan)
    expect(mount.unmountedPieceIds.length).toBeGreaterThan(0)
    for (const id of mount.unmountedPieceIds) expect((plan.pieces.find((p) => p.id === id) as PieceSpec).width).toBeLessThan(20)
    expect(mount.clips).toBeGreaterThan(0)
  })

  it('prints one clip file at the design fit, with 5 % spares, and quotes its weighed settings', () => {
    for (const fit of ['snug', 'standard', 'loose'] as const) {
      const config = clips({ fit })
      const plan = layoutOf(config)
      const n = mountPlan(config, plan).clips
      const parts = mountParts(config, plan)
      expect(parts).toHaveLength(1)
      const [part] = parts
      expect(part).toMatchObject({ kind: 'clip', mark: 'C1', group: 'mount', label: `Wall clip, ${fit} fit`, count: n + Math.ceil(n * 0.05) })
      expect(part.id).toBe(clipSpec(fit).id)
      expect(part.shape).toEqual({ clearance: CLIP_CLEARANCE[fit], marks: 0 })
      expect(part.printNote).toContain(`: ${PART_PRINT_SETTINGS.clip.summary}.`)
    }
  })

  it('keeps the clip specs apart by fit and marks, and gives the fit test its marked clips', () => {
    const ids = new Set<string>()
    for (const fit of ['snug', 'standard', 'loose'] as const) {
      for (const marks of [0, 1, 2, 3] as const) ids.add(clipSpec(fit, marks).id)
    }
    expect(ids.size).toBe(12)
    expect(clipSpecForFit('loose', 3)).toMatchObject({ kind: 'clip', group: 'fit-test', count: 1, label: 'Test clip 3, loose', shape: { marks: 3 } })
    // A looser clip is narrower across its barbs, never longer or taller.
    expect(clipSpec('loose').size.y).toBeLessThan(clipSpec('snug').size.y)
    expect(clipSpec('loose').size.x).toBe(clipSpec('snug').size.x)
    expect(clipSpec('loose').size.z).toBe(POCKET_DEPTH)
  })

  it('builds every clip file as one closed, printable solid', () => {
    for (const fit of ['snug', 'standard', 'loose'] as const) {
      for (const marks of [0, 1, 2, 3] as const) {
        const mesh = buildClipMesh(clipSpec(fit, marks))
        const check = checkMesh(mesh)
        expect(check.closed && check.manifold && check.oriented).toBe(true)
        expect(componentCount(mesh)).toBe(1)
        expect(pinchedVertices(mesh)).toBe(0)
        expect(downwardArea(mesh, 1e-3, Math.cos(45.01 * (Math.PI / 180)))).toBe(0)
      }
    }
    expect(() => buildClipMesh({ id: 'broken', shape: {} })).toThrow(/clearance/)
  })
})

describe('clip pockets in the real tile mesher', () => {
  /** The area of a pocket's or notch's flat ceiling: its last outline. */
  const ceilingArea = (f: BackFeature) => {
    const last = f.levels[f.levels.length - 1]
    return Math.abs(signedArea(last.ringTop ?? last.ring))
  }

  it('cuts clip pockets beside key slots into whole tiles and cut pieces: one closed solid, only its ceilings bridged', () => {
    const walls: DesignConfig[] = [
      clips({ lock: 'keys', surface: { width: 520, height: 400 } }),
      clips({ lock: 'keys', joint: 2, surface: { width: 610, height: 380 }, layout: { origin: 'center', rowOffset: 0.5 } }),
      clips({ lock: 'keys', surface: { width: 560, height: 420 }, perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'bullnose' } }),
      clips({ tile: { width: 100, height: 60, thickness: 6 }, surface: { width: 470, height: 250 } }),
    ]
    let clipped = 0
    for (const config of walls) {
      const plan = layoutOf(config)
      const field = sineField(config.texture.depth, config.tile.width, config.tile.height)
      for (const p of plan.pieces) {
        const features = [...keyPockets(config, p), ...clipPockets(config, p)]
        const mesh = buildPieceMesh(config, field, p, { cellMm: 2 })
        const check = checkMesh(mesh)
        expect(check.closed && check.manifold && check.oriented, p.id).toBe(true)
        expect(componentCount(mesh), p.id).toBe(1)
        expect(pinchedVertices(mesh), p.id).toBe(0)
        // Looking down more steeply than 45 degrees above the bed: exactly the flat ceilings (mouths are 45 degrees).
        const ceilings = features.reduce((sum, f) => sum + ceilingArea(f), 0)
        expect(downwardArea(mesh, 0.01, 0.71), p.id).toBeCloseTo(ceilings, 1)
        // Every pocket keeps its skin under the lowest point of the top above it.
        const top = pieceTopSampler(config, field, p)
        for (const f of clipPockets(config, p)) {
          const b = box(f)
          let lowest = Infinity
          for (let i = 0; i <= 40; i++) {
            for (let j = 0; j <= 12; j++) lowest = Math.min(lowest, top(b.minX + ((b.maxX - b.minX) * i) / 40, b.minY + ((b.maxY - b.minY) * j) / 12))
          }
          expect(lowest - POCKET_DEPTH, p.id).toBeGreaterThanOrEqual(MIN_SKIN_MM - 1e-9)
          clipped++
        }
      }
    }
    expect(clipped).toBeGreaterThan(20)
  })

  it('meshes every pocket it places on random walls, wherever the fallbacks put it', () => {
    // A fixed seed, so a failure is reproducible: 16 walls is a couple of seconds and covers the bands,
    // the centred band, the scanned heights and the turned clips together.
    let seed = 20260922
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 2 ** 32
    }
    const oneOf = <T,>(all: readonly T[]): T => all[Math.floor(random() * all.length)]
    const between = (a: number, b: number) => a + random() * (b - a)
    const tenth = (v: number) => Math.round(v * 10) / 10
    let placed = 0
    for (let n = 0; n < 16; n++) {
      const w = Math.round(between(40, 220))
      const h = random() < 0.5 ? w : Math.round(between(40, 220))
      const profile = oneOf(['none', 'margin', 'chamfer', 'frame'] as const)
      const preset = PERIMETER_PROFILES[profile === 'none' ? 'margin' : profile]
      const config = clips({
        lock: oneOf(['none', 'keys', 'tabs'] as const),
        joint: tenth(between(0, 6)),
        bevel: tenth(between(0, 3)),
        jointEdge: oneOf(['square', 'chamfer', 'round', 'pillow'] as const),
        tile: { width: w, height: h, thickness: 4 },
        surface: { width: Math.round(w * between(1.4, 3) + between(0, 40)), height: Math.round(h * between(1.4, 3) + between(0, 40)) },
        layout: { origin: oneOf(['corner', 'center', 'balanced'] as const), rowOffset: oneOf([0, 0.5, 0.3333] as const) },
        perimeter: { ...DEFAULT_CONFIG.perimeter, profile, width: preset.width, drop: preset.drop, land: preset.land },
      })
      const plan = layoutOf(config)
      const field = sineField(config.texture.depth, config.tile.width, config.tile.height)
      for (const p of plan.pieces) {
        const pockets = clipPockets(config, p)
        const where = `#${n} ${config.tile.width}x${config.tile.height} ${p.id}`
        expectClear(config, p, where)
        if (pockets.length === 0) continue
        placed += pockets.length
        const mesh = buildPieceMesh(config, field, p, { cellMm: 3 })
        const check = checkMesh(mesh)
        expect(check.closed && check.manifold && check.oriented, where).toBe(true)
        expect(componentCount(mesh), where).toBe(1)
        expect(pinchedVertices(mesh), where).toBe(0)
        // Steeper than 45 degrees downward is the ceilings of the pockets and the key notches, and nothing else.
        const ceilings = [...keyPockets(config, p), ...pockets].reduce((sum, f) => sum + ceilingArea(f), 0)
        expect(downwardArea(mesh, 0.01, 0.71), where).toBeCloseTo(ceilings, 1)
      }
    }
    expect(placed).toBeGreaterThan(60)
  })

  it('keeps a pocket KEY_CLEAR from every socket, and leaves the bands where a glued design has them', () => {
    // A socket is a recess in the same plate as a pocket, so the pocket keeps its wall to one exactly as it
    // does to a key notch: cut touching, the mesher refuses the piece. Nothing of the tabs crosses a row
    // joint, though, so the bands themselves never move out for them, where the keys push them to 19.5 mm.
    const tabs = clips({ lock: 'tabs' })
    expect(clipBandOffset(tabs)).toBe(clipBandOffset(clips()))
    expect(clipBandOffset(clips({ lock: 'keys' }))).toBeGreaterThan(clipBandOffset(tabs))
    const plan = layoutOf(tabs)
    for (const p of plan.pieces) expectClear(tabs, p, p.id)
    // A socket is cut wherever the left side is interior, which on this wall is every piece but the left column.
    expect(plan.pieces.filter((p) => pieceSockets(tabs, p).length > 0)).toHaveLength(plan.pieces.length - 3)
    // Every piece of a 150 mm wall keeps the pair of clips a glued design gives it: the sockets cost nothing.
    for (const p of plan.pieces) expect(clipSites(tabs, p).length, p.id).toBe(clipSites({ ...tabs, lock: 'none' }, p).length)
    // And a piece the sockets do box in is answered by the clip search, not by leaving the pocket out.
    const narrow = clips({ lock: 'tabs', tile: { width: 30, height: 56, thickness: 4 }, surface: { width: 102, height: 151 }, layout: { origin: 'center', rowOffset: 0.5 } })
    for (const p of layoutOf(narrow).pieces) expectClear(narrow, p, `narrow ${p.id}`)
  })

  it('cuts a pocket for a turned clip on a narrow cut, and keeps both pockets of a short piece apart', () => {
    const config = clips({ lock: 'keys' })
    const field = sineField(config.texture.depth, 150, 150)
    const narrow = piece({ x0: 0, y0: 0, x1: 30, y1: 150 }, { boundary: 0b1010, tabs: 0, profiled: {} })
    const sites = clipSites(config, narrow)
    expect(sites.map((s) => s.axis)).toEqual(['v'])
    const mesh = buildPieceMesh(config, field, narrow, { cellMm: 1 })
    const check = checkMesh(mesh)
    expect(check.closed && check.manifold && check.oriented).toBe(true)
    expect(componentCount(mesh)).toBe(1)
    // The turned pocket's long side runs up the piece.
    const b = box(clipPockets(config, narrow)[0])
    expect(b.maxY - b.minY).toBeCloseTo(2 * POCKET_HALF_LONG, 6)
    expect(b.maxX - b.minX).toBeCloseTo(2 * POCKET_HALF_SHORT, 6)
  })
})
