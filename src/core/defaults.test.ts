import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, THICKNESS_PRESETS } from './config'
import { filamentById } from './filaments'
import { SLIVER_MM } from './layout'
import { printerById } from './printers'
import { DEFAULT_TEXTURE_ID, textureById } from './textures/registry'

/**
 * A fresh design must read as untouched: the studio marks anything away from a texture's own
 * defaults as a change, so a mismatch here would show "2 changed" in Advanced before the first click.
 */
describe('DEFAULT_CONFIG', () => {
  it('starts on the default texture at its own recommended depth and scale', () => {
    const texture = textureById(DEFAULT_CONFIG.texture.id)
    expect(DEFAULT_CONFIG.texture.id).toBe(DEFAULT_TEXTURE_ID)
    expect(texture.id).toBe(DEFAULT_TEXTURE_ID)
    expect(DEFAULT_CONFIG.texture.depth).toBe(texture.defaults.depth)
    expect(DEFAULT_CONFIG.texture.scale).toBe(texture.defaults.scale)
    expect(DEFAULT_CONFIG.texture.params).toEqual({})
    expect(DEFAULT_CONFIG.texture.invert).toBe(false)
    expect(DEFAULT_CONFIG.texture.rotate).toBe(false)
  })

  it('starts on a thickness that is one of the offered presets', () => {
    expect(THICKNESS_PRESETS.map((preset) => preset.value)).toContain(DEFAULT_CONFIG.tile.thickness)
  })

  it('starts on a real filament and a real printer, and tiles from the top-left corner', () => {
    expect(filamentById(DEFAULT_CONFIG.colorId).id).toBe(DEFAULT_CONFIG.colorId)
    expect(printerById(DEFAULT_CONFIG.printerId).id).toBe(DEFAULT_CONFIG.printerId)
    expect(DEFAULT_CONFIG.layout.origin).toBe('corner')
    expect(DEFAULT_CONFIG.layout.rowOffset).toBe(0)
  })

  it('shows the tiles touching: no gap, and no chamfer valley that reads as one', () => {
    // Two tiles meet chamfer to chamfer, so a closed joint opens a valley of twice the bevel. Kept at
    // or under the width the layout itself absorbs, the joint reads as a drawn line, not as a gap.
    expect(DEFAULT_CONFIG.joint).toBe(0)
    expect(2 * DEFAULT_CONFIG.bevel).toBeLessThanOrEqual(SLIVER_MM)
    // Still a real 45 degree cut: the raking light needs an edge to catch along every joint.
    expect(DEFAULT_CONFIG.bevel).toBeGreaterThan(0)
  })

  it('fits the default wall with whole tiles only', () => {
    // The opening screen should show the product at its best: a wall that needs no cuts at all.
    expect(DEFAULT_CONFIG.surface.width % DEFAULT_CONFIG.tile.width).toBe(0)
    expect(DEFAULT_CONFIG.surface.height % DEFAULT_CONFIG.tile.height).toBe(0)
  })
})
