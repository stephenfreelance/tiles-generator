import { describe, expect, it } from 'vitest'
import { clampToRange, decimalsOf, nudge, roundTo, stepMultiplier } from './fieldMath'

describe('fieldMath', () => {
  it('counts written decimals', () => {
    expect(decimalsOf(1)).toBe(0)
    expect(decimalsOf(0.25)).toBe(2)
    expect(decimalsOf(-2.5)).toBe(1)
    expect(decimalsOf(1e-7)).toBe(7)
    expect(decimalsOf(Number.NaN)).toBe(0)
  })

  it('rounds to a decimal count', () => {
    expect(roundTo(0.1 + 0.2, 1)).toBe(0.3)
    expect(roundTo(1234.5678, 2)).toBe(1234.57)
  })

  it('maps modifiers to step multipliers', () => {
    expect(stepMultiplier({ shiftKey: false, altKey: false })).toBe(1)
    expect(stepMultiplier({ shiftKey: true, altKey: false })).toBe(10)
    expect(stepMultiplier({ shiftKey: false, altKey: true })).toBe(0.1)
  })

  it('nudges without float drift', () => {
    expect(nudge(0.2, 0.1, 1)).toBe(0.3)
    expect(nudge(2.4, 0.1, 1, 0.1)).toBe(2.41)
    expect(nudge(150, 1, -1, 10)).toBe(140)
    expect(nudge(2.45, 0.1, 1)).toBe(2.55)
  })

  it('clamps and names the limit it hit', () => {
    expect(clampToRange(500, 20, 400)).toEqual({ value: 400, edge: 'max' })
    expect(clampToRange(5, 20, 400)).toEqual({ value: 20, edge: 'min' })
    expect(clampToRange(150, 20, 400)).toEqual({ value: 150, edge: null })
  })
})
