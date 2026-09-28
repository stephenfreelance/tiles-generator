// Tessera's mark: the corner of a wall as the default layout sets it out. One whole tile at the top
// left, where tiling starts, and the three pieces the wall cuts at its right and bottom edges. A piece
// keeps its rounded corners along the joints and goes square only where the wall's edge cut it.
// Pure, so the app bar, the tab icon and public/favicon.svg all draw the same geometry.

import { markTones, type MarkTones } from '@/core/accent'

/** The tab icon's plate: the espresso bar, so the mark reads the same in a light or a dark tab strip. */
const PLATE = '#2E241B'

/**
 * Units of the 32-unit icon, every edge on a whole pixel at 16 px (7 px tile, 1 px joint, 4 px cuts)
 * and at the bar's 24 px crop. The radius is what tells a joint corner from a cut one, so it stays even
 * and large enough to read at that size.
 */
const INSET = 4
const WHOLE = 14
const JOINT = 2
const CUT = 32 - 2 * INSET - WHOLE - JOINT
const RADIUS = 4

/** The app bar crops the plate away and shows the mark alone, one unit to a pixel at 1.5rem. */
export const MARK_VIEWBOX = `${INSET} ${INSET} ${32 - 2 * INSET} ${32 - 2 * INSET}`

export interface MarkPiece {
  d: string
  tone: keyof MarkTones
}

/** A rectangle whose corners are rounded unless named square (tl, tr, br, bl). */
function piece(x: number, y: number, w: number, h: number, square: string[]): string {
  const [tl, tr, br, bl] = ['tl', 'tr', 'br', 'bl'].map((corner) => (square.includes(corner) ? 0 : RADIUS))
  const arc = (r: number, toX: number, toY: number) => (r ? `A${r} ${r} 0 0 1 ${toX} ${toY}` : '')
  return (
    `M${x + tl} ${y}H${x + w - tr}${arc(tr, x + w, y + tr)}` +
    `V${y + h - br}${arc(br, x + w - br, y + h)}` +
    `H${x + bl}${arc(bl, x, y + h - bl)}` +
    `V${y + tl}${arc(tl, x + tl, y)}Z`
  )
}

const FAR = INSET + WHOLE + JOINT

export const MARK_PIECES: readonly MarkPiece[] = [
  { d: piece(INSET, INSET, WHOLE, WHOLE, []), tone: 'whole' },
  { d: piece(FAR, INSET, CUT, WHOLE, ['tr', 'br']), tone: 'cut' },
  { d: piece(INSET, FAR, WHOLE, CUT, ['br', 'bl']), tone: 'cut' },
  { d: piece(FAR, FAR, CUT, CUT, ['tr', 'br', 'bl']), tone: 'cut' },
]

/** The tab icon for a tile color, as the SVG file's text. public/favicon.svg is this for DEFAULT_COLOR. */
export function faviconSvg(hex: string): string {
  const tones = markTones(hex)
  const paths = MARK_PIECES.map(({ d, tone }) => `  <path d="${d}" fill="${tones[tone]}"/>`).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  <rect width="32" height="32" rx="7" fill="${PLATE}"/>\n${paths}\n</svg>\n`
}
