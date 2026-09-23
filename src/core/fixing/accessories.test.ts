import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config'
import { checkMesh, componentCount, downwardArea } from '../geometry/meshChecks'
import { computeLayout, layoutInputOf } from '../layout'
import { printerById } from '../printers'
import type { DesignConfig, MeshData } from '../types'
import { accessoryParts, buildAccessoryMesh, fitClearance, fitTestFor, wallParts } from './accessories'
import { CLIP_CLEARANCE } from './mechanism'
import { tabPlan } from './tabs'
import type { AccessorySpec } from './types'

const design = (over: Partial<DesignConfig> = {}): DesignConfig => ({ ...structuredClone(DEFAULT_CONFIG), ...over })
const planOf = (config: DesignConfig) => computeLayout(layoutInputOf(config, printerById(config.printerId)))
const partsOf = (config: DesignConfig) => accessoryParts(config, planOf(config))

function bounds(mesh: MeshData) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < mesh.positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], mesh.positions[i])
    max[i % 3] = Math.max(max[i % 3], mesh.positions[i])
  }
  return { min, max }
}

function expectSolid(spec: AccessorySpec, mesh: MeshData): void {
  const check = checkMesh(mesh)
  expect(check.closed, spec.id).toBe(true)
  expect(check.manifold, spec.id).toBe(true)
  expect(check.oriented, spec.id).toBe(true)
  expect(check.volume, spec.id).toBeGreaterThan(0)
  expect(componentCount(mesh), spec.id).toBe(1)
  expect(mesh.topIndexCount).toBe(0)
  // On the bed.
  expect(bounds(mesh).min[2]).toBeCloseTo(0, 6)
}

describe('accessory parts', () => {
  it('is empty for a glued design without keys, as every default design is', () => {
    expect(partsOf(DEFAULT_CONFIG)).toEqual([])
    expect(partsOf(design({ mount: 'clips', tile: { width: 150, height: 150, thickness: 3 } }))).toEqual([])
  })

  it('tests only the fasteners the wall really uses', () => {
    // Tiles too small for any clip pocket: no clips to try, so no fit test at all.
    expect(partsOf(design({ mount: 'clips', tile: { width: 50, height: 50, thickness: 4 }, surface: { width: 400, height: 300 } }))).toEqual([])
    // Keys that fit, clips that find no room: the fit test tries the keys alone.
    const keysOnly = partsOf(design({ mount: 'clips', lock: 'keys', tile: { width: 50, height: 50, thickness: 4 }, surface: { width: 400, height: 300 } }))
    expect(new Set(keysOnly.filter((p) => p.group === 'fit-test').map((p) => p.kind))).toEqual(new Set(['fit-test', 'key']))
    // A joint edge too deep for a key slot: the clips are tested, never keys.
    const clipsOnly = partsOf(design({ mount: 'clips', lock: 'keys', bevel: 3 }))
    expect(clipsOnly.some((p) => p.kind === 'key')).toBe(false)
    expect(clipsOnly.filter((p) => p.group === 'fit-test').some((p) => p.kind === 'clip')).toBe(true)
    // Keys that could be cut but that no joint takes: a whole tile beside a 10 mm cut, or one piece.
    expect(partsOf(design({ lock: 'keys', surface: { width: 160, height: 150 } }))).toEqual([])
    expect(partsOf(design({ lock: 'keys', surface: { width: 120, height: 120 } }))).toEqual([])
    // With keys that are placed, both coupons come along; the wall's clips bring theirs.
    const both = partsOf(design({ mount: 'clips', lock: 'keys' }))
    expect(both.filter((p) => p.kind === 'fit-test')).toHaveLength(2)
    expect(both.some((p) => p.kind === 'clip' && p.group === 'mount')).toBe(true)
    expect(both.some((p) => p.kind === 'clip' && p.group === 'fit-test')).toBe(true)
  })

  it('lists the fit test first, then the clips, then the keys', () => {
    const parts = partsOf(design({ mount: 'clips', lock: 'keys' }))
    const groups = parts.map((p) => p.group)
    const order = ['fit-test', 'mount', 'join']
    for (let i = 1; i < groups.length; i++) expect(order.indexOf(groups[i])).toBeGreaterThanOrEqual(order.indexOf(groups[i - 1]))
    expect(new Set(groups)).toEqual(new Set(order))
    expect(parts.filter((p) => p.group === 'mount').map((p) => p.mark)).toEqual(['C1'])
    expect(parts.filter((p) => p.group === 'join').map((p) => p.mark)).toEqual(['K1'])
    // Ids never repeat, and never look like a piece id.
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length)
    for (const p of parts) expect(p.id === 'full' || p.id.startsWith('p-')).toBe(false)
    // Marks are unique too: the plans and the file names carry them.
    expect(new Set(parts.map((p) => p.mark)).size).toBe(parts.length)
  })

  it('reads the clip clearance from the mechanism and keeps the key clearances', () => {
    for (const fit of ['snug', 'standard', 'loose'] as const) expect(fitClearance(fit, 'clip')).toBe(CLIP_CLEARANCE[fit])
    expect([fitClearance('snug', 'key'), fitClearance('standard', 'key'), fitClearance('loose', 'key')]).toEqual([0.05, 0.1, 0.15])
  })

  it('builds every part as one closed, printable solid the size its spec says', () => {
    const configs = [
      design({ mount: 'clips', lock: 'keys' }),
      design({ mount: 'clips', fit: 'loose', surface: { width: 1000, height: 550 }, layout: { origin: 'center', rowOffset: 0.5 }, printerId: 'bambu-a1-mini' }),
      design({ lock: 'keys', fit: 'snug' }),
    ]
    const seen = new Set<string>()
    for (const config of configs) {
      for (const spec of partsOf(config)) {
        if (seen.has(spec.id)) continue
        seen.add(spec.id)
        const mesh = buildAccessoryMesh(config, spec)
        expectSolid(spec, mesh)
        if (spec.kind === 'fit-test') continue
        const { min, max } = bounds(mesh)
        // The mesh fills its printed box.
        expect(max[0] - min[0], spec.id).toBeLessThanOrEqual(spec.size.x + 0.01)
        expect(max[1] - min[1], spec.id).toBeLessThanOrEqual(spec.size.y + 0.01)
        expect(max[2] - min[2], spec.id).toBeCloseTo(spec.size.z, 2)
        // A clip prints on its back: only the barbs' return faces look down, within 45 degrees of the vertical.
        // A key lies flat, its lead-in up: nothing looks down at all.
        if (spec.kind === 'clip') expect(downwardArea(mesh, 1e-3, Math.cos(45.01 * (Math.PI / 180))), spec.id).toBe(0)
        if (spec.kind === 'key') expect(downwardArea(mesh, 0), spec.id).toBe(0)
      }
    }
    for (const prefix of ['clip-', 'key-', 'fit-coupon']) expect([...seen].some((id) => id.startsWith(prefix)), prefix).toBe(true)
  })
})

describe('the two named lists of parts', () => {
  const fitted = design({ mount: 'clips', lock: 'keys' })

  it('composes the catalogue: the fit test, then the wall parts', () => {
    const plan = planOf(fitted)
    const wall = wallParts(fitted, plan)
    const test = fitTestFor(fitted, plan)
    expect(accessoryParts(fitted, plan)).toEqual([...test, ...wall])
    // The download's own files: the clips, then the keys, and no part of the fit test.
    expect(wall.map((p) => p.mark)).toEqual(['C1', 'K1'])
    expect(wall.map((p) => p.group)).toEqual(['mount', 'join'])
    expect(wall.some((p) => p.group === 'fit-test')).toBe(false)
    expect(test.every((p) => p.group === 'fit-test')).toBe(true)
    expect(test.map((p) => p.mark)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'])
  })

  it('has nothing to test where the wall needs no part', () => {
    // Glued, as every default design is.
    expect(wallParts(DEFAULT_CONFIG, planOf(DEFAULT_CONFIG))).toEqual([])
    expect(fitTestFor(DEFAULT_CONFIG, planOf(DEFAULT_CONFIG))).toEqual([])
    // A 3 mm plate holds no key slot and no clip pocket, whatever the design asks for.
    const thin = design({ mount: 'clips', lock: 'keys', tile: { width: 150, height: 150, thickness: 3 } })
    expect(wallParts(thin, planOf(thin))).toEqual([])
    expect(fitTestFor(thin, planOf(thin))).toEqual([])
    // Tiles too small for a pocket: the wall is glued, so there is nothing to try.
    const small = design({ mount: 'clips', tile: { width: 50, height: 50, thickness: 4 }, surface: { width: 400, height: 300 } })
    expect(wallParts(small, planOf(small))).toEqual([])
    expect(fitTestFor(small, planOf(small))).toEqual([])
  })

  it('tests the wall list it is handed, so the catalogue cannot disagree with itself', () => {
    const plan = planOf(fitted)
    const keysOnly = wallParts(fitted, plan).filter((part) => part.kind === 'key')
    const tried = fitTestFor(fitted, plan, keysOnly)
    expect(tried.some((part) => part.kind === 'clip')).toBe(false)
    expect(tried.some((part) => part.kind === 'key')).toBe(true)
    expect(fitTestFor(fitted, plan, [])).toEqual([])
  })

  // The tabs print nothing, so no part of the wall says they are there: the plan is the only witness, which
  // is why fitTestFor asks tabPlan rather than reading the list it is handed.
  it('tests the tabs off the plan, not off a printed part, and adds nothing to a wall without them', () => {
    const tabs = design({ lock: 'tabs' })
    const plan = planOf(tabs)
    expect(wallParts(tabs, plan)).toEqual([])
    expect(tabPlan(tabs, plan).tabs).toBeGreaterThan(0)
    const test = fitTestFor(tabs, plan)
    expect(test.map((p) => p.mark)).toEqual(['F1', 'F2', 'F3', 'F4'])
    expect(test.every((p) => p.kind === 'fit-test' && p.group === 'fit-test')).toBe(true)
    expect(accessoryParts(tabs, plan)).toEqual(test)
    // A wall one tile wide locks nothing, so there is nothing to try even with the tabs asked for.
    const one = design({ lock: 'tabs', surface: { width: 150, height: 600 } })
    expect(tabPlan(one, planOf(one)).tabs).toBe(0)
    expect(fitTestFor(one, planOf(one))).toEqual([])
  })

  it('leaves every design without tabs exactly as it was, part for part', () => {
    for (const config of [DEFAULT_CONFIG, design({ lock: 'keys' }), design({ mount: 'clips' }), design({ mount: 'clips', lock: 'keys' })]) {
      const plan = planOf(config)
      const parts = accessoryParts(config, plan)
      // No part of a design without tabs carries a socket or a tab, and the fit test is numbered as it was.
      for (const part of parts) {
        expect(part.shape.socket, part.id).toBeUndefined()
        expect(part.shape.tab ?? 0, part.id).toBe(0)
      }
      const test = parts.filter((p) => p.group === 'fit-test')
      expect(test.map((p) => p.mark)).toEqual(test.map((_, i) => `F${i + 1}`))
    }
  })
})
