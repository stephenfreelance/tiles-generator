import { describe, expect, it } from 'vitest'
import { pointInRing, ringBounds, ringSelfIntersects, signedArea } from '../geometry/polygon'
import { DIGIT_COLUMNS, DIGIT_ROWS, digitOutline, digitRing, FIT_DIGIT, type FitDigit, isFitDigit } from './fitDigit'
import { FIT_ORDER } from './fitTest'

// The number cut into the fit test's parts is all that tells the three fits apart once they are off the bed, so
// each digit has to be one clean ring a mesher can cut and a maker can read the right way round.

const DIGITS: FitDigit[] = [1, 2, 3]

/** Cells a digit covers: its area on the grid. */
const cells = (digit: FitDigit) => signedArea(digitOutline(digit))

describe('the fit digits', () => {
  it('numbers the fits in the order the fit test prints them, snuggest first', () => {
    expect(FIT_ORDER.map((fit) => FIT_DIGIT[fit])).toEqual([1, 2, 3])
    expect([0, 1, 2, 3, 4, '2', 2.5, null].filter(isFitDigit)).toEqual([1, 2, 3])
  })

  it('draws each digit as one simple counter-clockwise ring filling its 3 x 5 grid', () => {
    for (const digit of DIGITS) {
      const ring = digitOutline(digit)
      expect(ringSelfIntersects(ring), `${digit}`).toBe(false)
      expect(signedArea(ring), `${digit}`).toBeGreaterThan(0)
      expect(ringBounds(ring)).toEqual({ minX: 0, minY: 0, maxX: DIGIT_COLUMNS, maxY: DIGIT_ROWS })
      // Whole cells only, every edge along the grid: strokes and gaps are each one cell, never a sliver.
      for (let i = 0; i < ring.length; i += 2) {
        expect(Number.isInteger(ring[i]) && Number.isInteger(ring[i + 1])).toBe(true)
        const j = (i + 2) % ring.length
        expect(ring[i] === ring[j] || ring[i + 1] === ring[j + 1], `${digit} edge ${i / 2}`).toBe(true)
      }
    }
  })

  it('tells the three digits apart by their shape, not only by their order', () => {
    expect(DIGITS.map(cells)).toEqual([8, 11, 10])
    expect(new Set(DIGITS.map((digit) => digitOutline(digit).join())).size).toBe(3)
  })

  it('places a digit at its size and centre, upright', () => {
    for (const digit of DIGITS) {
      const ring = digitRing(digit, 1.2, 10, -4)
      expect(signedArea(ring)).toBeCloseTo(cells(digit) * 1.44, 9)
      const box = ringBounds(ring)
      expect(box.minX).toBeCloseTo(10 - 1.8, 9)
      expect(box.maxX).toBeCloseTo(10 + 1.8, 9)
      expect(box.minY).toBeCloseTo(-4 - 3, 9)
      expect(box.maxY).toBeCloseTo(-4 + 3, 9)
    }
    // Upright, not turned: the 1's flag sits on the left one cell below its top, with the top-left cell empty.
    const one = digitRing(1, 1, 0, 0)
    expect(pointInRing(one, -1, 1)).toBe(1)
    expect(pointInRing(one, -1, 2)).toBe(-1)
  })

  it('mirrors a digit for a back, still counter-clockwise and the reflection of the upright one', () => {
    for (const digit of DIGITS) {
      const upright = digitRing(digit, 1, 0, 0)
      const mirrored = digitRing(digit, 1, 0, 0, true)
      expect(signedArea(mirrored)).toBeCloseTo(signedArea(upright), 9)
      expect(ringSelfIntersects(mirrored)).toBe(false)
      const points = (ring: number[]) =>
        Array.from({ length: ring.length / 2 }, (_, k) => `${ring[2 * k] + 0},${ring[2 * k + 1] + 0}`).sort()
      const reflected = upright.map((v, k) => (k % 2 === 0 ? -v : v))
      expect(points(mirrored)).toEqual(points(reflected))
    }
  })
})
