// Stepping and clamping rules shared by LengthField, NumberField and SliderField.

/** Fraction digits of a number as written (0.25 -> 2, 1e-7 -> 7). */
export function decimalsOf(value: number): number {
  if (!Number.isFinite(value)) return 0
  const [mantissa, exponent] = String(Math.abs(value)).split('e')
  const dot = mantissa.indexOf('.')
  const fractionDigits = dot < 0 ? 0 : mantissa.length - dot - 1
  return Math.max(0, fractionDigits - Number(exponent ?? 0))
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** Math.min(10, Math.max(0, decimals))
  return Math.round(value * factor) / factor
}

/** Shift steps ten times further, Alt ten times finer; the same keys as in slicers and CAD. */
export function stepMultiplier(modifiers: { shiftKey: boolean; altKey: boolean }): number {
  if (modifiers.shiftKey) return 10
  if (modifiers.altKey) return 0.1
  return 1
}

/** Moves a value by one (scaled) step, rounded so 0.1 steps never drift into 0.30000000000000004. */
export function nudge(value: number, step: number, direction: 1 | -1, multiplier = 1): number {
  const stepDecimals = decimalsOf(step) + (multiplier < 1 ? decimalsOf(multiplier) : 0)
  const decimals = Math.min(6, Math.max(stepDecimals, decimalsOf(value)))
  return roundTo(value + direction * step * multiplier, decimals)
}

export type LimitEdge = 'min' | 'max'

/** Clamps into [min, max] and reports which limit was hit, so the field can say why. */
export function clampToRange(value: number, min: number, max: number): { value: number; edge: LimitEdge | null } {
  if (value < min) return { value: min, edge: 'min' }
  if (value > max) return { value: max, edge: 'max' }
  return { value, edge: null }
}
