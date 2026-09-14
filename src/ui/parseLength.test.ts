import { describe, expect, it } from 'vitest'
import { formatLength } from '@/core/units'
import type { LengthUnit } from '@/core/types'
import { parseLength, parseNumber, parseNumberText } from './parseLength'

describe('parseLength', () => {
  it.each<[string, LengthUnit, number]>([
    ['1.2 m', 'mm', 1200],
    ['120cm', 'mm', 1200],
    ['1 200', 'mm', 1200],
    ['1,5', 'cm', 15],
    ['4 ft', 'mm', 1219.2],
    ['18 in', 'mm', 457.2],
    ['1200mm', 'cm', 1200],
    ['150', 'mm', 150],
    ['150', 'cm', 1500],
    ['1.25', 'm', 1250],
    ['  150  ', 'mm', 150],
    ['150 MM', 'mm', 150],
    ['2m', 'mm', 2000],
    ['.5 m', 'mm', 500],
    ['0,5 m', 'mm', 500],
    ['2 metres', 'mm', 2000],
    ['30 centimeters', 'mm', 300],
    ['12 inches', 'mm', 304.8],
    ['150 mm.', 'mm', 150],
  ])('reads %j (default %s) as %d mm', (text, unit, mm) => {
    expect(parseLength(text, unit)).toBeCloseTo(mm, 6)
  })

  it('reads thousands groupings in both conventions', () => {
    expect(parseLength('1,250', 'mm')).toBe(1250)
    expect(parseLength('1,250.5', 'mm')).toBe(1250.5)
    expect(parseLength('1.250,5', 'mm')).toBe(1250.5)
    expect(parseLength('1 200,5 mm', 'mm')).toBe(1200.5)
    expect(parseLength('1 200 mm', 'mm')).toBe(1200)
    expect(parseLength('12,000', 'mm')).toBe(12000)
  })

  it('keeps a comma as a decimal when it cannot be a grouping', () => {
    expect(parseLength('1,25 m', 'mm')).toBe(1250)
    expect(parseLength('0,500 m', 'mm')).toBe(500)
    expect(parseLength('1234,5', 'mm')).toBe(1234.5)
  })

  it('adds compound tape readings', () => {
    expect(parseLength('1 m 20 cm', 'mm')).toBe(1200)
    expect(parseLength('5 ft 6 in', 'mm')).toBeCloseTo(1676.4, 6)
    expect(parseLength(`5'6"`, 'mm')).toBeCloseTo(1676.4, 6)
    expect(parseLength("5' 6", 'mm')).toBeCloseTo(1676.4, 6)
    expect(parseLength('5’ 6”', 'mm')).toBeCloseTo(1676.4, 6)
  })

  it('reads a minus sign so the field can clamp it', () => {
    expect(parseLength('-5', 'mm')).toBe(-5)
    expect(parseLength('−5 cm', 'mm')).toBe(-50)
  })

  it.each(['', '   ', 'abc', '12 kg', '1.2.3', '12 5', 'm', '1 m 20', '5 ft -6 in', '1,2,3', '--5'])(
    'rejects %j',
    (text) => {
      expect(parseLength(text, 'mm')).toBeNull()
    },
  )

  it('reads back everything formatLength writes', () => {
    const units: LengthUnit[] = ['mm', 'cm', 'm']
    for (const unit of units) {
      for (const mm of [20, 150, 152.5, 999.9, 1200, 1234.5, 20000, 1234567]) {
        const shown = formatLength(mm, unit)
        const decimals = unit === 'mm' ? 1 : unit === 'cm' ? 2 : 4
        const expected = Math.round((mm / { mm: 1, cm: 10, m: 1000 }[unit]) * 10 ** decimals) / 10 ** decimals
        expect(parseLength(shown, unit), shown).toBeCloseTo(expected * { mm: 1, cm: 10, m: 1000 }[unit], 6)
        expect(parseLength(formatLength(mm, unit, false), unit), shown).toBeCloseTo(
          expected * { mm: 1, cm: 10, m: 1000 }[unit],
          6,
        )
      }
    }
  })
})

describe('parseNumberText', () => {
  it.each<[string, number]>([
    ['42', 42],
    ['+42', 42],
    ['-0.5', -0.5],
    ['1,5', 1.5],
    ['1,500', 1500],
    ['1.500.000', 1500000],
    ['5.', 5],
    ['.25', 0.25],
  ])('reads %j as %d', (text, value) => {
    expect(parseNumberText(text)).toBe(value)
  })

  it.each(['', '.', ',', '1 2', 'x1', '1.2.3', '1,2.3,4'])('rejects %j', (text) => {
    expect(parseNumberText(text)).toBeNull()
  })
})

describe('parseNumber', () => {
  it('tolerates the field unit typed after the value', () => {
    expect(parseNumber('45°', '°')).toBe(45)
    expect(parseNumber('30 %', '%')).toBe(30)
    expect(parseNumber('2,4 mm', 'mm')).toBe(2.4)
    expect(parseNumber('12', '%')).toBe(12)
  })

  it('rejects a different unit', () => {
    expect(parseNumber('12 cm', 'mm')).toBeNull()
  })
})
