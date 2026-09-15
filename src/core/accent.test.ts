import { describe, expect, it } from 'vitest'
import { accentPalette, accentVariables, contrastRatio, type AccentPalette } from './accent'
import { COLOR_PRESETS, DEFAULT_COLOR } from './colors'

const PANEL = '#FFFDF8'
const GROUND = '#F2EADC'
const INK_3 = '#6B5D4D'
const HEX = /^#[0-9A-F]{6}$/

// An independent OKLCH reading, so the hue check does not trust the module's own conversion.
function oklch(hex: string): { l: number; c: number; h: number } {
  const linear = (i: number) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [linear(1), linear(3), linear(5)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    c: Math.hypot(A, B),
    h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  }
}

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** Every floor the interface leans on, with the input named in each failure. */
function expectFloors(input: string, palette: AccentPalette) {
  for (const value of Object.values(palette)) expect(value, input).toMatch(HEX)
  expect(contrastRatio(palette.accent, PANEL), input).toBeGreaterThanOrEqual(6.5)
  expect(contrastRatio(palette.ink, palette.accent), input).toBeGreaterThanOrEqual(6.5)
  expect(contrastRatio(palette.ink, palette.hover), input).toBeGreaterThanOrEqual(6.5)
  expect(contrastRatio(palette.ink, palette.press), input).toBeGreaterThanOrEqual(6.5)
  expect(contrastRatio(palette.accent, palette.soft), input).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(INK_3, palette.soft), input).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(palette.accent, GROUND), input).toBeGreaterThanOrEqual(4.5)
  // Visibly distinct states: dark hues compress WCAG ratios, so 1.05 is a real step there.
  expect(contrastRatio(palette.accent, palette.hover), input).toBeGreaterThanOrEqual(1.05)
  expect(contrastRatio(palette.hover, palette.press), input).toBeGreaterThanOrEqual(1.05)
  expect(contrastRatio(palette.accent, palette.press), input).toBeGreaterThan(contrastRatio(palette.accent, palette.hover))
  expect(contrastRatio(palette.soft, PANEL), input).toBeGreaterThanOrEqual(1.08)
}

describe('contrastRatio', () => {
  it('matches the WCAG extremes and is symmetric', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
    expect(contrastRatio('#35682A', PANEL)).toBeCloseTo(contrastRatio(PANEL, '#35682A'), 10)
  })

  it('agrees with the ratios measured for the retired green', () => {
    expect(contrastRatio('#35682A', PANEL)).toBeCloseTo(6.53, 2)
    expect(contrastRatio('#35682A', '#EDF3E6')).toBeCloseTo(5.87, 2)
  })
})

describe('accentPalette', () => {
  it('holds every floor for the eleven presets', () => {
    for (const preset of COLOR_PRESETS) expectFloors(preset.name, accentPalette(preset.hex))
  })

  it('holds every floor over a dense grid of custom colors', () => {
    const byte = (n: number) => n.toString(16).padStart(2, '0')
    for (let r = 0; r <= 255; r += 17) {
      for (let g = 0; g <= 255; g += 17) {
        for (let b = 0; b <= 255; b += 17) {
          const hex = `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase()
          expectFloors(hex, accentPalette(hex))
        }
      }
    }
  })

  it('keeps the hue of every chromatic preset across the whole family', () => {
    for (const preset of COLOR_PRESETS) {
      const tile = oklch(preset.hex)
      if (tile.c < 0.05) continue
      const palette = accentPalette(preset.hex)
      for (const key of ['accent', 'hover', 'press', 'soft'] as const) {
        expect(hueDistance(oklch(palette[key]).h, tile.h), `${preset.name} ${key}`).toBeLessThan(2.5)
      }
    }
  })

  it('steps hover and press darker, and lighter only for a near-black accent', () => {
    const green = accentPalette(DEFAULT_COLOR)
    expect(oklch(green.hover).l).toBeLessThan(oklch(green.accent).l)
    expect(oklch(green.press).l).toBeLessThan(oklch(green.hover).l)
    const black = accentPalette('#000000')
    expect(black.accent).toBe('#000000')
    expect(oklch(black.hover).l).toBeGreaterThan(0.2)
    expect(oklch(black.press).l).toBeGreaterThan(oklch(black.hover).l)
  })

  it('returns a tile color that already clears the floor as the accent itself', () => {
    expect(accentPalette('#35682a').accent).toBe('#35682A')
    expect(accentPalette('#2F3033').accent).toBe('#2F3033')
    expect(accentPalette('#1D5300').accent).toBe('#1D5300')
  })

  it('lands the default green on the lightest readable green, next to the retired hand-tuned one', () => {
    const palette = accentPalette(DEFAULT_COLOR)
    expect(contrastRatio(palette.accent, PANEL)).toBeLessThan(6.6)
    expect(hueDistance(oklch(palette.accent).h, oklch('#35682A').h)).toBeLessThan(3)
    expect(Math.abs(oklch(palette.soft).l - oklch('#EDF3E6').l)).toBeLessThan(0.01)
    expect(palette.ink).toBe(PANEL)
  })

  it('falls back to the palette of DEFAULT_COLOR for an unreadable color', () => {
    const fallback = accentPalette(DEFAULT_COLOR)
    for (const input of ['', 'green', '#12345', 'rgb(0,0,0)']) expect(accentPalette(input), input).toEqual(fallback)
  })

  it('warms the soft fill of a near-grey tile with the bench tone instead of its own cold cast', () => {
    const bench = oklch('#EFE7D8')
    for (const grey of ['#2F3033', '#808285', '#F4F2EC', '#000000', '#FFFFFF']) {
      expect(hueDistance(oklch(accentPalette(grey).soft).h, bench.h), grey).toBeLessThan(15)
    }
  })

  it('reads short and lowercase hex like the design store does', () => {
    expect(accentPalette('#abc')).toEqual(accentPalette('#AABBCC'))
    expect(accentPalette(' c0582f ')).toEqual(accentPalette('#C0582F'))
  })
})

describe('accentVariables', () => {
  it('names each value as _tokens.scss declares it', () => {
    const palette = accentPalette('#1E63C4')
    expect(accentVariables(palette)).toEqual({
      '--accent': palette.accent,
      '--accent-hover': palette.hover,
      '--accent-press': palette.press,
      '--accent-soft': palette.soft,
      '--accent-ink': palette.ink,
    })
  })
})
