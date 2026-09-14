import type { LengthUnit } from './types'

export const LENGTH_UNITS: LengthUnit[] = ['mm', 'cm', 'm']

const MM_PER_UNIT: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000 }

/** Decimals worth showing per unit: 0.1 mm is the finest length that matters for a printed tile. */
const UNIT_DECIMALS: Record<LengthUnit, number> = { mm: 1, cm: 2, m: 4 }

export const toMm = (value: number, unit: LengthUnit): number => value * MM_PER_UNIT[unit]

export const fromMm = (mm: number, unit: LengthUnit): number => mm / MM_PER_UNIT[unit]

export const unitDecimals = (unit: LengthUnit): number => UNIT_DECIMALS[unit]

const formatters = new Map<number, Intl.NumberFormat>()

/** Formats a number with at most `decimals` fraction digits and no trailing zeros. */
export function formatNumber(value: number, decimals = 1): string {
  let fmt = formatters.get(decimals)
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals, useGrouping: true })
    formatters.set(decimals, fmt)
  }
  return fmt.format(Object.is(value, -0) ? 0 : value)
}

/** "1,250 mm", "125 cm", "1.25 m". */
export function formatLength(mm: number, unit: LengthUnit = 'mm', withUnit = true): string {
  const text = formatNumber(fromMm(mm, unit), UNIT_DECIMALS[unit])
  return withUnit ? `${text} ${unit}` : text
}

/** "150 × 150 mm". */
export function formatSize(width: number, height: number, unit: LengthUnit = 'mm'): string {
  return `${formatLength(width, unit, false)} × ${formatLength(height, unit, false)} ${unit}`
}

/** Square metres with two decimals, from mm². */
export function formatArea(mm2: number): string {
  return `${formatNumber(mm2 / 1e6, 2)} m²`
}
