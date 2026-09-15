// The interface accent follows the tile color, but a maker must never be able to drag the action
// color under its contrast floor: a white or yellow tile would otherwise leave white lettering on a
// pale button. So the palette keeps the tile's hue (worked in OKLCH, where lightness moves without
// the hue drifting) and darkens only as far as the floor demands. Pure, so vitest can prove the
// floors over every preset and a dense grid of custom colors.

import { DEFAULT_COLOR, parseHex } from './colors'

/** Every value an uppercase '#RRGGBB'. */
export interface AccentPalette {
  /** The primary action, selection and focus. */
  accent: string
  hover: string
  press: string
  /** A very light tint of the same hue, for selected fills and chips that carry accent lettering. */
  soft: string
  /** What sits on the accent. */
  ink: string
}

/** --panel, the lightest surface the accent is drawn on. */
const PANEL = '#FFFDF8'
/** The retired fixed green (#35682A) reached 6.53:1 on --panel; no tile color may do worse. */
const ACCENT_FLOOR = 6.5
/** OKLab lightness steps down to hover and press, close to the hand-tuned green's (0.032, 0.071). */
const HOVER_STEP = 0.035
const PRESS_STEP = 0.075
/** Below this lightness a press step would crush into black, so the dark accents step lighter instead. */
const DARK_LIMIT = 0.2
/** The retired #EDF3E6 sat at L 0.956, C 0.018: pale enough for accent and --ink-3 lettering, still tinted. */
const SOFT_LIGHTNESS = 0.956
const SOFT_CHROMA = 0.02
/** --panel-2, the recessed bench tone a near-grey tile's soft fill takes its warmth from. */
const BENCH = '#EFE7D8'

type Rgb = [number, number, number]

interface Lch {
  l: number
  c: number
  h: number
}

const toLinear = (channel: number): number => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
const toGamma = (channel: number): number => (channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055)

/** Linear-light sRGB channels in [0, 1]; an unreadable hex reads as black, as hexToHsv does. */
function linearRgb(hex: string): Rgb {
  const n = parseInt((parseHex(hex) ?? '#000000').slice(1), 16)
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255)]
}

function luminance(hex: string): number {
  const [r, g, b] = linearRgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio, from 1 to 21, symmetric in its arguments. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// OKLab matrices from Bjorn Ottosson's reference implementation.
function toOklch([r, g, b]: Rgb): Lch {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: lightness, c: Math.hypot(A, B), h: Math.atan2(B, A) }
}

function fromOklch({ l: lightness, c, h }: Lch): Rgb {
  const A = c * Math.cos(h)
  const B = c * Math.sin(h)
  const l = (lightness + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (lightness - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (lightness - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const GAMUT_EPSILON = 1e-6
const inGamut = (rgb: Rgb): boolean => rgb.every((channel) => channel >= -GAMUT_EPSILON && channel <= 1 + GAMUT_EPSILON)

/** The color at this lightness and hue, its chroma reduced only as far as sRGB requires. */
function inGamutHex(lch: Lch): string {
  const l = Math.min(1, Math.max(0, lch.l))
  let rgb = fromOklch({ l, c: lch.c, h: lch.h })
  if (!inGamut(rgb)) {
    let lo = 0
    let hi = lch.c
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2
      if (inGamut(fromOklch({ l, c: mid, h: lch.h }))) lo = mid
      else hi = mid
    }
    rgb = fromOklch({ l, c: lo, h: lch.h })
  }
  const byte = (channel: number) =>
    Math.round(toGamma(Math.min(1, Math.max(0, channel))) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${byte(rgb[0])}${byte(rgb[1])}${byte(rgb[2])}`.toUpperCase()
}

/** The tile color when it already clears the floor, otherwise the lightest color of its hue that does. */
function readableAccent(hex: string, lch: Lch): string {
  if (contrastRatio(hex, PANEL) >= ACCENT_FLOOR) return hex
  // Black clears every floor, so the search always holds a passing candidate.
  let best = '#000000'
  let lo = 0
  let hi = lch.l
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2
    const candidate = inGamutHex({ l: mid, c: lch.c, h: lch.h })
    if (contrastRatio(candidate, PANEL) >= ACCENT_FLOOR) {
      best = candidate
      lo = mid
    } else {
      hi = mid
    }
  }
  return best
}

/**
 * The pale fill of the tile's hue. A near-grey tile has almost no hue to lend, and its faint cast
 * (Charcoal leans blue) would read cold on the warm bench, so it borrows --panel-2's warmth instead.
 */
function softTint(tile: Lch): string {
  const bench = toOklch(linearRgb(BENCH))
  // Squared below the cap, so a faint cast fades out faster than the borrowed warmth fades in.
  const share = Math.min(tile.c, SOFT_CHROMA) / SOFT_CHROMA
  const own = share * Math.min(tile.c, SOFT_CHROMA)
  const borrowed = (1 - share) * Math.min(bench.c, SOFT_CHROMA)
  const a = own * Math.cos(tile.h) + borrowed * Math.cos(bench.h)
  const b = own * Math.sin(tile.h) + borrowed * Math.sin(bench.h)
  return inGamutHex({ l: SOFT_LIGHTNESS, c: Math.hypot(a, b), h: Math.atan2(b, a) })
}

/** The accent family for a tile color; an unreadable hex gets the palette of DEFAULT_COLOR. */
export function accentPalette(hex: string): AccentPalette {
  const tile = parseHex(hex) ?? DEFAULT_COLOR
  const tileLch = toOklch(linearRgb(tile))
  const accent = readableAccent(tile, tileLch)
  const accentLch = toOklch(linearRgb(accent))
  // Darker steps read as pressing in. A near-black accent has no room, so it steps toward the light,
  // from DARK_LIMIT at least: below it a step rounds to the same 8-bit color or one no screen shows.
  const darker = accentLch.l - PRESS_STEP >= DARK_LIMIT
  const step = (delta: number) =>
    inGamutHex({ ...accentLch, l: darker ? accentLch.l - delta : Math.max(accentLch.l, DARK_LIMIT) + delta })
  return {
    accent,
    hover: step(HOVER_STEP),
    press: step(PRESS_STEP),
    soft: softTint(tileLch),
    // --panel: the accent clears 6.5:1 against it, so the same pair reads as lettering on the accent.
    ink: PANEL,
  }
}

/** The custom properties a palette writes, named as _tokens.scss declares them. */
export function accentVariables(palette: AccentPalette): Record<string, string> {
  return {
    '--accent': palette.accent,
    '--accent-hover': palette.hover,
    '--accent-press': palette.press,
    '--accent-soft': palette.soft,
    '--accent-ink': palette.ink,
  }
}
