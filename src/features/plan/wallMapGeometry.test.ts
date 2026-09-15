import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { computeLayout } from '@/core/layout'
import { buildPlanModel, type PlanModel } from '@/core/plan/planModel'
import type { DesignConfig } from '@/core/types'
import { formatNumber } from '@/core/units'
import {
  axisMap,
  BOND_MIN_END_PX,
  type Box,
  chipWidth,
  layoutWallMap,
  MIN_STRIP_PX,
  pieceSides,
  type Segment,
  type WallMapGeometry,
} from './wallMapGeometry'

// The map is laid out from estimated text metrics, so these rules are what keeps it legible.

interface Scenario {
  surface: { width: number; height: number }
  tile: number
  joint?: number
  origin?: DesignConfig['layout']['origin']
  rowOffset?: DesignConfig['layout']['rowOffset']
}

function modelFor({ surface, tile, joint = 0, origin = 'corner', rowOffset = 0 }: Scenario): PlanModel {
  const config = normalizeConfig({
    ...DEFAULT_CONFIG,
    surface,
    tile: { ...DEFAULT_CONFIG.tile, width: tile, height: tile },
    joint,
    layout: { origin, rowOffset },
  })
  const plan = computeLayout({ surface: config.surface, tile: config.tile, joint: config.joint, layout: config.layout })
  return buildPlanModel(config, plan)
}

const SCENARIOS: Record<string, Scenario> = {
  user: { surface: { width: 1200, height: 640 }, tile: 100 },
  exact: { surface: { width: 1200, height: 600 }, tile: 150 },
  'two-edges': { surface: { width: 1250, height: 640 }, tile: 100 },
  centred: { surface: { width: 1250, height: 640 }, tile: 100, origin: 'center' },
  balanced: { surface: { width: 1000, height: 800 }, tile: 150, joint: 2, origin: 'balanced' },
  'bond-half': { surface: { width: 1250, height: 640 }, tile: 100, rowOffset: 0.5 },
  'bond-third': { surface: { width: 1250, height: 640 }, tile: 100, rowOffset: 0.3333 },
  'tall-narrow': { surface: { width: 610, height: 2400 }, tile: 150, joint: 2 },
  'big-centred': { surface: { width: 3000, height: 2400 }, tile: 100, origin: 'center' },
  'cut-to-fit': { surface: { width: 300, height: 250 }, tile: 400 },
  // Beyond the spec's list: a centred strip too low for the pill, and a many-cut bond.
  'centred-strip': { surface: { width: 1000, height: 150 }, tile: 150, origin: 'center' },
  'bond-centred': { surface: { width: 1330, height: 910 }, tile: 120, joint: 3, origin: 'center', rowOffset: 0.3333 },
  'bond-third-150': { surface: { width: 1250, height: 640 }, tile: 150, rowOffset: 0.3333 },
}

const WIDTHS = [332, 400, 478]
const HEIGHTS = [208, 256]

/** Long strips, tall narrow walls, bonds and walls smaller than a tile, crossed with joints and origins. */
const SWEEP_WALLS: Scenario[] = [
  { surface: { width: 1200, height: 640 }, tile: 100 },
  { surface: { width: 3000, height: 90 }, tile: 100 },
  { surface: { width: 2400, height: 300 }, tile: 100 },
  { surface: { width: 610, height: 2400 }, tile: 150 },
  { surface: { width: 1250, height: 640 }, tile: 100, rowOffset: 0.3333 },
  { surface: { width: 120, height: 2400 }, tile: 100 },
  { surface: { width: 300, height: 250 }, tile: 400 },
  { surface: { width: 5000, height: 2400 }, tile: 100 },
]

const boxesOf = (g: WallMapGeometry): { name: string; box: Box }[] => [
  ...g.chips.map((c) => ({ name: `chip ${c.mark}`, box: c.box })),
  ...g.start.labels.map((l) => ({ name: `label ${l.text}`, box: l.box })),
  ...(g.start.pill ? [{ name: 'pill', box: g.start.pill }] : []),
]

const overlap = (a: Box, b: Box, tolerance: number) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > tolerance &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > tolerance

/** Whether a stroke passes through a box's interior (Liang-Barsky clipping). */
function crosses(s: Segment, b: Box): boolean {
  const dx = s.x2 - s.x1
  const dy = s.y2 - s.y1
  let t0 = 0
  let t1 = 1
  const edges: [number, number][] = [
    [-dx, s.x1 - b.x],
    [dx, b.x + b.width - s.x1],
    [-dy, s.y1 - b.y],
    [dy, b.y + b.height - s.y1],
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q <= 0) return false
    } else {
      const t = q / p
      if (p < 0) t0 = Math.max(t0, t)
      else t1 = Math.min(t1, t)
    }
  }
  return t1 - t0 > 1e-6
}

const within = (inner: Box, outer: Box, tolerance = 0.01) =>
  inner.x >= outer.x - tolerance &&
  inner.y >= outer.y - tolerance &&
  inner.x + inner.width <= outer.x + outer.width + tolerance &&
  inner.y + inner.height <= outer.y + outer.height + tolerance

function layout(name: string, width: number, maxWallHeight: number) {
  const model = modelFor(SCENARIOS[name])
  const geometry = layoutWallMap(model, { width, maxWallHeight })
  if (!geometry) throw new Error(`${name} at ${width} px drew nothing`)
  return { model, geometry }
}

describe('layoutWallMap', () => {
  for (const name of Object.keys(SCENARIOS)) {
    for (const width of WIDTHS) {
      for (const maxWallHeight of HEIGHTS) {
        it(`keeps ${name} legible at ${width} px, wall up to ${maxWallHeight} px`, () => {
          const { model, geometry: g } = layout(name, width, maxWallHeight)
          const svg: Box = { x: 0, y: 0, width: g.width, height: g.height }
          const boxes = boxesOf(g)

          // (1) Everything lettered stays inside the drawing.
          for (const { name: what, box } of boxes) expect(within(box, svg), `${what} inside`).toBe(true)

          // (2) Nothing lettered overlaps anything else, the start dot's ring included.
          const dot = g.start.dot
          const ring: Box = { x: dot.x - 7.5, y: dot.y - 7.5, width: 15, height: 15 }
          const all = [...boxes, { name: 'dot', box: ring }]
          for (let i = 0; i < all.length; i++) {
            for (let j = i + 1; j < all.length; j++) {
              expect(overlap(all[i].box, all[j].box, 1), `${all[i].name} clear of ${all[j].name}`).toBe(false)
            }
          }

          // (3) Cut chips sit off the wall, and off the reach of a centre mark's lines.
          for (const chip of g.chips.filter((c) => c.cut)) {
            expect(overlap(chip.box, g.wall, 0.01), `cut chip ${chip.mark} off the wall`).toBe(false)
            // A wall under 64 px tall has no room either side of its middle, so the chip stays centred.
            if (model.settingOut.modeX !== 'edge' && g.wall.height >= 64) {
              const { box } = chip
              expect(box.y < dot.y && dot.y < box.y + box.height, `chip ${chip.mark} off the level line`).toBe(false)
              expect(box.x < dot.x && dot.x < box.x + box.width, `chip ${chip.mark} off the upright line`).toBe(false)
            }
          }

          // (4) Exactly one whole chip, on the wall (or in the top band) and clear of the start marker.
          const whole = g.chips.filter((c) => !c.cut)
          expect(whole).toHaveLength(model.fullCount > 0 ? 1 : 0)
          if (whole.length) {
            const box = whole[0].box
            if (!whole[0].leader) expect(within(box, g.wall)).toBe(true)
            for (const line of g.start.lines) {
              const lineBox: Box = {
                x: Math.min(line.x1, line.x2) - 2,
                y: Math.min(line.y1, line.y2) - 2,
                width: Math.abs(line.x2 - line.x1) + 4,
                height: Math.abs(line.y2 - line.y1) + 4,
              }
              expect(overlap(box, lineBox, 0), 'whole chip clear of the start lines').toBe(false)
            }
          }

          // (5) Every piece in the table can be found on the map.
          const chipped = new Set(g.chips.map((c) => c.pieceId))
          for (const row of model.legend) expect(chipped.has(row.pieceId), `chip for ${row.mark}`).toBe(true)

          // (6) Thin strips are drawn wide enough to see.
          const bond = model.chains.columns.length > 1
          g.tiles.forEach((t, i) => {
            const src = model.tiles[i]
            if (!src.cut) return
            if (src.h < model.tile.height - 0.01) expect(t.height).toBeGreaterThanOrEqual(MIN_STRIP_PX - 0.01)
            if (src.w < model.tile.width - 0.01) {
              expect(t.width).toBeGreaterThanOrEqual((bond ? BOND_MIN_END_PX : MIN_STRIP_PX) - 0.01)
            }
          })

          // (9) The dot is where the drawing says the start is.
          const Y = axisMap(model.chains.rows.items, model.height, g.wall.height, MIN_STRIP_PX)
          if (model.settingOut.modeX === 'edge') {
            expect(dot.x).toBeCloseTo(g.wall.x, 6)
            expect(dot.y).toBeCloseTo(g.wall.y + g.wall.height - Y.at(model.settingOut.point.y), 6)
          } else {
            const [level, upright] = g.start.lines
            expect(level.y1).toBeCloseTo(dot.y, 6)
            expect(upright.x1).toBeCloseTo(dot.x, 6)
          }

          // (13) Deterministic.
          expect(layoutWallMap(model, { width, maxWallHeight })).toEqual(g)
        })
      }
    }
  }

  it('says when a strip was drawn wider than scale', () => {
    expect(layout('user', 332, 256).geometry.widened).toBe(true)
    expect(layout('tall-narrow', 478, 208).geometry.widened).toBe(true)
    expect(layout('user', 478, 208).geometry.widened).toBe(false)
  })

  it('gives each running-bond row end its own chip when the rows are tall enough, and stacks them otherwise', () => {
    // 100 mm rows on a 640 mm wall draw 27 px tall even at 478 px, under the 28 px pitch a chip needs.
    const roomy = layout('bond-third-150', 478, 208)
    // Piece ids are letters handed out per layout, so each layout is read with its own sides.
    const sideChips = ({ model, geometry }: { model: PlanModel; geometry: WallMapGeometry }, side: 'left' | 'right') => {
      const sides = pieceSides(model)
      return geometry.chips.filter((c) => c.cut && sides.get(c.pieceId)?.size === 1 && sides.get(c.pieceId)?.has(side))
    }
    const roomySides = pieceSides(roomy.model)
    for (const side of ['left', 'right'] as const) {
      const ends = roomy.model.tiles.filter(
        (t) =>
          t.kind === 'edge' &&
          roomySides.get(t.pieceId)?.size === 1 &&
          roomySides.get(t.pieceId)?.has(side) &&
          (side === 'left' ? t.x <= 0.01 : t.x + t.w >= roomy.model.width - 0.01),
      )
      expect(ends.length).toBeGreaterThan(0)
      expect(sideChips(roomy, side)).toHaveLength(ends.length)
    }

    // Stacked chips sit beside rows they do not name, so each is tied to a row end of its own mark,
    // at every width including the desktop rail, without two leaders crossing.
    for (const width of [332, 478]) {
      const tight = layout('bond-third', width, 208)
      for (const side of ['left', 'right'] as const) {
        const chips = [...sideChips(tight, side)].sort((a, b) => a.box.y - b.box.y)
        expect(chips.length, `${side} chips at ${width}`).toBeGreaterThan(1)
        const centres = chips.map((c) => c.box.y + c.box.height / 2)
        expect(new Set(centres).size).toBe(centres.length)
        const wallEdge = side === 'left' ? tight.geometry.wall.x : tight.geometry.wall.x + tight.geometry.wall.width
        for (const chip of chips) {
          const leader = chip.leader
          expect(leader, `leader for ${chip.mark}`).not.toBeNull()
          expect(leader!.x2).toBeCloseTo(wallEdge, 6)
          const own = tight.geometry.tiles.filter((t) => t.pieceId === chip.pieceId)
          expect(own.some((t) => leader!.y2 > t.y && leader!.y2 < t.y + t.height), `${chip.mark} points at its own row`).toBe(true)
          // The leader leaves from the chip's side facing the wall, so it never runs over another chip.
          expect(leader!.x1).toBeCloseTo(side === 'left' ? chip.box.x + chip.box.width : chip.box.x, 6)
        }
        const ends = chips.map((c) => c.leader!.y2)
        expect(ends).toEqual([...ends].sort((a, b) => a - b))
      }
    }
  })

  it('pairs a lone edge mark with its cut size, and drops sizes where a side holds several marks', () => {
    const user = layout('user', 478, 208).geometry
    expect(user.chips.find((c) => c.cut)).toMatchObject({ mark: 'B', size: '40' })
    const third = layout('bond-third', 332, 208)
    const sides = pieceSides(third.model)
    const side = third.geometry.chips.filter((c) => c.cut && (sides.get(c.pieceId)?.has('left') || sides.get(c.pieceId)?.has('right')))
    expect(side.length).toBeGreaterThan(0)
    for (const chip of side.filter((c) => sides.get(c.pieceId)?.size === 1)) expect(chip.size).toBeNull()
  })

  it('keeps every letter inside the drawing and clear of every other, across realistic walls', () => {
    const failures: string[] = []
    for (const wall of SWEEP_WALLS) {
      for (const joint of [0, 2]) {
        for (const origin of ['corner', 'center', 'balanced'] as const) {
          const model = modelFor({ ...wall, joint, origin })
          for (const width of [280, 332, 400, 478]) {
            for (const maxWallHeight of HEIGHTS) {
              const g = layoutWallMap(model, { width, maxWallHeight })
              const where = `${wall.surface.width}x${wall.surface.height}/${wall.tile} j${joint} ${origin}${wall.rowOffset ? ' bond' : ''} @${width}x${maxWallHeight}`
              if (!g) {
                failures.push(`${where}: drew nothing`)
                continue
              }
              const svg: Box = { x: 0, y: 0, width: g.width, height: g.height }
              const lettered = boxesOf(g)
              const dot = g.start.dot
              const marks = [
                ...lettered,
                { name: 'dot', box: { x: dot.x - 7.5, y: dot.y - 7.5, width: 15, height: 15 } },
                ...(g.start.dimension ? [{ name: 'dimension', box: g.start.dimension.box }] : []),
              ]
              const leaders = [
                ...g.chips.flatMap((c) => (c.leader ? [{ name: `leader ${c.mark}`, segment: c.leader }] : [])),
                ...(g.start.pillLeader ? [{ name: 'pill leader', segment: g.start.pillLeader }] : []),
              ]
              const guides = g.start.guides.map((segment) => ({ name: 'guide', segment }))
              const ends = [...leaders, ...guides].flatMap(({ name, segment: s }) => [
                { name: `${name} end`, box: { x: s.x1, y: s.y1, width: 0, height: 0 } },
                { name: `${name} end`, box: { x: s.x2, y: s.y2, width: 0, height: 0 } },
              ])
              for (const { name, box } of [...marks, ...ends]) {
                if (!within(box, svg)) failures.push(`${where}: ${name} outside`)
              }
              for (let i = 0; i < marks.length; i++) {
                for (let j = i + 1; j < marks.length; j++) {
                  if (overlap(marks[i].box, marks[j].box, 0)) failures.push(`${where}: ${marks[i].name} over ${marks[j].name}`)
                }
              }
              // The start dimension's lines reach the wall through the chips, never under one.
              for (const { name, segment } of guides) {
                for (const { name: what, box } of lettered) {
                  if (crosses(segment, box)) failures.push(`${where}: ${name} under ${what}`)
                }
              }
              // A leader never runs through the start marker's lettering, its dimension or the lines out to it.
              const startMarks = [
                ...marks.filter((m) => m.name.startsWith('label') || m.name === 'dimension' || m.name === 'pill'),
                ...guides.map(({ segment: s }) => ({
                  name: 'guide',
                  box: { x: Math.min(s.x1, s.x2), y: s.y1 - 0.5, width: Math.abs(s.x2 - s.x1), height: 1 },
                })),
              ]
              for (const { name, segment } of leaders) {
                for (const { name: what, box } of startMarks) {
                  if (what !== 'pill' || name !== 'pill leader') {
                    if (crosses(segment, box)) failures.push(`${where}: ${name} through ${what}`)
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('dimensions the level line up from the wall foot, beside the measurement', () => {
    for (const width of [280, 332, 478]) {
      for (const name of ['user', 'two-edges', 'bond-third', 'bond-third-150']) {
        const { model, geometry: g } = layout(name, width, 208)
        const dim = g.start.dimension
        expect(dim, `${name} at ${width}`).not.toBeNull()
        const foot = g.wall.y + g.wall.height
        // The span covers the level line and the foot, and its extension lines run from it to the wall.
        expect(dim!.box.y).toBeLessThanOrEqual(g.start.dot.y)
        expect(dim!.box.y + dim!.box.height).toBeGreaterThanOrEqual(foot)
        expect(g.start.guides.map((s) => s.y1).sort((a, b) => a - b)).toEqual([g.start.dot.y, foot])
        for (const s of g.start.guides) {
          expect(s.x1).toBeLessThanOrEqual(dim!.box.x + dim!.box.width)
          expect(s.x2).toBeGreaterThan(g.wall.x - 5)
        }
        // The measurement reads beside the span: right of it is only the dimension, and it sits within reach.
        const size = g.start.labels.find((l) => l.text === `${formatNumber(model.settingOut.point.y)} mm`)
        expect(size, `${name} size label`).toBeDefined()
        expect(dim!.box.x - (size!.box.x + size!.box.width)).toBeLessThan(12)
        expect(size!.y).toBeGreaterThan(g.start.dot.y - 1)
        expect(size!.y).toBeLessThan(foot + 12)
      }
    }
    // A wall set out from its corner draws no dimension.
    expect(layout('exact', 332, 208).geometry.start.dimension).toBeNull()
    expect(layout('centred', 332, 208).geometry.start.dimension).toBeNull()
  })

  it('draws nothing in a box too narrow to read', () => {
    expect(layoutWallMap(modelFor(SCENARIOS.user), { width: 159, maxWallHeight: 208 })).toBeNull()
  })
})

describe('axisMap', () => {
  it('is monotonic and exact at both ends', () => {
    for (const name of Object.keys(SCENARIOS)) {
      const model = modelFor(SCENARIOS[name])
      for (const lengthPx of [60, 139, 208]) {
        for (const chain of [model.chains.rows, ...model.chains.columns]) {
          const map = axisMap(chain.items, chain.total, lengthPx, MIN_STRIP_PX)
          expect(map.at(0)).toBeCloseTo(0, 2)
          expect(map.at(chain.total)).toBeCloseTo(lengthPx, 2)
          let last = -Infinity
          for (let mm = 0; mm <= chain.total; mm += chain.total / 400) {
            const px = map.at(mm)
            expect(px).toBeGreaterThanOrEqual(last - 1e-9)
            last = px
          }
        }
      }
    }
  })

  it('falls back to scale when there is no room to widen', () => {
    const model = modelFor(SCENARIOS.user)
    expect(axisMap(model.chains.rows.items, model.height, 20, MIN_STRIP_PX).widened).toBe(false)
  })
})

describe('chipWidth', () => {
  it('grows with the mark and never drops under a touch target', () => {
    expect(chipWidth('AA', null)).toBeGreaterThan(chipWidth('A', null))
    expect(chipWidth('A', null)).toBeGreaterThanOrEqual(24)
    expect(chipWidth('B', '40')).toBeGreaterThan(chipWidth('B', null))
  })
})
