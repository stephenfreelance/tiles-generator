// Sample grid of the top surface. Grid lines are float32-exact values, and the surface is sampled at
// exactly those values, so a vertex stored as float32 sits on the analytic surface to within one float32
// rounding of z. That is what keeps chamfer planes (and any sloped flat land) exactly planar after the
// mesh is written out, which the STEP coplanar merge depends on.

/** Cap on cells per axis, so an absurd cellMm cannot allocate gigabytes. */
const MAX_CELLS = 8192

export interface GridSurface {
  xs: Float64Array
  ys: Float64Array
  /** Row-major (ny + 1) x (nx + 1) heights, already rounded to float32. */
  z: Float64Array
  /** Per cell: 0 = split along v00-v11, 1 = split along v10-v01. */
  diag: Uint8Array
}

/** Size of one float32 step at `maxSize`: offsets on this lattice are exact at 0 and at the far edge. */
export function float32Quantum(maxSize: number): number {
  const m = Math.max(Math.abs(maxSize), 1e-3)
  return 2 ** (Math.floor(Math.log2(m)) - 23)
}

const cellCount = (span: number, cellMm: number, min = 1) =>
  Math.min(MAX_CELLS, Math.max(min, Math.ceil(span / cellMm - 1e-9)))

/** Cells across one span between two breaks: cellMm wide, on the quantum lattice, at least one. */
const spanSteps = (span: number, cell: number, quantum: number) =>
  Math.max(1, Math.min(Math.round(span / quantum), cellCount(span, cell)))

/** Breaks on the quantum lattice, strictly inside (0, end), sorted and without repeats. */
function latticeOffsets(breaks: readonly number[], end: number, quantum: number): number[] {
  const offsets: number[] = []
  for (const b of breaks) {
    const q = Math.round(b / quantum) * quantum
    if (q > 0 && q < end && !offsets.includes(q)) offsets.push(q)
  }
  return offsets.sort((a, b) => a - b)
}

/** Lines from 0 through every offset, each span cut into cells on the quantum lattice. */
function bandLines(offsets: readonly number[], cell: number, quantum: number): number[] {
  const lines = [0]
  let previous = 0
  for (const offset of offsets) {
    const span = offset - previous
    const steps = spanSteps(span, cell, quantum)
    for (let k = 1; k <= steps; k++) {
      lines.push(k === steps ? offset : previous + Math.round((k * span) / steps / quantum) * quantum)
    }
    previous = offset
  }
  return lines
}

/**
 * Grid lines across one axis of a piece: uniform cells, plus break lines at the given distances in from
 * the low end (x = 0 or y = 0) and from the high end, where an edge profile creases, so its planes stay
 * flat and the corner mitres run along cell diagonals. The low band is built from 0 and the high band as
 * `end - offset`, so lines on both sides stay float32-exact. Identical for every piece with the same size,
 * cell and breaks, so neighbouring pieces share their rim samples exactly.
 *
 * When the two bands overlap (a piece barely wider than its edges) the grid is uniform, as it always was
 * for joint edges; with `union` (a perimeter profile crosses the axis) it keeps every break instead, each
 * span subdivided to cellMm, so a narrow border cut still carries its profile's creases.
 */
export function axisLines(
  size: number,
  cellMm: number,
  lowBreaks: readonly number[],
  highBreaks: readonly number[],
  quantum: number,
  union = false,
): Float64Array {
  const end = Math.fround(size)
  const cell = Math.max(cellMm, 1e-3)
  const low = latticeOffsets(lowBreaks, end, quantum)
  const high = latticeOffsets(highBreaks, end, quantum)
  const lowBand = low.length ? low[low.length - 1] : 0
  const highBand = high.length ? high[high.length - 1] : 0
  const overlap = lowBand + highBand >= end - 0.5 * cell
  if ((lowBand <= 0 && highBand <= 0) || (overlap && !union)) {
    const n = cellCount(end, cell, 2)
    const lines = new Float64Array(n + 1)
    for (let i = 0; i <= n; i++) lines[i] = Math.fround((i / n) * end)
    return lines
  }
  if (overlap) return unionLines(end, cell, low, high, quantum)
  const lowLines = bandLines(low, cell, quantum)
  const highLines = bandLines(high, cell, quantum)
  const middle = end - lowBand - highBand
  const inner = cellCount(middle, cell)
  const lines = new Float64Array(lowLines.length + inner - 1 + highLines.length)
  let k = 0
  for (const line of lowLines) lines[k++] = line
  for (let i = 1; i < inner; i++) lines[k++] = Math.fround(lowBand + (i / inner) * middle)
  for (let i = highLines.length - 1; i >= 0; i--) lines[k++] = end - highLines[i]
  return lines
}

/** Every break from both ends in one sorted list, each span cut into cells: bands that overlap. */
function unionLines(end: number, cell: number, low: number[], high: number[], quantum: number): Float64Array {
  const stops = [...new Set([0, ...low, ...high.map((q) => end - q), end])].sort((a, b) => a - b)
  const lines = [0]
  for (let s = 1; s < stops.length; s++) {
    const a = stops[s - 1]
    const b = stops[s]
    const span = b - a
    const steps = spanSteps(span, cell, quantum)
    for (let k = 1; k < steps; k++) {
      const line = a + Math.round((k * span) / steps / quantum) * quantum
      if (line > lines[lines.length - 1] && line < b) lines.push(line)
    }
    lines.push(b)
  }
  return Float64Array.from(lines)
}

/** Samples the surface on the grid and picks, per cell, the diagonal that follows the surface best. */
export function sampleGrid(sample: (x: number, y: number) => number, xs: Float64Array, ys: Float64Array): GridSurface {
  const nx = xs.length - 1
  const ny = ys.length - 1
  const w1 = nx + 1
  const z = new Float64Array(w1 * (ny + 1))
  for (let j = 0; j <= ny; j++) {
    const y = ys[j]
    const row = j * w1
    for (let i = 0; i <= nx; i++) z[row + i] = Math.fround(sample(xs[i], y))
  }
  const diag = new Uint8Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    const yc = 0.5 * (ys[j] + ys[j + 1])
    for (let i = 0; i < nx; i++) {
      const a = j * w1 + i
      const z00 = z[a]
      const z10 = z[a + 1]
      const z01 = z[a + w1]
      const z11 = z[a + w1 + 1]
      // The centre sample decides: a rising ridge (the chamfer mitre) has the smaller height difference
      // across the wrong diagonal, so comparing height differences alone flattens it.
      const zc = sample(0.5 * (xs[i] + xs[i + 1]), yc)
      const errA = Math.abs(0.5 * (z00 + z11) - zc)
      const errB = Math.abs(0.5 * (z10 + z01) - zc)
      diag[j * nx + i] =
        errA < errB ? 0 : errB < errA ? 1 : Math.abs(z00 - z11) <= Math.abs(z10 - z01) ? 0 : 1
    }
  }
  return { xs, ys, z, diag }
}
