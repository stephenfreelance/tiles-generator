import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/core/accent'
import { COLOR_PRESETS } from '@/core/colors'
import { cutHaloOn, HALO_HEX } from './cutMark'

// Vitest empties stylesheet imports (even ?raw), and the app project carries no node types, so fs is
// reached through the runtime and typed here for the one call this test makes, as tokens.test.ts does.
interface NodeRuntime {
  process: { getBuiltinModule(id: 'node:fs'): { readFileSync(path: URL, encoding: 'utf8'): string } }
}
const fs = (globalThis as unknown as NodeRuntime).process.getBuiltinModule('node:fs')
const tokens = fs.readFileSync(new URL('../../styles/_tokens.scss', import.meta.url), 'utf8')

function token(name: string): string {
  const match = new RegExp(`^\\s*${name}:\\s*(#[0-9a-f]{6});`, 'im').exec(tokens)
  if (!match) throw new Error(`No hex ${name} in _tokens.scss`)
  return match[1].toUpperCase()
}

const CUT = token('--cut')
const CUT_SOFT = token('--cut-soft')

/** Every sixteenth step of each channel: 5,832 colors, enough to catch a hole the presets miss. */
const GRID_STEP = 15
const grid: string[] = []
for (let r = 0; r <= 255; r += GRID_STEP) {
  for (let g = 0; g <= 255; g += GRID_STEP) {
    for (let b = 0; b <= 255; b += GRID_STEP) {
      grid.push(`#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase())
    }
  }
}

const presets = COLOR_PRESETS.map((preset) => preset.hex)
const haloContrast = (tile: string) => contrastRatio(HALO_HEX[cutHaloOn(tile)], tile)
const worst = (tiles: string[], of: (tile: string) => number) =>
  tiles.reduce((low, tile) => Math.min(low, of(tile)), Infinity)

describe('cutHaloOn', () => {
  it('draws from the palette the stylesheet declares', () => {
    expect(HALO_HEX.ink).toBe(token('--ink'))
    expect(HALO_HEX.panel).toBe(token('--panel'))
  })

  it('clears 4:1 against every preset and every color of a dense grid', () => {
    for (const tile of [...presets, ...grid]) {
      expect(haloContrast(tile), tile).toBeGreaterThanOrEqual(4)
    }
  })

  it('is why the red pair alone is not enough', () => {
    // The cut mark's own colors against the tile under it: the floor the halo exists to lift.
    const redPair = (tile: string) => Math.max(contrastRatio(CUT, tile), contrastRatio(CUT_SOFT, tile))
    expect(worst(presets, redPair)).toBeCloseTo(2.44, 2)
    expect(redPair('#EE6F9A')).toBeCloseTo(2.44, 2) // Pink, the worst preset
    expect(redPair('#F47B20')).toBeCloseTo(2.54, 2) // Orange
    expect(redPair('#00A19B')).toBeCloseTo(2.74, 2) // Teal
    expect(redPair('#5C9748')).toBeCloseTo(3.01, 2) // Green
    expect(worst(grid, redPair)).toBeLessThan(2.5)
  })

  it('never falls below the measured 4.06:1 floor', () => {
    expect(worst(grid, haloContrast)).toBeCloseTo(4.064, 2)
    expect(worst(presets, haloContrast)).toBeCloseTo(4.416, 2) // Terracotta, the worst preset
  })

  it('picks ink on a light tile and panel on a dark one', () => {
    expect(cutHaloOn('#F4F2EC')).toBe('ink') // White
    expect(cutHaloOn('#2F3033')).toBe('panel') // Charcoal
    // An unreadable hex reads as black everywhere else in the app, so the halo answers for black.
    expect(cutHaloOn('not a color')).toBe('panel')
  })
})
