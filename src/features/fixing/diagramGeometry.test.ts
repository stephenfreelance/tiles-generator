import { describe, expect, it } from 'vitest'
import { CLIP_THICKNESS, MIN_BASE, POCKET_DEPTH, STOP_HEIGHT, stopRects } from '@/core/fixing/mechanism'
import {
  arrowHeadPath,
  battenScrews,
  blockTiles,
  CARD,
  cardTiles,
  circlePath,
  CLIP_PLAN,
  CLIP_SECTION,
  clipPlan,
  clipPlanAt,
  clipPocketHalfAt,
  clipPocketPlan,
  clipPocketSectionPath,
  clipSectionPath,
  clipStopsSectionPath,
  clipWallTiles,
  KEY,
  keyPath,
  keySpots,
  PLATE,
  PULLED,
  RELIEF_AMP,
  SCREW_SECTION,
  screwSectionPath,
  START_LINE,
  startLineTiles,
  tileSectionPath,
  WALL_FACE,
  type TileBlock,
} from './diagramGeometry'

/** The corners of a path made only of M and L commands, as [x, y] pairs. */
function points(path: string): [number, number][] {
  const numbers = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  const pairs: [number, number][] = []
  for (let i = 0; i + 1 < numbers.length; i += 2) pairs.push([numbers[i], numbers[i + 1]])
  return pairs
}

const xs = (path: string) => points(path).map(([x]) => x)
const ys = (path: string) => points(path).map(([, y]) => y)

/** The first subpath of a compound path (the outline, without the holes after it). */
const outline = (path: string) => path.split(' M')[0]

const BLOCK: TileBlock = { columns: 2, rows: 2, w: 60, h: 40, gap: 2, x0: 10, y0: 20 }

describe('keyPath', () => {
  it('straddles its seam: as long on one side of it as on the other', () => {
    const across = xs(keyPath(50, 30, true))
    expect(Math.min(...across)).toBe(50 - KEY.half)
    expect(Math.max(...across)).toBe(50 + KEY.half)
    const along = ys(keyPath(50, 30, false))
    expect(Math.min(...along)).toBe(30 - KEY.half)
    expect(Math.max(...along)).toBe(30 + KEY.half)
  })

  it('has square shoulders: a head wider than its neck', () => {
    const corners = points(keyPath(0, 0, true))
    expect(corners).toHaveLength(12)
    const widths = new Set(corners.map(([, y]) => Math.abs(y)))
    expect([...widths].sort((a, b) => a - b)).toEqual([KEY.neck, KEY.head])
  })

  it('draws its pocket around it: grown by the clearance on every side', () => {
    const key = xs(keyPath(0, 0, true))
    const pocket = xs(keyPath(0, 0, true, 1))
    expect(Math.max(...pocket)).toBe(Math.max(...key) + 1)
    expect(Math.max(...ys(keyPath(0, 0, true, 1)))).toBe(KEY.head + 1)
  })

  it("cuts a fit test key's marks into its +x end only, one notch per mark, inside the head", () => {
    const scale = 2.3
    for (const marks of [1, 2, 3]) {
      const corners = points(keyPath(0, 0, true, 0, scale, marks))
      expect(corners).toHaveLength(12 + 3 * marks)
      // Each notch's tip is the only kind of corner off both ends and the shoulders.
      const tips = corners.filter(([x]) => Math.abs(x - (KEY.half - KEY.markDepth) * scale) < 1e-9)
      expect(tips).toHaveLength(marks)
      for (const [, y] of tips) expect(Math.abs(y) + (KEY.markWidth / 2) * scale).toBeLessThan(KEY.head * scale)
      // The -x end stays whole: its two corners and nothing between.
      expect(corners.filter(([x]) => x === -KEY.half * scale)).toHaveLength(2)
    }
    // A down-pointing key carries them at its lower end.
    const upright = points(keyPath(0, 0, false, 0, 1, 2))
    expect(upright.filter(([, y]) => Math.abs(y - (KEY.half - KEY.markDepth)) < 1e-9)).toHaveLength(2)
  })
})

describe('keySpots', () => {
  const spots = keySpots(BLOCK)

  it('puts two keys on every inside seam of a tile side, and none on the outside edge', () => {
    // One vertical seam across two rows and one horizontal seam across two columns: 2 x 2 + 2 x 2.
    expect(spots).toHaveLength(8)
    const right = BLOCK.x0 + BLOCK.columns * (BLOCK.w + BLOCK.gap) - BLOCK.gap
    const bottom = BLOCK.y0 + BLOCK.rows * (BLOCK.h + BLOCK.gap) - BLOCK.gap
    for (const spot of spots) {
      expect(spot.x).toBeGreaterThan(BLOCK.x0)
      expect(spot.x).toBeLessThan(right)
      expect(spot.y).toBeGreaterThan(BLOCK.y0)
      expect(spot.y).toBeLessThan(bottom)
    }
  })

  it('centres each key on its seam, at a quarter and three quarters of the tile side', () => {
    const seamX = BLOCK.x0 + BLOCK.w + BLOCK.gap / 2
    const vertical = spots.filter((spot) => spot.horizontal)
    expect(vertical.every((spot) => spot.x === seamX)).toBe(true)
    expect(vertical.map((spot) => spot.y)).toEqual([30, 50, 72, 92])
    const horizontal = spots.filter((spot) => !spot.horizontal)
    expect(horizontal.map((spot) => spot.x)).toEqual([25, 55, 87, 117])
  })

  it('lays no key on a single tile, which has no seam', () => {
    expect(keySpots({ ...BLOCK, columns: 1, rows: 1 })).toEqual([])
  })

  it('agrees with the tiles it is drawn on', () => {
    expect(blockTiles(BLOCK)).toEqual([
      { x: 10, y: 20 },
      { x: 72, y: 20 },
      { x: 10, y: 62 },
      { x: 72, y: 62 },
    ])
  })
})

describe('the cards', () => {
  it('stands the two tiles of a back view inside the card, the joint between them drawn wide at its middle', () => {
    const [left, right] = cardTiles()
    expect(left.x).toBeGreaterThan(0)
    expect(right.x + right.w).toBeLessThan(CARD.width)
    expect(right.x - (left.x + left.w)).toBe(CARD.gap)
    expect((left.x + left.w + right.x) / 2).toBe(CARD.width / 2)
    expect(left.y + left.h).toBeLessThan(CARD.height)
  })

  it('fits a clip pocket at the card scale inside one tile of the side section', () => {
    const k = 0.8
    const pocket = points(clipPocketSectionPath(CARD.wallFace, CARD.jointY / 2, k))
    expect(Math.min(...pocket.map(([, y]) => y))).toBeGreaterThan(0)
    expect(Math.max(...pocket.map(([, y]) => y))).toBeLessThan(CARD.jointY)
    expect(Math.max(...pocket.map(([x]) => x))).toBeLessThan(CARD.wallFace + PLATE)
  })
})

describe('the clip in section', () => {
  const c = CLIP_SECTION

  it("draws depth at the plate's scale: the real pocket, clip and stops under a 4 mm plate", () => {
    const perMm = PLATE / MIN_BASE
    expect(c.depth).toBeCloseTo(POCKET_DEPTH * perMm, 2)
    expect(c.thick).toBeCloseTo(CLIP_THICKNESS * perMm, 2)
    expect(c.depth - c.thick).toBeCloseTo(STOP_HEIGHT * perMm, 2)
  })

  it('cuts its pocket into the plate and leaves plate over it', () => {
    expect(c.depth).toBeLessThan(PLATE)
    const pocket = points(clipPocketSectionPath(WALL_FACE, 50))
    expect(Math.min(...pocket.map(([x]) => x))).toBe(WALL_FACE)
    expect(Math.max(...pocket.map(([x]) => x))).toBe(WALL_FACE + c.depth)
    // Open at the mouth: the outline starts and ends on the tile's back.
    expect(pocket[0][0]).toBe(WALL_FACE)
    expect(pocket.at(-1)?.[0]).toBe(WALL_FACE)
  })

  it('narrows through a lead-in to the land, then flares wider to the ceiling', () => {
    expect(c.land).toBeLessThan(c.mouth)
    expect(c.land).toBeLessThan(c.ceiling)
    expect(clipPocketHalfAt(c.lead / 2)).toBeLessThan(c.mouth)
    expect(clipPocketHalfAt(c.depth)).toBe(c.ceiling)
  })

  // Clicked in, its one seated state on the wall or off it: its back level with the tile's back (u = 0).
  describe('clicked in', () => {
    const clip = points(clipSectionPath(0, 0))

    it('passes the land: its body is narrower than the pocket at the land', () => {
      const atLand = clip.filter(([u]) => u >= c.lead && u <= c.landEnd)
      for (const [, v] of atLand) expect(Math.abs(v)).toBeLessThan(c.land)
      expect(c.body).toBeLessThan(c.land)
    })

    it('catches: its barbs stand out past the land, behind the lips', () => {
      expect(c.barb).toBeGreaterThan(c.land)
      const barbs = clip.filter(([, v]) => Math.abs(v) === c.barb)
      for (const [u] of barbs) expect(u).toBeGreaterThan(c.landEnd)
    })

    it('stays inside the pocket everywhere, its body clear of the ceiling', () => {
      expect(Math.min(...clip.map(([u]) => u))).toBe(0)
      for (const [u, v] of clip) {
        expect(u).toBeLessThan(c.depth)
        expect(Math.abs(v)).toBeLessThanOrEqual(clipPocketHalfAt(u) + 1e-9)
      }
    })

    it('rests on its stops: they stand from its top to the ceiling, on the centre block, clear of the screw head', () => {
      const stops = points(clipStopsSectionPath(0, 0))
      expect(Math.min(...stops.map(([u]) => u))).toBe(c.thick)
      expect(Math.max(...stops.map(([u]) => u))).toBe(c.depth)
      expect(Math.max(...stops.map(([, v]) => Math.abs(v)))).toBeLessThan(c.body)
      expect(Math.min(...stops.map(([, v]) => Math.abs(v)))).toBeGreaterThan(SCREW_SECTION.head)
      // One on each side of the centre line.
      expect(stops.some(([, v]) => v > 0)).toBe(true)
      expect(stops.some(([, v]) => v < 0)).toBe(true)
    })
  })

  it('sinks the screw head below the clip top and runs its shank through the tape into the wall', () => {
    const screw = points(screwSectionPath(WALL_FACE, 50))
    const depths = screw.map(([x]) => x - WALL_FACE)
    expect(Math.max(...depths)).toBeLessThan(c.thick)
    expect(Math.min(...depths)).toBeLessThan(0)
    expect(Math.max(...screw.map(([, y]) => Math.abs(y - 50)))).toBe(SCREW_SECTION.head)
    // The head sits in the clip's body, and the shank fits the plug.
    expect(SCREW_SECTION.head).toBeLessThan(c.body)
    expect(SCREW_SECTION.shank).toBeLessThan(SCREW_SECTION.plug)
  })
})

describe('the clip on the wall, in side section', () => {
  const tape = CLIP_SECTION.tape
  const onWall = { back: WALL_FACE + tape, clip: WALL_FACE + tape, tape: WALL_FACE }

  it('stands a tile on its clips a tape off the wall: the clip level with its back, the tape behind the clip', () => {
    for (const show of ['on', 'press', 'off'] as const) {
      const { upper, lower } = clipWallTiles(show)
      expect(lower).toEqual(onWall)
      for (const tile of [upper, lower]) {
        expect(tile.back).toBeGreaterThan(WALL_FACE)
        expect(tile.tape + tape).toBe(tile.clip)
      }
    }
    expect(clipWallTiles('on').upper).toEqual(onWall)
  })

  it('presses a tile on with its clip in it, the tape proud of its back, and leaves the clip on the wall when it comes off', () => {
    const press = clipWallTiles('press').upper
    expect(press).toEqual({ back: WALL_FACE + PULLED, clip: WALL_FACE + PULLED, tape: WALL_FACE + PULLED - tape })
    const off = clipWallTiles('off').upper
    expect(off).toEqual({ back: WALL_FACE + PULLED, clip: WALL_FACE + tape, tape: WALL_FACE })
  })

  it('scales the tape for a card', () => {
    const { lower } = clipWallTiles('on', CARD.wallFace, 0.8)
    expect(lower).toEqual({ back: CARD.wallFace + 0.8, clip: CARD.wallFace + 0.8, tape: CARD.wallFace })
  })
})

describe('the clip in plan', () => {
  const plan = clipPlanAt(0, 0, 1)
  const corners = points(outline(plan.path))

  it('runs tip to tip along x, its barbs the widest part', () => {
    expect(Math.min(...corners.map(([x]) => x))).toBeCloseTo(-CLIP_PLAN.half, 9)
    expect(Math.max(...corners.map(([x]) => x))).toBeCloseTo(CLIP_PLAN.half, 9)
    expect(Math.max(...corners.map(([, y]) => y))).toBeCloseTo(CLIP_PLAN.body + CLIP_PLAN.barb, 2)
  })

  it('is symmetric about both axes', () => {
    const key = ([x, y]: [number, number]) => `${x.toFixed(2)} ${y.toFixed(2)}`
    const set = new Set(corners.map(key))
    for (const [x, y] of corners) {
      expect(set.has(key([-x, y]))).toBe(true)
      expect(set.has(key([x, -y]))).toBe(true)
    }
  })

  it('cuts four slots in from the ends, stopping at the centre block', () => {
    // The slots' inner ends are the only corners at the block's faces.
    const atBlock = corners.filter(([x]) => Math.abs(Math.abs(x) - CLIP_PLAN.block) < 1e-6)
    expect(atBlock).toHaveLength(8)
    // The block is clear of the barbs, which sit at the tines' tips.
    expect(CLIP_PLAN.block).toBeLessThan(CLIP_PLAN.half - CLIP_PLAN.barbLength - CLIP_PLAN.barb)
  })

  it('has a hole in the middle of its block, inside the countersink rim, and the rim inside the block', () => {
    expect(plan.path.split(' M')).toHaveLength(2)
    expect(CLIP_PLAN.hole).toBeLessThan(CLIP_PLAN.sink)
    expect(plan.sink.r).toBe(CLIP_PLAN.sink)
    const [x0, y0, x1, y1] = plan.block
    expect(x1 - x0).toBeGreaterThan(2 * plan.sink.r)
    expect(y1 - y0).toBeGreaterThan(2 * plan.sink.r)
  })

  it('carries its two stops on the block as mechanism.ts places them, clear of the countersink', () => {
    expect(plan.stops).toHaveLength(2)
    const real = stopRects()
    plan.stops.forEach((stop, i) => stop.forEach((v, j) => expect(v).toBeCloseTo(real[i][j], 9)))
    const [bx0, by0, bx1, by1] = plan.block
    for (const [x0, y0, x1, y1] of plan.stops) {
      expect(x0).toBeGreaterThanOrEqual(bx0)
      expect(x1).toBeLessThanOrEqual(bx1)
      expect(y0).toBeGreaterThanOrEqual(by0)
      expect(y1).toBeLessThanOrEqual(by1)
      expect(Math.min(Math.abs(y0), Math.abs(y1))).toBeGreaterThan(plan.sink.r)
    }
  })

  it("cuts a fit test clip's marks into its spine's +x end only, one notch per mark, between the slots", () => {
    const spine = CLIP_PLAN.body - CLIP_PLAN.tine - CLIP_PLAN.slot
    for (const marks of [1, 2, 3]) {
      const marked = points(outline(clipPlanAt(0, 0, 1, 'h', marks).path))
      expect(marked).toHaveLength(corners.length + 3 * marks)
      const tips = marked.filter(([x]) => Math.abs(x - (CLIP_PLAN.half - CLIP_PLAN.markDepth)) < 1e-9)
      expect(tips).toHaveLength(marks)
      for (const [, y] of tips) expect(Math.abs(y) + CLIP_PLAN.markWidth / 2).toBeLessThan(spine)
      // The -x end is the unmarked clip's.
      const left = (pts: [number, number][]) => pts.filter(([x]) => x < 0).map(([x, y]) => `${x} ${y}`)
      expect(left(marked)).toEqual(left(corners))
    }
    // A 'v' clip carries them at its +y end.
    const upright = points(outline(clipPlanAt(0, 0, 1, 'v', 2).path))
    expect(upright.filter(([, y]) => Math.abs(y - (CLIP_PLAN.half - CLIP_PLAN.markDepth)) < 1e-9)).toHaveLength(2)
  })

  it('turns a quarter turn for a vertical clip', () => {
    const upright = points(outline(clipPlanAt(10, 20, 1, 'v').path))
    expect(Math.max(...upright.map(([, y]) => y))).toBeCloseTo(20 + CLIP_PLAN.half, 9)
    expect(Math.max(...upright.map(([x]) => x))).toBeCloseTo(10 + CLIP_PLAN.body + CLIP_PLAN.barb, 2)
  })

  it('takes any length and width, the barbs staying proportional', () => {
    const long = points(outline(clipPlan(0, 0, 60, 10).path))
    expect(Math.max(...long.map(([x]) => x))).toBeCloseTo(30, 9)
    expect(Math.max(...long.map(([, y]) => y))).toBeCloseTo(5 * (1 + CLIP_PLAN.barb / CLIP_PLAN.body), 2)
  })

  it('sits inside its pocket seen from the back, the ceiling wider than the mouth', () => {
    const { mouth, ceiling } = clipPocketPlan(0, 0, 1)
    for (const [x, y] of corners) {
      expect(x).toBeGreaterThan(mouth[0])
      expect(x).toBeLessThan(mouth[2])
      expect(y).toBeGreaterThan(mouth[1])
      expect(y).toBeLessThan(mouth[3])
    }
    expect(ceiling[0]).toBeLessThan(mouth[0])
    expect(ceiling[3]).toBeGreaterThan(mouth[3])
  })
})

describe('circlePath', () => {
  it('draws a closed circle of two arcs through its left and right points', () => {
    expect(circlePath(10, 20, 5)).toBe('M5 20 A5 5 0 1 0 15 20 A5 5 0 1 0 5 20 Z')
  })
})

describe('tileSectionPath', () => {
  it('keeps its relief on the face, never behind the plate', () => {
    const edge = xs(tileSectionPath(30, 0, 50))
    expect(Math.min(...edge)).toBe(30)
    expect(Math.max(...edge)).toBeLessThanOrEqual(30 + PLATE + RELIEF_AMP)
    expect(Math.max(...edge)).toBeGreaterThan(30 + PLATE)
  })

  it('carries the pattern on across a joint: the relief is a function of height alone', () => {
    const upper = points(tileSectionPath(30, 0, 50))
    const lower = points(tileSectionPath(30, 50, 100))
    const faceAt = (edge: [number, number][], y: number) => edge.find(([x, py]) => py === y && x !== 30)?.[0]
    expect(faceAt(upper, 50)).toBe(faceAt(lower, 50))
  })
})

describe('arrowHeadPath', () => {
  it('ends on the point it aims at', () => {
    expect(arrowHeadPath(0, 0, 10, 0)).toMatch(/L10 0 L/)
  })
})

describe('the start line', () => {
  it('stands every tile to come on or above the line, within the wall drawn', () => {
    const tiles = startLineTiles()
    expect(tiles.length).toBeGreaterThanOrEqual(START_LINE.rows * 2)
    for (const tile of tiles) {
      expect(tile.y + START_LINE.tileH).toBeLessThanOrEqual(START_LINE.line)
      expect(tile.y).toBeGreaterThan(0)
      expect(tile.x).toBeGreaterThanOrEqual(START_LINE.x0)
      expect(tile.x + START_LINE.tileW).toBeLessThanOrEqual(START_LINE.x1)
    }
    // The bottom row stands right on the line.
    expect(tiles.some((tile) => tile.y + START_LINE.tileH === START_LINE.line)).toBe(true)
  })

  it('spaces the batten screws evenly and keeps them off its ends', () => {
    const screws = battenScrews()
    expect(screws.length).toBeGreaterThanOrEqual(2)
    expect(screws[0]).toBeGreaterThan(START_LINE.x0)
    expect(screws.at(-1)).toBeLessThan(START_LINE.x1)
    const gaps = screws.slice(1).map((x, i) => x - screws[i])
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 9)
  })
})
