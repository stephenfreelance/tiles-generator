import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config'
import { checkMesh, componentCount, downwardArea } from '../geometry/meshChecks'
import { pointInRing } from '../geometry/polygon'
import type { DesignConfig, MeshData } from '../types'
import { buildAccessoryMesh } from './accessories'
import { buildCouponMesh, FIT_ORDER, fitTestParts } from './fitTest'
import { keyGeometry, keyNotchAt } from './joins'
import { CLIP_CLEARANCE, POCKET_DEPTH } from './mechanism'
import { clipSpec } from './mount'
import { SOCKET_CLEARANCE, tabGeometry } from './tabs'

const design = (over: Partial<DesignConfig> = {}): DesignConfig => ({ ...structuredClone(DEFAULT_CONFIG), ...over })
const tabbed = (over: Partial<DesignConfig> = {}): DesignConfig => design({ lock: 'tabs', tile: { width: 150, height: 150, thickness: 4 }, ...over })

/** Where a coupon's key slot, socket or tab meets the side at `x`: the span of its vertices in the plate, across y. */
function slotOpening(mesh: MeshData, x: number, depth: number): [number, number] | null {
  const ys: number[] = []
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const [px, py, pz] = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]
    if (Math.abs(px - x) < 1e-4 && pz > 1e-4 && pz <= depth + 1e-4) ys.push(py)
  }
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null
}

/** The top of a coupon along its side at `x`: the highest vertex at each y (in µm). */
function rimAt(mesh: MeshData, x: number): Map<number, number> {
  const top = new Map<number, number>()
  for (let i = 0; i < mesh.positions.length; i += 3) {
    if (Math.abs(mesh.positions[i] - x) > 1e-4) continue
    const y = Math.round(mesh.positions[i + 1] * 1000)
    top.set(y, Math.max(top.get(y) ?? -Infinity, mesh.positions[i + 2]))
  }
  return top
}

describe('fit test', () => {
  it('is only printed when keys or clips are on, and the plate can hold their pockets', () => {
    expect(fitTestParts(DEFAULT_CONFIG)).toEqual([])
    expect(fitTestParts(design({ mount: 'clips', tile: { width: 150, height: 150, thickness: 3 } }))).toEqual([])
    expect(fitTestParts(design({ mount: 'clips' })).length).toBeGreaterThan(0)
    expect(fitTestParts(design({ lock: 'keys' })).length).toBeGreaterThan(0)
  })

  it('prints a coupon and a clip per fit class for clips, marked by one to three notches', () => {
    const parts = fitTestParts(design({ mount: 'clips' }))
    expect(parts.map((p) => [p.mark, p.kind])).toEqual([
      ['F1', 'fit-test'],
      ['F2', 'clip'],
      ['F3', 'clip'],
      ['F4', 'clip'],
    ])
    for (const p of parts) {
      expect(p.group).toBe('fit-test')
      expect(p.count).toBe(1)
    }
    const clips = parts.filter((p) => p.kind === 'clip')
    expect(clips.map((p) => p.shape.clearance)).toEqual(FIT_ORDER.map((fit) => CLIP_CLEARANCE[fit]))
    expect(clips.map((p) => p.shape.marks)).toEqual([1, 2, 3])
    expect(clips.map((p) => p.label)).toEqual(['Test clip 1, snug', 'Test clip 2, standard', 'Test clip 3, loose'])
    // The same clip as the wall's at that fit, but for its marks.
    expect(clips[1].id).toBe(clipSpec('standard', 2).id)
    expect(clips[1].size).toEqual(clipSpec('standard').size)
  })

  it('adds a second coupon and the three keys when keys are on too, and only those when clips are off', () => {
    const both = fitTestParts(design({ mount: 'clips', lock: 'keys' }))
    expect(both.map((p) => p.kind)).toEqual(['fit-test', 'fit-test', 'clip', 'clip', 'clip', 'key', 'key', 'key'])
    expect(both.map((p) => p.mark)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'])
    expect(both.slice(0, 2).map((p) => p.label)).toEqual(['Test coupon A with a clip pocket and a key slot', 'Test coupon B with the facing key slot'])
    expect(new Set(both.map((p) => p.id)).size).toBe(both.length)
    const keys = fitTestParts(design({ lock: 'keys' }))
    expect(keys.map((p) => p.kind)).toEqual(['fit-test', 'fit-test', 'key', 'key', 'key'])
    expect(keys.slice(0, 2).map((p) => p.label)).toEqual(['Test coupon A with a key slot', 'Test coupon B with the facing key slot'])
    expect(keys.every((p) => p.group === 'fit-test')).toBe(true)
    // Clips alone keep their one coupon.
    expect(fitTestParts(design({ mount: 'clips' }))[0].label).toBe('Test coupon with a clip pocket')
  })

  it('flags what each coupon holds in its shape, the keys the parts list draws it by (clip, key, mate)', () => {
    const [a, b] = fitTestParts(design({ mount: 'clips', lock: 'keys' }))
    expect(a.shape).toMatchObject({ clip: 1, key: 1 })
    expect(b.shape).toMatchObject({ clip: 0, key: 1, mate: 1 })
    expect(fitTestParts(design({ mount: 'clips' }))[0].shape).toMatchObject({ clip: 1, key: 0 })
    expect(fitTestParts(design({ lock: 'keys' }))[0].shape).toMatchObject({ clip: 0, key: 1 })
    for (const coupon of [a, b]) expect(Object.keys(coupon.shape)).not.toContain('snap')
  })

  it('tests only the fasteners the wall uses, and nothing when keys are asked for but cannot be cut', () => {
    const both = design({ mount: 'clips', lock: 'keys' })
    expect(fitTestParts(both, { clips: true, keys: false, tabs: false }).some((p) => p.kind === 'key' || p.shape.key === 1)).toBe(false)
    expect(fitTestParts(both, { clips: false, keys: true, tabs: false }).some((p) => p.kind === 'clip' || p.shape.clip === 1)).toBe(false)
    // A 3 mm edge between tiles leaves no room for a key slot on the 4 mm plate.
    expect(fitTestParts(design({ lock: 'keys', jointEdge: 'round', bevel: 3 }))).toEqual([])
  })

  it('grows coupon A round its clip pocket, and keeps the pocket and the key slot apart', () => {
    const [a] = fitTestParts(design({ mount: 'clips', lock: 'keys' }))
    // The whole pocket and its walls fit, with the notch beyond it.
    expect(a.size.x).toBeGreaterThan(52 + 3 + 8.4)
    expect(a.size.y).toBeGreaterThanOrEqual(16 + 6)
  })

  it('cuts the coupons with the real tile mesher: closed solids with their pocket and notch', () => {
    for (const config of [design({ mount: 'clips', lock: 'keys' }), design({ mount: 'clips', jointEdge: 'pillow', bevel: 2 }), design({ lock: 'keys' })]) {
      for (const coupon of fitTestParts(config).filter((p) => p.kind === 'fit-test')) {
        const mesh = buildCouponMesh(config, coupon)
        const check = checkMesh(mesh)
        expect(check.closed && check.manifold && check.oriented, coupon.id).toBe(true)
        expect(componentCount(mesh), coupon.id).toBe(1)
        // The pocket's ceiling (and the notch's) is a flat face looking down inside the plate.
        expect(downwardArea(mesh, 0.5), coupon.id).toBeGreaterThan(0)
        expect(buildAccessoryMesh(config, coupon).indices.length).toBe(mesh.indices.length)
      }
      // The coupon is printed face up like a tile: the pocket ceiling is below the plate's top.
      expect(POCKET_DEPTH).toBeLessThan(config.tile.thickness)
    }
  })

  it('butts coupon B against A: the same height, key slots facing at mid-height, the relief running on', () => {
    const configs = [design({ lock: 'keys' }), design({ mount: 'clips', lock: 'keys' }), design({ lock: 'keys', joint: 3, jointEdge: 'pillow', bevel: 1 })]
    for (const config of configs) {
      const [a, b] = fitTestParts(config)
      expect(b.size.y).toBe(a.size.y)
      expect(b.shape.x0).toBe(a.size.x)
      const meshA = buildCouponMesh(config, a)
      const meshB = buildCouponMesh(config, b)
      const depth = keyGeometry(config)?.depth ?? 0
      const slotA = slotOpening(meshA, a.size.x, depth)
      const slotB = slotOpening(meshB, 0, depth)
      expect(slotA).not.toBeNull()
      expect(slotB).not.toBeNull()
      const [a0, a1] = slotA as [number, number]
      const [b0, b1] = slotB as [number, number]
      expect(b0).toBeCloseTo(a0, 4)
      expect(b1).toBeCloseTo(a1, 4)
      expect((a0 + a1) / 2).toBeCloseTo(a.size.y / 2, 4)
      // B carries on A's relief: the tops meet at the butted sides like two tiles of the wall.
      const rimA = rimAt(meshA, a.size.x)
      const rimB = rimAt(meshB, 0)
      let shared = 0
      for (const [y, z] of rimA) {
        const other = rimB.get(y)
        if (other === undefined) continue
        shared++
        expect(other, `y ${y / 1000}`).toBeCloseTo(z, 3)
      }
      expect(shared).toBeGreaterThan(10)
    }
  })

  it('cuts the test keys for the butted coupons: each one seats across their slots whatever the wall joint', () => {
    for (const [joint, rowOffset] of [[0, 0], [0.5, 0], [2, 0], [2, 0.3333]] as const) {
      const config = design({ lock: 'keys', joint, layout: { ...DEFAULT_CONFIG.layout, rowOffset } })
      const parts = fitTestParts(config)
      const [a, b] = parts
      const keys = parts.filter((p) => p.kind === 'key')
      expect(keys).toHaveLength(3)
      const reach = keyGeometry(config)?.reach ?? 0
      // The slots at the depth a key sits in, coupon B butted against A's right side with the joint closed.
      const slotA = keyNotchAt(config, 1, a.size.y / 2, { width: a.size.x, height: a.size.y })?.levels[1].ring
      const slotB = keyNotchAt(config, 3, b.size.y / 2, { width: b.size.x, height: b.size.y })?.levels[1].ring
      if (!slotA || !slotB) throw new Error('no key slot on a coupon')
      const butted = slotB.map((v, i) => (i % 2 === 0 ? v + a.size.x : v))
      for (const key of keys) {
        const where = `${key.mark} at joint ${joint}, offset ${rowOffset}`
        expect(key.size.x, where).toBeCloseTo(2 * reach - 2 * Number(key.shape.clearance), 6)
        const mesh = buildAccessoryMesh(config, key)
        let seated = 0
        for (let i = 0; i < mesh.positions.length; i += 3) {
          if (mesh.positions[i + 2] !== 0) continue
          // The key's bottom outline, centred on the butt line and on the slots' mid-height.
          const x = mesh.positions[i] - key.size.x / 2 + a.size.x
          const y = mesh.positions[i + 1] - key.size.y / 2 + a.size.y / 2
          if (Math.abs(x - a.size.x) < 1e-9) continue
          expect(pointInRing(x < a.size.x ? slotA : butted, x, y), where).toBe(1)
          seated++
        }
        expect(seated, where).toBeGreaterThan(8)
      }
    }
  })

  it('refuses a coupon B spec that lost the numbers it butts by', () => {
    const config = design({ lock: 'keys' })
    const [, b] = fitTestParts(config)
    const { x0: _x0, ...shape } = b.shape
    expect(() => buildCouponMesh(config, { ...b, shape })).toThrow()
  })
})

// The tabs are the one fixing whose clearance ends up inside a tile, so the fit test has to end in a real
// choice made BEFORE the tiles are printed: coupon A carries the tab, and one coupon B per fit carries the
// socket it goes into. Nothing else is printed for them, which is why the tab flag cannot be read off a part.
describe('the fit test of the tabs', () => {
  it('prints coupon A with the tab and the socket at all three fits, marked one to three notches', () => {
    const parts = fitTestParts(tabbed())
    expect(parts.map((p) => [p.mark, p.kind])).toEqual([
      ['F1', 'fit-test'],
      ['F2', 'fit-test'],
      ['F3', 'fit-test'],
      ['F4', 'fit-test'],
    ])
    expect(parts.map((p) => p.label)).toEqual([
      'Test coupon A with a tab',
      'Test coupon B1 with the facing socket, snug',
      'Test coupon B2 with the facing socket, standard',
      'Test coupon B3 with the facing socket, loose',
    ])
    expect(parts[0].shape).toMatchObject({ clip: 0, key: 0, tab: 1 })
    expect(parts.slice(1).map((p) => p.shape.marks)).toEqual([1, 2, 3])
    expect(parts.slice(1).every((p) => p.shape.socket === 1 && p.shape.tab === 0)).toBe(true)
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length)
    for (const part of parts) {
      expect(part.group).toBe('fit-test')
      expect(part.count).toBe(1)
    }
  })

  it('butts every socket coupon against A at one size, whatever the fit the design is at', () => {
    for (const fit of FIT_ORDER) {
      const parts = fitTestParts(tabbed({ fit }))
      const [a, ...sockets] = parts
      for (const b of sockets) {
        expect(b.size.y, `${fit} ${b.mark}`).toBe(a.size.y)
        expect(b.size.x, `${fit} ${b.mark}`).toBe(sockets[0].size.x)
        expect(b.shape.x0, `${fit} ${b.mark}`).toBe(a.size.x)
      }
    }
  })

  it('numbers the marks in print order whatever else is printed, and keeps the clips out of a glued wall', () => {
    const glued = fitTestParts(tabbed()).map((p) => p.mark)
    expect(glued).toEqual(['F1', 'F2', 'F3', 'F4'])
    const clipped = fitTestParts(tabbed({ mount: 'clips' }))
    expect(clipped.map((p) => [p.mark, p.kind])).toEqual([
      ['F1', 'fit-test'],
      ['F2', 'fit-test'],
      ['F3', 'fit-test'],
      ['F4', 'fit-test'],
      ['F5', 'clip'],
      ['F6', 'clip'],
      ['F7', 'clip'],
    ])
    expect(clipped[0].label).toBe('Test coupon A with a clip pocket and a tab')
    expect(clipped[0].shape).toMatchObject({ clip: 1, key: 0, tab: 1 })
  })

  it('tests nothing when the tabs are asked for but cannot be cut', () => {
    expect(fitTestParts(tabbed({ tile: { width: 150, height: 150, thickness: 3 } }))).toEqual([])
    // A 1 mm edge between tiles leaves no room for a socket on the 4 mm plate.
    expect(fitTestParts(tabbed({ bevel: 1 }))).toEqual([])
    // A joint wider than the tab hides under: the tabs place nothing, so nothing is tested.
    expect(fitTestParts(tabbed({ joint: 3 }))).toEqual([])
    expect(fitTestParts(tabbed(), { clips: true, keys: true, tabs: false })).toEqual([])
  })

  it('cuts every coupon with the real tile mesher: the tab on A, the socket at its own fit on each B', () => {
    for (const config of [tabbed(), tabbed({ fit: 'loose' }), tabbed({ mount: 'clips' }), tabbed({ joint: 2 }), tabbed({ jointEdge: 'pillow', bevel: 0.8 })]) {
      const g = tabGeometry(config)
      if (!g) throw new Error('expected a tab section')
      for (const coupon of fitTestParts(config)) {
        if (coupon.kind !== 'fit-test') continue
        const where = `${coupon.id} at joint ${config.joint}, ${config.jointEdge}`
        const mesh = buildCouponMesh(config, coupon)
        const check = checkMesh(mesh)
        expect(check.closed && check.manifold && check.oriented, where).toBe(true)
        expect(componentCount(mesh), where).toBe(1)
        expect(buildAccessoryMesh(config, coupon).indices.length, where).toBe(mesh.indices.length)
        let minX = Infinity
        let maxX = -Infinity
        for (let i = 0; i < mesh.positions.length; i += 3) {
          minX = Math.min(minX, mesh.positions[i])
          maxX = Math.max(maxX, mesh.positions[i])
        }
        if (coupon.shape.tab === 1) {
          // A has no cavity of its own unless it carries a clip pocket: its tab stands out past its right side.
          expect(maxX, where).toBeCloseTo(coupon.size.x + g.reach, 2)
          expect(minX, where).toBe(0)
        } else {
          // Each B is a plain slab with the socket cut into its left side, so it has a ceiling to look down from.
          expect(maxX, where).toBeCloseTo(coupon.size.x, 2)
          expect(downwardArea(mesh, 0.5), where).toBeGreaterThan(0)
        }
      }
    }
  })

  it("opens A's tab and each socket on the line the two coupons butt along, at the same height", () => {
    const config = tabbed()
    const [a, ...sockets] = fitTestParts(config)
    const tab = slotOpening(buildCouponMesh(config, a), a.size.x, tabGeometry(config)?.thickness ?? 0)
    expect(tab).not.toBeNull()
    const [t0, t1] = tab as [number, number]
    expect((t0 + t1) / 2).toBeCloseTo(a.size.y / 2, 4)
    let last = 0
    for (const b of sockets) {
      const fit = FIT_ORDER[(b.shape.marks as number) - 1]
      const open = slotOpening(buildCouponMesh(config, b), 0, tabGeometry({ ...config, fit })?.depth ?? 0)
      expect(open, b.mark).not.toBeNull()
      const [b0, b1] = open as [number, number]
      expect((b0 + b1) / 2, b.mark).toBeCloseTo(a.size.y / 2, 4)
      // The socket swallows the tab with the clearance of its own fit, so each one is wider than the last.
      expect(b1 - b0, b.mark).toBeGreaterThan(t1 - t0)
      expect(b1 - b0, b.mark).toBeGreaterThan(last)
      last = b1 - b0
      expect(b1 - b0 - (t1 - t0), b.mark).toBeCloseTo(2 * SOCKET_CLEARANCE[fit], 2)
    }
  })

  it('refuses a socket coupon whose spec lost the fit it was cut at', () => {
    const config = tabbed()
    const [, b] = fitTestParts(config)
    const { marks: _marks, ...shape } = b.shape
    expect(() => buildCouponMesh(config, { ...b, shape })).toThrow()
    expect(() => buildCouponMesh(config, { ...b, shape: { ...b.shape, marks: 4 } })).toThrow()
  })
})
