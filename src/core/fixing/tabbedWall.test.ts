import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '../config'
import { checkMesh, componentCount, downwardArea, meshVolume, pinchedVertices, weldByPosition } from '../geometry/meshChecks'
import { buildPieceMesh } from '../geometry/tileMesh'
import { computeLayout, layoutInputOf } from '../layout'
import { hasSide } from '../sides'
import { createHeightField } from '../textures/registry'
import type { DesignConfig, LayoutOrigin, PerimeterProfile, PieceSpec, Placement, RowOffset, SurfaceSides } from '../types'
import { pieceFeatures } from './features'
import { pieceSockets, pieceTabs, SOCKET_SIDE, TAB_SIDE } from './tabs'
import type { BackFeature } from './types'

// A tabbed wall taken through the real path: layoutInputOf, computeLayout, pieceFeatures, buildPieceMesh. The
// synthetic pieces in tabs.test.ts prove the section; these prove what the app actually builds, which is the
// only place the layout's neighbour rule and the mesher meet. The rule the whole feature rests on is that a
// tab is cut ONLY where the tile beside it really has the socket: an unmated tab bears on that tile's back
// plate and stands it off the wall, and no maker could recover from it.

const design = (over: Partial<DesignConfig>): DesignConfig => normalizeConfig({ ...DEFAULT_CONFIG, lock: 'tabs', ...over })
const sides = (over: Partial<SurfaceSides> = {}): SurfaceSides => ({ bottom: true, right: true, top: true, left: true, ...over })

/** Each row's placements, left to right, which is the order a tab looks along. */
function rowsOf(plan: { placements: Placement[] }): Placement[][] {
  const rows = new Map<number, Placement[]>()
  for (const p of plan.placements) {
    const list = rows.get(p.row)
    if (list) list.push(p)
    else rows.set(p.row, [p])
  }
  return [...rows.values()].map((list) => [...list].sort((a, b) => a.x - b.x))
}

/** Every joint within a row of a real wall, as the pair of models that meet across it. */
function joints(config: DesignConfig): { left: PieceSpec; right: PieceSpec }[] {
  const plan = computeLayout(layoutInputOf(config))
  const pieces = new Map(plan.pieces.map((p) => [p.id, p]))
  const out: { left: PieceSpec; right: PieceSpec }[] = []
  for (const row of rowsOf(plan))
    for (let k = 0; k + 1 < row.length; k++) {
      const left = pieces.get(row[k].pieceId)
      const right = pieces.get(row[k + 1].pieceId)
      if (!left || !right) throw new Error('a placement names a piece the plan does not carry')
      out.push({ left, right })
    }
  return out
}

/** Which lattice positions of a side a feature list sits at, so a tab and its socket can be matched up. */
const along = (features: readonly BackFeature[], axis: 0 | 1): number[] =>
  features
    .map((f) => {
      const ring = f.levels[0].ring
      let lo = Infinity
      let hi = -Infinity
      for (let i = axis; i < ring.length; i += 2) {
        lo = Math.min(lo, ring[i])
        hi = Math.max(hi, ring[i])
      }
      return Math.round(((lo + hi) / 2) * 100) / 100
    })
    .sort((a, b) => a - b)

// ---------------------------------------------------------------------------------------------------

describe('a tab is only ever cut where its socket is', () => {
  // Every kind of wall that makes a narrow piece at an end of a row, plus every border profile: a profile
  // that drops to the rim takes the top away at the edge of the wall, and no socket may sit under it, so the
  // pieces the layout must refuse a tab to are exactly the ones at a shaped edge.
  const PROFILES: PerimeterProfile[] = ['none', 'margin', 'chamfer', 'bullnose', 'ogee', 'frame']
  const ORIGINS: LayoutOrigin[] = ['corner', 'center', 'balanced']
  const OFFSETS: RowOffset[] = [0, 0.5, 0.3333]

  it('holds over every wall, border profile and bond that leaves a narrow piece at the end of a row', () => {
    const unmated: string[] = []
    for (const profile of PROFILES)
      for (const width of [8, 15, 25, 40])
        for (const surface of [400, 420, 445, 500, 560, 620, 700, 1000, 1180, 1205])
          for (const tile of [50, 100, 150])
            for (const origin of ORIGINS)
              for (const rowOffset of OFFSETS) {
                const config = design({
                  surface: { width: surface, height: 600 },
                  tile: { width: tile, height: tile, thickness: 6 },
                  perimeter: { profile, sides: sides(), width, drop: 2, fade: 0, land: 'valleys' },
                  layout: { origin, rowOffset },
                })
                for (const { left, right } of joints(config)) {
                  const tabs = pieceTabs(config, left)
                  if (tabs.length === 0) continue
                  const sockets = pieceSockets(config, right)
                  const want = along(tabs, 1)
                  const have = along(sockets, 1)
                  if (!want.every((y) => have.some((s) => Math.abs(s - y) < 0.01)))
                    unmated.push(`${profile} ${width}mm border, ${surface} wall of ${tile} tiles, ${origin}/${rowOffset}: ${left.id} -> ${right.id}`)
                }
              }
    expect([...new Set(unmated)]).toEqual([])
  })

  it('refuses the tab facing a narrow end cut whose own border profile leaves no room for a socket', () => {
    // The case that used to leave one: a 25 mm chamfer takes the top away 25 mm in from the wall's right
    // edge, so the 25 mm end cut can hold no socket however wide 11.7 mm alone says it is.
    const config = design({
      surface: { width: 400, height: 600 },
      tile: { width: 50, height: 50, thickness: 6 },
      perimeter: { profile: 'chamfer', sides: sides(), width: 25, drop: 2, fade: 0, land: 'valleys' },
      layout: { origin: 'center', rowOffset: 0 },
    })
    const ends = joints(config).filter(({ right }) => right.width < 30)
    expect(ends.length).toBeGreaterThan(0)
    for (const { left, right } of ends) {
      expect(pieceSockets(config, right)).toEqual([])
      expect(hasSide(left.edges.tabs, TAB_SIDE)).toBe(false)
      expect(pieceTabs(config, left)).toEqual([])
    }
    // The joints away from that edge keep their pair: the rule takes the tab away where it must, and nowhere else.
    const inner = joints(config).filter(({ right }) => right.width >= 30)
    expect(inner.some(({ left }) => pieceTabs(config, left).length > 0)).toBe(true)
  })

  it('cuts neither on the boundary of the wall, and puts each on its own side', () => {
    for (const profile of PROFILES)
      for (const surface of [445, 1205])
        for (const origin of ORIGINS) {
          const config = design({
            surface: { width: surface, height: 600 },
            tile: { width: 100, height: 100, thickness: 6 },
            perimeter: { profile, sides: sides(), width: 20, drop: 2, fade: 0, land: 'valleys' },
            layout: { origin, rowOffset: 0 },
          })
          for (const piece of computeLayout(layoutInputOf(config)).pieces) {
            for (const f of pieceTabs(config, piece)) {
              expect(f.side, piece.id).toBe(TAB_SIDE)
              expect(hasSide(piece.edges.boundary, TAB_SIDE), piece.id).toBe(false)
            }
            for (const f of pieceSockets(config, piece)) {
              expect(f.side, piece.id).toBe(SOCKET_SIDE)
              expect(hasSide(piece.edges.boundary, SOCKET_SIDE), piece.id).toBe(false)
            }
          }
        }
  })
})

describe('the mesher keeps its promise on every piece of a real tabbed wall', () => {
  // A wall whose last column is a cut too narrow for a socket, so it carries the five kinds of piece at once:
  // a whole tile with both the tab and the socket, a left-boundary piece with no socket, a right-boundary one
  // with no tab, the narrow cut, and (with the clips on) the same pieces carrying clip pockets as well.
  const WALL = { width: 1205, height: 600 }
  const TILE = { width: 150, height: 150, thickness: 6 }

  const wall = (over: Partial<DesignConfig> = {}) =>
    design({ surface: WALL, tile: TILE, layout: { origin: 'corner', rowOffset: 0 }, ...over })

  it('lays that wall out with all five kinds of piece', () => {
    const plan = computeLayout(layoutInputOf(wall()))
    const cut = plan.pieces.filter((p) => p.width < 11.7)
    expect(cut).toHaveLength(3)
    // The whole tile before the narrow cut is its own model, carrying no tab: "Full tile, no tab".
    expect(plan.pieces.some((p) => p.label === 'Full tile, no tab')).toBe(true)
    expect(plan.pieces.some((p) => hasSide(p.edges.tabs, TAB_SIDE))).toBe(true)
    for (const piece of plan.pieces) {
      if (hasSide(piece.edges.boundary, SOCKET_SIDE)) expect(pieceSockets(wall(), piece), piece.id).toEqual([])
      if (hasSide(piece.edges.boundary, TAB_SIDE)) expect(pieceTabs(wall(), piece), piece.id).toEqual([])
    }
  })

  for (const [name, config] of [
    ['glued', wall()],
    ['on clips', wall({ mount: 'clips' })],
  ] as const) {
    it(`builds a sound solid for every piece of it, ${name}`, () => {
      const field = createHeightField(config)
      const plan = computeLayout(layoutInputOf(config))
      let withPair = 0
      let withBoth = 0
      for (const piece of plan.pieces) {
        const features = pieceFeatures(config, piece)
        const pair = pieceTabs(config, piece).length > 0 && pieceSockets(config, piece).length > 0
        if (pair) withPair++
        if (pair && features.some((f) => f.role === 'clip-pocket')) withBoth++
        const mesh = buildPieceMesh(config, field, piece, { cellMm: 1.5 }, features)
        const check = checkMesh(mesh)
        expect(check.closed, `${piece.id}: closed`).toBe(true)
        expect(check.manifold, `${piece.id}: manifold`).toBe(true)
        expect(check.oriented, `${piece.id}: oriented`).toBe(true)
        expect(check.volume, `${piece.id}: volume`).toBeGreaterThan(0)
        expect(check.boundaryEdges, `${piece.id}: open edges`).toBe(0)
        expect(pinchedVertices(mesh), `${piece.id}: pinched vertices`).toBe(0)
        expect(componentCount(mesh), `${piece.id}: one body`).toBe(1)
        expect(meshVolume(mesh), `${piece.id}: volume by divergence`).toBeCloseTo(check.volume, 6)
        // Welding may not join two vertices the solid keeps apart: a tab's root meets the side wall exactly.
        expect(weldByPosition(mesh.positions).count, `${piece.id}: welded vertices`).toBeGreaterThan(0)
        // The tab adds no overhang at all: it grows off the bed and only ever narrows going up, where the
        // socket's ceiling and a clip pocket's are bridged. So the piece overhangs exactly as much without it.
        const noTab = buildPieceMesh(config, field, piece, { cellMm: 1.5 }, features.filter((f) => f.role !== 'join-tab'))
        expect(downwardArea(mesh, 0.01), `${piece.id}: the tab overhangs nothing`).toBeCloseTo(downwardArea(noTab, 0.01), 4)
        // The printed box runs past the tile's right side by the tab's reach, and past nothing else.
        let minX = Infinity
        let maxX = -Infinity
        for (let i = 0; i < mesh.positions.length; i += 3) {
          minX = Math.min(minX, mesh.positions[i])
          maxX = Math.max(maxX, mesh.positions[i])
        }
        expect(minX, `${piece.id}: left of the tile`).toBeCloseTo(0, 6)
        expect(maxX, `${piece.id}: right of the tile`).toBeCloseTo(piece.width + (pieceTabs(config, piece).length > 0 ? 8 : 0), 2)
      }
      expect(withPair, 'pieces carrying both a tab and a socket').toBeGreaterThan(0)
      // The clip pockets have to land on the same plate as the pair, which is the case KEY_CLEAR governs.
      expect(withBoth, 'pieces carrying the pair and clip pockets at once').toBe(name === 'on clips' ? withPair : 0)
    })
  }
})
