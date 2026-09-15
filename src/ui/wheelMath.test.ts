import { describe, expect, it } from 'vitest'
import { COLOR_PRESETS, hexToHsv, hsvToHex } from '@/core/colors'
import {
  BRIGHTNESS_LEVELS,
  BRIGHTNESS_STEP,
  BRIGHTNESS_STEP_LARGE,
  brightnessLevel,
  dragBrightness,
  hueSatText,
  hueSatToPoint,
  openingHsv,
  pointToHueSat,
  stepBrightness,
  stepHueSat,
  syncHsv,
} from './wheelMath'

const near = (actual: number, expected: number, digits = 6) => expect(actual).toBeCloseTo(expected, digits)

describe('pointToHueSat', () => {
  it('puts red at the top and runs the hues clockwise, as a conic-gradient does', () => {
    near(pointToHueSat({ x: 0.5, y: 0 }).h, 0)
    near(pointToHueSat({ x: 1, y: 0.5 }).h, 90)
    near(pointToHueSat({ x: 0.5, y: 1 }).h, 180)
    near(pointToHueSat({ x: 0, y: 0.5 }).h, 270)
  })

  it('grows saturation with the distance from the centre', () => {
    near(pointToHueSat({ x: 0.5, y: 0.25 }).s, 0.5)
    near(pointToHueSat({ x: 0.5, y: 0 }).s, 1)
  })

  it('clamps a point outside the disc to its edge', () => {
    const corner = pointToHueSat({ x: 1, y: 0 })
    near(corner.s, 1)
    near(corner.h, 45)
    near(pointToHueSat({ x: 3, y: 0.5 }).s, 1)
  })

  it('keeps the hue it was given at the exact centre', () => {
    expect(pointToHueSat({ x: 0.5, y: 0.5 }, 212)).toEqual({ h: 212, s: 0 })
    expect(pointToHueSat({ x: 0.5, y: 0.5 })).toEqual({ h: 0, s: 0 })
    expect(pointToHueSat({ x: Number.NaN, y: 0.5 }, 40)).toEqual({ h: 40, s: 0 })
  })
})

describe('hueSatToPoint', () => {
  it('is the inverse of pointToHueSat inside the disc', () => {
    for (const h of [0, 24, 90, 181, 300, 359]) {
      for (const s of [0.1, 0.5, 0.8, 1]) {
        const back = pointToHueSat(hueSatToPoint({ h, s }))
        near(back.h, h, 4)
        near(back.s, s, 4)
      }
    }
  })

  it('sits at the centre for no saturation and clamps past the edge', () => {
    expect(hueSatToPoint({ h: 120, s: 0 })).toEqual({ x: 0.5, y: 0.5 })
    expect(hueSatToPoint({ h: 0, s: 2 })).toEqual({ x: 0.5, y: 0 })
    const wrapped = hueSatToPoint({ h: 450, s: 1 })
    near(wrapped.x, 1)
    near(wrapped.y, 0.5)
  })
})

describe('stepHueSat', () => {
  const at = { h: 24, s: 0.8 }

  it('turns the hue on Left and Right, 15 degrees with Shift', () => {
    expect(stepHueSat(at, { key: 'ArrowRight', shiftKey: false })).toEqual({ h: 29, s: 0.8 })
    expect(stepHueSat(at, { key: 'ArrowLeft', shiftKey: false })).toEqual({ h: 19, s: 0.8 })
    expect(stepHueSat(at, { key: 'ArrowRight', shiftKey: true })).toEqual({ h: 39, s: 0.8 })
  })

  it('wraps the hue round the wheel', () => {
    expect(stepHueSat({ h: 2, s: 1 }, { key: 'ArrowLeft', shiftKey: false })).toEqual({ h: 357, s: 1 })
    expect(stepHueSat({ h: 355, s: 1 }, { key: 'ArrowRight', shiftKey: false })).toEqual({ h: 0, s: 1 })
  })

  it('moves saturation on Up and Down without float dust, clamped to the disc', () => {
    expect(stepHueSat(at, { key: 'ArrowUp', shiftKey: false })).toEqual({ h: 24, s: 0.85 })
    expect(stepHueSat(at, { key: 'ArrowDown', shiftKey: true })).toEqual({ h: 24, s: 0.65 })
    expect(stepHueSat({ h: 24, s: 0.97 }, { key: 'ArrowUp', shiftKey: true })).toEqual({ h: 24, s: 1 })
    expect(stepHueSat({ h: 24, s: 0.02 }, { key: 'ArrowDown', shiftKey: false })).toEqual({ h: 24, s: 0 })
  })

  it('ignores every other key', () => {
    expect(stepHueSat(at, { key: 'Enter', shiftKey: false })).toBeNull()
    expect(stepHueSat(at, { key: 'Home', shiftKey: false })).toBeNull()
  })
})

describe('hueSatText', () => {
  it('speaks whole degrees and percent', () => {
    expect(hueSatText({ h: 24.4, s: 0.8 })).toBe('Hue 24 degrees, saturation 80 percent')
    expect(hueSatText({ h: 359.7, s: 1.2 })).toBe('Hue 0 degrees, saturation 100 percent')
  })
})

describe('syncHsv', () => {
  it('keeps the local state while the hex is the one it makes', () => {
    const local = { h: 123.4, s: 0.56, v: 0.78 }
    expect(syncHsv(local, hsvToHex(local))).toBe(local)
  })

  it('keeps the hue through brightness 0 and saturation 0', () => {
    const dark = { h: 210, s: 0.7, v: 0 }
    expect(syncHsv(dark, '#000000')).toBe(dark)
    const grey = { h: 210, s: 0, v: 0.5 }
    expect(syncHsv(grey, hsvToHex(grey))).toBe(grey)
  })

  it('reads a different hex afresh', () => {
    const local = { h: 210, s: 0.7, v: 0.4 }
    for (const preset of COLOR_PRESETS) {
      const next = syncHsv(local, preset.hex)
      expect(next).toEqual(hexToHsv(preset.hex))
      expect(hsvToHex(next)).toBe(preset.hex)
    }
  })

  it('keeps the local hue when the new hex is a grey or black', () => {
    const local = { h: 210, s: 0.7, v: 0.4 }
    const grey = syncHsv(local, '#808080')
    expect(grey.h).toBe(210)
    expect(grey.s).toBe(0)
    expect(hsvToHex(grey)).toBe('#808080')
    expect(syncHsv({ ...local, v: 0.9 }, '#000000')).toEqual({ h: 210, s: 0.7, v: 0 })
  })
})

describe('brightness stops', () => {
  const key = (k: string, shiftKey = false) => ({ key: k, shiftKey })
  const atLevel = (hex: string, level: number) => hsvToHex({ ...hexToHsv(hex), v: level / BRIGHTNESS_LEVELS })

  it("makes every preset's own brightness a stop, so a step away and back restores the preset", () => {
    for (const { hex } of COLOR_PRESETS) {
      const level = brightnessLevel(hexToHsv(hex).v)
      expect(atLevel(hex, level), hex).toBe(hex)
      for (const [there, back] of [
        ['ArrowRight', 'ArrowLeft'],
        ['ArrowLeft', 'ArrowRight'],
        ['PageUp', 'PageDown'],
        ['PageDown', 'PageUp'],
      ]) {
        const away = stepBrightness(level, key(there))!
        // A step clamped at an end cannot come back; that is the end, not drift.
        if (away === 0 || away === BRIGHTNESS_LEVELS) continue
        expect(atLevel(hex, stepBrightness(away, key(back))!), `${hex} ${there}`).toBe(hex)
      }
      // A drag that ends where it started lands on the same stop.
      expect(atLevel(hex, dragBrightness(level, 0, 230)), hex).toBe(hex)
    }
  })

  it('round-trips the brightness of any hex', () => {
    for (let n = 0; n < 0x1000000; n += 0x010307) {
      const hex = `#${n.toString(16).padStart(6, '0').toUpperCase()}`
      expect(atLevel(hex, brightnessLevel(hexToHsv(hex).v)), hex).toBe(hex)
    }
  })

  it('moves the spoken percent on every arrow press, and ten percent on Shift or a Page key', () => {
    for (let level = 0; level + BRIGHTNESS_STEP <= BRIGHTNESS_LEVELS; level++) {
      const percent = (l: number) => Math.round((l / BRIGHTNESS_LEVELS) * 100)
      expect(percent(stepBrightness(level, key('ArrowUp'))!)).toBeGreaterThan(percent(level))
    }
    expect(stepBrightness(100, key('ArrowRight', true))).toBe(100 + BRIGHTNESS_STEP_LARGE)
    expect(stepBrightness(100, key('PageDown'))).toBe(100 - BRIGHTNESS_STEP_LARGE)
    expect(stepBrightness(1, key('ArrowDown'))).toBe(0)
    expect(stepBrightness(254, key('PageUp'))).toBe(BRIGHTNESS_LEVELS)
    expect(stepBrightness(100, key('Home'))).toBeNull()
    expect(stepBrightness(100, key('Enter'))).toBeNull()
  })

  it('drags relative to the grab: no movement is no change, and the full travel spans every stop', () => {
    expect(dragBrightness(191, 0, 230)).toBe(191)
    expect(dragBrightness(0, 230, 230)).toBe(BRIGHTNESS_LEVELS)
    expect(dragBrightness(200, -1000, 230)).toBe(0)
    expect(dragBrightness(120, 5, 0)).toBe(120)
  })
})

describe('openingHsv', () => {
  it('reopens a black or a grey on the hue and saturation the last opening left', () => {
    // Terracotta taken down to black: reopened, full brightness brings the terracotta back.
    const memory = { ...hexToHsv('#C0582F'), v: 0 }
    expect(openingHsv(memory, '#000000')).toBe(memory)
    expect(hsvToHex({ ...openingHsv(memory, '#000000'), v: 0xc0 / 255 })).toBe('#C0582F')
    expect(openingHsv({ h: 17, s: 0.76, v: 0.5 }, '#808080')).toEqual({ h: 17, s: 0, v: 128 / 255 })
  })

  it('reads the hex afresh with no memory, or once the color moved on', () => {
    expect(openingHsv(null, '#C0582F')).toEqual(hexToHsv('#C0582F'))
    expect(openingHsv({ h: 17, s: 0.76, v: 0 }, '#1E63C4')).toEqual(hexToHsv('#1E63C4'))
  })
})
