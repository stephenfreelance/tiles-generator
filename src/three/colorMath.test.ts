import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { clampAlbedo, inverseNeutralToneMap, linearLuminance, neutralToneMap, sheetBackground } from './colorMath'
import { LOOK } from './look'

describe('neutral tone mapping', () => {
  it('leaves mid tones almost untouched and compresses highlights', () => {
    const [r] = neutralToneMap([0.3, 0.3, 0.3])
    expect(r).toBeCloseTo(0.26, 2)
    const [hi] = neutralToneMap([4, 4, 4])
    expect(hi).toBeLessThan(1)
  })

  it('inverts back to the sheet colour so the canvas edge matches the paper', () => {
    const sheet = new THREE.Color(LOOK.palette.sheet)
    const compensated = sheetBackground(true)
    const mapped = neutralToneMap([compensated.r, compensated.g, compensated.b])
    expect(mapped[0]).toBeCloseTo(sheet.r, 3)
    expect(mapped[1]).toBeCloseTo(sheet.g, 3)
    expect(mapped[2]).toBeCloseTo(sheet.b, 3)
  })

  it('round-trips arbitrary colours below the shoulder', () => {
    for (const c of [
      [0.05, 0.1, 0.2],
      [0.5, 0.4, 0.3],
      [0.85, 0.82, 0.78],
    ] as [number, number, number][]) {
      const back = neutralToneMap(inverseNeutralToneMap(c))
      for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(c[i], 3)
    }
  })
})

describe('clampAlbedo', () => {
  it('pulls pure white in to the warm clamp colour', () => {
    expect(clampAlbedo('#FFFFFF', false).getHexString()).toBe(LOOK.materials.whiteMatte.slice(1).toLowerCase())
    expect(clampAlbedo('#FFFFFF', true).getHexString()).toBe(LOOK.materials.whiteGlossy.slice(1).toLowerCase())
  })

  it('lifts pure black to the floor colour', () => {
    expect(clampAlbedo('#000000', false).getHexString()).toBe(LOOK.materials.blackMatte.slice(1).toLowerCase())
  })

  it('keeps ordinary colours as published', () => {
    expect(clampAlbedo('#5C9748', false).getHexString()).toBe('5c9748')
  })

  it('keeps the hue of dark saturated colours while lifting them', () => {
    const navy = clampAlbedo('#0A0A40', true)
    expect(linearLuminance(navy)).toBeGreaterThanOrEqual(linearLuminance(new THREE.Color(LOOK.materials.blackGlossy)) - 1e-6)
    expect(navy.b).toBeGreaterThan(navy.r)
  })
})
