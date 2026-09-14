import { describe, expect, it } from 'vitest'
import { computeLayout } from '../layout'
import type { PieceSpec } from '../types'
import { pieceFileName, sizeText, slug } from './filenames'

const piece = (over: Partial<PieceSpec> = {}): PieceSpec => ({
  id: 'full',
  mark: 'A',
  kind: 'full',
  label: 'Full tile',
  crop: { x0: 0, y0: 0, x1: 150, y1: 150 },
  width: 150,
  height: 150,
  count: 40,
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
