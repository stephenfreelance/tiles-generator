import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '../config'
import { checkMesh, componentCount, meshVolume, pinchedVertices } from '../geometry/meshChecks'
import { ringBounds, ringSelfIntersects, signedArea } from '../geometry/polygon'
import { buildPieceMesh } from '../geometry/tileMesh'
import { createHeightField } from '../textures/registry'
import type { DesignConfig, FitClass, JointEdgeProfile, PieceEdges } from '../types'
import { fitClearance } from './accessories'
import { KEY_CLEAR, KEY_DEPTH_MIN, KEY_RECESS, TAB_JOINT_MAX, TAB_MIN_DEPTH, tabDepth } from './capability'
import { pieceFeatures } from './features'
import { keyGeometry, notchOutline, type PieceShape } from './joins'
import { POCKET_HALF_SHORT } from './mechanism'
import type { BackFeature } from './types'
import {
  BACK_MISMATCH,
  MIN_ENGAGEMENT,
  MIN_SHOULDER,
  pieceSockets,
  pieceTabs,
  SOCKET_CLEARANCE,
  SOCKET_CLEARANCE_RANGE,
  SOCKET_SIDE,
  TAB_BELOW_RIM,
  TAB_DEPTH_STACK,
  tabChecks,
  tabFeatures,
  tabGeometry,
  tabOutline,
  TAB_SIDE,
  type TabGeometry,
} from './tabs'

// The tab and its socket are one designed section, so these pin the whole of it: that the socket really is
// the tab's offset curve (which is what makes one ring function serve both), that the tab is thinner than the
// socket is deep (the one failure that would ruin the feature), the margins over every fit class, and which
// of the pair each piece carries. Nothing here claims a force, a hold or a time: nothing has been printed.

const FITS: FitClass[] = ['snug', 'standard', 'loose']
const JOINT_EDGES: JointEdgeProfile[] = ['square', 'chamfer', 'round', 'pillow']

const design = (over: Partial<DesignConfig> = {}): DesignConfig => normalizeConfig({ ...DEFAULT_CONFIG, lock: 'tabs', ...over })
const tile = (over: Partial<DesignConfig['tile']> = {}) => ({ ...DEFAULT_CONFIG.tile, ...over })
const square = (size: number, thickness = 4) => ({ width: size, height: size, thickness })

const geometryOf = (config: DesignConfig): TabGeometry => {
  const g = tabGeometry(config)
  if (!g) throw new Error('expected a tab section')
  return g
}

const edges = (over: Partial<PieceEdges> = {}): PieceEdges => ({ boundary: 0, tabs: 0, profiled: {}, ...over })

/** A whole interior tile of the design, with whatever edges the case is about. */
const wholeTile = (config: DesignConfig, over: Partial<PieceEdges> = {}): PieceShape => ({
  crop: { x0: 0, y0: 0, x1: config.tile.width, y1: config.tile.height },
  width: config.tile.width,
  height: config.tile.height,
  edges: edges(over),
})

/** A piece cut to `width` off the left of the tile, so its right side is a cut and its left one is not. */
const leftStrip = (config: DesignConfig, width: number, over: Partial<PieceEdges> = {}): PieceShape => ({
  crop: { x0: 0, y0: 0, x1: width, y1: config.tile.height },
  width,
  height: config.tile.height,
  edges: edges(over),
})

const topOf = (feature: { levels: { z1: number }[] }) => feature.levels[feature.levels.length - 1].z1

/** Where each of a piece's features sits along its side: the middle of its outline across the side line. */
const centres = (features: readonly BackFeature[]): number[] =>
  features
    .map((f) => {
      const b = ringBounds(f.levels[0].ring)
      return Math.round(((b.minY + b.maxY) / 2) * 100) / 100
    })
    .sort((a, b) => a - b)

// ---------------------------------------------------------------------------------------------------

describe('the socket is the tab, offset', () => {
  it('puts every vertex of the socket exactly the clearance out from the tab, fillets included', () => {
    for (const fit of FITS) {
      const key = keyGeometry(design({ fit }))
      if (!key) throw new Error('expected a key section')
      const nominal = notchOutline(key, 0)
      const grown = notchOutline(key, SOCKET_CLEARANCE[fit])
      // Same corner list and the same fillet segments, so the two rings pair off vertex for vertex; each
      // filleted arc keeps its centre and changes only its radius, which is what an offset curve is.
      expect(grown).toHaveLength(nominal.length)
      for (let k = 0; k < nominal.length; k += 2) {
        const gap = Math.hypot(grown[k] - nominal[k], grown[k + 1] - nominal[k + 1])
        expect(gap, `${fit} vertex ${k / 2}`).toBeCloseTo(SOCKET_CLEARANCE[fit], 10)
      }
    }
  })

  it('caps the mouth chamfer so the mouth ring lofts onto the body ring at every fit', () => {
    for (const fit of FITS) {
      const g = geometryOf(design({ fit }))
      const key = keyGeometry(design({ fit }))
      if (!key) throw new Error('expected a key section')
      // The mouth is the body grown AGAIN, so at the loosest fit the nominal 0.4 mm would take the shoulder
      // fillet past zero, the ring would lose its arc and the two could not loft: hence the cap.
      expect(tabChecks(g).clearances.mouthFilletNotInverted, fit).toBeGreaterThanOrEqual(0)
      expect(notchOutline(key, g.clearance + g.mouthGrow), fit).toHaveLength(notchOutline(key, g.clearance).length)
      expect(g.mouthGrow, fit).toBeLessThanOrEqual(g.mouth)
      // Only the loosest fit gives anything up, and the body ring that carries the fit never moves.
      expect(g.mouthGrow, fit).toBe(fit === 'loose' ? 0.25 : g.mouth)
    }
  })

  it('never inverts the reentrant shoulder, even at the loosest fit', () => {
    for (const fit of FITS) {
      const g = geometryOf(design({ fit }))
      // The shoulder fillet shrinks by the clearance as the chamber grows: at 0 the ring folds back on itself.
      expect(tabChecks(g).clearances.filletNotInverted, fit).toBeGreaterThan(0)
      expect(g.shoulderFillet - SOCKET_CLEARANCE_RANGE[1]).toBeCloseTo(0.35, 10)
      const key = keyGeometry(design({ fit }))
      if (!key) throw new Error('expected a key section')
      for (const grow of [SOCKET_CLEARANCE[fit], SOCKET_CLEARANCE[fit] + key.mouth]) {
        const ring = Float64Array.from(notchOutline(key, grow))
        expect(ringSelfIntersects(ring), `${fit} grown by ${grow}`).toBe(false)
        expect(signedArea(ring)).toBeGreaterThan(0)
      }
    }
  })

  it('takes twice the clearance of a loose printed key at Standard, because both halves carry the error', () => {
    expect(SOCKET_CLEARANCE.standard).toBeCloseTo(2 * fitClearance('loose', 'key'), 10)
    expect(SOCKET_CLEARANCE_RANGE).toEqual([0.15, 0.45])
  })
})

describe("the tab's outline", () => {
  it('stands wholly beyond its side line, rooted on it, wound the other way from a notch', () => {
    for (const joint of [0, 1, 2]) {
      const config = design({ joint })
      const key = keyGeometry(config)
      const g = geometryOf(config)
      if (!key) throw new Error('expected a key section')
      const points = tabOutline(key, joint)
      const ts: number[] = []
      const roots: number[] = []
      for (let k = 0; k < points.length; k += 2) {
        ts.push(points[k + 1])
        if (points[k + 1] === 0) roots.push(k / 2)
      }
      // Exactly one edge on the side line: the tab's root, the two corners of the throat's mouth.
      expect(roots, `joint ${joint}`).toHaveLength(2)
      expect(roots[1] - roots[0]).toBe(1)
      // Counter-clockwise around the material, the root edge runs the opposite way along the side from a
      // cavity's opening: s falls where a notch's rises. That sign is what tells the mesher the two apart.
      expect(points[2 * roots[0]]).toBeGreaterThan(points[2 * roots[1]])
      // Everything else is out past the line, and the furthest point out is the tab's whole reach.
      expect(ts.filter((t) => t !== 0).every((t) => t < 0)).toBe(true)
      expect(-Math.min(...ts)).toBeCloseTo(g.reach, 10)
      expect(g.reach).toBeCloseTo(joint + key.reach, 10)
      expect(g.neck).toBeCloseTo(joint + key.neck, 10)
      // Along the side it is the key's own head: nothing wider ever crosses the joint.
      const ss = points.filter((_, k) => k % 2 === 0)
      expect(Math.max(...ss) - Math.min(...ss)).toBeCloseTo(key.headWidth, 10)
    }
  })

  it('places the tab on the right side of the piece, counter-clockwise, rooted on x = width', () => {
    const config = design()
    const piece = wholeTile(config, { tabs: 1 << TAB_SIDE })
    const tabs = pieceTabs(config, piece)
    const g = geometryOf(config)
    expect(tabs).not.toHaveLength(0)
    for (const tab of tabs) {
      expect(tab.role).toBe('join-tab')
      expect(tab.side).toBe(TAB_SIDE)
      expect(tab.outward).toBe(true)
      const ring = tab.levels[0].ring
      expect(signedArea(ring)).toBeGreaterThan(0)
      const b = ringBounds(ring)
      expect(b.minX).toBeCloseTo(piece.width, 10)
      expect(b.maxX).toBeCloseTo(piece.width + g.reach, 10)
      expect(b.minY).toBeGreaterThanOrEqual(g.margin)
      expect(b.maxY).toBeLessThanOrEqual(piece.height - g.margin)
    }
  })
})

describe('the tab is thinner than its socket is deep', () => {
  it('leaves KEY_RECESS of air under the ceiling on every plate and joint edge that takes a socket', () => {
    let found = 0
    for (const thickness of [4, 4.4, 5, 6, 8, 12]) {
      for (const jointEdge of JOINT_EDGES) {
        for (const bevel of [0, 0.5, 0.8, 1.5, 3]) {
          const config = design({ tile: tile({ thickness }), jointEdge, bevel })
          const g = tabGeometry(config)
          if (!g) continue
          found++
          const label = `${thickness} ${jointEdge} ${bevel}`
          expect(g.depth - g.thickness, label).toBeCloseTo(KEY_RECESS, 10)
          // The one failure that would ruin the feature: a tab as tall as its socket is deep bottoms out on
          // the socket's own bridged ceiling and stands its neighbour off the wall, every tile after the first.
          expect(tabChecks(g).ceilingRoom, label).toBeGreaterThan(0)
          expect(tabChecks(g).ceilingRoom, label).toBeCloseTo(KEY_RECESS - BACK_MISMATCH, 10)
        }
      }
    }
    expect(found).toBeGreaterThan(20)
  })

  it('builds the tab lower than the socket it goes into, feature for feature', () => {
    for (const thickness of [4, 6, 12]) {
      const config = design({ tile: tile({ thickness }) })
      const piece = wholeTile(config, { tabs: 1 << TAB_SIDE })
      const [tab] = pieceTabs(config, piece)
      const [socket] = pieceSockets(config, piece)
      expect(socket.role).toBe('join-socket')
      expect(socket.outward).toBeUndefined()
      expect(topOf(socket) - topOf(tab), `${thickness} mm plate`).toBeCloseTo(KEY_RECESS, 10)
      // Two neighbours' backs may sit this far apart: the air under the ceiling has to cover it.
      expect(topOf(socket) - topOf(tab)).toBeGreaterThan(BACK_MISMATCH)
      // And the socket's ceiling stays inside the plate, so the front of the tile never opens.
      expect(topOf(socket)).toBeLessThan(thickness)
    }
  })

  it('derives its own least depth from that stack, and needs more plate than a key does', () => {
    expect(TAB_DEPTH_STACK.reduce((sum, v) => sum + v, 0)).toBeCloseTo(TAB_MIN_DEPTH, 10)
    // At the least depth the tab is exactly the floor a printed key is held to.
    const atFloor = geometryOf(design({ bevel: 0.8 }))
    expect(atFloor.depth).toBeCloseTo(TAB_MIN_DEPTH, 10)
    expect(atFloor.thickness).toBeCloseTo(KEY_DEPTH_MIN, 10)
    expect(tabChecks(atFloor).engagement).toBeCloseTo(MIN_ENGAGEMENT, 10)
    // A 1 mm edge between tiles leaves a key its 1.4 mm notch but not a tab its 1.6 mm socket.
    const thin = design({ bevel: 1 })
    expect(tabDepth(thin)).toBeNull()
    expect(geometryOf(design({ bevel: 0.8 })).thickness).toBeGreaterThanOrEqual(KEY_DEPTH_MIN)
  })
})

describe('tabChecks', () => {
  /** Designs a maker can really reach with the tabs on: every plate, every joint they may cross, tiles from the default up. */
  const DESIGNS: { name: string; over: Partial<DesignConfig> }[] = [
    { name: 'the default wall', over: {} },
    { name: 'the thinnest plate that takes a socket', over: { bevel: 0.8 } },
    { name: 'the Sturdy plate', over: { tile: tile({ thickness: 6 }) } },
    { name: 'a 12 mm plate', over: { tile: tile({ thickness: 12 }) } },
    { name: 'a 1 mm joint', over: { joint: 1 } },
    { name: 'the widest joint a tab may cross', over: { joint: TAB_JOINT_MAX } },
    { name: 'a square joint edge', over: { jointEdge: 'square', bevel: 0 } },
    { name: 'a 240 mm tile', over: { tile: square(240), surface: { width: 1200, height: 960 } } },
    { name: 'a 300 x 250 tile', over: { tile: { width: 300, height: 250, thickness: 6 }, surface: { width: 1200, height: 1000 } } },
    { name: 'on clips', over: { mount: 'clips' } },
  ]
  const GRID = DESIGNS.flatMap(({ name, over }) => FITS.map((fit) => [name, fit, over] as const))

  it.each(GRID)('holds every margin of the pair, with room to spare (%s, %s fit)', (name, fit, over) => {
    const k = tabChecks(geometryOf(design({ ...over, fit })))
    expect(k.engagement, `${name}: engagement`).toBeGreaterThanOrEqual(MIN_ENGAGEMENT)
    expect(k.ceilingRoom, `${name}: ceiling room`).toBeGreaterThan(0)
    expect(k.shoulder, `${name}: shoulder`).toBeGreaterThanOrEqual(MIN_SHOULDER)
    expect(k.jointPlay, `${name}: joint play`).toBe(SOCKET_CLEARANCE[fit])
    expect(k.socketWall, `${name}: socket wall`).toBeGreaterThanOrEqual(3)
    expect(k.cornerClear, `${name}: corner clear`).toBeGreaterThan(2.5)
    expect(k.clipBandClear, `${name}: clip band clear`).toBeGreaterThan(0)
    expect(k.rimOverTab, `${name}: rim over tab`).toBeGreaterThanOrEqual(TAB_BELOW_RIM)
    expect(k.tabThickness, `${name}: tab thickness`).toBeGreaterThanOrEqual(KEY_DEPTH_MIN)
    for (const [what, value] of Object.entries(k.clearances)) {
      expect(value, `${name}: ${what}`).toBeGreaterThanOrEqual(0)
    }
    expect(k.clearances.filletNotInverted, `${name}: fillet not inverted`).toBeGreaterThan(0)
    expect(k.clearances.throatStep, `${name}: throat step`).toBeGreaterThan(0)
    expect(k.clearances.tabPastMouth, `${name}: tab past mouth`).toBeGreaterThan(0)
  })

  it('reports the worst case of each margin over that grid, so a change to one of them shows here', () => {
    const all = GRID.map(([, fit, over]) => tabChecks(geometryOf(design({ ...over, fit }))))
    const worst = (pick: (k: (typeof all)[number]) => number) => Math.min(...all.map(pick))
    // Engagement is the boundary by construction: TAB_MIN_DEPTH is the stack that leaves exactly one.
    expect(worst((k) => k.engagement)).toBeCloseTo(MIN_ENGAGEMENT, 10)
    expect(worst((k) => k.shoulder)).toBeCloseTo(3 - SOCKET_CLEARANCE_RANGE[1], 10)
    expect(worst((k) => k.ceilingRoom)).toBeCloseTo(KEY_RECESS - BACK_MISMATCH, 10)
    expect(worst((k) => k.socketWall)).toBeCloseTo(3, 10)
    expect(worst((k) => k.rimOverTab)).toBeCloseTo(TAB_BELOW_RIM, 10)
  })

  it('holds every margin but the clip band on the small tiles, where the head narrows to 8 mm', () => {
    for (const size of [20, 40, 60, 70]) {
      for (const fit of FITS) {
        const g = geometryOf(design({ tile: square(size), surface: { width: size * 8, height: size * 4 }, fit }))
        const k = tabChecks(g)
        const label = `${size} mm, ${fit}`
        expect(k.engagement, label).toBeGreaterThanOrEqual(MIN_ENGAGEMENT)
        expect(k.shoulder, label).toBeGreaterThanOrEqual(MIN_SHOULDER)
        expect(k.cornerClear, label).toBeGreaterThan(2.5)
        expect(k.clearances.throatStep, label).toBeGreaterThan(0)
        expect(k.clearances.filletNotInverted, label).toBeGreaterThan(0)
      }
    }
    // The 20 mm tile is where the head is at its narrowest, so it is where the shoulder is tightest.
    expect(geometryOf(design({ tile: square(20), surface: { width: 200, height: 200 } })).headWidth).toBe(8)
  })

  it('records where a socket reaches into the clip band, which is the clip search to answer, not the section', () => {
    // Below about 110 mm the lattice puts a socket within KEY_CLEAR of the horizontal band's pocket, and the
    // clip has to move along its band, exactly as it already does for a key notch. mount.ts owns that: its
    // clip search must take the sockets in beside keyPockets, or a 100 mm tile leaves a wall of a few tenths
    // of a millimetre between the two. Nothing here can place the clip, so this records the window instead.
    const clipBandClear = (size: number) =>
      tabChecks(geometryOf(design({ tile: square(size), surface: { width: size * 8, height: size * 4 }, mount: 'clips' }))).clipBandClear
    expect(clipBandClear(150)).toBeGreaterThan(KEY_CLEAR)
    expect(clipBandClear(70)).toBeGreaterThan(0)
    expect(clipBandClear(100)).toBeLessThan(0)
    expect(clipBandClear(80)).toBeLessThan(0)
    // And the mesher will not catch it: the two do not touch, so it builds the thin wall without a word.
    const config = design({ tile: square(100), surface: { width: 800, height: 400 }, mount: 'clips' })
    const piece = { ...wholeTile(config, { tabs: 1 << TAB_SIDE }), id: 'full', mark: 'A', kind: 'full' as const, label: 'Full tile', count: 1 }
    const mesh = buildPieceMesh(config, createHeightField(config), piece, { cellMm: 1.2 }, pieceFeatures(config, piece))
    expect(checkMesh(mesh).closed).toBe(true)
    // The band itself never moves for the tabs: nothing of theirs crosses a row joint.
    const glued = design({ tile: square(100), surface: { width: 800, height: 400 } })
    expect(geometryOf({ ...glued, mount: 'clips' }).clipBand).toBe(geometryOf({ ...glued, lock: 'none', mount: 'clips' }).clipBand)
    expect(geometryOf(glued).clipBand).toBeCloseTo(10.1, 10)
    expect(POCKET_HALF_SHORT).toBeCloseTo(8.01, 2)
  })
})

describe('which of the pair a piece carries', () => {
  it('cuts nothing at all unless the tabs are asked for and can be cut', () => {
    for (const over of [
      { lock: 'none' as const } as Partial<DesignConfig>,
      { lock: 'keys' as const },
      { tile: tile({ thickness: 3 }) },
      { bevel: 1 },
      { joint: TAB_JOINT_MAX + 0.2 },
    ]) {
      const config = normalizeConfig({ ...DEFAULT_CONFIG, lock: 'tabs', ...over })
      const piece = wholeTile(config, { tabs: 1 << TAB_SIDE })
      expect(tabFeatures(config, piece), JSON.stringify(over)).toEqual([])
    }
  })

  it('puts a tab and a socket at every lattice position, the tab right and the socket left', () => {
    const config = design()
    const g = geometryOf(config)
    const piece = wholeTile(config, { tabs: 1 << TAB_SIDE })
    const tabs = pieceTabs(config, piece)
    const sockets = pieceSockets(config, piece)
    expect(tabs).toHaveLength(g.lattice.length)
    expect(sockets).toHaveLength(g.lattice.length)
    expect(tabFeatures(config, piece)).toEqual([...tabs, ...sockets])
    for (const socket of sockets) expect(socket.side).toBe(SOCKET_SIDE)
    // The two ends of a joint ask the same question, so a tab lands where the neighbour's socket is: both
    // are centred on the same lattice position along their side.
    expect(centres(tabs)).toEqual(centres(sockets))
    expect(centres(sockets)).toEqual(g.lattice)
  })

  it('cuts no tab where the layout has not found a neighbour for it', () => {
    const config = design()
    expect(pieceTabs(config, wholeTile(config))).toEqual([])
    // An empty socket is harmless at the back of a tile, so it is cut whatever the neighbour does.
    expect(pieceSockets(config, wholeTile(config))).not.toHaveLength(0)
  })

  it('keeps both off the boundary of the wall and off a cut side', () => {
    const config = design()
    const bit = (side: number) => 1 << side
    // A piece on the right edge of the wall carries no tab even if the layout asked for one.
    expect(pieceTabs(config, wholeTile(config, { tabs: bit(TAB_SIDE), boundary: bit(TAB_SIDE) }))).toEqual([])
    // A piece on the left edge carries no socket: there is no tile beside it to put one in.
    expect(pieceSockets(config, wholeTile(config, { boundary: bit(SOCKET_SIDE) }))).toEqual([])
    // A cut only ever falls on the surface edge, and a cut side takes neither.
    const cut = leftStrip(config, 100, { tabs: bit(TAB_SIDE) })
    expect(pieceTabs(config, cut)).toEqual([])
    expect(pieceSockets(config, cut)).not.toHaveLength(0)
  })

  it('needs the neighbour to be as wide as the socket ring asks, and no wider', () => {
    const config = design()
    const g = geometryOf(config)
    expect(g.minWidth).toBeCloseTo(11.7, 10)
    // Derived from the ring: the widest fit's mouth outline, plus the wall the notch margin keeps beyond it.
    expect(g.minWidth).toBeCloseTo(g.margin + g.socketReachMax, 10)
    expect(g.socketReachMax).toBeGreaterThanOrEqual(g.socketReach)
    const strip = (width: number) => ({ ...leftStrip(config, config.tile.width, {}), width, crop: { x0: 0, y0: 0, x1: config.tile.width, y1: config.tile.height } })
    expect(pieceSockets(config, strip(g.minWidth))).not.toHaveLength(0)
    expect(pieceSockets(config, strip(g.minWidth - 0.1))).toEqual([])
  })

  it('never moves a socket when the fit changes: only the ring inside it', () => {
    const config = design()
    const piece = wholeTile(config, { tabs: 1 << TAB_SIDE })
    const places = (fit: FitClass) => centres(pieceSockets({ ...config, fit }, piece))
    expect(places('snug')).toEqual(places('loose'))
    expect(places('standard')).toEqual(places('loose'))
    const area = (fit: FitClass) => Math.abs(signedArea(pieceSockets({ ...config, fit }, piece)[0].levels[1].ring))
    expect(area('snug')).toBeLessThan(area('standard'))
    expect(area('standard')).toBeLessThan(area('loose'))
  })

  it('cuts neither under a border profile that drops to the rim', () => {
    const config = design({ perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'bullnose', width: 12, drop: 4, land: 'cut' } })
    const within = { tabs: 1 << TAB_SIDE, profiled: { right: 0, left: 0 } }
    expect(pieceTabs(config, wholeTile(config, within))).toEqual([])
    expect(pieceSockets(config, wholeTile(config, within))).toEqual([])
    // A flat margin never goes below the plate, so it takes both.
    const flat = design({ perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'margin', width: 12, drop: 0, land: 'valleys' } })
    expect(pieceTabs(flat, wholeTile(flat, within))).not.toHaveLength(0)
    expect(pieceSockets(flat, wholeTile(flat, within))).not.toHaveLength(0)
  })

  it('gives two readings of one piece the same features', () => {
    const config = design({ mount: 'clips' })
    const piece = wholeTile(config, { tabs: 1 << TAB_SIDE })
    expect(pieceFeatures(config, { ...piece, crop: { ...piece.crop }, edges: structuredClone(piece.edges) })).toEqual(
      pieceFeatures(config, piece),
    )
  })
})

describe('the mesher takes the pair', () => {
  it('builds a sound tile at every fit, the loosest socket included', () => {
    for (const fit of FITS) {
      const config = design({ fit })
      const piece = { ...wholeTile(config, { tabs: 1 << TAB_SIDE }), id: 'full', mark: 'A', kind: 'full' as const, label: 'Full tile', count: 1 }
      const mesh = buildPieceMesh(config, createHeightField(config), piece, { cellMm: 1.2 }, pieceFeatures(config, piece))
      const check = checkMesh(mesh)
      expect(check.closed && check.manifold && check.oriented, fit).toBe(true)
      expect(pinchedVertices(mesh), fit).toBe(0)
      expect(componentCount(mesh), fit).toBe(1)
    }
  })

  it('builds a sound tile with a tab standing out of it and a socket cut into it', () => {
    const config = design()
    const piece = { ...wholeTile(config, { tabs: 1 << TAB_SIDE }), id: 'full', mark: 'A', kind: 'full' as const, label: 'Full tile', count: 1 }
    const field = createHeightField(config)
    const features = pieceFeatures(config, piece)
    expect(features).toHaveLength(4)
    const mesh = buildPieceMesh(config, field, piece, { cellMm: 1.2 }, features)
    const plain = buildPieceMesh(config, field, piece, { cellMm: 1.2 }, [])
    const check = checkMesh(mesh)
    expect(check.closed).toBe(true)
    expect(check.manifold).toBe(true)
    expect(check.oriented).toBe(true)
    expect(check.volume).toBeGreaterThan(0)
    expect(pinchedVertices(mesh)).toBe(0)
    expect(componentCount(mesh)).toBe(1)
    // The top surface is untouched: the tile is the same from the front.
    expect(mesh.topIndexCount).toBe(plain.topIndexCount)
    expect(mesh.indices.subarray(0, mesh.topIndexCount)).toEqual(plain.indices.subarray(0, plain.topIndexCount))
    // The printed box is the tab's reach wider than the tile, and nothing stands past the other side.
    const g = geometryOf(config)
    let maxX = -Infinity
    let minX = Infinity
    for (let i = 0; i < mesh.positions.length; i += 3) {
      maxX = Math.max(maxX, mesh.positions[i])
      minX = Math.min(minX, mesh.positions[i])
    }
    expect(maxX).toBeCloseTo(piece.width + g.reach, 2)
    expect(minX).toBe(0)
    // A tab adds its own volume and a socket takes its own away, both small against the tile.
    expect(Math.abs(meshVolume(mesh) - meshVolume(plain))).toBeLessThan(0.01 * meshVolume(plain))
  })
})
