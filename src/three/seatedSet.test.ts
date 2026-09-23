import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/core/accent'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { accessoryParts } from '@/core/fixing/accessories'
import { keyGeometry, keyPockets } from '@/core/fixing/joins'
import { clipPockets } from '@/core/fixing/mount'
import { seatedParts, type SeatedPart } from '@/core/fixing/seated'
import type { AccessorySpec, BackFeature } from '@/core/fixing/types'
import { presetByHex } from '@/core/colors'
import { pointInRing } from '@/core/geometry/polygon'
import { tabLimits } from '@/core/fixing/capability'
import { computeLayout, layoutInputOf } from '@/core/layout'
import type { DesignConfig, LayoutPlan, MeshData, PieceSpec } from '@/core/types'
import { heroPiece } from '@/hooks/previewLod'
import { LOOK, partColor } from './look'
import {
  buildSeatedSet,
  meshBox,
  partMesh,
  seatBox,
  seatedExtent,
  seatedSetFor,
  tileViewLabel,
  turnXY,
  type PartBox,
  type PartSeat,
  type SeatedModel,
  type SeatedSources,
} from './seatedSet'

// The Back view draws the printed parts where the maker will press them: these pin the neutral they
// render in, the box maths that seats and turns them, and the grouping into one model per printed file.

// Vitest empties stylesheet imports, and the app project carries no node types, so fs is reached
// through the runtime and typed here for the one call this test makes (as src/styles/tokens.test.ts does).
interface NodeRuntime {
  process: {
    getBuiltinModule(id: 'node:fs'): {
      readFileSync(path: URL, encoding: 'utf8'): string
      readdirSync(path: URL, options: { recursive: true }): string[]
    }
  }
}
const fs = (globalThis as unknown as NodeRuntime).process.getBuiltinModule('node:fs')
const tokens = fs.readFileSync(new URL('../styles/_tokens.scss', import.meta.url), 'utf8')
const token = (name: string) => new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(tokens)?.[1].trim().toUpperCase()

describe('partColor', () => {
  it('is the interface ink and panel, token for token', () => {
    expect(LOOK.parts.ink).toBe(token('--ink'))
    expect(LOOK.parts.panel).toBe(token('--panel'))
  })

  it('draws ink on a light tile and the panel color on a dark one', () => {
    for (const light of ['#FFFFFF', '#EDEBE6', '#E8DCC0', '#F2C94C', '#9AD0C2']) expect(partColor(light), light).toBe(LOOK.parts.ink)
    for (const dark of ['#000000', '#1F1F1F', '#23395B', '#5B2333', '#2E4D2C']) expect(partColor(dark), dark).toBe(LOOK.parts.panel)
  })

  it('always stands out from the tile, at least 3:1 whatever its color', () => {
    const steps = [0, 51, 102, 153, 204, 255]
    for (const r of steps) {
      for (const g of steps) {
        for (const b of steps) {
          const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
          expect(contrastRatio(partColor(hex), hex), hex).toBeGreaterThanOrEqual(3)
        }
      }
    }
  })
})

/** A closed box from (x0, y0, 0) to (x1, y1, z1), enough for the box maths. */
function block(x0: number, y0: number, x1: number, y1: number, z1: number): MeshData {
  const positions = new Float32Array([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1])
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7])
  return { positions, indices, topIndexCount: 0 }
}

describe('seating maths', () => {
  it('measures a mesh box', () => {
    expect(meshBox(block(0, 0, 16, 12, 2.6))).toEqual({ minX: 0, maxX: 16, minY: 0, maxY: 12, minZ: 0, maxZ: expect.closeTo(2.6, 5) })
  })

  it('turns by exact quarter turns, counter-clockwise', () => {
    expect(turnXY(2, 1, 0)).toEqual([2, 1])
    expect(turnXY(2, 1, 1)).toEqual([-1, 2])
    expect(turnXY(2, 1, 2)).toEqual([-2, -1])
    expect(turnXY(2, 1, 3)).toEqual([1, -2])
    expect(Object.is(turnXY(0, 0, 2)[0], -0)).toBe(false)
  })

  it('centres a part on its seat, bottom at its z, sides swapped by a quarter turn', () => {
    const box: PartBox = { minX: 0, maxX: 16, minY: 0, maxY: 12, minZ: 0, maxZ: 2.6 }
    expect(seatBox(box, { x: 150, y: 37.5, z: 0.4, turns: 0 })).toEqual({ minX: 142, maxX: 158, minY: 31.5, maxY: 43.5, minZ: 0.4, maxZ: 3 })
    expect(seatBox(box, { x: 75, y: 0, z: 0.4, turns: 1 })).toEqual({ minX: 69, maxX: 81, minY: -8, maxY: 8, minZ: 0.4, maxZ: 3 })
    expect(seatBox(box, { x: 75, y: 0, z: 0.4, turns: 2 })).toEqual(seatBox(box, { x: 75, y: 0, z: 0.4, turns: 0 }))
  })

  it('boxes every seat of every model, and nothing when nothing is seated', () => {
    const box: PartBox = { minX: 0, maxX: 16, minY: 0, maxY: 12, minZ: 0, maxZ: 2.6 }
    const extent = seatedExtent([
      { box, seats: [{ x: 150, y: 75, z: 0.4, turns: 0 }, { x: 0, y: 75, z: 0.4, turns: 0 }] },
      { box: { ...box, maxZ: 2.4 }, seats: [{ x: 75, y: 40, z: -0.1, turns: 1 }] },
    ])
    expect(extent).toEqual({ minX: -8, maxX: 158, minY: 32, maxY: 81, minZ: -0.1, maxZ: 3 })
    expect(seatedExtent([])).toBeNull()
  })
})

const PIECE: PieceSpec = {
  id: 'full',
  mark: 'A',
  kind: 'full',
  label: 'Full tile',
  crop: { x0: 0, y0: 0, x1: 150, y1: 150 },
  width: 150,
  height: 150,
  count: 12,
  edges: { boundary: 0, tabs: 0, profiled: {} },
}

const spec = (id: string, kind: AccessorySpec['kind']): AccessorySpec => ({
  id,
  kind,
  mark: kind === 'key' ? 'K1' : 'C1',
  label: kind,
  count: 1,
  size: { x: 16, y: 12, z: 2.6 },
  printNote: '',
  group: kind === 'key' ? 'join' : 'mount',
  shape: {},
})

function sources(seated: SeatedPart[], specs: AccessorySpec[]): SeatedSources & { built: string[] } {
  const built: string[] = []
  return {
    built,
    seat: () => seated,
    parts: () => specs,
    mesh: (_config, part) => {
      built.push(part.id)
      return part.kind === 'key' ? block(0, 0, 16, 12, 2.2) : block(0, 0, 30, 10, 2.6)
    },
  }
}

describe('buildSeatedSet', () => {
  const plan = { pieces: [PIECE], placements: [] } as unknown as LayoutPlan

  it('groups the parts by printed model, building each mesh once', () => {
    const keys: SeatedPart[] = [
      { kind: 'key', accessoryId: 'key-a', x: 150, y: 37.5, z: 0.4, turns: 0 },
      { kind: 'key', accessoryId: 'key-a', x: 150, y: 112.5, z: 0.4, turns: 0 },
      { kind: 'key', accessoryId: 'key-a', x: 37.5, y: 0, z: 0.4, turns: 1 },
    ]
    const clips: SeatedPart[] = [{ kind: 'clip', accessoryId: 'clip-a', x: 75, y: 20, z: 0, turns: 0 }]
    const from = sources([...keys, ...clips], [spec('fit-1', 'fit-test'), spec('clip-a', 'clip'), spec('key-a', 'key')])
    const set = buildSeatedSet(DEFAULT_CONFIG, plan, PIECE, from)
    expect(set?.models.map((m) => [m.accessoryId, m.kind, m.seats.length])).toEqual([
      ['key-a', 'key', 3],
      ['clip-a', 'clip', 1],
    ])
    expect(from.built).toEqual(['key-a', 'clip-a'])
    expect(set?.keys).toBe(3)
    expect(set?.clips).toBe(1)
    expect(set?.extent).toMatchObject({ minX: 31.5, maxX: 158, minY: -8, minZ: 0 })
  })

  it('leaves out a part the download does not print, and is null with nothing left', () => {
    const seated: SeatedPart[] = [{ kind: 'key', accessoryId: 'key-gone', x: 150, y: 75, z: 0.4, turns: 0 }]
    expect(buildSeatedSet(DEFAULT_CONFIG, plan, PIECE, sources(seated, [spec('key-a', 'key')]))).toBeNull()
    expect(buildSeatedSet(DEFAULT_CONFIG, plan, PIECE, sources([], [spec('key-a', 'key')]))).toBeNull()
  })

  it('keys a set by what it seats, so the same parts in the same places read as the same set', () => {
    const seated: SeatedPart[] = [{ kind: 'key', accessoryId: 'key-a', x: 150, y: 75, z: 0.4, turns: 0 }]
    const a = buildSeatedSet(DEFAULT_CONFIG, plan, PIECE, sources(seated, [spec('key-a', 'key')]))
    const b = buildSeatedSet(DEFAULT_CONFIG, plan, PIECE, sources([...seated], [spec('key-a', 'key')]))
    const moved = buildSeatedSet(DEFAULT_CONFIG, plan, PIECE, sources([{ ...seated[0], y: 70 }], [spec('key-a', 'key')]))
    expect(a?.key).toBe(b?.key)
    expect(moved?.key).not.toBe(a?.key)
  })
})

/** A wall of whole 150 mm tiles with a gap between them on a 4 mm plate: the hero is an interior tile. */
function wall(over: Partial<DesignConfig> = {}): { config: DesignConfig; plan: LayoutPlan; hero: PieceSpec } {
  const config = normalizeConfig({
    ...DEFAULT_CONFIG,
    surface: { width: 600, height: 600 },
    tile: { width: 150, height: 150, thickness: 4 },
    joint: 2,
    lock: 'keys',
    ...over,
  })
  const plan = computeLayout(layoutInputOf(config))
  const hero = heroPiece(plan)
  if (!hero) throw new Error('no hero piece')
  return { config, plan, hero }
}

/** The bottom face of a seated part, as points of the tile frame: where it could meet the tile's own faces. */
function bottomPoints(model: SeatedModel, seat: PartSeat): [number, number][] {
  const p = model.mesh.positions
  const cx = (model.box.minX + model.box.maxX) / 2
  const cy = (model.box.minY + model.box.maxY) / 2
  const points: [number, number][] = []
  for (let i = 0; i + 2 < p.length; i += 3) {
    if (Math.abs(p[i + 2] - model.box.minZ) > 1e-4) continue
    const [x, y] = turnXY(p[i] - cx, p[i + 1] - cy, seat.turns)
    points.push([seat.x + x, seat.y + y])
  }
  return points
}

/** The feature whose cavity outline at the back holds (x, y). */
function featureAt(features: readonly BackFeature[], x: number, y: number): BackFeature | undefined {
  return features.find((f) => pointInRing(f.levels[0].ring, x, y) === 1)
}

describe('the keys in the back of tile A (real planners)', () => {
  it('seats a key in every notch, half in and half out past its side, clear of the notch walls', () => {
    const { config, plan, hero } = wall()
    const set = seatedSetFor(config, plan, hero)
    const notches = keyPockets(config, hero)
    const g = keyGeometry(config)
    const keyModel = set?.models.find((m) => m.kind === 'key')
    if (!set || !g || !keyModel) throw new Error('no keys seated')
    expect(set.keys).toBe(notches.length)
    expect(set.clips).toBe(0)
    for (const seat of keyModel.seats) {
      const box = seatBox(keyModel.box, seat)
      // Inside the notch depth: never proud of the back, never through the ceiling.
      expect(box.minZ).toBeGreaterThan(0)
      expect(box.maxZ).toBeLessThanOrEqual(g.depth + 1e-6)
      // Centred on the joint beyond one side: as far into the neighbour as into this tile.
      const across = [box.minX < 0 && box.maxX > 0, box.minX < hero.width && box.maxX > hero.width, box.minY < 0 && box.maxY > 0, box.minY < hero.height && box.maxY > hero.height]
      expect(across.filter(Boolean)).toHaveLength(1)
      const [cx, cy] = [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2]
      const joint = config.joint / 2
      const off = across[0] ? cx + joint : across[1] ? cx - hero.width - joint : across[2] ? cy + joint : cy - hero.height - joint
      expect(Math.abs(off)).toBeLessThan(1e-6)
      // The half in this tile sits inside its notch, clear of every wall: no face of it lies on a face of the tile.
      const inside = bottomPoints(keyModel, seat).filter(([x, y]) => x > 0 && x < hero.width && y > 0 && y < hero.height)
      expect(inside.length).toBeGreaterThan(0)
      const notch = featureAt(notches, inside[0][0], inside[0][1])
      expect(notch).toBeDefined()
      for (const [x, y] of inside) expect(pointInRing(notch!.levels[1].ring, x, y), `${x}, ${y}`).toBe(1)
    }
    // The turn has keys standing out past both sides to clear.
    expect(set.extent.maxX).toBeGreaterThan(hero.width + 5)
    expect(set.extent.minX).toBeLessThan(-5)
  })

  it('has nothing to seat on a glued wall with no keys', () => {
    const { config, plan, hero } = wall({ lock: 'none' })
    expect(seatedSetFor(config, plan, hero)).toBeNull()
  })

  // A tab is part of the tile, so it seats no printed part; but the turn to the Back view swings the tile
  // about its own width, and without the tab in the extent it swings the tab through the bench floor.
  it('seats nothing for a tab, and still lifts the turn clear of it', () => {
    const { config, plan, hero } = wall({ lock: 'tabs' })
    const reach = tabLimits(config)?.projection ?? 0
    expect(reach).toBeGreaterThan(0)
    expect(hero.edges.tabs).not.toBe(0)
    const set = seatedSetFor(config, plan, hero)
    if (!set) throw new Error('expected a set for the tab to turn with')
    // Nothing printed: no model, no key and no clip, and so nothing named in the view's label.
    expect(set.models).toEqual([])
    expect([set.keys, set.clips]).toEqual([0, 0])
    expect(tileViewLabel(config, hero, 'back', set)).not.toContain('in place')
    // The extent is the tile's own printed box: it reaches exactly the tab's tip and no further.
    expect(set.extent.maxX).toBeCloseTo(hero.width + reach, 6)
    expect(set.extent.minX).toBe(0)
    // With clips in the same tile the clips are seated as always, and the tab still sets the reach.
    const clipped = wall({ lock: 'tabs', mount: 'clips' })
    const both = seatedSetFor(clipped.config, clipped.plan, clipped.hero)
    expect(both?.clips).toBeGreaterThan(0)
    expect(both?.extent.maxX).toBeCloseTo(clipped.hero.width + reach, 6)
  })

  it('has nothing to turn for a piece the layout gave no tab', () => {
    // The right-hand column carries the socket and no tab, so its back holds nothing that stands out.
    const { config, plan } = wall({ lock: 'tabs' })
    const edge = plan.pieces.find((piece) => piece.edges.tabs === 0)
    if (!edge) throw new Error('expected a piece with no tab on a tabbed wall')
    expect(seatedSetFor(config, plan, edge)).toBeNull()
  })

  it('hands back the same set for a recolour or a rename', () => {
    const { config, plan, hero } = wall()
    const set = seatedSetFor(config, plan, hero)
    expect(seatedSetFor({ ...config, color: '#1F1F1F', name: 'Other' }, plan, hero)).toBe(set)
  })
})

describe('the clips in the back of tile A (real planners)', () => {
  for (const fit of ['snug', 'standard', 'loose'] as const) {
    it(`seats a clip in every pocket, its back inside the pocket mouth at the ${fit} fit`, () => {
      const { config, plan, hero } = wall({ mount: 'clips', lock: 'none', fit })
      const set = seatedSetFor(config, plan, hero)
      const pockets = clipPockets(config, hero)
      const clipModel = set?.models.find((m) => m.kind === 'clip')
      if (!set || !clipModel) throw new Error('no clips seated')
      expect(pockets.length).toBeGreaterThan(0)
      expect(set.clips).toBe(pockets.length)
      for (const seat of clipModel.seats) {
        const box = seatBox(clipModel.box, seat)
        const pocket = featureAt(pockets, seat.x, seat.y)
        if (!pocket) throw new Error(`no pocket under the clip at ${seat.x}, ${seat.y}`)
        // Level with the tile's back or just proud of it, and no taller than its pocket.
        expect(box.minZ).toBeLessThanOrEqual(1e-6)
        expect(box.minZ).toBeGreaterThan(-0.5)
        expect(box.maxZ).toBeLessThanOrEqual(pocket.levels[pocket.levels.length - 1].z1 + 1e-4)
        // Its back lies inside the pocket's mouth, so it never shares the plane of the tile's back.
        for (const [x, y] of bottomPoints(clipModel, seat)) expect(pointInRing(pocket.levels[0].ring, x, y), `${x}, ${y}`).toBe(1)
      }
    })
  }

  it('draws the parts the download prints, clips and keys together', () => {
    const { config, plan, hero } = wall({ mount: 'clips', lock: 'keys' })
    const set = seatedSetFor(config, plan, hero)
    const printed = new Set(accessoryParts(config, plan).map((part) => part.id))
    const seated = seatedParts(config, hero)
    expect(set?.models.map((m) => m.kind).sort()).toEqual(['clip', 'key'])
    expect(set?.keys).toBe(seated.filter((part) => part.kind === 'key').length)
    expect(set?.clips).toBe(seated.filter((part) => part.kind === 'clip').length)
    for (const model of set?.models ?? []) expect(printed.has(model.accessoryId), model.accessoryId).toBe(true)
  })
})

describe('the part mesher the Back view calls', () => {
  it('builds a clip and a key, and refuses a fit-test part rather than reaching the tile mesher', () => {
    const { config, plan } = wall({ mount: 'clips', lock: 'keys' })
    const parts = accessoryParts(config, plan)
    for (const kind of ['clip', 'key'] as const) {
      const part = parts.find((p) => p.kind === kind)
      if (!part) throw new Error(`no ${kind} to build`)
      const mesh = partMesh(config, part)
      expect(mesh.positions.length, kind).toBeGreaterThan(0)
      expect(mesh.indices.length % 3, kind).toBe(0)
    }
    const coupon = parts.find((p) => p.kind === 'fit-test')
    if (!coupon) throw new Error('no coupon in the parts list')
    expect(() => partMesh(config, coupon)).toThrow(/never seated/)
  })

  // The coupons are cut by the tile mesher, so a main-thread call to buildAccessoryMesh drags the whole
  // mesher (solid.ts, the height fields) into the bundle the studio downloads. It belongs to the worker.
  it('leaves every mesher out of the main thread: nothing outside the worker and core imports one', () => {
    const src = new URL('../', import.meta.url)
    const files = fs
      .readdirSync(src, { recursive: true })
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.startsWith('core/') && !f.startsWith('workers/'))
    expect(files.length).toBeGreaterThan(50)
    for (const file of files) {
      const text = fs.readFileSync(new URL(file, src), 'utf8')
      for (const statement of text.match(/^import[\s\S]*?from '[^']+'/gm) ?? []) {
        for (const mesher of ['buildPieceMesh', 'buildCouponMesh', 'buildAccessoryMesh']) {
          expect(statement.includes(mesher), `${file}: ${statement}`).toBe(false)
        }
        expect(/from '[^']*geometry\/solid'/.test(statement), `${file}: ${statement}`).toBe(false)
      }
    }
  })
})

describe('tileViewLabel', () => {
  const labelFor = (over: Partial<DesignConfig>, face: 'front' | 'back') => {
    const { config, plan, hero } = wall(over)
    return { label: tileViewLabel(config, hero, face, seatedSetFor(config, plan, hero)), config, hero }
  }

  it('names the whole tile the view shows, at its own size and color', () => {
    const { label, config } = labelFor({ lock: 'none' }, 'front')
    expect(label).toBe(`3D view of tile A, 150 × 150 mm, in ${presetByHex(config.color)?.name}`)
  })

  it('names a cut hero a piece, at the size it really is rather than the tile size', () => {
    // A 250 × 250 wall of 150 mm tiles on a 2 mm joint, balanced: every piece is a 124 mm cut.
    const { label, config } = labelFor({ surface: { width: 250, height: 250 }, layout: { origin: 'balanced', rowOffset: 0 }, mount: 'clips', lock: 'none' }, 'back')
    expect(label).toBe(`3D view of the back of piece A, 124 × 124 mm, in ${presetByHex(config.color)?.name}, with its 2 wall clips in place`)
    expect(label).not.toContain('150')
    expect(label).not.toContain('tile')
  })

  it('counts the parts on the back only, and falls back to the tile with no piece in hand', () => {
    const { config, plan, hero } = wall({ mount: 'clips', lock: 'keys' })
    const set = seatedSetFor(config, plan, hero)
    expect(tileViewLabel(config, hero, 'front', set)).not.toContain('in place')
    expect(tileViewLabel(config, hero, 'back', set)).toContain(`with its ${set?.keys} keys and ${set?.clips} wall clips in place`)
    expect(tileViewLabel(config, null, 'front', null)).toBe(`3D view of one 150 × 150 mm tile, in ${presetByHex(config.color)?.name}`)
  })
})
