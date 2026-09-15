import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { COLOR_PRESETS, DEFAULT_COLOR } from '@/core/colors'
import { linearLuminance } from './colorMath'
import { LOOK } from './look'
import { materialRecipe, MaterialLibrary, TileMaterialSet } from './materials'

const TERRACOTTA = '#C0582F'
const BLUE = '#1E63C4'

describe('materialRecipe', () => {
  it('keeps one shader structure across every color, and splits only on the standard tier', () => {
    const physical = materialRecipe(DEFAULT_COLOR, 2).structureKey
    for (const { hex } of COLOR_PRESETS) {
      expect(materialRecipe(hex, 2).structureKey).toBe(physical)
      expect(materialRecipe(hex, 1).structureKey).toBe(physical)
      expect(materialRecipe(hex, 0).structureKey).not.toBe(physical)
    }
    expect(materialRecipe('#12AB34', 1).structureKey).toBe(physical)
    expect(materialRecipe(DEFAULT_COLOR, 0).physical).toBe(false)
  })

  it('clamps light and dark hexes into the renderable albedo range, keeping ordinary colors as picked', () => {
    const ceiling = new THREE.Color(LOOK.materials.whiteClamp)
    const floor = linearLuminance(new THREE.Color(LOOK.materials.blackClamp))
    expect(materialRecipe('#FFFFFF', 2).color.getHexString()).toBe(ceiling.getHexString())
    expect(materialRecipe('#000000', 2).color.getHexString()).toBe(LOOK.materials.blackClamp.slice(1).toLowerCase())
    // Near-white is scaled under the clamp, a dark saturated blue is lifted without losing its hue.
    const white = materialRecipe('#FAFAFA', 2).color
    expect(Math.max(white.r, white.g, white.b)).toBeLessThanOrEqual(Math.max(ceiling.r, ceiling.g, ceiling.b) + 1e-5)
    const navy = materialRecipe('#05051A', 2).color
    expect(linearLuminance(navy)).toBeGreaterThanOrEqual(floor - 1e-6)
    expect(navy.b).toBeGreaterThan(navy.r)
    expect(materialRecipe(DEFAULT_COLOR, 2).color.getHexString()).toBe(DEFAULT_COLOR.slice(1).toLowerCase())
    for (const { hex } of COLOR_PRESETS) {
      const color = materialRecipe(hex, 2).color
      expect(Math.max(color.r, color.g, color.b)).toBeLessThanOrEqual(Math.max(ceiling.r, ceiling.g, ceiling.b) + 1e-5)
      expect(linearLuminance(color)).toBeGreaterThanOrEqual(floor - 1e-6)
    }
  })

  it('reads short and lowercase hexes, and falls back to the default for an unreadable one', () => {
    expect(materialRecipe('#abc', 2).color.equals(materialRecipe('#AABBCC', 2).color)).toBe(true)
    expect(materialRecipe('not a color', 2).color.equals(materialRecipe(DEFAULT_COLOR, 2).color)).toBe(true)
  })
})

describe('TileMaterialSet', () => {
  it('builds the matte print on physical tiers and a plain standard material on tier 0', () => {
    const high = new TileMaterialSet(materialRecipe(TERRACOTTA, 2), null)
    expect(high.walls).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    const walls = high.walls as THREE.MeshPhysicalMaterial
    expect(walls.roughness).toBe(0.9)
    expect(walls.metalness).toBe(0)
    expect(walls.specularIntensity).toBe(0.42)
    expect(walls.sheen).toBe(0.08)
    expect(walls.ior).toBeCloseTo(1.46, 6)
    expect(walls.clearcoat).toBe(0)
    expect(walls.anisotropy).toBe(0)
    expect(walls.iridescence).toBe(0)
    expect(walls.transmission).toBe(0)
    expect(high.uniforms.tsGrainMap.value).not.toBeNull()
    expect(high.uniforms.tsGrainRough.value).toBe(0.06)
    expect(high.uniforms.tsGrainAlbedo.value).toBe(0.04)

    const low = new TileMaterialSet(materialRecipe(TERRACOTTA, 0), null)
    expect(low.walls).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(low.walls).not.toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect(low.walls.roughness).toBe(0.9)
    high.dispose()
    low.dispose()
  })

  it('shows half the global layer-line amplitude, and none while they are off', () => {
    const set = new TileMaterialSet(materialRecipe(TERRACOTTA, 2), null)
    expect(set.uniforms.tsLayerAmp.value).toBe(0)
    set.setLayerLines(true)
    expect(set.uniforms.tsLayerAmp.value).toBeCloseTo(LOOK.layerLines.amplitude * 0.5, 9)
    set.setLayerLines(false)
    expect(set.uniforms.tsLayerAmp.value).toBe(0)
    set.dispose()
  })

  it('fades a color change on the materials it already has', () => {
    const set = new TileMaterialSet(materialRecipe(TERRACOTTA, 2), null)
    const walls = set.walls as THREE.MeshPhysicalMaterial
    const top = set.top(null)
    const start = walls.color.clone()
    const blue = materialRecipe(BLUE, 2)
    set.retarget(blue)
    // Nothing snaps: the colours on screen only move once frames advance.
    expect(walls.color.equals(start)).toBe(true)
    expect(set.step(1 / 60)).toBe(true)
    expect(walls.color.equals(start)).toBe(false)
    expect(walls.color.equals(blue.color)).toBe(false)
    let frames = 0
    while (set.step(1 / 60) && frames < 600) frames++
    expect(frames).toBeLessThan(600)
    expect(walls.color.equals(blue.color)).toBe(true)
    expect(walls.sheenColor.equals(blue.sheenColor)).toBe(true)
    expect(set.walls).toBe(walls)
    expect(set.top(null)).toBe(top)
    expect(top.color.equals(blue.color)).toBe(true)
    set.dispose()
  })

  it('ignores a recipe of another structure', () => {
    const set = new TileMaterialSet(materialRecipe(TERRACOTTA, 2), null)
    set.retarget(materialRecipe(BLUE, 0))
    expect(set.recipe.structureKey).toBe(materialRecipe(TERRACOTTA, 2).structureKey)
    expect(set.step(1 / 60)).toBe(false)
    set.dispose()
  })
})

describe('MaterialLibrary', () => {
  it('reuses the set on screen for every color on the physical tiers', () => {
    const library = new MaterialLibrary()
    const set = library.resolve(materialRecipe(TERRACOTTA, 2))
    expect(library.resolve(materialRecipe(TERRACOTTA, 2))).toBe(set)
    expect(library.resolve(materialRecipe(BLUE, 2))).toBe(set)
    expect(library.resolve(materialRecipe(BLUE, 1))).toBe(set)
    expect(library.resolve(materialRecipe('#12AB34', 1))).toBe(set)
    library.dispose()
  })

  it('builds a new set for tier 0 that starts from the colours on screen, and disposes the old one only on flush', () => {
    const library = new MaterialLibrary()
    const first = library.resolve(materialRecipe(TERRACOTTA, 2))
    const shownColor = first.walls.color.clone()
    const disposeWalls = vi.spyOn(first.walls, 'dispose')
    const blue = materialRecipe(BLUE, 0)
    const second = library.resolve(blue)
    expect(second).not.toBe(first)
    expect(second.walls).not.toBe(first.walls)
    expect(second.walls.color.equals(shownColor)).toBe(true)
    expect(disposeWalls).not.toHaveBeenCalled()
    const third = library.resolve(materialRecipe(BLUE, 2))
    expect(third).not.toBe(second)
    const disposeSecond = vi.spyOn(second.walls, 'dispose')
    const disposeThird = vi.spyOn(third.walls, 'dispose')
    library.flush(third)
    expect(disposeWalls).toHaveBeenCalledTimes(1)
    expect(disposeSecond).toHaveBeenCalledTimes(1)
    expect(disposeThird).not.toHaveBeenCalled()
    library.dispose()
  })

  it('keeps one normal-mapped top alive through a pass without normal maps', () => {
    const library = new MaterialLibrary()
    const set = library.resolve(materialRecipe(TERRACOTTA, 2))
    const first = new THREE.Texture()
    const second = new THREE.Texture()
    const firstTop = set.top(first)
    const disposeFirst = vi.spyOn(firstTop, 'dispose')
    // A coarse pass: nothing on screen has a normal map, and the final pass will need that program again.
    set.prune(new Set([null]))
    expect(disposeFirst).not.toHaveBeenCalled()
    const secondTop = set.top(second)
    expect(secondTop).not.toBe(firstTop)
    set.prune(new Set([second]))
    expect(disposeFirst).toHaveBeenCalledTimes(1)
    expect(set.top(second)).toBe(secondTop)
    library.dispose()
  })

  it('never prunes a top built after the snapshot of maps it was given', () => {
    const library = new MaterialLibrary()
    const set = library.resolve(materialRecipe(TERRACOTTA, 2))
    const shown = new THREE.Texture()
    const shownTop = set.top(shown)
    // A coarse pass is snapshotted, then the final pass hands its meshes new tops before that prune runs.
    const generation = set.generation
    const final = set.top(new THREE.Texture())
    const disposeFinal = vi.spyOn(final, 'dispose')
    const disposeShown = vi.spyOn(shownTop, 'dispose')
    set.prune(new Set([null]), generation)
    expect(disposeFinal).not.toHaveBeenCalled()
    // The older top is still kept as the one program a pass without normal maps holds on to.
    expect(disposeShown).not.toHaveBeenCalled()
    set.prune(new Set([null]))
    expect(disposeFinal.mock.calls.length + disposeShown.mock.calls.length).toBe(1)
    library.dispose()
  })
})
