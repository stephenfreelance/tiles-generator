// Tile colors: a short list of presets plus any hex the maker picks. Pure, so the worker and vitest
// can use it. A design stores the color as '#RRGGBB', uppercase, so equal colors compare equal.

export interface ColorPreset {
  name: string
  hex: string
}

/** The studio's swatches, in display order: two neutrals, then round the hue wheel. */
export const COLOR_PRESETS: ColorPreset[] = [
  { name: 'White', hex: '#F4F2EC' },
  { name: 'Charcoal', hex: '#2F3033' },
  { name: 'Terracotta', hex: '#C0582F' },
  { name: 'Red', hex: '#D7263D' },
  { name: 'Orange', hex: '#F47B20' },
  { name: 'Yellow', hex: '#F6C343' },
  { name: 'Green', hex: '#5C9748' },
  { name: 'Teal', hex: '#00A19B' },
  { name: 'Blue', hex: '#1E63C4' },
  { name: 'Violet', hex: '#7B4FD0' },
  { name: 'Pink', hex: '#EE6F9A' },
]

/** Green: the hex the previous default filament had, so a default design looks unchanged. */
export const DEFAULT_COLOR = '#5C9748'

/** '#abc', 'abc', '#aabbcc' or 'aabbcc' (surrounding spaces allowed) as '#AABBCC'; null otherwise. */
export function parseHex(input: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim())
  if (!match) return null
  const digits = match[1].length === 3 ? match[1].replace(/./g, '$&$&') : match[1]
  return `#${digits.toUpperCase()}`
}

export function presetByHex(hex: string): ColorPreset | undefined {
  const normalized = parseHex(hex)
  return normalized ? COLOR_PRESETS.find((preset) => preset.hex === normalized) : undefined
}

/** What to call a color in copy: its preset name, or 'Custom' for anything picked on the wheel. */
export function colorName(hex: string): string {
  return presetByHex(hex)?.name ?? 'Custom'
}

/** Hue in [0, 360), saturation and value in [0, 1]. An unreadable hex reads as black. */
export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const n = parseInt((parseHex(hex) ?? '#000000').slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d > 0) {
    if (max === r) h = 60 * ((g - b) / d)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
    if (h < 0) h += 360
    if (h >= 360) h -= 360
  }
  return { h, s: max > 0 ? d / max : 0, v: max }
}

const unit = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0)

/** '#RRGGBB' for any hue (wrapped) and any saturation and value (clamped), so a wheel drag can pass raw numbers. */
export function hsvToHex(hsv: { h: number; s: number; v: number }): string {
  const h = Number.isFinite(hsv.h) ? ((hsv.h % 360) + 360) % 360 : 0
  const s = unit(hsv.s)
  const v = unit(hsv.v)
  const c = v * s
  const sector = h / 60
  const x = c * (1 - Math.abs((sector % 2) - 1))
  const m = v - c
  const [r, g, b] =
    sector < 1 ? [c, x, 0] : sector < 2 ? [x, c, 0] : sector < 3 ? [0, c, x] : sector < 4 ? [0, x, c] : sector < 5 ? [x, 0, c] : [c, 0, x]
  const byte = (channel: number) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')
  return `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase()
}
