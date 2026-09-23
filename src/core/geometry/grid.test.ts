import { describe, expect, it } from 'vitest'
import { axisLines, float32Quantum } from './grid'

// Frozen copy of axisLines as it was before each end got its own breaks, the reference a default design
// must still match line for line. Do not edit it along with grid.ts.
function legacyAxisLines(size: number, cellMm: number, breaks: number[], quantum: number): Float64Array {
  const cellCount = (span: number, cell: number, min = 1) => Math.min(8192, Math.max(min, Math.ceil(span / cell - 1e-9)))
  const end = Math.fround(size)
  const cell = Math.max(cellMm, 1e-3)
  const offsets: number[] = []
  for (const b of breaks) {
    const q = Math.round(b / quantum) * quantum
    if (q > 0 && !offsets.includes(q)) offsets.push(q)
  }
  offsets.sort((a, b) => a - b)
  const band = offsets.length ? offsets[offsets.length - 1] : 0
  if (band <= 0 || 2 * band >= end - 0.5 * cell) {
    const n = cellCount(end, cell, 2)
    const lines = new Float64Array(n + 1)
    for (let i = 0; i <= n; i++) lines[i] = Math.fround((i / n) * end)
    return lines
  }
  const bandLines: number[] = [0]
  let previous = 0
  for (const offset of offsets) {
    const span = offset - previous
    const steps = Math.min(64, Math.max(1, Math.min(Math.round(span / quantum), cellCount(span, cell))))
    for (let k = 1; k <= steps; k++) {
      bandLines.push(k === steps ? offset : previous + Math.round((k * span) / steps / quantum) * quantum)
    }
    previous = offset
  }
  const inner = cellCount(end - 2 * band, cell)
  const count = bandLines.length
  const lines = new Float64Array(2 * count + inner - 1)
  for (let k = 0; k < count; k++) lines[k] = bandLines[k]
  for (let i = 1; i < inner; i++) lines[count - 1 + i] = Math.fround(band + (i / inner) * (end - 2 * band))
  for (let k = 0; k < count; k++) lines[count + inner - 1 + k] = end - bandLines[count - 1 - k]
  return lines
}

const quantum = float32Quantum(150)

const isFloat32 = (lines: Float64Array) => lines.every((v) => Math.fround(v) === v)
const isIncreasing = (lines: Float64Array) => lines.every((v, i) => i === 0 || v > lines[i - 1])

describe('axisLines', () => {
  it('matches the symmetric grid it replaced, line for line', () => {
    for (const size of [150, 125, 100, 42.5, 33.33, 12, 7, 2.1, 1.2]) {
      for (const cell of [0.2, 0.4, 0.8, 1.2, 2, 5]) {
        for (const breaks of [[], [0], [0.5], [0.6], [1.2], [3], [0.6, 0.3]]) {
          const expected = legacyAxisLines(size, cell, breaks, quantum)
          expect(axisLines(size, cell, breaks, breaks, quantum), `${size} ${cell} ${breaks}`).toEqual(expected)
        }
      }
    }
  })

  it('puts each end its own breaks, float32-exact on both sides', () => {
    const lines = axisLines(150, 0.8, [0.5, 8, 13.2], [0.5], quantum)
    expect(lines[0]).toBe(0)
    expect(lines[lines.length - 1]).toBe(150)
    expect(isIncreasing(lines)).toBe(true)
    expect(isFloat32(lines)).toBe(true)
    const q = (v: number) => Math.round(v / quantum) * quantum
    for (const b of [0.5, 8, 13.2]) expect(lines).toContain(q(b))
    expect(lines).toContain(150 - q(0.5))
    // No line mirrors the low end's profile at the high end.
    expect(lines).not.toContain(150 - q(8))
  })

  it('subdivides a wide band to the cell size', () => {
    const lines = axisLines(150, 0.2, [16], [0.5], quantum)
    const inBand = [...lines].filter((v) => v <= Math.round(16 / quantum) * quantum)
    // 16 mm at 0.2 mm: 80 cells, more than the chamfer-sized cap the band used to have.
    expect(inBand).toHaveLength(81)
    // Lines sit on the float32 lattice, so a cell may be a step wider than asked.
    const widest = Math.max(...inBand.slice(1).map((v, i) => v - inBand[i]))
    expect(widest).toBeLessThanOrEqual(0.2 + 2 * quantum)
  })

  it('keeps a profile on one end only, with nothing on the other', () => {
    const lines = axisLines(40, 1, [3, 6], [], quantum)
    expect(isIncreasing(lines)).toBe(true)
    expect(lines).toContain(Math.round(6 / quantum) * quantum)
    expect(lines[lines.length - 1]).toBe(40)
  })

  it('falls back to a plain grid on overlapping joint bands, and keeps every break with union', () => {
    // A 5 mm border cut: the profile's lines run past the far joint's.
    const low = [0.5, 3.2, 4.8]
    const high = [0.5]
    const plain = axisLines(5, 0.8, low, high, quantum)
    expect(plain).toEqual(axisLines(5, 0.8, [], [], quantum))
    const union = axisLines(5, 0.8, low, high, quantum, true)
    expect(isIncreasing(union)).toBe(true)
    expect(isFloat32(union)).toBe(true)
    const q = (v: number) => Math.round(v / quantum) * quantum
    for (const b of low) expect(union).toContain(q(b))
    expect(union).toContain(Math.fround(5) - q(0.5))
    const widest = Math.max(...[...union].slice(1).map((v, i) => v - union[i]))
    expect(widest).toBeLessThanOrEqual(0.8 + 2 * quantum)
  })

  it('drops breaks outside the piece', () => {
    expect(axisLines(10, 1, [0.5, 12, 30], [0.5], quantum)).toEqual(axisLines(10, 1, [0.5], [0.5], quantum))
  })
})
