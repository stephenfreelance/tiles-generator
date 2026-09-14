/** Units written against the number ("45°", "30%"); everything else takes a space ("2.4 mm"). */
const TIGHT_UNITS = new Set(['°', '%'])

export function withUnit(text: string, unit?: string): string {
  if (!unit) return text
  return TIGHT_UNITS.has(unit) ? `${text}${unit}` : `${text} ${unit}`
}
