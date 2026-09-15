import * as THREE from 'three'
import { DEFAULT_COLOR, parseHex } from '@/core/colors'
import { clampAlbedo, lighten } from './colorMath'
import { LOOK, type Tier } from './look'
import { acquireGrainTexture, type TextureHandle } from './proceduralTextures'
import { applyTesseraPatch, createTesseraUniforms, type TesseraUniforms } from './shaderPatch'

/** What differs between tile colors in the one printed look (a matte PLA); colours are linear. */
export interface MaterialRecipe {
  /** Everything that changes the compiled shader program. Colours do not. */
  structureKey: string
  physical: boolean
  color: THREE.Color
  sheenColor: THREE.Color
}

/**
 * Maps a tile color ('#RRGGBB') to material parameters. Every scalar of the look lives in
 * `LOOK.materials`; `tier` 0 drops the physical extras.
 */
export function materialRecipe(hex: string, tier: Tier): MaterialRecipe {
  const color = clampAlbedo(parseHex(hex) ?? DEFAULT_COLOR)
  const physical = tier > 0
  return {
    // Tier 0 swaps physical for standard materials; within a tier every color shares one program.
    structureKey: physical ? 'physical' : 'standard',
    physical,
    color,
    sheenColor: lighten(color, LOOK.materials.sheenLighten),
  }
}

function buildMaterial(recipe: MaterialRecipe, uniforms: TesseraUniforms, normalMap: THREE.Texture | null): THREE.MeshStandardMaterial {
  const look = LOOK.materials
  const common: THREE.MeshStandardMaterialParameters = {
    color: recipe.color.clone(),
    roughness: look.roughness,
    metalness: look.metalness,
    envMapIntensity: look.envMapIntensity,
  }
  // Standard material on the low tier: sheen, specular intensity and ior do not exist there.
  const material = recipe.physical
    ? new THREE.MeshPhysicalMaterial({
        ...common,
        specularIntensity: look.specularIntensity,
        sheen: look.sheen,
        sheenColor: recipe.sheenColor.clone(),
        sheenRoughness: look.sheenRoughness,
        ior: look.ior,
      })
    : new THREE.MeshStandardMaterial(common)
  if (normalMap) {
    material.normalMap = normalMap
    material.normalMapType = THREE.ObjectSpaceNormalMap
  }
  applyTesseraPatch(material, uniforms)
  return material
}

/** Colours that animate when the tile color changes (all linear). */
interface ColorChannels {
  color: THREE.Color
  sheenColor: THREE.Color
}

const CHANNELS = ['color', 'sheenColor'] as const

function channelsOf(source: ColorChannels): ColorChannels {
  return { color: source.color.clone(), sheenColor: source.sheenColor.clone() }
}

function dampColor(current: THREE.Color, target: THREE.Color, lambda: number, dt: number): boolean {
  current.r = THREE.MathUtils.damp(current.r, target.r, lambda, dt)
  current.g = THREE.MathUtils.damp(current.g, target.g, lambda, dt)
  current.b = THREE.MathUtils.damp(current.b, target.b, lambda, dt)
  const settled = Math.abs(current.r - target.r) + Math.abs(current.g - target.g) + Math.abs(current.b - target.b) < 1e-4
  if (settled) current.copy(target)
  return !settled
}

/**
 * The materials of one shader structure: a walls/bottom material shared by every piece and one top
 * material per baked normal map (the maps differ per piece, the shader program is shared). Owns its textures.
 */
export class TileMaterialSet {
  readonly uniforms: TesseraUniforms = createTesseraUniforms()
  readonly walls: THREE.MeshStandardMaterial
  private recipeValue: MaterialRecipe
  private readonly tops = new Map<THREE.Texture | null, THREE.MeshStandardMaterial>()
  /** When each top was built, counted in tops: a prune never drops one newer than its snapshot. */
  private readonly builtAt = new WeakMap<THREE.MeshStandardMaterial, number>()
  private builds = 0
  private grain: TextureHandle | null
  private readonly display: ColorChannels
  private target: ColorChannels
  private layerLinesOn = false

  constructor(recipe: MaterialRecipe, startFrom: TileMaterialSet | null) {
    this.recipeValue = recipe
    this.grain = acquireGrainTexture()
    this.target = channelsOf(recipe)
    // A tier change starts from the colours on screen, so a color fade in progress carries on instead of snapping.
    this.display = startFrom ? startFrom.displayedColors() : channelsOf(recipe)
    this.applyUniforms(this.grain.texture)
    this.walls = buildMaterial(recipe, this.uniforms, null)
    this.tops.set(null, buildMaterial(recipe, this.uniforms, null))
    this.applyDisplay()
  }

  get recipe(): MaterialRecipe {
    return this.recipeValue
  }

  /** Top-surface material for a piece's baked normal map (null: vertex normals). */
  top(normalMap: THREE.Texture | null): THREE.MeshStandardMaterial {
    let material = this.tops.get(normalMap)
    if (!material) {
      material = buildMaterial(this.recipeValue, this.uniforms, normalMap)
      this.copyDisplayInto(material)
      this.tops.set(normalMap, material)
      this.builtAt.set(material, ++this.builds)
    }
    return material
  }

  /** Same shader structure, new color: the colours animate, and no scalar differs between colors. */
  retarget(recipe: MaterialRecipe): void {
    if (recipe.structureKey !== this.recipeValue.structureKey) return
    this.recipeValue = recipe
    this.target = channelsOf(recipe)
  }

  /** World pitch of the red-pencil hatch, kept constant on screen by the caller. */
  setHatchScale(pitchMm: number): void {
    this.uniforms.tsHatchPitch.value = pitchMm
  }

  setHatchDirection(direction: THREE.Vector3): void {
    this.uniforms.tsHatchDir.value.copy(direction)
  }

  setLayerLines(on: boolean): void {
    this.layerLinesOn = on
    this.uniforms.tsLayerAmp.value = this.layerAmplitude()
  }

  /** Advances colour transitions; true while still animating. */
  step(dt: number): boolean {
    let moving = false
    for (const key of CHANNELS) {
      if (dampColor(this.display[key], this.target[key], LOOK.materials.colorDamp, dt)) moving = true
    }
    this.applyDisplay()
    return moving
  }

  /** Stamp to pass to prune() along with the maps on screen now: tops built later are left alone. */
  get generation(): number {
    return this.builds
  }

  /**
   * Drops top materials whose normal maps are gone. While no piece on screen has a normal map (a coarse
   * pass), one retired normal-mapped material is kept: it holds the shader program the final pass
   * needs a moment later, which would otherwise be deleted and linked again. A top built after
   * `generation` belongs to a newer commit than `activeMaps` describes, so it is never dropped.
   */
  prune(activeMaps: ReadonlySet<THREE.Texture | null>, generation = Number.POSITIVE_INFINITY): void {
    let keepOne = ![...activeMaps].some((map) => map !== null)
    for (const [map, material] of this.tops) {
      if (map === null || activeMaps.has(map)) continue
      if ((this.builtAt.get(material) ?? 0) > generation) continue
      if (keepOne) {
        keepOne = false
        continue
      }
      material.dispose()
      this.tops.delete(map)
    }
  }

  dispose(): void {
    for (const m of this.materials()) m.dispose()
    this.tops.clear()
    this.grain?.release()
    this.grain = null
  }

  displayedColors(): ColorChannels {
    return channelsOf(this.display)
  }

  private materials(): THREE.MeshStandardMaterial[] {
    return [this.walls, ...this.tops.values()]
  }

  private layerAmplitude(): number {
    return this.layerLinesOn ? LOOK.layerLines.amplitude * LOOK.materials.layerLines : 0
  }

  private applyUniforms(grainMap: THREE.Texture): void {
    const u = this.uniforms
    u.tsLayerMm.value = LOOK.layerLines.layerMm
    u.tsLineMm.value = LOOK.layerLines.lineMm
    u.tsLayerAmp.value = this.layerAmplitude()
    u.tsTintRed.value.set(LOOK.palette.red)
    u.tsDimColor.value.setRGB(...LOOK.hatch.dimTint)
    u.tsHatchLine.value = LOOK.hatch.lineFraction
    u.tsHatchGlow.value = LOOK.hatch.glow
    u.tsWashGlow.value = LOOK.hatch.washGlow
    u.tsGrainMap.value = grainMap
    u.tsGrainMm.value = LOOK.materials.grain.tileMm
    u.tsGrainRough.value = LOOK.materials.grain.roughness
    u.tsGrainAlbedo.value = LOOK.materials.grain.albedo
  }

  private copyDisplayInto(m: THREE.MeshStandardMaterial): void {
    m.color.copy(this.display.color)
    if (m instanceof THREE.MeshPhysicalMaterial) m.sheenColor.copy(this.display.sheenColor)
  }

  private applyDisplay(): void {
    for (const m of this.materials()) this.copyDisplayInto(m)
  }
}

/**
 * Keeps the material set on screen across renders: a color change reuses the set (colours animate), a
 * tier change that swaps the material type builds a new set that starts from the old colours.
 * Retired sets are disposed after the new one has committed.
 */
export class MaterialLibrary {
  private current: TileMaterialSet | null = null
  private retired: TileMaterialSet[] = []

  resolve(recipe: MaterialRecipe): TileMaterialSet {
    if (this.current && this.current.recipe.structureKey === recipe.structureKey) return this.current
    const next = new TileMaterialSet(recipe, this.current)
    if (this.current) this.retired.push(this.current)
    this.current = next
    return next
  }

  /** Disposes every set except the one on screen. */
  flush(onScreen: TileMaterialSet): void {
    for (const set of this.retired) if (set !== onScreen) set.dispose()
    this.retired = this.retired.filter((s) => s === onScreen)
  }

  dispose(): void {
    for (const set of this.retired) set.dispose()
    this.current?.dispose()
    this.retired = []
    this.current = null
  }
}
