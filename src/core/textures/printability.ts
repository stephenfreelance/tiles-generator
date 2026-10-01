// What a face-up FDM print makes of a relief. A printer lays the relief down in flat layers, so a surface
// comes out as stairs: each step is one layer tall and layer / tan(slope) wide. Steep flanks give steps
// narrower than a line of plastic, which read as one smooth surface; true flats print as one clean skin;
// everything in between (the top of a low dome, the bottom of a shallow dish, a crest that rolls over
// gently) prints as wide flat treads ringed by steps, which is the "striped" and "nipple" look a print
// shows where the render showed a smooth curve. This measures how much of a relief falls there.
//
// Pure and DOM-free: it samples any field in millimetres, so the tests hold every texture to it.

/** The layer the numbers are quoted at: what slicers ship for a 0.4 mm nozzle, and what the README advises at most. */
export const LAYER_MM = 0.2
/**
 * Widest stair step that still reads as part of a slope rather than as a flat tread with a line around it:
 * about two and a half lines of a 0.4 mm nozzle. At 0.2 mm layers it means a slope of at least 11 degrees.
 */
export const STEP_LIMIT_MM = 1
/** Slope below which a surface is a designed flat: its one tread is wider than 6 mm and prints as a clean skin. */
export const FLAT_SLOPE = 0.03
/** A cap narrower than this is a speck, not something the eye picks out as a disc. */
const CAP_MIN_MM = 1.6
/** Share of a tread that must be curved by design for it to count as a cap rather than a small plateau. */
const CAP_CURVED_SHARE = 0.7

export interface LayerStats {
  /** Share of the area that is flat by design (a plateau or a floor). */
  flat: number
  /** Share of the area neither flat nor steep: its steps are wider than STEP_LIMIT_MM, so it prints striped. */
  shallow: number
  /**
   * Caps per 1000 mm2: tops of domes and bottoms of dishes that are curved by design but come out of the
   * printer as a flat disc at least CAP_MIN_MM across, ringed by steps: the "nipple" and the "single circle".
   */
  caps: number
  /** Median step width over the sloped area (not flat), mm: how fine the lines on the slopes are. */
  medianStepMm: number
}

export interface LayerOptions {
  layerMm?: number
  /** Sampling pitch, mm: finer than a line of plastic, so a cap is measured to a tenth of a millimetre. */
  pitchMm?: number
}

/**
 * Samples `field` over a window (mm) and reports how it prints. The printed height is the field rounded to
 * whole layers, as a slicer cuts each layer through its middle.
 */
export function layerStats(
  field: (x: number, y: number) => number,
  window: { x0: number; y0: number; width: number; height: number },
  options: LayerOptions = {},
): LayerStats {
  const layer = options.layerMm ?? LAYER_MM
  const pitch = options.pitchMm ?? 0.1
  const nx = Math.max(3, Math.round(window.width / pitch))
  const ny = Math.max(3, Math.round(window.height / pitch))
  // One sample of margin all round, so every pixel of the window has a central difference.
  const w = nx + 2
  const h = ny + 2
  const z = new Float64Array(w * h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) z[j * w + i] = field(window.x0 + (i - 0.5) * pitch, window.y0 + (j - 0.5) * pitch)
  }
  const steepSlope = layer / STEP_LIMIT_MM
  const n = nx * ny
  const level = new Int32Array(n)
  const slope = new Float64Array(n)
  let flat = 0
  let shallow = 0
  const steps: number[] = []
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const at = (j + 1) * w + i + 1
      const gx = (z[at + 1] - z[at - 1]) / (2 * pitch)
      const gy = (z[at + w] - z[at - w]) / (2 * pitch)
      const g = Math.hypot(gx, gy)
      const k = j * nx + i
      slope[k] = g
      level[k] = Math.floor(z[at] / layer + 0.5)
      if (g < FLAT_SLOPE) flat++
      else {
        if (g < steepSlope) shallow++
        steps.push(layer / g)
      }
    }
  }
  steps.sort((a, b) => a - b)
  return {
    flat: flat / n,
    shallow: shallow / n,
    caps: (countCaps(level, slope, nx, ny, pitch) * 1000) / (window.width * window.height),
    medianStepMm: steps.length ? steps[Math.floor(steps.length / 2)] : 0,
  }
}

/**
 * Treads that stand above (or sink below) everything around them and are curved by design: a disc the
 * printer made where the model had a rounded top. A tread touching the window's edge is left out, since
 * its far side is unknown.
 */
function countCaps(level: Int32Array, slope: Float64Array, nx: number, ny: number, pitch: number): number {
  const seen = new Uint8Array(level.length)
  const stack: number[] = []
  let caps = 0
  for (let start = 0; start < level.length; start++) {
    if (seen[start]) continue
    const l = level[start]
    let above = false
    let below = false
    let edge = false
    let area = 0
    let curved = 0
    seen[start] = 1
    stack.push(start)
    while (stack.length) {
      const k = stack.pop() as number
      area++
      if (slope[k] >= FLAT_SLOPE) curved++
      const i = k % nx
      const j = (k - i) / nx
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) edge = true
      for (const [di, dj] of NEIGHBOURS) {
        const a = i + di
        const b = j + dj
        if (a < 0 || b < 0 || a >= nx || b >= ny) continue
        const q = b * nx + a
        const lq = level[q]
        if (lq === l) {
          if (!seen[q]) {
            seen[q] = 1
            stack.push(q)
          }
        } else if (lq > l) above = true
        else below = true
      }
    }
    if (edge || (above && below) || (!above && !below)) continue
    const diameter = 2 * Math.sqrt((area * pitch * pitch) / Math.PI)
    // Curved by design almost throughout: a dome's tread is flat only at its very apex (a few percent),
    // while a narrow plateau the model asked for keeps a third or more flat inside the band of flank its
    // top layer also takes in.
    if (diameter >= CAP_MIN_MM && curved > CAP_CURVED_SHARE * area) caps++
  }
  return caps
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
