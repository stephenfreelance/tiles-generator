// Geometry of the HSV color wheel: hue runs clockwise from the top (as a CSS conic-gradient does) and
// saturation grows with the distance from the centre. Pure, so vitest can drive it without a DOM.
import { hexToHsv, hsvToHex } from '@/core/colors'

export interface Hsv {
  h: number
  s: number
  v: number
}

export interface HueSat {
  h: number
  s: number
}

/** A position in the wheel's square box, as fractions of its side: (0, 0) top-left, (1, 1) bottom-right. */
export interface WheelPoint {
  x: number
  y: number
}

/** Hue step of one arrow key press, in degrees; Shift takes the large one. */
export const HUE_STEP = 5
export const HUE_STEP_LARGE = 15
/** Saturation step of one arrow key press, as a fraction; Shift takes the large one. */
export const SAT_STEP = 0.05
export const SAT_STEP_LARGE = 0.15

/**
 * Brightness stops: one per byte of a hex channel, so a color's own brightness is always a stop and
 * leaving it and coming back restores the exact hex. Percent is only how the stop is shown and spoken.
 */
export const BRIGHTNESS_LEVELS = 255
/** Stops per arrow key press: never a whole percent, so the readout moves on every press. Shift and Page keys take the large one. */
export const BRIGHTNESS_STEP = 3
export const BRIGHTNESS_STEP_LARGE = 26

const TAU = Math.PI * 2
/** Below this radius (a fraction of the box) the angle is noise, so the hue the wheel had is kept. */
const CENTRE_EPSILON = 1e-6

const wrapHue = (h: number): number => (Number.isFinite(h) ? ((h % 360) + 360) % 360 : 0)
const clampUnit = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0)
// Steps are added in fractions of a percent, so drop the float dust before it reaches a readout.
const tidy = (value: number): number => Math.round(value * 1e6) / 1e6

/** Hue and saturation under a point; anything outside the disc lands on its edge. */
export function pointToHueSat(point: WheelPoint, fallbackHue = 0): HueSat {
  const dx = point.x - 0.5
  // Screen y grows downwards; the wheel's zero hue is at the top.
  const dy = 0.5 - point.y
  const radius = Math.hypot(dx, dy)
  if (!(radius > CENTRE_EPSILON)) return { h: wrapHue(fallbackHue), s: 0 }
  const h = wrapHue((Math.atan2(dx, dy) * 360) / TAU)
  return { h, s: Math.min(1, radius / 0.5) }
}

/** Where the thumb sits for a hue and saturation, as fractions of the box. */
export function hueSatToPoint({ h, s }: HueSat): WheelPoint {
  const angle = (wrapHue(h) * TAU) / 360
  const r = 0.5 * clampUnit(s)
  return { x: 0.5 + r * Math.sin(angle), y: 0.5 - r * Math.cos(angle) }
}

export interface WheelKey {
  key: string
  shiftKey: boolean
}

/** The hue and saturation after an arrow key, or null for a key the wheel does not handle. */
export function stepHueSat(current: HueSat, { key, shiftKey }: WheelKey): HueSat | null {
  const hueStep = shiftKey ? HUE_STEP_LARGE : HUE_STEP
  const satStep = shiftKey ? SAT_STEP_LARGE : SAT_STEP
  switch (key) {
    case 'ArrowRight':
      return { h: tidy(wrapHue(current.h + hueStep)), s: current.s }
    case 'ArrowLeft':
      return { h: tidy(wrapHue(current.h - hueStep)), s: current.s }
    case 'ArrowUp':
      return { h: current.h, s: tidy(clampUnit(current.s + satStep)) }
    case 'ArrowDown':
      return { h: current.h, s: tidy(clampUnit(current.s - satStep)) }
    default:
      return null
  }
}

/** Whole degrees and percent, as a screen reader hears the thumb. */
export function hueSatText({ h, s }: HueSat): string {
  return `Hue ${Math.round(wrapHue(h)) % 360} degrees, saturation ${Math.round(clampUnit(s) * 100)} percent`
}

/**
 * The picker's own HSV for an incoming hex. While the hex is still the one the local state makes, the
 * local state stands, so a grey or a black keeps the hue it was dragged from; any other hex is read
 * afresh, keeping the local hue (and saturation) only where the hex itself cannot carry one.
 */
export function syncHsv(local: Hsv, hex: string): Hsv {
  if (hsvToHex(local) === hex) return local
  const next = hexToHsv(hex)
  if (next.v === 0) return { h: local.h, s: local.s, v: 0 }
  if (next.s === 0) return { h: local.h, s: 0, v: next.v }
  return next
}

/** The brightness stop of a value in [0, 1]. */
export const brightnessLevel = (v: number): number => Math.round(clampUnit(v) * BRIGHTNESS_LEVELS)

const clampLevel = (level: number): number =>
  Number.isFinite(level) ? Math.min(BRIGHTNESS_LEVELS, Math.max(0, Math.round(level))) : 0

/** The brightness stop after a step key, or null for a key the slider leaves to its own handling. */
export function stepBrightness(level: number, { key, shiftKey }: WheelKey): number | null {
  const large = shiftKey || key === 'PageUp' || key === 'PageDown'
  const step = large ? BRIGHTNESS_STEP_LARGE : BRIGHTNESS_STEP
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
    case 'PageUp':
      return clampLevel(level + step)
    case 'ArrowLeft':
    case 'ArrowDown':
    case 'PageDown':
      return clampLevel(level - step)
    default:
      return null
  }
}

/**
 * The stop under a thumb dragged `dx` px from where it was grabbed, over a knob travel of `travel` px.
 * Relative to the grab, so pressing the knob anywhere never moves it before the pointer does.
 */
export function dragBrightness(startLevel: number, dx: number, travel: number): number {
  if (!(travel > 0)) return clampLevel(startLevel)
  return clampLevel(startLevel + (dx / travel) * BRIGHTNESS_LEVELS)
}

/** What a picker opens on: what the last opening left, while it still makes this hex, else the hex read afresh. */
export function openingHsv(memory: Hsv | null | undefined, hex: string): Hsv {
  return memory ? syncHsv(memory, hex) : hexToHsv(hex)
}
