import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, MIN_FIXING_THICKNESS, normalizeConfig, PERIMETER_PROFILES } from '@/core/config'
import { accessoryParts } from '@/core/fixing/accessories'
import { FIT_MARKS } from '@/core/fixing/guide'
import { computeLayout, layoutInputOf } from '@/core/layout'
import type { DesignConfig } from '@/core/types'
import {
  autoFade,
  autoFadeText,
  borderBadge,
  cutDropNote,
  dropHelp,
  edgesNow,
  effectiveLand,
  FIT_NAMES,
  FIT_ORDER,
  fitLabel,
  type FittedParts,
  fittedParts,
  fixingLimitReason,
  fixingPlateReason,
  floorTenth,
  hasPerimeter,
  jointHeading,
  LAND_COPY,
  landOrder,
  needsFixingPlate,
  PERIMETER_COPY,
  PERIMETER_ORDER,
  plateRaisedFrom,
  plateRaisedNote,
  profileFilesLine,
  type TileModels,
  tileModels,
  withFixings,
  withPerimeterProfile,
} from './edges'

const design = (patch: Partial<DesignConfig> = {}): DesignConfig => ({ ...DEFAULT_CONFIG, ...patch })

const light = (patch: Partial<DesignConfig> = {}) =>
  design({ ...patch, tile: { ...DEFAULT_CONFIG.tile, thickness: 3 } })

describe('edgesNow', () => {
  it('reads the default design as chamfered joints', () => {
    expect(edgesNow(DEFAULT_CONFIG)).toBe('Chamfer joints')
  })

  it('names the border and the joints together, and never how the wall goes up', () => {
    const config = withFixings(withPerimeterProfile(design(), 'bullnose'), { mount: 'clips', lock: 'keys' })
    expect(edgesNow(config)).toBe('Rounded edge · chamfer joints')
    expect(edgesNow(design({ lock: 'keys', mount: 'clips' }))).toBe('Chamfer joints')
  })

  it('falls back to the joints when no side carries the profile', () => {
    const profiled = withPerimeterProfile(design(), 'ogee')
    const sides = { top: false, right: false, bottom: false, left: false }
    const bare = { ...profiled, perimeter: { ...profiled.perimeter, sides } }
    expect(hasPerimeter(bare)).toBe(false)
    expect(edgesNow(bare)).toBe('Chamfer joints')
  })

  it('calls a joint edge of no size square, whatever its shape', () => {
    expect(jointHeading({ jointEdge: 'round', bevel: 0 })).toBe('Square joints')
    expect(jointHeading({ jointEdge: 'pillow', bevel: 0.4 })).toBe('Pillow joints')
  })
})

describe('borderBadge', () => {
  it('says on the lid what the border panel holds, including a profile no side carries', () => {
    expect(borderBadge(DEFAULT_CONFIG)).toBe('None')
    const ogee = withPerimeterProfile(design(), 'ogee')
    expect(borderBadge(ogee)).toBe('Ogee edge')
    const sides = { top: false, right: false, bottom: false, left: false }
    const bare = { ...ogee, perimeter: { ...ogee.perimeter, sides } }
    expect(hasPerimeter(bare)).toBe(false)
    expect(borderBadge(bare)).toBe('No side ticked')
  })
})

describe('withPerimeterProfile', () => {
  it('adopts each profile’s own width, drop and land, and keeps the sides and the fade', () => {
    const start = design({
      perimeter: { ...DEFAULT_CONFIG.perimeter, sides: { top: true, right: true, bottom: false, left: true }, fade: 6 },
    })
    for (const profile of PERIMETER_ORDER) {
      if (profile === 'none') continue
      const next = withPerimeterProfile(start, profile).perimeter
      const defaults = PERIMETER_PROFILES[profile]
      const { width, drop, land } = defaults
      expect(next).toEqual({ ...start.perimeter, profile, width, drop, land })
    }
  })

  it('starts the edges that drop to the rim trimming the pattern, and the flat ones on a band at the valleys', () => {
    expect(withPerimeterProfile(design(), 'chamfer').perimeter.land).toBe('cut')
    expect(withPerimeterProfile(design(), 'bullnose').perimeter.land).toBe('cut')
    expect(withPerimeterProfile(design(), 'ogee').perimeter.land).toBe('cut')
    expect(withPerimeterProfile(design(), 'margin').perimeter.land).toBe('valleys')
    expect(withPerimeterProfile(design(), 'frame').perimeter.land).toBe('valleys')
    // From a cut chamfer to a margin, which cannot cut: the margin's own land, never a cut it cannot print.
    const cut = withPerimeterProfile(design(), 'bullnose')
    expect(withPerimeterProfile(cut, 'margin').perimeter.land).toBe('valleys')
    // A peaks land chosen on one dropping edge gives way to the next edge's own default.
    const peaks = { ...cut, perimeter: { ...cut.perimeter, land: 'peaks' as const } }
    expect(withPerimeterProfile(peaks, 'ogee').perimeter.land).toBe('cut')
  })

  it('switching back to none leaves the tuned values alone', () => {
    const tuned = withPerimeterProfile(design(), 'frame')
    expect(withPerimeterProfile(tuned, 'none').perimeter).toEqual({ ...tuned.perimeter, profile: 'none' })
  })

  it('survives normalizeConfig unchanged for every profile', () => {
    for (const profile of PERIMETER_ORDER) {
      const next = withPerimeterProfile(design(), profile)
      expect(normalizeConfig(next).perimeter).toEqual(next.perimeter)
    }
  })

  it('gives every profile a name, a heading and a sentence', () => {
    for (const profile of PERIMETER_ORDER) {
      expect(PERIMETER_COPY[profile].name).not.toBe('')
      expect(PERIMETER_COPY[profile].line).toMatch(/\.$/)
    }
  })
})

describe('pattern at the edge', () => {
  it('offers the cut only on the edges that drop to the rim, first', () => {
    for (const profile of ['chamfer', 'bullnose', 'ogee'] as const) expect(landOrder(profile)).toEqual(['cut', 'valleys', 'peaks'])
    for (const profile of ['margin', 'frame', 'none'] as const) expect(landOrder(profile)).toEqual(['valleys', 'peaks'])
    // Every profile's own default land is one it offers.
    for (const profile of PERIMETER_ORDER) {
      if (profile !== 'none') expect(landOrder(profile)).toContain(PERIMETER_PROFILES[profile].land)
    }
  })

  it('names and explains every choice in a sentence, the cut promising nothing is added', () => {
    expect(LAND_COPY.cut.name).toBe('Cut')
    expect(LAND_COPY.valleys.name).toBe('Valleys')
    expect(LAND_COPY.peaks.name).toBe('Peaks')
    for (const copy of Object.values(LAND_COPY)) expect(copy.line).toMatch(/\.$/)
    expect(LAND_COPY.cut.line).toContain('stays open right to the edge')
    expect(LAND_COPY.cut.line).toContain('nothing is added')
    expect(LAND_COPY.valleys.line).toContain('level with its valleys')
    expect(LAND_COPY.peaks.line).toContain('level with its peaks')
  })

  it('shows a cut the geometry cannot print as the valleys it prints', () => {
    expect(effectiveLand({ profile: 'bullnose', land: 'cut' })).toBe('cut')
    expect(effectiveLand({ profile: 'margin', land: 'cut' })).toBe('valleys')
    expect(effectiveLand({ profile: 'frame', land: 'peaks' })).toBe('peaks')
  })

  it('measures the drop from the tops of the pattern when the edge starts there', () => {
    const tops = 'How far the edge falls by the time it reaches the rim, measured down from the tops of the pattern.'
    const plain = 'How far the edge falls towards the wall by the time it reaches the rim.'
    expect(dropHelp({ profile: 'bullnose', land: 'cut' }, 2.6)).toBe(tops)
    expect(dropHelp({ profile: 'chamfer', land: 'peaks' }, 2.6)).toBe(tops)
    expect(dropHelp({ profile: 'ogee', land: 'valleys' }, 2.6)).toBe(plain)
    // Without a pattern there are no tops to measure from.
    expect(dropHelp({ profile: 'bullnose', land: 'cut' }, 0)).toBe(plain)
    expect(dropHelp({ profile: 'frame', land: 'valleys' }, 2.6)).toBe('How far the frame stands above the tops of the pattern.')
  })
})

describe('cutDropNote', () => {
  const cut = (drop: number, patch: Partial<DesignConfig> = {}) => {
    const start = withPerimeterProfile(design(patch), 'chamfer')
    return { ...start, perimeter: { ...start.perimeter, drop } }
  }
  const short = 'At this drop the edge stops above the valleys of the pattern: a drop of 2.6 mm or more reaches them.'

  it('says nothing at the defaults of every cut: each reaches the valleys, on the Light plate too', () => {
    for (const profile of ['chamfer', 'bullnose', 'ogee'] as const) {
      expect(cutDropNote(withPerimeterProfile(design(), profile)), profile).toBeNull()
      expect(cutDropNote(withPerimeterProfile(light(), profile)), profile).toBeNull()
    }
  })

  it('names the drop that reaches the valleys while the edge stops above them', () => {
    expect(cutDropNote(cut(2))).toBe(short)
    expect(cutDropNote(cut(0.5))).toBe(short)
    expect(cutDropNote(cut(2.6))).toBeNull()
    // The drop it names is one the slider offers and that reaches: 2.65 mm of relief needs 2.7.
    const deeper = cut(2.6, { texture: { ...DEFAULT_CONFIG.texture, depth: 2.65 } })
    expect(cutDropNote(deeper)).toBe(
      'At this drop the edge stops above the valleys of the pattern: a drop of 2.7 mm or more reaches them.',
    )
    expect(cutDropNote(cut(2.7, { texture: { ...DEFAULT_CONFIG.texture, depth: 2.65 } }))).toBeNull()
  })

  it('reads the drop the base really prints', () => {
    // 8 mm on the Standard plate prints 4.9 mm, which reaches.
    expect(cutDropNote(cut(8))).toBeNull()
    // A 1.6 mm plate holds 1.6 + 2.6 - 1.2 - 0.5 = 2.5 mm at most: no drop reaches, so it names none.
    const thin = cut(8, { tile: { ...DEFAULT_CONFIG.tile, thickness: 1.6 } })
    expect(cutDropNote(thin)).toBe('The edge stops above the valleys of the pattern: a 1.6 mm base has no room for a drop that reaches them.')
    // On the Light plate 2 mm stops short and 2.6 mm fits: the usual note.
    expect(cutDropNote(cut(2, { tile: { ...DEFAULT_CONFIG.tile, thickness: 3 } }))).toBe(short)
  })

  it('says nothing where the edge does not cut, or has no pattern or no side to cut', () => {
    const start = cut(2)
    expect(cutDropNote({ ...start, perimeter: { ...start.perimeter, land: 'valleys' } })).toBeNull()
    expect(cutDropNote({ ...start, perimeter: { ...start.perimeter, land: 'peaks' } })).toBeNull()
    expect(cutDropNote({ ...start, perimeter: { ...start.perimeter, profile: 'margin' } })).toBeNull()
    expect(cutDropNote({ ...start, perimeter: { ...start.perimeter, profile: 'none' } })).toBeNull()
    expect(cutDropNote({ ...start, texture: { ...start.texture, depth: 0 } })).toBeNull()
    const sides = { top: false, right: false, bottom: false, left: false }
    expect(cutDropNote({ ...start, perimeter: { ...start.perimeter, sides } })).toBeNull()
    expect(cutDropNote(DEFAULT_CONFIG)).toBeNull()
  })
})

describe('autoFade', () => {
  it('is twice the relief depth, kept between 3 and 16 mm', () => {
    expect(autoFade(2.6)).toBeCloseTo(5.2)
    expect(autoFade(0.5)).toBe(3)
    expect(autoFade(8)).toBe(16)
  })

  it('says why it is the length it is, including at either end of its range', () => {
    expect(autoFadeText(2.6)).toBe('The pattern settles into a flat band over 5.2 mm, twice its depth.')
    expect(autoFadeText(0.5)).toBe('The pattern settles into a flat band over 3 mm, the shortest it goes.')
    expect(autoFadeText(8.5)).toBe('The pattern settles into a flat band over 16 mm, the longest it goes.')
  })
})

const models = (now: number, noProfile: number, noLock: number, neither: number): TileModels => ({
  now,
  noProfile,
  noLock,
  neither,
})

const KEYED = { ...DEFAULT_CONFIG, lock: 'keys' } as const
const TABBED = { ...DEFAULT_CONFIG, lock: 'tabs' } as const

describe('profileFilesLine', () => {
  it('says how many more files the edge tiles cost', () => {
    expect(profileFilesLine(models(9, 4, 9, 4), KEYED)).toBe('Edge tiles become models of their own: 4 files to print, now 9.')
    expect(profileFilesLine(models(2, 1, 2, 1), KEYED)).toBe('Edge tiles become models of their own: 1 file to print, now 2.')
  })

  it('says so plainly when the count does not move', () => {
    expect(profileFilesLine(models(4, 4, 4, 4), KEYED)).toBe('Still 4 files to print.')
    expect(profileFilesLine(models(1, 1, 1, 1), KEYED)).toBe('Still 1 file to print.')
  })

  it('puts a jump the keys made on the keys, never passing it off as free', () => {
    // The profile on the top only splits 4 models; the keys split every edge tile.
    expect(profileFilesLine(models(9, 9, 4, 1), KEYED)).toBe('The keys already make the edge tiles models of their own: still 9 files to print.')
    expect(profileFilesLine(models(9, 9, 4, 1), TABBED)).toBe('The tabs already make the edge tiles models of their own: still 9 files to print.')
  })

  it('stays plain when the keys split the very same tiles, since the keys line states the pair once', () => {
    expect(profileFilesLine(models(9, 9, 9, 1), KEYED)).toBe('Edge tiles become models of their own: 9 files to print.')
  })
})

describe('tileModels', () => {
  const keyed = design({ lock: 'keys' })
  const edged = withPerimeterProfile(design(), 'bullnose')

  it('costs no layout for a choice that is off', () => {
    expect(tileModels(DEFAULT_CONFIG)).toEqual(models(1, 1, 1, 1))
  })

  it('counts the models keys add on the default wall: the edge tiles lose their outer notches', () => {
    expect(tileModels(keyed)).toEqual(models(9, 9, 1, 1))
    // A tab is cut on the very same interior sides, so it splits the very same edge tiles off.
    expect(tileModels(design({ lock: 'tabs' }))).toEqual(models(9, 9, 1, 1))
    expect(tileModels(edged)).toEqual(models(9, 1, 9, 1))
    const both = withFixings(edged, { lock: 'keys' })
    expect(tileModels(both)).toEqual(models(9, 9, 9, 1))
  })

  it('agrees with the layout the studio draws', () => {
    const both = withFixings(edged, { lock: 'keys', mount: 'clips' })
    expect(tileModels(both).now).toBe(computeLayout(layoutInputOf(both)).pieces.length)
  })
})

describe('fixings and the plate', () => {
  it('needs the plate for keys, for tabs, for wall clips, or all of them', () => {
    expect(needsFixingPlate(DEFAULT_CONFIG)).toBe(false)
    expect(needsFixingPlate(design({ lock: 'keys' }))).toBe(true)
    // A socket is a recess in the same plate a key slot is, and needs it deeper still.
    expect(needsFixingPlate(design({ lock: 'tabs' }))).toBe(true)
    expect(needsFixingPlate(design({ mount: 'clips' }))).toBe(true)
  })

  it('names whichever asks for it on the disabled card', () => {
    expect(fixingPlateReason(DEFAULT_CONFIG)).toBeNull()
    expect(fixingPlateReason(design({ lock: 'keys' }))).toBe('Keys need 4 mm')
    expect(fixingPlateReason(design({ mount: 'clips' }))).toBe('Wall clips need 4 mm')
    expect(fixingPlateReason(design({ lock: 'keys', mount: 'clips' }))).toBe('Keys and wall clips need 4 mm')
    expect(fixingPlateReason(design({ lock: 'tabs' }))).toBe('Tabs need 4 mm')
    expect(fixingPlateReason(design({ lock: 'tabs', mount: 'clips' }))).toBe('Tabs and wall clips need 4 mm')
    expect(fixingLimitReason(design({ mount: 'clips' }))).toBe('the clip pockets need it')
    expect(fixingLimitReason(design({ lock: 'keys' }))).toBe('the key slots need it')
    expect(fixingLimitReason(design({ lock: 'tabs' }))).toBe('the sockets need it')
    expect(fixingLimitReason(design({ lock: 'tabs', mount: 'clips' }))).toBe('the sockets and clip pockets need it')
  })

  it('moves a Light plate to Standard in the same edit that turns keys or wall clips on', () => {
    const keyed = withFixings(light(), { lock: 'keys' })
    expect(keyed.lock).toBe('keys')
    expect(keyed.tile.thickness).toBe(MIN_FIXING_THICKNESS)
    const clipped = withFixings(light(), { mount: 'clips' })
    expect(clipped.mount).toBe('clips')
    expect(clipped.tile.thickness).toBe(MIN_FIXING_THICKNESS)
    // A bare Tabs choice raises it too: a 3 mm plate leaves no room under the joint edge for a socket.
    const tabbed = withFixings(light(), { lock: 'tabs' })
    expect(tabbed.lock).toBe('tabs')
    expect(tabbed.tile.thickness).toBe(MIN_FIXING_THICKNESS)
  })

  it('never touches a plate that already holds the pockets, nor one with nothing to hold', () => {
    const sturdy = design({ tile: { ...DEFAULT_CONFIG.tile, thickness: 6 } })
    expect(withFixings(sturdy, { lock: 'keys' }).tile.thickness).toBe(6)
    expect(withFixings(light(), { mount: 'glue' }).tile.thickness).toBe(3)
    expect(withFixings(light({ lock: 'keys' }), { lock: 'none' }).tile.thickness).toBe(3)
    // Only the patched fields and the plate move: everything else is the design as it was.
    const keyed = withFixings(light(), { lock: 'keys' })
    expect({ ...keyed, lock: 'none', tile: { ...keyed.tile, thickness: 3 } }).toEqual(light())
  })

  it('says where the plate went and why', () => {
    expect(plateRaisedNote(3, design({ lock: 'keys' }))).toBe(
      'Thickness moved from 3 mm to the Standard 4 mm plate: the key slots need it.',
    )
    expect(plateRaisedNote(3.4, design({ lock: 'keys', mount: 'clips' }))).toBe(
      'Thickness moved from 3.4 mm to the Standard 4 mm plate: the key slots and clip pockets need it.',
    )
    expect(plateRaisedNote(3, design({ lock: 'tabs' }))).toBe('Thickness moved from 3 mm to the Standard 4 mm plate: the sockets need it.')
  })
})

describe('the fit', () => {
  const parts = (keys: boolean, clips: boolean, tabs = false): FittedParts => ({ keys, clips, tabs })

  it('calls each fit class what the printed marks call it, so the picker cannot drift', () => {
    // The note under the picker is guide.ts's fitChosenText, which names the class from FIT_MARKS.
    for (const fit of FIT_ORDER) expect(FIT_NAMES[fit]).toBe(FIT_MARKS[fit].name)
  })

  it('names the control after the parts it sets, and the tabs after what the fit really shapes', () => {
    expect(fitLabel(parts(true, false))).toBe('Fit of the printed keys')
    expect(fitLabel(parts(false, true))).toBe('Fit of the printed clips')
    expect(fitLabel(parts(true, true))).toBe('Fit of the printed keys and clips')
    // Nothing is printed for a tab, so its row cannot be named after a printed part.
    expect(fitLabel(parts(false, false, true))).toBe('Fit of the tabs and their sockets')
    expect(fitLabel(parts(false, true, true))).toBe('Fit of the clips and the tabs')
  })

  it('reads the fitted parts off what the design really prints, not the fit test', () => {
    const printed = (config: DesignConfig) => fittedParts(accessoryParts(config, computeLayout(layoutInputOf(config))))
    expect(printed(design({ lock: 'keys', mount: 'clips' }))).toEqual(parts(true, true))
    expect(printed(design({ mount: 'clips' }))).toEqual(parts(false, true))
    // Keys on, but a 3 mm edge between tiles leaves no room for a key slot on the 4 mm base.
    expect(printed(design({ lock: 'keys', jointEdge: 'round', bevel: 3 }))).toEqual(parts(false, false))
    // Tiles too small for a clip pocket print no clip, and so no fit test either.
    expect(printed(design({ mount: 'clips', tile: { width: 32, height: 32, thickness: 4 } }))).toEqual(parts(false, false))
    expect(printed(DEFAULT_CONFIG)).toEqual(parts(false, false))
    // The fit test's own clips and keys are not the wall's.
    expect(fittedParts([{ kind: 'clip', group: 'fit-test' }, { kind: 'key', group: 'fit-test' }])).toEqual(parts(false, false))
    // A tab prints nothing at all, so it never reaches the parts list: the wall's own plan says it is there.
    expect(printed(design({ lock: 'tabs' }))).toEqual(parts(false, false))
    expect(fittedParts(accessoryParts(TABBED, computeLayout(layoutInputOf(TABBED))), true)).toEqual(parts(false, false, true))
  })
})

describe('plateRaisedFrom', () => {
  it('reads the move off the step the undo history holds, so redo brings the note back', () => {
    const before = light()
    const after = withFixings(before, { mount: 'clips' })
    expect(plateRaisedFrom(before, after)).toBe(3)
    expect(plateRaisedNote(3, after)).toBe('Thickness moved from 3 mm to the Standard 4 mm plate: the clip pockets need it.')
  })

  it('says nothing for a step that did not move the plate for the fixings', () => {
    const before = light()
    const after = withFixings(before, { mount: 'clips' })
    expect(plateRaisedFrom(undefined, after)).toBeNull()
    // Undone: the design is back on the Light plate with no fixings.
    expect(plateRaisedFrom(after, before)).toBeNull()
    // The next edit retires it.
    expect(plateRaisedFrom(after, { ...after, color: '#112233' })).toBeNull()
    // A plate already thick enough never moved.
    const standard = design()
    expect(plateRaisedFrom(standard, withFixings(standard, { lock: 'keys' }))).toBeNull()
    // A thicker base picked by hand with the fixings already on is not the fixings' doing.
    const thin = light({ lock: 'keys' })
    expect(plateRaisedFrom(thin, { ...thin, tile: { ...thin.tile, thickness: 4 } })).toBeNull()
  })

  it('says nothing for a design opened in place of another', () => {
    const before = light()
    const opened = { ...withFixings(before, { lock: 'keys' }), name: 'Bathroom' }
    expect(plateRaisedFrom(before, opened)).toBeNull()
  })
})

describe('floorTenth', () => {
  it('floors to 0.1 mm, reading a hair under a tenth as that tenth', () => {
    expect(floorTenth(6.6 - 1.2 - 0.5)).toBe(4.9)
    expect(floorTenth(2.3)).toBe(2.3)
    expect(floorTenth(2.38)).toBe(2.3)
    expect(floorTenth(0)).toBe(0)
  })
})

describe('copy', () => {
  it('carries no em-dash', () => {
    const texts = [
      ...PERIMETER_ORDER.map((profile) => PERIMETER_COPY[profile].line),
      fitLabel({ keys: true, clips: true, tabs: false }),
      fitLabel({ keys: false, clips: false, tabs: true }),
      plateRaisedNote(3, design({ lock: 'keys', mount: 'clips' })),
      plateRaisedNote(3, design({ lock: 'tabs' })),
      fixingPlateReason(design({ lock: 'keys', mount: 'clips' })) ?? '',
      fixingPlateReason(design({ lock: 'tabs' })) ?? '',
    ]
    for (const text of texts) expect(text).not.toContain(String.fromCharCode(0x2014))
  })
})
