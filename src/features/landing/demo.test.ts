import { describe, expect, it } from 'vitest'
import { hexToHsv, presetByHex } from '@/core/colors'
import { textureById } from '@/core/textures/registry'
import { CUT_DEMO, HERO_SPECIMENS, heroConfig } from './demo'

// Vivid means saturated and bright enough to read as a color on the stage, which rules out White and Charcoal.
const isVivid = (hex: string) => {
  const { s, v } = hexToHsv(hex)
  return s >= 0.5 && v >= 0.5
}

describe('landing demo designs', () => {
  it('pairs every hero relief with one of the studio presets', () => {
    for (const specimen of HERO_SPECIMENS) {
      expect(textureById(specimen.textureId).id).toBe(specimen.textureId)
      expect(presetByHex(specimen.color)?.hex, specimen.color).toBe(specimen.color)
    }
  })

  it('cycles exactly these five pairings, in this order, each with its own relief', () => {
    expect(HERO_SPECIMENS.map((specimen) => [specimen.textureId, presetByHex(specimen.color)?.name])).toEqual([
      ['zellige', 'Terracotta'],
      ['wavy', 'Green'],
      ['fluted', 'Blue'],
      ['fish-scale', 'Charcoal'],
      ['moroccan-star', 'Orange'],
    ])
    expect(new Set(HERO_SPECIMENS.map((specimen) => specimen.textureId)).size).toBe(HERO_SPECIMENS.length)
  })

  it('carries the specimen color through into the hero design', () => {
    for (const specimen of HERO_SPECIMENS) {
      const config = heroConfig(specimen)
      expect(config.color).toBe(specimen.color)
      expect(config.texture.id).toBe(specimen.textureId)
    }
  })

  it('shows the cut demonstration in a vivid preset', () => {
    expect(presetByHex(CUT_DEMO.color)?.hex).toBe(CUT_DEMO.color)
    expect(isVivid(CUT_DEMO.color)).toBe(true)
  })
})
