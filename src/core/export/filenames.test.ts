import { describe, expect, it } from 'vitest'
import { accessoryParts } from '../fixing/accessories'
import { computeLayout } from '../layout'
import type { AccessorySpec } from '../fixing/types'
import type { PieceSpec } from '../types'
import { accessoryFileName, accessoryZipPath, pieceFileName, sizeText, slug } from './filenames'
import { FIXED_CONFIG, FIXED_PLAN } from './testFixings'

const piece = (over: Partial<PieceSpec> = {}): PieceSpec => ({
  id: 'full',
  mark: 'A',
  kind: 'full',
  label: 'Full tile',
  crop: { x0: 0, y0: 0, x1: 150, y1: 150 },
  width: 150,
  height: 150,
  count: 40,
  edges: { boundary: 0, tabs: 0, profiled: {} },
  ...over,
})

describe('slug', () => {
  it('keeps ASCII words and hyphens', () => {
    expect(slug('Full tile')).toBe('full-tile')
    expect(slug('Top-right corner')).toBe('top-right-corner')
  })

  it('strips accents and separators', () => {
    expect(slug('Coin supérieur · 42.5 × 150 mm')).toBe('coin-superieur-42-5-150-mm')
  })
})

describe('sizeText', () => {
  it('drops trailing zeros', () => {
    expect(sizeText(150)).toBe('150')
    expect(sizeText(42.5)).toBe('42.5')
    expect(sizeText(33.33)).toBe('33.33')
    expect(sizeText(100.0)).toBe('100')
  })
})

describe('pieceFileName', () => {
  it('names a full tile', () => {
    expect(pieceFileName(piece(), 'stl')).toBe('A_full-tile_150x150_x40.stl')
  })

  it('names a cut piece in either format', () => {
    const cut = piece({ mark: 'D', label: 'Top-right corner', width: 42.5, height: 150, count: 1 })
    expect(pieceFileName(cut, 'step')).toBe('D_top-right-corner_42.5x150_x1.step')
  })

  it('gives every piece of a real layout a unique file name', () => {
    const plan = computeLayout({
      surface: { width: 1000, height: 800 },
      tile: { width: 150, height: 150 },
      joint: 0,
      layout: { origin: 'balanced', rowOffset: 0.5 },
    })
    const names = plan.pieces.map((p) => pieceFileName(p, 'stl'))
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('accessoryFileName', () => {
  const spec = (over: Partial<AccessorySpec> = {}): AccessorySpec => ({
    id: 'clip-c0.2',
    kind: 'clip',
    mark: 'C1',
    label: 'Wall clip, standard fit',
    count: 29,
    size: { x: 48, y: 14.54, z: 2.8 },
    printNote: '',
    group: 'mount',
    shape: {},
    ...over,
  })

  it('names a part like a tile: mark, what it is, its size or class, copies', () => {
    expect(accessoryFileName(spec(), 'stl')).toBe('C1_wall-clip_standard-fit_x29.stl')
    expect(accessoryFileName(spec({ mark: 'F1', label: 'Coupon', count: 1, group: 'fit-test' }), 'stl')).toBe('F1_coupon_x1.stl')
    expect(accessoryFileName(spec({ mark: 'F3', label: 'Test clip 1, snug', count: 1, group: 'fit-test' }), 'step')).toBe('F3_test-clip-1_snug_x1.step')
  })

  it('keeps decimals in lengths and drops accents and symbols', () => {
    expect(accessoryFileName(spec({ kind: 'key', mark: 'K1', label: 'Key, 15.8 mm', count: 20, group: 'join' }), 'stl')).toBe('K1_key_15.8mm_x20.stl')
    expect(accessoryFileName(spec({ mark: 'K1', label: 'Clé, 0.1 mm', count: 3 }), 'stl')).toBe('K1_cle_0.1mm_x3.stl')
    expect(accessoryFileName(spec({ mark: 'F1', label: 'Test coupon · 67 × 23 mm', count: 1 }), 'stl')).toBe('F1_test-coupon-67-23-mm_x1.stl')
  })

  it('puts the part in its group folder inside the zip', () => {
    expect(accessoryZipPath(spec(), 'stl')).toBe('mount/C1_wall-clip_standard-fit_x29.stl')
    expect(accessoryZipPath(spec({ mark: 'F1', label: 'Coupon', count: 1, group: 'fit-test' }), 'step')).toBe('fit-test/F1_coupon_x1.step')
    expect(accessoryZipPath(spec({ kind: 'key', mark: 'K1', label: 'Key', count: 58, group: 'join' }), 'stl')).toBe('join/K1_key_x58.stl')
  })

  it('gives every part of a keyed wall on clips its own file in its own folder', () => {
    const parts = accessoryParts(FIXED_CONFIG, FIXED_PLAN)
    expect(new Set(parts.map((p) => p.kind))).toEqual(new Set(['fit-test', 'clip', 'key']))
    const paths = parts.map((p) => accessoryZipPath(p, 'stl'))
    expect(new Set(paths).size).toBe(paths.length)
    for (const [i, part] of parts.entries()) {
      expect(paths[i].startsWith(`${part.group}/${part.mark}_`)).toBe(true)
      expect(paths[i]).toMatch(/^(fit-test|mount|join)\/[A-Z]+\d+_[a-z0-9.-]+(_[a-z0-9.-]+)?_x\d+\.stl$/)
    }
    expect(paths.filter((path) => path.startsWith('mount/C1_wall-clip_standard-fit_x'))).toHaveLength(1)
  })

  it('never collides with a tile file: tile marks are letters only', () => {
    const plan = computeLayout({
      surface: { width: 1000, height: 800 },
      tile: { width: 150, height: 150 },
      joint: 0,
      layout: { origin: 'balanced', rowOffset: 0.5 },
    })
    const tiles = new Set(plan.pieces.map((p) => pieceFileName(p, 'stl')))
    for (const mark of ['C1', 'K1', 'F1']) expect(tiles.has(accessoryFileName(spec({ mark }), 'stl'))).toBe(false)
    for (const piece of plan.pieces) expect(piece.mark).toMatch(/^[A-Z]+$/)
  })
})
