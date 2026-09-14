import * as THREE from 'three'
import type { Filament, Finish } from '@/core/filaments'
import { clampAlbedo, darken, lighten, linearLuminance } from './colorMath'
import { LOOK, type Tier } from './look'
import { acquireDetailTexture, acquireFlakeTexture, type DetailKind, type FlakeSpec, type TextureHandle } from './proceduralTextures'
import { applyTesseraPatch, createTesseraUniforms, type TesseraUniforms } from './shaderPatch'

export interface DetailRecipe {
  kind: DetailKind
  /** Size of one texture repeat on the tile, mm. */
  tileMm: number
  grainRough: number
  grainAlbedo: number
  speckleDark: number
  speckleLight: number
  fiber: number
  woodBands: number
  /** Wood band frequency, cycles per mm. */
  woodFreq: number
}

export interface FlakeRecipe {
  spec: FlakeSpec
  tileMm: number
  tilt: number
  tint: number
  roughness: number
  metalness: number
  /** Iridescence multiplier outside flakes. */
  iridescenceOutside: number
  color: THREE.Color
}

/** Physically based parameters for one filament; colours are linear. */
export interface FinishRecipe {
  finish: Finish
  /** Everything that changes the compiled shader program. Colours and scalars do not. */
  structureKey: string
  physical: boolean
  color: THREE.Color
  secondary: THREE.Color
  lightTint: THREE.Color
  roughness: number
  metalness: number
  envMapIntensity: number
  specularIntensity: number
  specularColor: THREE.Color
  clearcoat: number
  clearcoatRoughness: number
  sheen: number
  sheenColor: THREE.Color
  sheenRoughness: number
  anisotropy: number
  anisotropyRotation: number
  iridescence: number
  iridescenceIOR: number
  iridescenceThicknessRange: [number, number]
  transmission: number
  thickness: number
  attenuationColor: THREE.Color
  attenuationDistance: number
  ior: number
  emissive: THREE.Color
  emissiveIntensity: number
  /** Low-tier stand-in for transmission. */
  opacity: number
  detail: DetailRecipe | null
  flakes: FlakeRecipe | null
  dual: boolean
  /** Fraction of the global layer-line strength this finish shows. */
  layerLines: number
  bloom: number
}

const GLOSSY_FINISHES: ReadonlySet<Finish> = new Set(['glossy', 'silk', 'metallic', 'galaxy', 'translucent'])

const grain = (grainRough: number, grainAlbedo: number, tileMm = 18): DetailRecipe => ({
  kind: 'grain',
  tileMm,
  grainRough,
  grainAlbedo,
  speckleDark: 0,
  speckleLight: 0,
  fiber: 0,
  woodBands: 0,
  woodFreq: 0.2,
})

/**
 * Maps a filament to material parameters, following the researched rendering hints (roughness, clearcoat,
 * sheen, anisotropy, flakes, speckle...). `tier` 0 drops the physical extras; `solidMm` is the tile's
 * base plus half the relief, the optical thickness of translucent tiles.
 */
export function finishRecipe(filament: Filament, tier: Tier, solidMm: number): FinishRecipe {
  const finish = filament.finish
  const petg = filament.line.startsWith('PETG')
  const base = clampAlbedo(filament.hex, GLOSSY_FINISHES.has(finish))
  const secondary = filament.secondaryHex ? new THREE.Color(filament.secondaryHex) : darken(base, 0.4)
  const r: FinishRecipe = {
    finish,
    structureKey: '',
    physical: tier > 0,
    color: base,
    secondary,
    lightTint: lighten(base, 0.18),
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: LOOK.materials.envMapIntensity,
    specularIntensity: 0.5,
    specularColor: new THREE.Color(1, 1, 1),
    clearcoat: 0,
    clearcoatRoughness: 0.2,
    sheen: 0,
    sheenColor: lighten(base, 0.3),
    sheenRoughness: 0.8,
    anisotropy: 0,
    anisotropyRotation: 0,
    iridescence: 0,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [100, 400],
    transmission: 0,
    thickness: Math.max(0.5, solidMm),
    attenuationColor: new THREE.Color(1, 1, 1),
    attenuationDistance: Infinity,
    ior: petg ? 1.57 : 1.46,
    emissive: new THREE.Color(0, 0, 0),
    emissiveIntensity: 0,
    opacity: 1,
    detail: grain(0.05, 0.03),
    flakes: null,
    dual: false,
    layerLines: 1,
    bloom: LOOK.bloom.byFinish[finish] ?? 0,
  }

  switch (finish) {
    case 'matte':
      r.roughness = 0.9
      r.specularIntensity = 0.42
      r.sheen = 0.08
      r.detail = grain(0.06, 0.04)
      r.layerLines = 0.5
      break
    case 'glossy':
      r.roughness = petg ? 0.22 : 0.36
      r.specularIntensity = 1
      r.clearcoat = petg ? 0.5 : 0.25
      r.clearcoatRoughness = petg ? 0.08 : 0.2
      r.detail = grain(0.04, 0.02)
      break
    case 'silk':
      r.roughness = 0.24
      r.metalness = 0.35
      r.specularIntensity = 1
      r.specularColor = base.clone().lerp(new THREE.Color(1, 1, 1), 0.4)
      // Streaky "liquid satin" highlight along the extrusion lines.
      r.anisotropy = 0.7
      r.anisotropyRotation = Math.PI / 4
      r.clearcoat = 0.6
      r.clearcoatRoughness = 0.08
      r.sheen = 0.35
      r.sheenColor = lighten(base, 0.5)
      r.sheenRoughness = 0.3
      r.envMapIntensity = 1.15
      if (/gold|rose|champagne/i.test(filament.name)) {
        r.iridescence = 0.15
        r.iridescenceThicknessRange = [250, 450]
      }
      r.dual = Boolean(filament.secondaryHex)
      if (filament.secondaryHex) r.secondary = clampAlbedo(filament.secondaryHex, true)
      r.detail = null
      r.layerLines = 0.9
      break
    case 'metallic':
      r.roughness = 0.47
      r.metalness = 0.72
      r.specularIntensity = 1
      r.anisotropy = 0.3
      r.clearcoat = 0.15
      r.clearcoatRoughness = 0.35
      r.envMapIntensity = 1.25
      r.detail = grain(0.16, 0.03, 12)
      r.flakes = {
        spec: { coverage: 0.3, radiusPx: [0.8, 1.6], seed: 11 },
        tileMm: 6,
        tilt: 0.12,
        tint: 0.15,
        roughness: 0.3,
        metalness: 1,
        iridescenceOutside: 1,
        color: lighten(base, 0.35),
      }
      break
    case 'carbon':
      r.color = darken(base, 0.08, 0.15)
      r.roughness = 0.84
      r.specularIntensity = 0.4
      r.sheen = 0.18
      r.sheenColor = new THREE.Color('#3A3A3A')
      r.sheenRoughness = 0.5
      r.detail = { ...grain(0.1, 0.05, 12), kind: 'carbon', fiber: 1 }
      r.layerLines = 0.4
      break
    case 'sparkle':
      r.roughness = 0.7
      r.clearcoat = 0.1
      r.clearcoatRoughness = 0.3
      r.detail = grain(0.05, 0.03)
      r.flakes = {
        spec: { coverage: 0.06, radiusPx: [2.4, 4.6], seed: 5 },
        tileMm: 16,
        tilt: 0.55,
        tint: 1,
        roughness: 0.15,
        metalness: 1,
        iridescenceOutside: 1,
        color: secondary,
      }
      r.layerLines = 0.5
      break
    case 'galaxy':
      r.roughness = 0.3
      r.clearcoat = 0.5
      r.clearcoatRoughness = 0.1
      r.iridescence = 0.35
      r.iridescenceIOR = 1.5
      r.iridescenceThicknessRange = [200, 500]
      r.flakes = {
        spec: { coverage: 0.16, radiusPx: [1.2, 2.6], seed: 9 },
        tileMm: 10,
        tilt: 0.4,
        tint: 0.9,
        roughness: 0.1,
        metalness: 0.8,
        iridescenceOutside: 0,
        color: secondary,
      }
      break
    case 'marble': {
      const busy = /granite/i.test(filament.name)
      r.roughness = 0.65
      r.specularIntensity = 0.5
      r.lightTint = busy ? new THREE.Color('#C9A08F') : lighten(base, 0.15)
      r.detail = {
        ...grain(0.06, 0.05, 24),
        kind: 'stone',
        speckleDark: busy ? 0.95 : 0.8,
        speckleLight: busy ? 0.85 : 0.7,
      }
      break
    }
    case 'wood':
      r.roughness = 0.8
      r.specularIntensity = 0.35
      r.sheen = 0.2
      r.sheenColor = lighten(base, 0.25)
      r.sheenRoughness = 0.6
      r.detail = { ...grain(0.08, 0.06, 30), kind: 'wood', speckleDark: 0.55, woodBands: 0.22, woodFreq: 0.2 }
      break
    case 'translucent': {
      const tint = new THREE.Color(filament.hex)
      const clear = Math.min(...tint.toArray()) > 0.9
      r.transmission = petg ? 0.9 : 0.7
      r.roughness = petg ? 0.2 : 0.35
      r.specularIntensity = 1
      r.clearcoat = 0.3
      r.clearcoatRoughness = 0.15
      r.color = lighten(base, 0.6)
      r.attenuationColor = tint
      r.attenuationDistance = clear ? 12 : linearLuminance(tint) > 0.6 ? 8 : 3
      r.opacity = 0.82
      r.detail = null
      break
    }
    case 'glow':
      r.roughness = 0.7
      r.emissive = filament.secondaryHex ? new THREE.Color(filament.secondaryHex) : lighten(base, 0.2)
      r.emissiveIntensity = 0.08
      r.detail = grain(0.04, 0.08)
      break
  }

  if (!r.physical) {
    // Standard material on the low tier: none of the physical extras exist there.
    r.clearcoat = 0
    r.sheen = 0
    r.anisotropy = 0
    r.iridescence = 0
  }

  r.structureKey = [
    finish,
    r.physical ? 'P' : 'S',
    r.detail?.kind ?? '-',
    r.flakes ? `${r.flakes.spec.coverage}/${r.flakes.spec.radiusPx.join('-')}/${r.flakes.spec.seed}` : '-',
    r.dual ? 'dual' : '-',
    r.iridescence > 0 ? 'iri' : '-',
    r.transmission > 0 ? 'trans' : '-',
    r.clearcoat > 0 ? 'cc' : '-',
    r.sheen > 0 ? 'sheen' : '-',
    r.anisotropy > 0 ? 'aniso' : '-',
  ].join('|')
  return r
}

function buildMaterial(recipe: FinishRecipe, uniforms: TesseraUniforms, normalMap: THREE.Texture | null): THREE.MeshStandardMaterial {
  const common: THREE.MeshStandardMaterialParameters = {
    color: recipe.color.clone(),
    roughness: recipe.roughness,
    metalness: recipe.metalness,
    envMapIntensity: recipe.envMapIntensity,
    emissive: recipe.emissive.clone(),
    emissiveIntensity: recipe.emissiveIntensity,
  }
  let material: THREE.MeshStandardMaterial
  if (recipe.physical) {
    material = new THREE.MeshPhysicalMaterial({
      ...common,
      specularIntensity: recipe.specularIntensity,
      specularColor: recipe.specularColor.clone(),
      clearcoat: recipe.clearcoat,
      clearcoatRoughness: recipe.clearcoatRoughness,
      sheen: recipe.sheen,
      sheenColor: recipe.sheenColor.clone(),
      sheenRoughness: recipe.sheenRoughness,
      anisotropy: recipe.anisotropy,
      anisotropyRotation: recipe.anisotropyRotation,
      iridescence: recipe.iridescence,
      iridescenceIOR: recipe.iridescenceIOR,
      iridescenceThicknessRange: [...recipe.iridescenceThicknessRange],
      transmission: recipe.transmission,
      thickness: recipe.thickness,
      attenuationColor: recipe.attenuationColor.clone(),
      attenuationDistance: recipe.attenuationDistance,
      ior: recipe.ior,
    })
  } else {
    material = new THREE.MeshStandardMaterial(common)
    if (recipe.transmission > 0) {
      material.transparent = true
      material.opacity = recipe.opacity
    }
  }
  if (normalMap) {
    material.normalMap = normalMap
    material.normalMapType = THREE.ObjectSpaceNormalMap
  }
  applyTesseraPatch(material, uniforms, { detail: recipe.detail !== null, flakes: recipe.flakes !== null, dual: recipe.dual })
  return material
}

/** Colours that animate when the filament changes (all linear). */
interface ColorChannels {
  color: THREE.Color
  secondary: THREE.Color
  lightTint: THREE.Color
  sheenColor: THREE.Color
  specularColor: THREE.Color
  attenuationColor: THREE.Color
  emissive: THREE.Color
  flakeColor: THREE.Color
}

const CHANNELS = ['color', 'secondary', 'lightTint', 'sheenColor', 'specularColor', 'attenuationColor', 'emissive', 'flakeColor'] as const

function channelsOf(recipe: FinishRecipe): ColorChannels {
  return {
    color: recipe.color.clone(),
    secondary: recipe.secondary.clone(),
    lightTint: recipe.lightTint.clone(),
    sheenColor: recipe.sheenColor.clone(),
    specularColor: recipe.specularColor.clone(),
    attenuationColor: recipe.attenuationColor.clone(),
    emissive: recipe.emissive.clone(),
    flakeColor: (recipe.flakes?.color ?? recipe.secondary).clone(),
  }
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
 * The materials of one finish: a walls/bottom material shared by every piece and one top material per
 * baked normal map (the maps differ per piece, the shader program is shared). Owns its textures.
 */
export class FinishMaterialSet {
  readonly uniforms: TesseraUniforms = createTesseraUniforms()
  readonly walls: THREE.MeshStandardMaterial
  private recipeValue: FinishRecipe
  private readonly tops = new Map<THREE.Texture | null, THREE.MeshStandardMaterial>()
  private readonly handles: TextureHandle[] = []
  private readonly display: ColorChannels
  private target: ColorChannels
  private layerLinesOn = false

  constructor(recipe: FinishRecipe, startFrom: FinishMaterialSet | null) {
    this.recipeValue = recipe
    const u = this.uniforms
    if (recipe.detail) {
      const handle = acquireDetailTexture(recipe.detail.kind)
      this.handles.push(handle)
      u.tsDetailMap.value = handle.texture
    }
    if (recipe.flakes) {
      const handle = acquireFlakeTexture(recipe.flakes.spec)
      this.handles.push(handle)
      u.tsFlakeMap.value = handle.texture
    }
    this.target = channelsOf(recipe)
    // A finish change starts from the colours on screen, so the switch animates instead of snapping.
    this.display = startFrom ? startFrom.displayedColors() : channelsOf(recipe)
    this.applyScalars(recipe)
    this.walls = buildMaterial(recipe, u, null)
    this.tops.set(null, buildMaterial(recipe, u, null))
    this.applyDisplay()
  }

  get recipe(): FinishRecipe {
    return this.recipeValue
  }

  /** Top-surface material for a piece's baked normal map (null: vertex normals). */
  top(normalMap: THREE.Texture | null): THREE.MeshStandardMaterial {
    let material = this.tops.get(normalMap)
    if (!material) {
      material = buildMaterial(this.recipeValue, this.uniforms, normalMap)
      this.copyDisplayInto(material)
      this.tops.set(normalMap, material)
    }
    return material
  }

  /** Same shader structure, new filament: scalars snap, colours animate. */
  retarget(recipe: FinishRecipe): void {
    if (recipe.structureKey !== this.recipeValue.structureKey) return
    this.recipeValue = recipe
    this.target = channelsOf(recipe)
    this.applyScalars(recipe)
    for (const m of this.materials()) this.applyMaterialScalars(m, recipe)
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
    this.uniforms.tsLayerAmp.value = on ? LOOK.layerLines.amplitude * this.recipeValue.layerLines : 0
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

  /** Drops top materials whose normal maps are gone. */
  prune(activeMaps: ReadonlySet<THREE.Texture | null>): void {
    for (const [map, material] of this.tops) {
      if (map === null || activeMaps.has(map)) continue
      material.dispose()
      this.tops.delete(map)
    }
  }

  dispose(): void {
    for (const m of this.materials()) m.dispose()
    this.tops.clear()
    for (const h of this.handles) h.release()
    this.handles.length = 0
  }

  displayedColors(): ColorChannels {
    return channelsOf({ ...this.recipeValue, ...this.display, flakes: this.recipeValue.flakes && { ...this.recipeValue.flakes, color: this.display.flakeColor } })
  }

  private materials(): THREE.MeshStandardMaterial[] {
    return [this.walls, ...this.tops.values()]
  }

  private applyScalars(recipe: FinishRecipe): void {
    const u = this.uniforms
    u.tsLayerMm.value = LOOK.layerLines.layerMm
    u.tsLineMm.value = LOOK.layerLines.lineMm
    u.tsLayerAmp.value = this.layerLinesOn ? LOOK.layerLines.amplitude * recipe.layerLines : 0
    u.tsTintRed.value.set(LOOK.palette.red)
    u.tsDimColor.value.setRGB(...LOOK.hatch.dimTint)
    u.tsHatchLine.value = LOOK.hatch.lineFraction
    u.tsHatchGlow.value = LOOK.hatch.glow
    u.tsWashGlow.value = LOOK.hatch.washGlow
    const d = recipe.detail
    if (d) {
      u.tsDetailMm.value = d.tileMm
      u.tsGrainRough.value = d.grainRough
      u.tsGrainAlbedo.value = d.grainAlbedo
      u.tsSpeckleDark.value = d.speckleDark
      u.tsSpeckleLight.value = d.speckleLight
      u.tsFiber.value = d.fiber
      u.tsWoodBands.value = d.woodBands
      u.tsWoodFreq.value = d.woodFreq
    }
    const f = recipe.flakes
    if (f) {
      u.tsFlakeMm.value = f.tileMm
      u.tsFlakeTilt.value = f.tilt
      u.tsFlakeTint.value = f.tint
      u.tsFlakeRough.value = f.roughness
      u.tsFlakeMetal.value = f.metalness
      u.tsFlakeIri.value = f.iridescenceOutside
    }
  }

  private applyMaterialScalars(m: THREE.MeshStandardMaterial, r: FinishRecipe): void {
    m.roughness = r.roughness
    m.metalness = r.metalness
    m.envMapIntensity = r.envMapIntensity
    m.emissiveIntensity = r.emissiveIntensity
    if (m instanceof THREE.MeshPhysicalMaterial) {
      m.specularIntensity = r.specularIntensity
      m.clearcoat = r.clearcoat
      m.clearcoatRoughness = r.clearcoatRoughness
      m.sheen = r.sheen
      m.sheenRoughness = r.sheenRoughness
      m.anisotropy = r.anisotropy
      m.anisotropyRotation = r.anisotropyRotation
      m.iridescence = r.iridescence
      m.iridescenceIOR = r.iridescenceIOR
      m.iridescenceThicknessRange = [...r.iridescenceThicknessRange]
      m.transmission = r.transmission
      m.thickness = r.thickness
      m.attenuationDistance = r.attenuationDistance
      m.ior = r.ior
    } else if (r.transmission > 0) {
      m.opacity = r.opacity
    }
  }

  private copyDisplayInto(m: THREE.MeshStandardMaterial): void {
    m.color.copy(this.display.color)
    m.emissive.copy(this.display.emissive)
    if (m instanceof THREE.MeshPhysicalMaterial) {
      m.sheenColor.copy(this.display.sheenColor)
      m.specularColor.copy(this.display.specularColor)
      m.attenuationColor.copy(this.display.attenuationColor)
    }
  }

  private applyDisplay(): void {
    for (const m of this.materials()) this.copyDisplayInto(m)
    const u = this.uniforms
    u.tsSecondary.value.copy(this.display.secondary)
    u.tsLightTint.value.copy(this.display.lightTint)
    u.tsFlakeColor.value.copy(this.display.flakeColor)
  }
}

/**
 * Keeps the material set on screen across renders: a filament change inside the same finish reuses the
 * set (colours animate), a structural change builds a new set that starts from the old colours.
 * Retired sets are disposed after the new one has committed.
 */
export class MaterialLibrary {
  private current: FinishMaterialSet | null = null
  private retired: FinishMaterialSet[] = []

  resolve(recipe: FinishRecipe): FinishMaterialSet {
    if (this.current && this.current.recipe.structureKey === recipe.structureKey) return this.current
    const next = new FinishMaterialSet(recipe, this.current)
    if (this.current) this.retired.push(this.current)
    this.current = next
    return next
  }

  /** Disposes every set except the one on screen. */
  flush(onScreen: FinishMaterialSet): void {
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
