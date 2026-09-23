import { describe, expect, it } from 'vitest'
import { cutsRelief, DEFAULT_CONFIG, DEFAULT_PERIMETER, normalizeConfig, PERIMETER_PROFILES } from '../config'
import type { DesignConfig, JointEdgeProfile, PerimeterProfile, PerimeterSettings, PieceEdges } from '../types'
import { pieceTopSampler } from './heightfield'
import {
  applyBevel,
  effectiveBevel,
  jointBreaks,
  jointZ,
  PERIMETER_RIM_FLOOR,
  perimeterBand,
  perimeterBreaks,
  perimeterZ,
  pieceAxisBreaks,
  resolveJointEdge,
  resolvePerimeter,
  shapingEdges,
  topShaper,
  type ResolvedPerimeter,
} from './profiles'
import { makeField } from './testFields'

type Profile = Exclude<PerimeterProfile, 'none'>
type Land = PerimeterSettings['land']
const PROFILES: Profile[] = ['margin', 'chamfer', 'bullnose', 'ogee', 'frame']
const DROPPING = ['chamfer', 'bullnose', 'ogee'] as const
const JOINTS: JointEdgeProfile[] = ['square', 'chamfer', 'round', 'pillow']
/** Every land a profile takes: the dropping profiles also cut the relief, margin and frame only flatten it. */
const VARIANTS: [Profile, Land][] = PROFILES.flatMap((profile) =>
  (cutsRelief(profile) ? (['cut', 'valleys', 'peaks'] as const) : (['valleys', 'peaks'] as const)).map(
    (land): [Profile, Land] => [profile, land],
  ),
)
/** The same without the cut: the lands that flatten the relief, as they printed before the cut existed. */
const FLAT_VARIANTS = VARIANTS.filter(([, land]) => land !== 'cut')

/** A design with a perimeter profile at that profile's own defaults, every side on. */
function withProfile(profile: Profile, over: Partial<PerimeterSettings> = {}, config: Partial<DesignConfig> = {}): DesignConfig {
  const d = PERIMETER_PROFILES[profile]
  return {
    ...DEFAULT_CONFIG,
    ...config,
    perimeter: { ...DEFAULT_PERIMETER, profile, width: d.width, drop: d.drop, land: d.land, ...over },
  }
}

const edges = (profiled: PieceEdges['profiled']): PieceEdges => ({ boundary: 0, tabs: 0, profiled })

/** Largest jump between two samples `step` apart over [from, to]: a continuous profile keeps it small. */
function largestJump(f: (d: number) => number, from: number, to: number, step = 1e-4): number {
  let worst = 0
  let previous = f(from)
  for (let d = from + step; d <= to; d += step) {
    const z = f(d)
    worst = Math.max(worst, Math.abs(z - previous))
    previous = z
  }
  return worst
}

describe('resolveJointEdge', () => {
  it('keeps the historical chamfer size on a default design', () => {
    expect(resolveJointEdge(DEFAULT_CONFIG)).toEqual({ profile: 'chamfer', size: effectiveBevel(DEFAULT_CONFIG), run: 0.5 })
  })

  it('clamps the size to half the plate and 3 mm', () => {
    expect(resolveJointEdge({ ...DEFAULT_CONFIG, bevel: 3 }).size).toBe(2)
    const thick = { ...DEFAULT_CONFIG, bevel: 5, tile: { width: 150, height: 150, thickness: 12 } }
    expect(resolveJointEdge(thick).size).toBe(3)
  })

  it('gives the pillow a four times longer run, within an eighth of the tile', () => {
    expect(resolveJointEdge({ ...DEFAULT_CONFIG, jointEdge: 'pillow', bevel: 1 })).toEqual({ profile: 'pillow', size: 1, run: 4 })
    const small = { ...DEFAULT_CONFIG, jointEdge: 'pillow' as const, bevel: 2, tile: { width: 40, height: 60, thickness: 4 } }
    expect(resolveJointEdge(small)).toEqual({ profile: 'pillow', size: 2, run: 5 })
  })

  it('leaves a square edge alone whatever its size', () => {
    expect(resolveJointEdge({ ...DEFAULT_CONFIG, jointEdge: 'square', bevel: 2 })).toEqual({ profile: 'square', size: 0, run: 0 })
    expect(jointBreaks(resolveJointEdge({ ...DEFAULT_CONFIG, jointEdge: 'square' }))).toEqual([])
  })
})

describe('jointZ', () => {
  const t = 4

  it('is the historical chamfer, bit for bit, inside, at and outside the rim', () => {
    const edge = resolveJointEdge({ ...DEFAULT_CONFIG, bevel: 0.6 })
    for (let d = -1; d <= 2; d += 0.0137) {
      for (const z of [4, 4.3, 6.4]) expect(jointZ(z, d, edge, t)).toBe(applyBevel(z, d, t, 0.6))
    }
  })

  it('drops by the full size at the rim and nothing past its run', () => {
    for (const profile of JOINTS) {
      const edge = resolveJointEdge({ ...DEFAULT_CONFIG, jointEdge: profile, bevel: 0.8 })
      const drop = profile === 'square' ? 0 : 0.8
      expect(jointZ(6, 0, edge, t), profile).toBeCloseTo(6 - drop, 12)
      expect(jointZ(6, edge.run, edge, t), profile).toBe(6)
      expect(jointZ(6, 20, edge, t), profile).toBe(6)
    }
  })

  it('rounds the round edge on a quarter circle', () => {
    const edge = resolveJointEdge({ ...DEFAULT_CONFIG, jointEdge: 'round', bevel: 1 })
    // Half way in, a circle of radius 1 has dropped 1 - sqrt(1 - 0.5^2).
    expect(jointZ(6, 0.5, edge, t)).toBeCloseTo(6 - (1 - Math.sqrt(0.75)), 12)
  })

  it('is continuous for every profile, skirt included', () => {
    for (const profile of JOINTS) {
      const edge = resolveJointEdge({ ...DEFAULT_CONFIG, jointEdge: profile, bevel: 1.5 })
      expect(largestJump((d) => jointZ(6.2, d, edge, t), -1, edge.run + 1), profile).toBeLessThan(0.02)
    }
  })

  it('subtracts the whole groove where a profile already dropped below the plate', () => {
    const edge = resolveJointEdge(DEFAULT_CONFIG)
    expect(jointZ(2, 0, edge, t)).toBeCloseTo(1.5, 12)
    const round = resolveJointEdge({ ...DEFAULT_CONFIG, jointEdge: 'round' })
    expect(jointZ(2, 0, round, t)).toBeCloseTo(1.5, 12)
  })
})

describe('resolvePerimeter', () => {
  it('is null without a profile or without a side', () => {
    expect(resolvePerimeter(DEFAULT_CONFIG)).toBeNull()
    const noSides = withProfile('margin', { sides: { bottom: false, right: false, top: false, left: false } })
    expect(resolvePerimeter(noSides)).toBeNull()
    expect(perimeterBand(DEFAULT_CONFIG)).toBe(0)
    expect(perimeterBand(noSides)).toBe(0)
  })

  it('resolves each profile at its defaults on the default plate', () => {
    // Plate 4, relief 2.6 (auto fade 5.2), joint chamfer 0.5.
    const at = (profile: Profile) => resolvePerimeter(withProfile(profile)) as ResolvedPerimeter
    expect(at('margin')).toMatchObject({ w: 8, h: 0, F: 5.2, L: 4, shape: 8, band: 13.2, clamped: false, reason: null })
    expect(at('margin').cut).toBe(false)
    // The dropping profiles cut the relief by default: no fade, so the band is the profile's own width.
    expect(at('chamfer')).toMatchObject({ w: 4, h: 3, L: 6.6, shape: 4, sides: 15, cut: true, F: 0, band: 4 })
    expect(at('bullnose')).toMatchObject({ w: 4, h: 4, L: 6.6, clamped: false, cut: true, band: 4 })
    expect(at('ogee')).toMatchObject({ w: 10, h: 3, L: 6.6, cut: true, band: 10 })
    expect(at('frame').cut).toBe(false)
    const frame = at('frame')
    expect(frame.Zf).toBeCloseTo(7.6, 12)
    expect(frame.L).toBe(4)
    // The frame's 45° inner slope runs from its top down to the land.
    expect(frame.shape).toBeCloseTo(10 + 3.6, 12)
    expect(frame.band).toBeCloseTo(frame.shape + 5.2, 12)
    expect(perimeterBand(withProfile('frame'))).toBe(frame.band)
  })

  it('fades over twice the relief depth, within 3 to 16 mm, unless set', () => {
    const fade = (depth: number, value = 0) =>
      resolvePerimeter(withProfile('margin', { fade: value }, { texture: { ...DEFAULT_CONFIG.texture, depth } }))?.F
    expect(fade(1)).toBe(3)
    expect(fade(5)).toBe(10)
    expect(fade(8)).toBe(16)
    expect(fade(2, 0.4)).toBe(1)
    expect(fade(2, 12)).toBe(12)
    // No relief, nothing to fade.
    expect(fade(0)).toBe(0)
    expect(fade(0, 12)).toBe(0)
  })

  it('lowers a drop that would dig the rim under the floor, and says the plate is the limit', () => {
    // Valleys on a 3 mm plate: the land is the plate, 3 - 1.2 - 0.5 = 1.3 mm of room.
    const thin = resolvePerimeter(withProfile('bullnose', { land: 'valleys', drop: 4 }, { tile: { width: 150, height: 150, thickness: 3 } }))
    expect(thin).toMatchObject({ clamped: true, reason: 'plate' })
    expect(thin?.h).toBeCloseTo(1.3, 12)
    // The peaks land has the relief on top of it: 6.6 - 1.2 - 0.5 = 4.9 mm, room for 4.
    expect(resolvePerimeter(withProfile('bullnose', { drop: 4 }))).toMatchObject({ h: 4, clamped: false })
  })

  it('keeps every rim at the floor or above, a joint crossing it included', () => {
    for (const profile of ['chamfer', 'bullnose', 'ogee'] as const) {
      for (const thickness of [1.2, 2, 3, 4, 6]) {
        for (const depth of [0, 1, 2.6, 8]) {
          for (const land of ['valleys', 'peaks', 'cut'] as const) {
            const config = withProfile(profile, { land, drop: 8 }, {
              tile: { width: 150, height: 150, thickness },
              texture: { ...DEFAULT_CONFIG.texture, depth },
              bevel: 3,
            })
            const e = resolvePerimeter(config) as ResolvedPerimeter
            const joint = resolveJointEdge(config)
            const label = `${profile} t${thickness} d${depth} ${land}`
            if (land === 'cut') {
              // A cut keeps the relief where the relief is lower: at a valley on the rim the floor is the
              // plate's own, as anywhere a joint crosses the plate; higher up the profile stops at the floor.
              for (const z0 of [thickness, thickness + depth / 2, thickness + depth]) {
                const rim = jointZ(perimeterZ(z0, 0, e), 0, joint, thickness)
                expect(rim, `${label} z${z0}`).toBeGreaterThanOrEqual(Math.min(PERIMETER_RIM_FLOOR, z0 - joint.size) - 1e-9)
              }
              continue
            }
            const rim = jointZ(perimeterZ(thickness, 0, e), 0, joint, thickness)
            // A plate too thin to hold any drop keeps a flat land: the floor is then the plate's own.
            expect(rim, label).toBeGreaterThanOrEqual(Math.min(PERIMETER_RIM_FLOOR, e.L - joint.size) - 1e-9)
          }
        }
      }
    }
  })

  it('narrows the band to fit the surface, the fade first', () => {
    const narrow = { surface: { width: 60, height: 600 } }
    // Both sides on a 60 mm wide surface: each band keeps under 60 / 2 - 2 = 28 mm.
    const fadeOnly = resolvePerimeter(withProfile('margin', { width: 25 }, narrow)) as ResolvedPerimeter
    expect(fadeOnly).toMatchObject({ w: 25, F: 3, band: 28, clamped: true, reason: 'surface' })
    const both = resolvePerimeter(withProfile('margin', { width: 30 }, narrow)) as ResolvedPerimeter
    expect(both).toMatchObject({ w: 28, F: 0, band: 28, reason: 'surface' })
    // One side only: the band may take the whole width but 2 mm.
    const oneSide = withProfile('margin', { width: 30, sides: { bottom: false, right: false, top: false, left: true } }, narrow)
    expect(resolvePerimeter(oneSide)).toMatchObject({ w: 30, F: 5.2, clamped: false })
    // The plate reason wins over the surface one: it comes with a fix.
    const plateToo = withProfile('bullnose', { width: 30, land: 'valleys', drop: 6 }, { ...narrow, tile: { width: 150, height: 150, thickness: 3 } })
    expect(resolvePerimeter(plateToo)).toMatchObject({ clamped: true, reason: 'plate' })
  })
})

describe('perimeterZ', () => {
  const z0s = [4, 5.3, 6.6]

  it('is continuous for every profile and land, across the shape, the fade and the skirt', () => {
    for (const [profile, land] of VARIANTS) {
      const e = resolvePerimeter(withProfile(profile, { width: 8, drop: profile === 'frame' ? 1 : 3, fade: 5, land })) as ResolvedPerimeter
      for (const z0 of z0s) {
        expect(largestJump((d) => perimeterZ(z0, d, e), -1, e.band + 1), `${profile} ${land} at ${z0}`).toBeLessThan(0.05)
      }
    }
  })

  it('leaves the relief exactly alone past the band', () => {
    for (const [profile, land] of VARIANTS) {
      const e = resolvePerimeter(withProfile(profile, { land })) as ResolvedPerimeter
      expect(perimeterZ(5.123, e.band, e)).toBe(5.123)
      expect(perimeterZ(5.123, e.band + 10, e)).toBe(5.123)
    }
  })

  it('lands flat at L where the shape ends, and reaches its rim at the surface edge', () => {
    for (const [profile, land] of FLAT_VARIANTS) {
      const e = resolvePerimeter(withProfile(profile, { land })) as ResolvedPerimeter
      expect(perimeterZ(5.3, e.shape, e), `${profile} ${land}`).toBeCloseTo(e.L, 12)
      const rim = profile === 'frame' ? e.Zf : profile === 'margin' ? e.L : e.L - e.h
      expect(perimeterZ(5.3, 0, e), `${profile} ${land}`).toBeCloseTo(rim, 12)
    }
  })

  it('computes the valleys and the peaks exactly as before the cut existed', () => {
    // The perimeterZ every flat land printed with until the cut came in, kept word for word.
    const smooth = (s: number) => (s <= 0 ? 0 : s >= 1 ? 1 : s * s * (3 - 2 * s))
    const arc = (v: number) => Math.sqrt(Math.max(0, 1 - v * v))
    const legacy = (z0: number, dp: number, e: ResolvedPerimeter): number => {
      const { profile, w, h, F, L, Zf, shape } = e
      if (dp >= shape + F) return z0
      if (dp >= shape) return F > 0 ? L + smooth((dp - shape) / F) * (z0 - L) : z0
      if (profile === 'frame') return dp <= w ? Zf : Zf - (dp - w)
      if (dp < 0) {
        const slope = profile === 'chamfer' ? Math.min(h / w, 3) : profile === 'bullnose' ? 3 : 0
        return (profile === 'margin' ? L : L - h) + slope * dp
      }
      const u = dp / w
      switch (profile) {
        case 'margin':
          return L
        case 'chamfer':
          return L - h * (1 - u)
        case 'bullnose':
          return L - h * (1 - arc(1 - u))
        case 'ogee':
          return u >= 0.5 ? L - 0.5 * h * (1 - arc(2 - 2 * u)) : L - 0.5 * h - 0.5 * h * arc(2 * u)
      }
    }
    const t = DEFAULT_CONFIG.tile.thickness
    const D = DEFAULT_CONFIG.texture.depth
    for (const [profile, land] of FLAT_VARIANTS) {
      for (const over of [{}, { fade: 7.5 }, { width: 13, drop: profile === 'frame' ? 2.5 : 1.7 }]) {
        const e = resolvePerimeter(withProfile(profile, { land, ...over })) as ResolvedPerimeter
        expect(e.cut, `${profile} ${land}`).toBe(false)
        expect(e.L, `${profile} ${land}`).toBe(t + (land === 'peaks' ? D : 0))
        for (let dp = -1.5; dp < e.band + 2; dp += 0.0731) {
          for (const z0 of [4, 4.77, 5.3, 6.6]) expect(perimeterZ(z0, dp, e), `${profile} ${land} ${dp}`).toBe(legacy(z0, dp, e))
        }
      }
    }
  })

  it('stands the frame proud of the relief peaks', () => {
    const e = resolvePerimeter(withProfile('frame', { drop: 2 })) as ResolvedPerimeter
    expect(perimeterZ(6.6, 5, e)).toBeCloseTo(4 + 2.6 + 2, 12)
    // The 45° inner slope: 1 mm further in, 1 mm lower.
    expect(perimeterZ(6.6, e.w + 1, e)).toBeCloseTo(e.Zf - 1, 12)
  })
})

describe('a profile that cuts the relief', () => {
  const cutOf = (profile: (typeof DROPPING)[number], over: Partial<PerimeterSettings> = {}, config: Partial<DesignConfig> = {}) =>
    resolvePerimeter(withProfile(profile, { land: 'cut', ...over }, config)) as ResolvedPerimeter
  const t = DEFAULT_CONFIG.tile.thickness
  const D = DEFAULT_CONFIG.texture.depth
  /** The relief heights a piece can have: the plate, the peaks and a few between. */
  const reliefs = [t, t + 0.3, t + D / 2, t + D - 0.2, t + D]

  it('has no fade and no land: its band is its width, its curve starts at the peaks', () => {
    for (const profile of DROPPING) {
      const e = cutOf(profile, { fade: 12, width: 9 })
      expect(e).toMatchObject({ cut: true, F: 0, w: 9, shape: 9, band: 9, L: t + D })
      expect(perimeterBand(withProfile(profile, { land: 'cut', width: 9 }))).toBe(9)
      // The drop measures down from the peaks, so it has the room the peaks land had.
      const peaks = resolvePerimeter(withProfile(profile, { land: 'peaks', fade: 12, width: 9 })) as ResolvedPerimeter
      expect(e.h).toBe(peaks.h)
      expect(e.reason).toBe(peaks.reason)
    }
  })

  it('reads as the valleys on a profile that cannot cut', () => {
    for (const profile of ['margin', 'frame'] as const) {
      const e = resolvePerimeter(withProfile(profile, { land: 'cut' })) as ResolvedPerimeter
      const valleys = resolvePerimeter(withProfile(profile, { land: 'valleys' })) as ResolvedPerimeter
      expect(e).toEqual(valleys)
    }
  })

  it('never stands above the relief, and meets it at and beyond its width', () => {
    for (const profile of DROPPING) {
      for (const over of [{}, { width: 15, drop: 5 }, { width: 2, drop: 0.5 }]) {
        const e = cutOf(profile, over)
        for (const z0 of reliefs) {
          for (let dp = -1; dp < e.w; dp += 0.0137) expect(perimeterZ(z0, dp, e)).toBeLessThanOrEqual(z0)
          expect(perimeterZ(z0, e.w, e)).toBe(z0)
          expect(perimeterZ(z0, e.w + 3.3, e)).toBe(z0)
        }
      }
    }
  })

  it('is the lower of the relief and the profile the peaks land draws, the skirt included', () => {
    for (const profile of DROPPING) {
      const e = cutOf(profile)
      const peaks = resolvePerimeter(withProfile(profile, { land: 'peaks' })) as ResolvedPerimeter
      for (const z0 of reliefs) {
        for (let dp = -1; dp < e.w; dp += 0.0371) expect(perimeterZ(z0, dp, e)).toBe(Math.min(z0, perimeterZ(z0, dp, peaks)))
      }
    }
  })

  it('keeps a dip open right to the rim where the profile stays above it', () => {
    // A 2 mm chamfer from the peaks of a 2.6 mm relief: its rim stays above the valleys.
    const e = cutOf('chamfer', { drop: 2 })
    expect(e.L - e.h).toBeGreaterThan(t)
    expect(perimeterZ(t, 0, e)).toBe(t)
    expect(perimeterZ(t, e.w / 2, e)).toBe(t)
    // A peak there is trimmed down to the chamfer.
    expect(perimeterZ(t + D, 0, e)).toBeCloseTo(e.L - e.h, 12)
  })

  it('is continuous across the rim, the skirt, the curve and its width, at every relief height', () => {
    for (const profile of DROPPING) {
      for (const over of [{}, { width: 12, drop: 4.5 }]) {
        const e = cutOf(profile, over)
        for (const z0 of reliefs) {
          expect(largestJump((d) => perimeterZ(z0, d, e), -1, e.w + 1), `${profile} at ${z0}`).toBeLessThan(0.05)
        }
      }
    }
  })

  it('rounds the plate edge too when it drops deeper than the relief, never under the floor', () => {
    const e = cutOf('bullnose', { drop: 8 })
    const joint = resolveJointEdge(withProfile('bullnose', { land: 'cut', drop: 8 }))
    // 6.6 - 1.2 - 0.5: the drop reaches below the valleys, so the plate edge rounds with it.
    expect(e).toMatchObject({ clamped: true, reason: 'plate' })
    expect(e.h).toBeCloseTo(4.9, 12)
    expect(perimeterZ(t, 0, e)).toBeCloseTo(PERIMETER_RIM_FLOOR + joint.size, 12)
    expect(perimeterZ(t, 0, e)).toBeLessThan(t)
  })

  it('mitres two cut sides on the diagonal', () => {
    for (const profile of DROPPING) {
      const shape = topShaper(withProfile(profile, { land: 'cut' }), edges({ bottom: 0, left: 0 }))
      for (let a = -0.3; a < 14; a += 0.37) {
        for (let b = -0.3; b < 14; b += 0.53) {
          for (const z0 of [t, t + 1.1, t + D]) expect(shape(z0, a, 80, 90, b)).toBe(shape(z0, b, 80, 90, a))
        }
      }
    }
  })

  it('creases where its own curve and the joint edge along the rim do, and ends its breaks at its width', () => {
    for (const profile of DROPPING) {
      const config = withProfile(profile, { land: 'cut' })
      const e = resolvePerimeter(config) as ResolvedPerimeter
      const breaks = perimeterBreaks(e, resolveJointEdge(config))
      expect(Math.max(...breaks), profile).toBe(e.w)
      expect(breaks, profile).toEqual([...new Set(breaks)].sort((a, b) => a - b))
      expect(breaks, profile).toContain(0.5)
    }
  })

  it('reaches the valleys of the default relief at its defaults, on the Light plate too', () => {
    for (const profile of DROPPING) {
      for (const thickness of [3, 4]) {
        const e = cutOf(profile, {}, { tile: { width: 150, height: 150, thickness } })
        expect(e.L - e.h, `${profile} t${thickness}`).toBeLessThan(thickness)
      }
    }
    // The chamfer has the room for its whole drop even there: 3 + 2.6 - 1.2 - 0.5 = 3.9 mm.
    expect(cutOf('chamfer', {}, { tile: { width: 150, height: 150, thickness: 3 } })).toMatchObject({ h: 3, clamped: false })
  })

  it('comes back unchanged through normalizeConfig', () => {
    for (const profile of DROPPING) {
      const config = withProfile(profile, { land: 'cut' })
      expect(normalizeConfig(config).perimeter).toEqual(config.perimeter)
    }
  })
})

describe('topShaper', () => {
  const t = DEFAULT_CONFIG.tile.thickness

  it('is the plain joint edge on an interior piece and without a profile', () => {
    const plain = topShaper(DEFAULT_CONFIG)
    const ignored = topShaper(DEFAULT_CONFIG, edges({ bottom: 0, left: 0 }))
    for (const [b, r, tp, l] of [[0.1, 50, 100, 20], [3, 0.2, 1, 60], [-0.2, 10, 10, 10]]) {
      expect(plain(6, b, r, tp, l)).toBe(applyBevel(6, Math.min(l, r, b, tp), t, 0.5))
      expect(ignored(6, b, r, tp, l)).toBe(plain(6, b, r, tp, l))
    }
  })

  it('mitres two profiled sides on the diagonal', () => {
    for (const [profile, land] of VARIANTS) {
      const shape = topShaper(withProfile(profile, { land }), edges({ bottom: 0, left: 0 }))
      for (let a = -0.3; a < 25; a += 0.37) {
        for (let b = -0.3; b < 25; b += 0.53) expect(shape(6.1, a, 80, 90, b)).toBe(shape(6.1, b, 80, 90, a))
      }
    }
  })

  it('replaces the joint edge with a profile over a flat land, and keeps it on the flat profiles and a cut', () => {
    const edgeOnly = edges({ bottom: 0 })
    // At the surface edge, far from any joint: the chamfer profile alone, the margin its land minus the joint edge.
    const valleys = withProfile('chamfer', { land: 'valleys' })
    const chamfer = resolvePerimeter(valleys) as ResolvedPerimeter
    expect(topShaper(valleys, edgeOnly)(6, 0, 70, 70, 70)).toBeCloseTo(chamfer.L - chamfer.h, 12)
    expect(topShaper(withProfile('margin'), edgeOnly)(6, 0, 70, 70, 70)).toBeCloseTo(t - 0.5, 12)
    // Where a joint meets the edge, the groove runs through the profile down to the rim.
    expect(topShaper(valleys, edgeOnly)(6, 0, 70, 70, 0)).toBeCloseTo(chamfer.L - chamfer.h - 0.5, 12)
    // A cut keeps the joint edge along the rim: a valley there drops by it, as on the tile with no profile.
    const cut = withProfile('chamfer', { drop: 2 })
    const e = resolvePerimeter(cut) as ResolvedPerimeter
    expect(topShaper(cut, edgeOnly)(t, 0, 70, 70, 70)).toBeCloseTo(t - 0.5, 12)
    expect(topShaper(cut, edgeOnly)(t + 2.6, 0, 70, 70, 70)).toBeCloseTo(e.L - e.h - 0.5, 12)
    expect(topShaper(cut, edgeOnly)(t, 0.2, 70, 70, 70)).toBeCloseTo(t - 0.3, 12)
  })

  it('never stands a cut above the same piece printed with no profile, and keeps its rim at the floor', () => {
    // Every cut and joint edge over thin to thick plates, no to deep relief, and narrow to wide, shallow to deep edges.
    const joints: [JointEdgeProfile, number][] = [['square', 0], ['chamfer', 0.5], ['chamfer', 3], ['round', 2], ['pillow', 3]]
    // A corner piece, a piece along one edge, and a whole tile past a narrow border cut (3 mm from the edge).
    const pieces = [edges({ bottom: 0, left: 0 }), edges({ bottom: 0 }), edges({ bottom: 3 })]
    const across = [0, 0.2, 0.6, 1.5, 3, 7, 20, 75]
    let added = -Infinity
    let underFloor = -Infinity
    for (const profile of DROPPING) {
      for (const [jointEdge, bevel] of joints) {
        for (const thickness of [1.2, 3, 4, 6]) {
          for (const depth of [0, 1, 2.6, 8]) {
            for (const [width, drop] of [[1, 0.5], [4, 3], [4, 8], [30, 8]]) {
              const config = normalizeConfig(
                withProfile(profile, { land: 'cut', width, drop }, {
                  jointEdge,
                  bevel,
                  tile: { width: 150, height: 150, thickness },
                  texture: { ...DEFAULT_CONFIG.texture, depth },
                }),
              )
              expect(resolvePerimeter(config)?.cut).toBe(true)
              const none = normalizeConfig({ ...config, perimeter: { ...config.perimeter, profile: 'none' } })
              for (const piece of pieces) {
                const shape = topShaper(config, piece)
                const plain = topShaper(none, piece)
                for (const z0 of [thickness, thickness + depth / 3, thickness + depth]) {
                  for (let b = 0; b < width + 3; b += 0.23) {
                    for (const l of across) {
                      const z = shape(z0, b, 150 - l, 150 - b, l)
                      const p = plain(z0, b, 150 - l, 150 - b, l)
                      added = Math.max(added, z - p)
                      // On the wall's edge a cut stops at the floor, or where the plain tile already sits lower.
                      if (b === 0 && piece.profiled.bottom === 0) underFloor = Math.max(underFloor, Math.min(PERIMETER_RIM_FLOOR, p) - z)
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(added).toBeLessThanOrEqual(0)
    expect(underFloor).toBeLessThanOrEqual(1e-9)
  })

  it('keeps the joint edge on a surface side the profile is switched off on', () => {
    const bottomOnly = withProfile('bullnose', { sides: { bottom: true, right: false, top: false, left: false } })
    // The layout only reports the bottom; the left side is a plain joint, square or not.
    const shape = topShaper(bottomOnly, edges({ bottom: 0 }))
    expect(shape(6, 70, 70, 70, 0)).toBeCloseTo(6 - 0.5, 12)
    expect(shape(6, 70, 70, 70, 0.2)).toBeCloseTo(6 - 0.3, 12)
  })

  it('spills continuously onto the piece past a narrow border cut', () => {
    for (const [profile, land] of VARIANTS) {
      const config = withProfile(profile, { land })
      // A 5 mm cut on the bottom edge, then a full tile whose bottom side is 5 mm from the edge.
      const cut = topShaper(config, edges({ bottom: 0 }))
      const above = topShaper(config, edges({ bottom: 5 }))
      for (const z0 of [4, 5.2, 6.6]) {
        expect(above(z0, 0, 70, 145, 70), profile).toBe(cut(z0, 5, 70, 0, 70))
        // Inside the upper piece, the profile goes on where the cut left it.
        const e = resolvePerimeter(config) as ResolvedPerimeter
        expect(above(z0, 3, 70, 145, 70), profile).toBe(perimeterZ(z0, 8, e))
      }
    }
  })

  it('shows through the shared sampler: a corner of a symmetric relief is symmetric', () => {
    const field = makeField((x, y) => 1.3 * (1 + Math.cos((2 * Math.PI * 3 * x) / 150) * Math.cos((2 * Math.PI * 3 * y) / 150)), 150, 150, 2.6)
    for (const [profile, land] of VARIANTS) {
      const sample = pieceTopSampler(withProfile(profile, { land }), field, {
        crop: { x0: 0, y0: 0, x1: 150, y1: 150 },
        width: 150,
        height: 150,
        edges: edges({ bottom: 0, left: 0 }),
      })
      for (let a = 0; a <= 30; a += 0.75) {
        for (let b = 0; b <= 30; b += 1.25) expect(sample(a, b)).toBeCloseTo(sample(b, a), 12)
      }
    }
  })
})

describe('break lines', () => {
  it('is one chamfer line per side on a default design', () => {
    const { x, y } = pieceAxisBreaks(DEFAULT_CONFIG, edges({}))
    expect(x).toEqual({ low: [0.5], high: [0.5], union: false })
    expect(y).toEqual({ low: [0.5], high: [0.5], union: false })
  })

  it('follows a round joint edge down its arc', () => {
    const lines = jointBreaks(resolveJointEdge({ ...DEFAULT_CONFIG, jointEdge: 'round', bevel: 1 }))
    expect(lines).toHaveLength(6)
    expect(Math.max(...lines)).toBe(1)
    expect(Math.min(...lines)).toBeGreaterThan(0)
  })

  it('puts the profile on the profiled side only, and ends at the band', () => {
    const config = withProfile('bullnose', { land: 'valleys' })
    const { x, y } = pieceAxisBreaks(config, edges({ bottom: 0 }))
    const e = resolvePerimeter(config) as ResolvedPerimeter
    expect(x).toEqual({ low: [0.5], high: [0.5], union: false })
    expect(y.union).toBe(true)
    expect(y.high).toEqual([0.5])
    expect(Math.max(...y.low)).toBeCloseTo(e.band, 12)
    // The bullnose replaces the joint edge: no chamfer line on that side.
    expect(y.low).not.toContain(0.5)
    expect(y.low).toEqual(perimeterBreaks(e, resolveJointEdge(config)))
  })

  it('keeps the joint edge lines on the flat profiles and a cut, and drops them for a flat land', () => {
    const joint = resolveJointEdge(DEFAULT_CONFIG)
    for (const [profile, land] of VARIANTS) {
      const breaks = perimeterBreaks(resolvePerimeter(withProfile(profile, { land })) as ResolvedPerimeter, joint)
      if (cutsRelief(profile) && land !== 'cut') expect(breaks, `${profile} ${land}`).not.toContain(0.5)
      else expect(breaks, `${profile} ${land}`).toContain(0.5)
    }
  })

  it('shifts the profile past a narrow cut and keeps the joint there', () => {
    const config = withProfile('margin')
    const { y } = pieceAxisBreaks(config, edges({ bottom: 5 }))
    // Margin lines at 8 and 13.2 from the edge are 3 and 8.2 from this side; the joint adds 0.5.
    expect(y.low[0]).toBe(0.5)
    expect(y.low[1]).toBeCloseTo(3, 12)
    expect(y.low[2]).toBeCloseTo(8.2, 12)
    expect(y.low).toHaveLength(3)
  })

  it('reports which offsets shape a piece', () => {
    expect(shapingEdges(DEFAULT_CONFIG, edges({ bottom: 0 }))).toEqual({})
    expect(shapingEdges(withProfile('ogee'), edges({ bottom: 0, left: 4 }))).toEqual({ bottom: 0, left: 4 })
    // A side switched off since the layout ran shapes nothing.
    const bottomOnly = withProfile('ogee', { sides: { bottom: true, right: false, top: false, left: false } })
    expect(shapingEdges(bottomOnly, edges({ bottom: 0, left: 4 }))).toEqual({ bottom: 0 })
    expect(pieceAxisBreaks(bottomOnly, edges({ left: 0 })).x).toEqual({ low: [0.5], high: [0.5], union: false })
  })
})
