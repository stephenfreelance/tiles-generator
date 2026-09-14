// Turning the setting-out model into screen geometry: one scale, so pencil lines and lettering keep
// their size in pixels while the drawing itself is measured in surface millimetres.

/** One CSS pixel in millimetres, at the 96 dpi the browser assumes. */
const MM_PER_CSS_PX = 25.4 / 96

export interface PlanGutters {
  left: number
  right: number
  top: number
  bottom: number
}

export interface PlanFrame {
  /** viewBox in surface millimetres, with (0, 0) at the top-left corner of the surface. */
  viewBox: { x: number; y: number; width: number; height: number }
  /** Screen pixels per surface millimetre. */
  scale: number
  /** Surface millimetres per screen pixel: the width of a hairline, the height of a letter. */
  mmPerPx: number
  /** Drawing scale for the view title, "1:20". */
  scaleText: string
}

/**
 * Fits the surface inside the measured box, keeping the gutters (in pixels) free for the dimension
 * chains, and returns the viewBox that makes one viewBox unit exactly one surface millimetre.
 */
export function planFrame(
  surface: { width: number; height: number },
  box: { width: number; height: number },
  gutters: PlanGutters,
): PlanFrame {
  const innerWidth = Math.max(16, box.width - gutters.left - gutters.right)
  const innerHeight = Math.max(16, box.height - gutters.top - gutters.bottom)
  const scale = Math.min(innerWidth / Math.max(1, surface.width), innerHeight / Math.max(1, surface.height))
  const mmPerPx = 1 / scale
  // Centre the surface in what the gutters leave, so the drawing sits square in its frame.
  const slackX = (innerWidth - surface.width * scale) / 2
  const slackY = (innerHeight - surface.height * scale) / 2
  return {
    viewBox: {
      x: -(gutters.left + slackX) * mmPerPx,
      y: -(gutters.top + slackY) * mmPerPx,
      width: box.width * mmPerPx,
      height: box.height * mmPerPx,
    },
    scale,
    mmPerPx,
    scaleText: scaleText(scale),
  }
}

/** "1:20", "1:2.5" or "4:1" for a swatch drawn larger than life. */
export function scaleText(pxPerMm: number): string {
  const ratio = 1 / (pxPerMm * MM_PER_CSS_PX)
  if (!Number.isFinite(ratio) || ratio <= 0) return '1:1'
  if (ratio < 1) return `${(1 / ratio).toFixed(1).replace(/\.0$/, '')}:1`
  if (ratio < 3) return `1:${ratio.toFixed(1)}`
  return `1:${Math.round(ratio)}`
}

/** Screen pixels from the surface edge to the first chain line. */
export const CHAIN_TOP_PX = 22
/** One dimension chain, with room under it for a cut figure too narrow to sit on its own span. */
export const CHAIN_BAND_PX = 28
/** Last chain line to the overall dimension line. */
export const OVERALL_GAP_PX = 28

/** The room the chains need around the surface, in screen pixels. */
export function planGutters(chainCount: number): PlanGutters {
  return {
    left: CHAIN_TOP_PX + OVERALL_GAP_PX + 26,
    // A bond repeats over several rows, and each of those chains is named at its right-hand end.
    right: chainCount > 1 ? 44 : 14,
    top: 16,
    bottom: CHAIN_TOP_PX + Math.max(0, chainCount - 1) * CHAIN_BAND_PX + OVERALL_GAP_PX + 20,
  }
}

/**
 * Keeps every nth division so ticks and extension lines never crowd: with 60 tiles across a phone
 * the chain still reads as a scale instead of a smear.
 */
export function tickStride(pitchPx: number, minPx = 7): number {
  if (!Number.isFinite(pitchPx) || pitchPx <= 0) return 1
  return Math.max(1, Math.ceil(minPx / pitchPx))
}
