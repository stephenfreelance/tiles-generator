import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import { pieceFeatures } from '@/core/fixing/features'
import { keyGeometry, keyPockets } from '@/core/fixing/joins'
import { CLIP_CLEARANCE, clipPlan, COUNTERSINK, DRILL_HOLE } from '@/core/fixing/mechanism'
import { clipPockets } from '@/core/fixing/mount'
import { seatedParts } from '@/core/fixing/seated'
import { tabLimits } from '@/core/fixing/capability'
import { computeLayout, layoutInputOf } from '@/core/layout'
import type { BackFeature, BackFeatureLevel } from '@/core/fixing/types'
import type { DesignConfig, PieceSpec, Side } from '@/core/types'
import {
  acrossJoint,
  chooseFeature,
  FIGURE,
  keyAcross,
  tileBackLayout,
  type SeatedLike,
  type TileBackInput,
} from './tileBackGeometry'

type Point = [number, number]

/** The corners of a path made of M and L commands (the first subpath only: holes follow a second M). */
function points(path: string): Point[] {
  const numbers = path.split(' M')[0].match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  const pairs: Point[] = []
  for (let i = 0; i + 1 < numbers.length; i += 2) pairs.push([numbers[i], numbers[i + 1]])
  return pairs
}

const ring = (pts: readonly Point[]) => Float64Array.from(pts.flat())

/** A rectangle's ring, counter-clockwise, centred on (cx, cy). */
const rect = (cx: number, cy: number, w: number, h: number): Point[] => [
  [cx - w / 2, cy - h / 2],
  [cx + w / 2, cy - h / 2],
  [cx + w / 2, cy + h / 2],
  [cx - w / 2, cy + h / 2],
]

/** A clip pocket like the engineering design's: a mouth lead-in to the land, the land, then a flare to the ceiling. */
function clipPocket(cx: number, cy: number, vertical = false): BackFeature {
  const r = (w: number, h: number) => ring(vertical ? rect(cx, cy, h, w) : rect(cx, cy, w, h))
  const levels: BackFeatureLevel[] = [
    { ring: r(50.6, 14.6), ringTop: r(49, 13), z0: 0, z1: 0.8 },
    { ring: r(49, 13), z0: 0.8, z1: 1 },
    { ring: r(49, 13), ringTop: r(52, 16), z0: 1, z1: 2.8 },
  ]
  return { role: 'clip-pocket', side: null, levels }
}

/**
 * A plain square-shouldered key notch on the bottom side at x = along: the neck slot then the head, the
 * opening edge first, as joins.ts walks it. Other sides are the bottom one turned, as placeOnSide does.
 */
function keyNotch(side: Side, along: number, width: number, height: number): BackFeature {
  const frame = (grow: number): Point[] => {
    const N = 3 + grow
    const B = 6 + grow
    const G = 3 - grow
    const A = 8 + grow
    return [
      [-N, 0],
      [N, 0],
      [N, G],
      [B, G],
      [B, A],
      [-B, A],
      [-B, G],
      [-N, G],
    ]
  }
  const place = (pts: Point[]) =>
    ring(
      pts.map(([s, t]) =>
        side === 0 ? [along + s, t] : side === 1 ? [width - t, along + s] : side === 2 ? [along - s, height - t] : [t, along - s],
      ),
    )
  return {
    role: 'key-pocket',
    side,
    levels: [
      { ring: place(frame(0.4)), ringTop: place(frame(0)), z0: 0, z1: 0.4 },
      { ring: place(frame(0)), z0: 0.4, z1: 2 },
    ],
  }
}

const input = (features: BackFeature[], seated: SeatedLike[] = [], joint = 0, width = 150, height = 150): TileBackInput => ({
  width,
  height,
  joint,
  features,
  seated,
})

const within = (p: Point, cx: number, cy: number, r: number) => Math.hypot(p[0] - cx, p[1] - cy) <= r + 1e-6

describe('tileBackLayout: the piece', () => {
  it('draws the piece at scale, its long side FIGURE.size, and nothing else when its back is flat', () => {
    const layout = tileBackLayout(input([], [], 0, 150, 75))
    expect(layout.scale).toBeCloseTo(FIGURE.size / 150, 9)
    expect(layout.width).toBeCloseTo(FIGURE.size + 2 * FIGURE.pad, 9)
    expect(layout.height).toBeCloseTo(FIGURE.size / 2 + 2 * FIGURE.pad, 9)
    expect(layout.detail).toBeNull()
    expect(layout.features).toEqual([])
  })

  it("is seen from the back: a pocket near the piece's left side is drawn at the right", () => {
    const layout = tileBackLayout(input([clipPocket(30, 75)]))
    const drawn = points(layout.features[0].path)
    const middle = drawn.reduce((sum, [x]) => sum + x, 0) / drawn.length
    const back = points(layout.back)
    const pieceMiddle = (Math.min(...back.map(([x]) => x)) + Math.max(...back.map(([x]) => x))) / 2
    expect(middle).toBeGreaterThan(pieceMiddle)
    // y still runs up the wall: a pocket low on the piece is drawn low.
    const low = tileBackLayout(input([clipPocket(75, 20)]))
    const lowY = points(low.features[0].path).map(([, y]) => y)
    expect(Math.min(...lowY)).toBeGreaterThan(Math.min(...points(low.back).map(([, y]) => y)) + 75 * low.scale)
  })
})

describe('chooseFeature', () => {
  it('prefers a clip pocket to a key notch', () => {
    const clip = clipPocket(75, 20)
    const chosen = chooseFeature(input([keyNotch(3, 40, 150, 150), clip, keyNotch(0, 40, 150, 150)]))
    expect(chosen).toBe(clip)
  })

  it('prefers a pocket whose part is seated, then the one drawn nearest the detail circle', () => {
    const left = keyNotch(3, 75, 150, 150)
    const right = keyNotch(1, 75, 150, 150)
    // Unseated, the notch on the piece's left side is drawn at the right, beside the circle.
    expect(chooseFeature(input([right, left]))).toBe(left)
    // A key seated only in the right-hand notch (as keys go in before the next tile) wins.
    expect(chooseFeature(input([right, left], [{ kind: 'key', x: 150, y: 75, turns: 0 }]))).toBe(right)
  })

  it('takes the higher of two pockets drawn level', () => {
    const low = clipPocket(75, 20)
    const high = clipPocket(75, 130)
    expect(chooseFeature(input([low, high]))).toBe(high)
  })

  it('finds nothing to magnify on a flat back', () => {
    expect(chooseFeature(input([]))).toBeNull()
  })
})

describe('tileBackLayout: the detail', () => {
  const cases: [string, TileBackInput][] = [
    ['a clip pocket', input([clipPocket(75, 20), clipPocket(75, 130)], [{ kind: 'clip', x: 75, y: 130, turns: 0 }])],
    ['a key notch', input([keyNotch(1, 37.5, 150, 150), keyNotch(2, 37.5, 150, 150)], [], 2)],
    ['a narrow piece', input([clipPocket(20, 60, true)], [], 0, 40, 160)],
    ['a wide piece', input([keyNotch(2, 100, 300, 80)], [], 0, 300, 80)],
  ]

  for (const [name, figure] of cases) {
    describe(name, () => {
      const layout = tileBackLayout(figure)
      const detail = layout.detail
      if (!detail) throw new Error('expected a detail')
      const piece = points(layout.back)

      it('stands the circle beside the piece, never over it, inside the figure', () => {
        expect(detail.cx - detail.r).toBeGreaterThanOrEqual(Math.max(...piece.map(([x]) => x)) + FIGURE.gap - 1e-6)
        expect(detail.cx + detail.r).toBeLessThanOrEqual(layout.width + 1e-6)
        expect(detail.cy - detail.r).toBeGreaterThanOrEqual(-1e-6)
        expect(detail.cy + detail.r).toBeLessThanOrEqual(layout.height + 1e-6)
      })

      it('ties the leader from the ring round the pocket to the circle', () => {
        const leader = detail.leader
        if (!leader) throw new Error('expected a leader')
        expect(Math.hypot(leader.x1 - detail.focus.cx, leader.y1 - detail.focus.cy)).toBeCloseTo(detail.focus.r, 6)
        expect(Math.hypot(leader.x2 - detail.cx, leader.y2 - detail.cy)).toBeCloseTo(detail.r, 6)
      })

      it('rings the pocket it magnifies, the ring inside the figure', () => {
        const chosen = chooseFeature(figure)
        const index = figure.features.indexOf(chosen as BackFeature)
        for (const p of points(layout.features[index].path)) expect(within(p, detail.focus.cx, detail.focus.cy, detail.focus.r)).toBe(true)
        const { cx, cy, r } = detail.focus
        expect(cx - r).toBeGreaterThanOrEqual(0)
        expect(cy - r).toBeGreaterThanOrEqual(0)
        expect(cx + r).toBeLessThanOrEqual(detail.cx - detail.r)
        expect(cy + r).toBeLessThanOrEqual(layout.height)
      })

      it('magnifies the part, and keeps it inside the circle', () => {
        expect(detail.magnification).toBeGreaterThan(1)
        expect(detail.scale).toBeCloseTo(detail.magnification * layout.scale, 9)
        for (const p of points(detail.part)) expect(within(p, detail.cx, detail.cy, detail.r * FIGURE.fill)).toBe(true)
      })
    })
  }

  it('seats the key across the joint: as far into the neighbour as into this tile', () => {
    const joint = 3
    const layout = tileBackLayout(input([keyNotch(0, 75, 150, 150)], [], joint))
    const detail = layout.detail
    if (!detail?.neighbour) throw new Error('expected a key detail')
    const ys = points(detail.part).map(([, y]) => y)
    expect(Math.max(...ys) - detail.cy).toBeCloseTo(detail.cy - Math.min(...ys), 1)
    // The neighbour's edge lies across the key, the joint's width off this tile's edge.
    const edge = points(detail.neighbour.edge)
    expect(edge[0][1]).toBeCloseTo(edge[1][1], 9)
    const edgeY = edge[0][1]
    expect(edgeY).toBeGreaterThan(Math.min(...ys))
    expect(edgeY).toBeLessThan(Math.max(...ys))
    expect(Math.abs(edgeY - detail.cy)).toBeCloseTo((joint / 2) * detail.scale, 1)
  })

  it("draws the clip inside its pocket's ceiling, lying along the pocket", () => {
    for (const vertical of [false, true]) {
      const figure = vertical ? input([clipPocket(20, 80, true)], [], 0, 40, 160) : input([clipPocket(75, 20)])
      const detail = tileBackLayout(figure).detail
      if (!detail?.hidden || !detail.sink) throw new Error('expected a clip detail')
      const clip = points(detail.part)
      const ceiling = points(detail.hidden)
      const box = (pts: Point[]) => [Math.min(...pts.map(([x]) => x)), Math.min(...pts.map(([, y]) => y)), Math.max(...pts.map(([x]) => x)), Math.max(...pts.map(([, y]) => y))]
      const [cx0, cy0, cx1, cy1] = box(clip)
      const [hx0, hy0, hx1, hy1] = box(ceiling)
      expect(cx0).toBeGreaterThan(hx0)
      expect(cy0).toBeGreaterThan(hy0)
      expect(cx1).toBeLessThan(hx1)
      expect(cy1).toBeLessThan(hy1)
      expect(cx1 - cx0 > cy1 - cy0).toBe(!vertical)
      expect(detail.sink.cx).toBeCloseTo(detail.cx, 6)
      expect(detail.neighbour).toBeNull()
    }
  })
})

describe('keyAcross', () => {
  it('mirrors a notch across the middle of the joint', () => {
    expect(acrossJoint(0, 150, 150, 2)([10, 3])).toEqual([10, -5])
    expect(acrossJoint(1, 150, 150, 2)([147, 10])).toEqual([155, 10])
    expect(acrossJoint(2, 150, 150, 2)([10, 147])).toEqual([10, 155])
    expect(acrossJoint(3, 150, 150, 2)([3, 10])).toEqual([-5, 10])
  })

  const config: DesignConfig = { ...DEFAULT_CONFIG, lock: 'keys', joint: 1.5 }
  const piece: Pick<PieceSpec, 'crop' | 'width' | 'height' | 'edges'> = {
    crop: { x0: 0, y0: 0, x1: 150, y1: 150 },
    width: 150,
    height: 150,
    edges: { boundary: 0, tabs: 0, profiled: {} },
  }

  it('makes a whole key of a real notch: its reach into both tiles and the joint between', () => {
    const g = keyGeometry(config)
    if (!g) throw new Error('expected keys at 4 mm')
    const notches = keyPockets(config, piece)
    expect(notches.length).toBeGreaterThan(0)
    for (const notch of notches) {
      if (notch.side === null) continue
      const nominal = notch.levels.at(-1)?.ring
      if (!nominal) throw new Error('expected a nominal level')
      const pts: Point[] = []
      for (let i = 0; i < nominal.length; i += 2) pts.push([nominal[i], nominal[i + 1]])
      const key = keyAcross(pts, notch.side, 150, 150, config.joint)
      expect(key).toHaveLength(2 * pts.length)
      const across = notch.side === 0 || notch.side === 2 ? key.map(([, y]) => y) : key.map(([x]) => x)
      expect(Math.max(...across) - Math.min(...across)).toBeCloseTo(2 * g.reach + config.joint, 6)
    }
  })

  it("draws a real piece's key detail", () => {
    const layout = tileBackLayout({ width: 150, height: 150, joint: config.joint, features: keyPockets(config, piece), seated: [] })
    expect(layout.detail?.role).toBe('key-pocket')
    expect(layout.detail?.neighbour).not.toBeNull()
  })
})

describe('a real tabbed tile', () => {
  const config: DesignConfig = { ...DEFAULT_CONFIG, lock: 'tabs' }
  const plan = computeLayout(layoutInputOf(config))
  const hero = plan.pieces[0]
  const input: TileBackInput = {
    width: hero.width,
    height: hero.height,
    joint: config.joint,
    features: pieceFeatures(config, hero),
    seated: seatedParts(config, hero),
  }

  it('draws the tile\'s own outline round its tabs, so none hangs outside the tile it belongs to', () => {
    const reach = tabLimits(config)?.projection ?? 0
    expect(reach).toBeGreaterThan(0)
    expect(hero.edges.tabs).not.toBe(0)
    const layout = tileBackLayout(input)
    const outline = points(layout.back)
    // A plain rectangle is four corners; every tab adds a detour of its own.
    expect(outline.length).toBeGreaterThan(4)
    // Seen from the back x is mirrored, so the tabs reach past the drawing's left, and the box takes them in.
    const xs = outline.map(([x]) => x)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...xs)).toBeLessThanOrEqual(layout.width + 1e-6)
    // Every drawn feature lies inside the figure too, tabs and sockets alike.
    expect(layout.features.map((f) => f.role).sort()).toEqual(['join-socket', 'join-socket', 'join-tab', 'join-tab'])
    for (const feature of layout.features) {
      for (const [x, y] of points(feature.path)) {
        expect(x).toBeGreaterThanOrEqual(-1e-6)
        expect(x).toBeLessThanOrEqual(layout.width + 1e-6)
        expect(y).toBeGreaterThanOrEqual(-1e-6)
        expect(y).toBeLessThanOrEqual(layout.height + 1e-6)
      }
    }
    // The tab really is drawn past the tile's own side: mirrored, that is left of the tile's box.
    const plain = tileBackLayout({ ...input, features: input.features.filter((f) => f.role !== 'join-tab') })
    expect(layout.width).toBeGreaterThan(plain.width)
  })

  it('magnifies a socket with the neighbour\'s tab standing in it, and no notch behind it', () => {
    const chosen = chooseFeature(input)
    expect(chosen?.role).toBe('join-socket')
    const detail = tileBackLayout(input).detail
    if (!detail?.neighbour) throw new Error('expected a socket detail across the joint')
    expect(detail.role).toBe('join-socket')
    // The tile across the joint is drawn, its edge with it, but it has no recess of its own to show.
    expect(detail.neighbour.area).not.toBe('')
    expect(detail.neighbour.edge).not.toBe('')
    expect(detail.neighbour.notch).toBe('')
    // The part is the neighbour's tab: it crosses the socket's own opening into the tile beside it.
    const part = points(detail.part)
    const pocket = points(detail.pocket)
    expect(part.length).toBeGreaterThan(4)
    // Mirrored, the socket opens on the drawing's right and the tab reaches out past it to the neighbour.
    expect(Math.max(...part.map(([x]) => x))).toBeGreaterThanOrEqual(Math.max(...pocket.map(([x]) => x)) - 1e-6)
    // And it sits inside the socket everywhere else: the socket is the tab's outline grown by the fit.
    expect(Math.min(...part.map(([x]) => x))).toBeGreaterThan(Math.min(...pocket.map(([x]) => x)))
  })

  it('shows a clip pocket instead when the tile has one, as it does beside a key notch', () => {
    const clipped: DesignConfig = { ...config, mount: 'clips' }
    const clipPlanned = computeLayout(layoutInputOf(clipped))
    const piece = clipPlanned.pieces[0]
    const detail = tileBackLayout({
      width: piece.width,
      height: piece.height,
      joint: clipped.joint,
      features: pieceFeatures(clipped, piece),
      seated: seatedParts(clipped, piece),
    }).detail
    expect(detail?.role).toBe('clip-pocket')
  })
})

describe('the real clip in a real pocket', () => {
  const piece: Pick<PieceSpec, 'crop' | 'width' | 'height' | 'edges'> = {
    crop: { x0: 0, y0: 0, x1: 150, y1: 150 },
    width: 150,
    height: 150,
    edges: { boundary: 0, tabs: 0, profiled: {} },
  }
  const clip = { outline: clipPlan(CLIP_CLEARANCE.standard), hole: DRILL_HOLE / 2, sink: COUNTERSINK / 2 }

  for (const lock of ['none', 'keys'] as const) {
    it(lock === 'keys' ? 'with keys: magnifies a clip pocket, not a key notch' : 'on clips alone', () => {
      const config: DesignConfig = { ...DEFAULT_CONFIG, mount: 'clips', lock }
      const features = [...keyPockets(config, piece), ...clipPockets(config, piece)]
      const seated = seatedParts(config, piece)
      expect(seated.some((part) => part.kind === 'clip')).toBe(true)
      const detail = tileBackLayout({ width: 150, height: 150, joint: config.joint, features, seated, clip }).detail
      if (!detail?.hidden || !detail.sink) throw new Error('expected a clip detail')
      expect(detail.role).toBe('clip-pocket')
      // The clip as it prints lies inside its pocket's ceiling, along it, its hole at the circle's centre.
      const pts = points(detail.part)
      const ceiling = points(detail.hidden)
      const xs = pts.map(([x]) => x)
      const ys = pts.map(([, y]) => y)
      expect(Math.min(...xs)).toBeGreaterThan(Math.min(...ceiling.map(([x]) => x)))
      expect(Math.max(...xs)).toBeLessThan(Math.max(...ceiling.map(([x]) => x)))
      expect(Math.min(...ys)).toBeGreaterThan(Math.min(...ceiling.map(([, y]) => y)))
      expect(Math.max(...ys)).toBeLessThan(Math.max(...ceiling.map(([, y]) => y)))
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(Math.max(...ys) - Math.min(...ys))
      expect(detail.sink.r).toBeCloseTo((COUNTERSINK / 2) * detail.scale, 9)
      // The detail is centred on a pocket seatedParts puts a clip in.
      for (const p of pts) expect(within(p, detail.cx, detail.cy, detail.r)).toBe(true)
    })
  }
})
