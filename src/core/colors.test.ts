import { describe, expect, it } from 'vitest'
import { COLOR_PRESETS, colorName, DEFAULT_COLOR, hexToHsv, hsvToHex, parseHex, presetByHex } from './colors'
import { LEGACY_COLOR_HEX } from './legacyColors'

describe('parseHex', () => {
  it('reads short and long forms, with or without # and spaces, as uppercase #RRGGBB', () => {
    expect(parseHex('#abc')).toBe('#AABBCC')
    expect(parseHex('abc')).toBe('#AABBCC')
    expect(parseHex('#aabbcc')).toBe('#AABBCC')
    expect(parseHex('aabbcc')).toBe('#AABBCC')
    expect(parseHex('  #C0582f\n')).toBe('#C0582F')
    expect(parseHex('000')).toBe('#000000')
  })

  it('refuses anything that is not three or six hex digits', () => {
    for (const input of ['', '#', '#ab', '#abcd', '#abcde', '#abcdefa', '##abcdef', 'ggg', '#12 345', 'red', 'rgb(0,0,0)', '0x123456']) {
      expect(parseHex(input), input).toBeNull()
    }
  })
})

describe('presets', () => {
  it('lists the eleven swatches in display order, each a normalized hex with a unique name', () => {
    expect(COLOR_PRESETS.map((p) => p.name)).toEqual([
      'White', 'Charcoal', 'Terracotta', 'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Violet', 'Pink',
    ])
    for (const preset of COLOR_PRESETS) expect(parseHex(preset.hex)).toBe(preset.hex)
    expect(new Set(COLOR_PRESETS.map((p) => p.hex)).size).toBe(COLOR_PRESETS.length)
  })

  it('defaults to Green', () => {
    expect(DEFAULT_COLOR).toBe('#5C9748')
    expect(presetByHex(DEFAULT_COLOR)?.name).toBe('Green')
  })

  it('finds a preset by any spelling of its hex, and names anything else Custom', () => {
    expect(presetByHex('#c0582f')?.name).toBe('Terracotta')
    expect(presetByHex('#12AB34')).toBeUndefined()
    expect(presetByHex('nope')).toBeUndefined()
    expect(colorName('#1E63C4')).toBe('Blue')
    expect(colorName('f4f2ec')).toBe('White')
    expect(colorName('#12AB34')).toBe('Custom')
    expect(colorName('not a color')).toBe('Custom')
  })
})

describe('hexToHsv and hsvToHex', () => {
  it('round-trips every preset, black, white, greys and the pure hues exactly', () => {
    const hexes = [
      ...COLOR_PRESETS.map((p) => p.hex),
      '#000000', '#FFFFFF', '#808080', '#010101', '#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FE0001', '#12AB34',
    ]
    for (const hex of hexes) {
      const hsv = hexToHsv(hex)
      expect(hsv.h, hex).toBeGreaterThanOrEqual(0)
      expect(hsv.h, hex).toBeLessThan(360)
      expect(hsv.s, hex).toBeGreaterThanOrEqual(0)
      expect(hsv.s, hex).toBeLessThanOrEqual(1)
      expect(hsv.v, hex).toBeGreaterThanOrEqual(0)
      expect(hsv.v, hex).toBeLessThanOrEqual(1)
      expect(hsvToHex(hsv), hex).toBe(hex)
    }
  })

  it('places the pure hues, black and white where a wheel expects them', () => {
    expect(hexToHsv('#FF0000')).toEqual({ h: 0, s: 1, v: 1 })
    expect(hexToHsv('#00FF00')).toEqual({ h: 120, s: 1, v: 1 })
    expect(hexToHsv('#0000FF')).toEqual({ h: 240, s: 1, v: 1 })
    expect(hexToHsv('#FF00FF')).toEqual({ h: 300, s: 1, v: 1 })
    expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 })
    expect(hexToHsv('#FFFFFF')).toEqual({ h: 0, s: 0, v: 1 })
    expect(hsvToHex({ h: 60, s: 1, v: 1 })).toBe('#FFFF00')
    expect(hsvToHex({ h: 180, s: 1, v: 1 })).toBe('#00FFFF')
  })

  it('wraps the hue and clamps saturation and value, so a raw drag always gives a color', () => {
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#FF0000')
    expect(hsvToHex({ h: -120, s: 1, v: 1 })).toBe('#0000FF')
    expect(hsvToHex({ h: 720 + 120, s: 1, v: 1 })).toBe('#00FF00')
    expect(hsvToHex({ h: 0, s: 2, v: -1 })).toBe('#000000')
    expect(hsvToHex({ h: 0, s: -1, v: 5 })).toBe('#FFFFFF')
    expect(hsvToHex({ h: Number.NaN, s: Number.NaN, v: Number.NaN })).toBe('#000000')
  })

  it('reads an unreadable hex as black', () => {
    expect(hexToHsv('nope')).toEqual({ h: 0, s: 0, v: 0 })
  })
})

describe('LEGACY_COLOR_HEX', () => {
  it('maps every retired filament id to a normalized hex', () => {
    const entries = Object.entries(LEGACY_COLOR_HEX)
    expect(entries).toHaveLength(104)
    for (const [id, hex] of entries) {
      expect(id).toMatch(/^(pla|petg)-[a-z0-9-]+$/)
      expect(parseHex(hex), id).toBe(hex)
    }
    expect(LEGACY_COLOR_HEX['pla-matte-terracotta']).toBe('#B15533')
    expect(LEGACY_COLOR_HEX['pla-cf-matcha-green']).toBe(DEFAULT_COLOR)
  })
})
