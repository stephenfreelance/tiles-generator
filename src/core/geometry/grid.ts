// Sample grid of the top surface. Grid lines are float32-exact values, and the surface is sampled at
// exactly those values, so a vertex stored as float32 sits on the analytic surface to within one float32
// rounding of z. That is what keeps chamfer planes (and any sloped flat land) exactly planar after the
// mesh is written out, which the STEP coplanar merge depends on.

/** Cap on cells per axis, so an absurd cellMm cannot allocate gigabytes. */
const MAX_CELLS = 8192
/** Cap on cells across one chamfer band. */
const MAX_BAND_CELLS = 64

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

/**
 * Grid lines across one axis of a piece: uniform cells, plus break lines at the given distances from both
 * edges (where the chamfer meets the relief) so the bevel planes stay flat and the corner mitres run along
 * cell diagonals. Identical for every piece with the same size, cell and breaks, so neighbouring pieces
 * share their rim samples exactly.
 */
export function axisLines(size: number, cellMm: number, breaks: number[], quantum: number): Float64Array {
  const end = Math.fround(size)
  const cell = Math.max(cellMm, 1e-3)
  const offsets: number[] = []
  for (const b of breaks) {
    const q = Math.round(b / quantum) * quantum
    if (q > 0 && !offsets.includes(q)) offsets.push(q)
  }
  offsets.sort((a, b) => a - b)
  const band = offsets.length ? offsets[offsets.length - 1] : 0
  // A piece barely wider than two chamfers gets a plain uniform grid instead of overlapping bands.
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
    const steps = Math.min(MAX_BAND_CELLS, Math.max(1, Math.min(Math.round(span / quantum), cellCount(span, cell))))
    for (let k = 1; k <= steps; k++) {
      bandLines.push(k === steps ? offset : previous + Math.round((k * span) / steps / quantum) * quantum)
    }
    previous = offset
  }
  const inner = cellCount(end - 2 * band, cell)
  const count = bandLines.length
  const lines = new Float64Array(2 * count + inner - 1)
  for (let k = 0; k < count; k++) lines[k] = bandLines[k]
  for (let i = 1; i < inner; i++) {
    lines[count - 1 + i] = Math.fround(band + (i / inner) * (end - 2 * band))
  }
  for (let k = 0; k < count; k++) lines[count + inner - 1 + k] = end - bandLines[count - 1 - k]
  return lines
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
