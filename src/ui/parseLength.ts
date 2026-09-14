import type { LengthUnit } from '@/core/types'

// Lenient parsers for what people type into measurement fields: mixed units, comma decimals,
// grouped thousands and imperial tape readings all become plain numbers.

/** Millimetres per unit word or symbol. Imperial units are accepted as input only. */
const MM_PER_UNIT = new Map<string, number>([
  ['mm', 1],
  ['millimeter', 1],
  ['millimeters', 1],
  ['millimetre', 1],
  ['millimetres', 1],
  ['cm', 10],
  ['centimeter', 10],
  ['centimeters', 10],
  ['centimetre', 10],
  ['centimetres', 10],
  ['dm', 100],
  ['m', 1000],
  ['meter', 1000],
  ['meters', 1000],
  ['metre', 1000],
  ['metres', 1000],
  ['in', 25.4],
  ['inch', 25.4],
  ['inches', 25.4],
  ['"', 25.4],
  ['ft', 304.8],
  ['foot', 304.8],
  ['feet', 304.8],
  ["'", 304.8],
])

const MM_PER_FOOT = 304.8

/** One number, then an optional unit word or tick mark ("1 200", "1,5 m", 4', 6"). */
const TERM = /([+-]?(?:\d[\d ,.]*\d|\d|[.,]\d+)\.?)\s*([a-z]+\.?|["'])?\s*/y

/** Lowercases and folds the typographic variants (minus sign, smart quotes, primes, thin spaces). */
function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\u2212/g, '-')
    .replace(/[\u2019\u2032]/g, "'")
    .replace(/[\u201d\u2033]/g, '"')
    .replace(/[\u00a0\u2009\u202f]/g, ' ')
}

const countOf = (text: string, char: string) => text.split(char).length - 1

/**
 * Reads a plain number written in either convention: "1,250" and "1 250" are thousands,
 * "1,5" and "0,500" are decimals, "1.250,5" and "1,250.5" both mean 1250.5.
 */
export function parseNumberText(raw: string): number | null {
  const match = /^([+-]?)\s*(.*)$/.exec(normalize(raw))
  if (!match) return null
  const sign = match[1] === '-' ? -1 : 1
  const body = match[2].trim()
  if (!/^[\d .,]+$/.test(body) || !/\d/.test(body)) return null

  const lastDot = body.lastIndexOf('.')
  const lastComma = body.lastIndexOf(',')
  let decimalSeparator: '.' | ',' | null = null
  if (lastDot >= 0 && lastComma >= 0) {
    decimalSeparator = lastDot > lastComma ? '.' : ','
  } else if (lastDot >= 0) {
    decimalSeparator = countOf(body, '.') === 1 ? '.' : null
  } else if (lastComma >= 0 && countOf(body, ',') === 1) {
    const [integerPart, fraction] = body.split(',')
    // "1,250" is how Tessera itself displays thousands, so it must read back as 1250.
    const looksGrouped = fraction.length === 3 && /^[1-9]\d{0,2}$/.test(integerPart)
    decimalSeparator = looksGrouped ? null : ','
  }

  let integerPart = body
  let fraction = ''
  if (decimalSeparator) {
    const at = body.lastIndexOf(decimalSeparator)
    integerPart = body.slice(0, at)
    fraction = body.slice(at + 1)
  }
  if (!/^\d*$/.test(fraction)) return null

  const groups = integerPart.split(/[ .,]/)
  if (groups.length > 1 && (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some((g) => !/^\d{3}$/.test(g)))) {
    return null
  }
  const digits = groups.join('')
  if (!digits && !fraction) return null
  const value = Number(`${digits || '0'}.${fraction || '0'}`)
  return Number.isFinite(value) ? sign * value : null
}

/** Reads a unitless value, tolerating the field's own unit typed after it ("45°", "30 %"). */
export function parseNumber(text: string, unit?: string): number | null {
  let source = normalize(text)
  const suffix = unit?.trim().toLowerCase()
  if (suffix && source.endsWith(suffix)) source = source.slice(0, -suffix.length).trim()
  return parseNumberText(source)
}

const roundMicron = (mm: number) => Math.round(mm * 1e6) / 1e6

/**
 * Parses a typed length into millimetres. A bare number is read in `defaultUnit`.
 * Accepts "1.2 m", "120cm", "1 200", "1,5", "4 ft", "18 in", "1200mm", and compound tape
 * readings such as "1 m 20 cm", "5 ft 6 in" or 5'6". Returns null when nothing sensible parses.
 */
export function parseLength(text: string, defaultUnit: LengthUnit): number | null {
  const source = normalize(text)
  if (!source) return null

  const terms: { value: number; unit: string | undefined }[] = []
  let position = 0
  while (position < source.length) {
    TERM.lastIndex = position
    const match = TERM.exec(source)
    if (!match) return null
    const value = parseNumberText(match[1].replace(/\.$/, ''))
    if (value === null) return null
    terms.push({ value, unit: match[2]?.replace(/\.$/, '') })
    position = TERM.lastIndex
  }

  if (terms.length === 1) {
    const factor = MM_PER_UNIT.get(terms[0].unit ?? defaultUnit)
    return factor === undefined ? null : roundMicron(terms[0].value * factor)
  }

  // Compound readings: every part names its unit, except inches trailing a feet value (5' 6).
  let total = 0
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i]
    if (term.value < 0) return null
    let unit = term.unit
    if (unit === undefined) {
      const previousIsFeet = i === terms.length - 1 && MM_PER_UNIT.get(terms[i - 1].unit ?? '') === MM_PER_FOOT
      if (!previousIsFeet) return null
      unit = 'in'
    }
    const factor = MM_PER_UNIT.get(unit)
    if (factor === undefined) return null
    total += term.value * factor
  }
  return roundMicron(total)
}
