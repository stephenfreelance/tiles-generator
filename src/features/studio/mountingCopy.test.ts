import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { accessoryParts } from '@/core/fixing/accessories'
import { fitChosenText, mountingGuide, mountingSummary } from '@/core/fixing/guide'
import { joinPlan } from '@/core/fixing/joins'
import { clipSites, mountPlan } from '@/core/fixing/mount'
import { tabPlan } from '@/core/fixing/tabs'
import { computeLayout, layoutInputOf } from '@/core/layout'
import type { DesignConfig } from '@/core/types'
import { tileModels, withFixings } from './edges'
import { explainMounting, JOIN_CARDS, mountingNow, pieceName, WALL_CARDS } from './mountingCopy'

// Step 7's well says what the plans place, in the design's own numbers: it is checked against those plans.

const design = (over: Partial<DesignConfig> = {}): DesignConfig => normalizeConfig({ ...DEFAULT_CONFIG, ...over })
const light = (over: Partial<DesignConfig> = {}) => design({ ...over, tile: { ...DEFAULT_CONFIG.tile, thickness: 3 } })

const explain = (config: DesignConfig, raisedFrom: number | null = null) => {
  const plan = computeLayout(layoutInputOf(config))
  return { plan, explained: explainMounting(config, plan, accessoryParts(config, plan), tileModels(config), raisedFrom) }
}

const allText = (config: DesignConfig) => {
  const { explained: e } = explain(config)
  return [e.now, e.back?.caption ?? '', e.back?.peek ?? '', ...e.print, ...e.need, ...e.steps, ...e.know, e.warning ?? '', e.fit?.label ?? '', e.fit?.note ?? '', e.spoken]
}

const CLIPS = design({ mount: 'clips' })
const KEYS = design({ lock: 'keys' })
const BOTH = design({ mount: 'clips', lock: 'keys' })
const TABS = design({ lock: 'tabs' })
const CLIP_TABS = design({ mount: 'clips', lock: 'tabs' })

describe('the cards', () => {
  it('asks two questions, glue and side by side first, each card with a note and the wall cards with a figure', () => {
    expect(WALL_CARDS.map((card) => card.value)).toEqual(['glue', 'clips'])
    expect(WALL_CARDS.map((card) => card.name)).toEqual(['Glue or tape', 'Wall clips'])
    expect(WALL_CARDS.map((card) => card.figure)).toEqual(['Adhesive behind', 'Only tape behind'])
    expect(JOIN_CARDS.map((card) => card.name)).toEqual(['Side by side', 'Keys', 'Tabs'])
    for (const card of [...WALL_CARDS, ...JOIN_CARDS]) expect(card.note).toMatch(/\.$/)
    expect(JOIN_CARDS.every((card) => card.figure === undefined)).toBe(true)
  })
})

describe('the heading', () => {
  it('names only what the plans place', () => {
    expect(mountingNow('glue')).toBe('Glued')
    expect(mountingNow('keys')).toBe('Glued · with keys')
    expect(mountingNow('clips')).toBe('On clips')
    expect(mountingNow('both')).toBe('On clips · with keys')
    expect(mountingNow('tabs')).toBe('Glued · with tabs')
    expect(mountingNow('clips-tabs')).toBe('On clips · with tabs')
    expect(explain(DEFAULT_CONFIG).explained.now).toBe('Glued')
    expect(explain(KEYS).explained.now).toBe('Glued · with keys')
    expect(explain(CLIPS).explained.now).toBe('On clips')
    expect(explain(BOTH).explained.now).toBe('On clips · with keys')
    expect(explain(TABS).explained.now).toBe('Glued · with tabs')
    expect(explain(CLIP_TABS).explained.now).toBe('On clips · with tabs')
  })

  it('reads glued when clips or keys are chosen but none is placed, and flags why above the well', () => {
    const tiny = design({ mount: 'clips', tile: { width: 32, height: 32, thickness: 4 } })
    const { explained: small } = explain(tiny)
    expect(small.now).toBe('Glued')
    expect(small.warning).toBe('No tile of this wall takes a wall clip, so it goes up with glue or tape. The notes under the tiling plan say why.')
    // The flag is its own strip, so it never costs the trade-offs one of their slots.
    expect(small.know.join(' ')).not.toContain('No tile of this wall')
    expect(small.spoken).toBe('Glued: nothing to print but your tiles. No tile of this wall takes a wall clip.')
    // A 3 mm edge between tiles leaves no room for a key slot on the 4 mm base.
    const { explained: deep } = explain(design({ lock: 'keys', jointEdge: 'round', bevel: 3 }))
    expect(deep.now).toBe('Glued')
    expect(deep.warning).toMatch(/^No joint of this wall takes a key, so none is printed\./)
    expect(deep.fit).toBeNull()
    // A joint too wide to hide a tab leaves the tabs out, and nothing is cut rather than nothing printed.
    const wide = explain(design({ lock: 'tabs', joint: 3 })).explained
    expect(wide.now).toBe('Glued')
    expect(wide.warning).toBe('No joint of this wall takes a tab, so none is cut. The notes under the tiling plan say why.')
    expect(wide.spoken).toBe('Glued: nothing to print but your tiles. No joint of this wall takes a tab.')
    expect(wide.fit).toBeNull()
  })
})

describe('on your tiles', () => {
  it('draws tile A with nothing cut into it for the default wall, and offers no turn to a flat back', () => {
    const { explained } = explain(DEFAULT_CONFIG)
    expect(explained.back?.piece.id).toBe('full')
    expect(explained.back?.caption).toBe('Nothing is cut into tile A: its back stays flat.')
    expect(explained.back?.peek).toBeNull()
  })

  it('counts the slots and pockets of tile A, with their depth, seen from the back', () => {
    const keys = explain(KEYS).explained.back!
    expect([keys.keySlots, keys.clipPockets]).toEqual([8, 0])
    expect(keys.caption).toBe(
      'Tile A, seen from the back: 8 key slots along its sides, 1.8 mm deep. The circle shows a key in its slot, reaching across the joint into the next tile. The front does not change.',
    )
    const clips = explain(CLIPS).explained.back!
    expect([clips.keySlots, clips.clipPockets]).toEqual([0, 2])
    expect(clips.caption).toMatch(/^Tile A, seen from the back: 2 clip pockets, 2\.8 mm deep\. The circle shows a clip clicked into its pocket/)
    const both = explain(BOTH).explained.back!
    expect(both.caption).toMatch(/^Tile A, seen from the back: 8 key slots along its sides, 1\.8 mm deep, and 2 clip pockets, 2\.8 mm deep\./)
    expect(both.peek).toBe('See the back of tile A')
  })

  it('counts the sockets cut into tile A and the tabs standing past it, each in its own terms', () => {
    const back = explain(TABS).explained.back!
    expect([back.sockets, back.tabs]).toEqual([2, 2])
    expect(back.caption).toBe(
      'Tile A, seen from the back: 2 sockets in its left side, 1.8 mm deep, and 2 tabs standing out past its right ' +
        'side, 1.4 mm thick. The circle shows the tab of the tile beside it, standing in one socket. The front does not change.',
    )
    // The back is worth turning to: a tabbed tile is not flat, whatever backHasPockets used to say.
    expect(back.peek).toBe('See the back of tile A')
    const both = explain(CLIP_TABS).explained.back!
    expect(both.caption).toMatch(/2 sockets in its left side, 1\.8 mm deep, 2 tabs standing out past its right side, 1\.4 mm thick, and 2 clip pockets/)
    expect(both.caption).toContain('The circle shows a clip clicked into its pocket')
  })

  it('calls a cut piece a piece', () => {
    expect(pieceName({ kind: 'full', mark: 'A' })).toBe('tile A')
    expect(pieceName({ kind: 'edge', mark: 'C' })).toBe('piece C')
    expect(pieceName({ kind: 'corner', mark: 'D' })).toBe('piece D')
  })
})

describe('you will print', () => {
  it('prints only the tiles for a glued wall', () => {
    expect(explain(DEFAULT_CONFIG).explained.print).toEqual(['Only your 32 tiles, from 1 file.'])
    expect(explain(design({ surface: { width: 1000, height: 700 } })).explained.print).toEqual(['Only your 24 tiles and 11 cut pieces, from 4 files.'])
  })

  it('counts the clips from the mount plan and the file, spares apart, and the fit test', () => {
    const { plan, explained } = explain(CLIPS)
    const mount = mountPlan(CLIPS, plan)
    const clip = accessoryParts(CLIPS, plan).find((part) => part.kind === 'clip' && part.group === 'mount')!
    expect(mount.clips).toBe(64)
    expect(explained.print).toEqual([
      'Your 32 tiles, from 1 file.',
      `${clip.count} wall clips (C1), from one file: 64 to fit and ${clip.count - 64} spares.`,
      'A fit test of 4 small pieces (F1 to F4), to print first.',
    ])
  })

  it('says why the keys make more tile files, and counts the keys', () => {
    const { plan, explained } = explain(KEYS)
    const keys = joinPlan(KEYS, plan).keys
    expect(keys).toBe(104)
    expect(explained.print[0]).toBe(
      'Your 32 tiles, from 9 files, not 1: a tile on the edge of the wall has no slot on its outer side, so the edge tiles are files of their own.',
    )
    expect(explained.print[1]).toBe('110 keys (K1), from one file: 104 to fit and 6 spares.')
    expect(explained.print.at(-1)).toMatch(/^A fit test of \d+ small pieces \(F1 to F\d\), to print first\.$/)
  })

  it('says the tabs add no file at all, and why the edge tiles are files of their own', () => {
    const { plan, explained } = explain(TABS)
    expect(tabPlan(TABS, plan).tabs).toBeGreaterThan(0)
    expect(explained.print).toEqual([
      'Your 32 tiles, from 9 files, not 1: a tile with no tile beside it has no tab or socket on that side, so the edge tiles are files of their own.',
      'Nothing for the tabs: each one is part of its own tile.',
      'A fit test of 4 small pieces (F1 to F4), to print first.',
    ])
    // With clips the clips are still counted, and the tabs still cost nothing.
    const clipped = explain(CLIP_TABS).explained.print
    expect(clipped[1]).toBe('Nothing for the tabs: each one is part of its own tile.')
    expect(clipped[2]).toMatch(/^\d+ wall clips \(C1\)/)
  })

  it('lists clips before keys when both are placed', () => {
    const lines = explain(BOTH).explained.print
    expect(lines[1]).toMatch(/wall clips \(C1\)/)
    expect(lines[2]).toMatch(/keys \(K1\)/)
  })
})

describe('you will need, do and know', () => {
  it('names purchased things generically, the screws only as an option', () => {
    expect(explain(DEFAULT_CONFIG).explained.need).toEqual(['Tile adhesive or double-sided mounting tape.'])
    expect(explain(KEYS).explained.need).toEqual(['Tile adhesive or double-sided mounting tape.', 'A flat table as big as the panel you key.'])
    const clips = explain(CLIPS).explained.need
    expect(clips[0]).toContain('not foam')
    expect(clips.at(-1)).toBe('Optional, to screw the clips on for good: 64 wall plugs (5 mm) and 64 countersunk screws (3.5 mm).')
    expect(clips.some((line) => line.includes('no clip'))).toBe(false)
    // Pieces with no clip are glued thin: the glue joins the list.
    const strip = design({ mount: 'clips', surface: { width: 1200, height: 612 } })
    expect(explain(strip).explained.need).toContain('A thin glue for the 8 pieces marked B, which have no clip.')
  })

  it('counts the pieces to glue as tiles on the wall, not as the files they print from, and names their marks', () => {
    // 930 × 620 mm: two piece files with no clip (C and D), seven tiles on the wall between them.
    const wall = design({ mount: 'clips', surface: { width: 930, height: 620 } })
    const { plan, explained } = explain(wall)
    const off = mountPlan(wall, plan).unmountedPieceIds
    const tiles = plan.placements.filter((placement) => off.includes(placement.pieceId)).length
    expect([off.length, tiles]).toEqual([2, 7])
    expect(explained.need).toContain('A thin glue for the 7 pieces marked C and D, which have no clip.')
    // One piece file placed once reads as one piece.
    const single = design({ mount: 'clips', surface: { width: 312, height: 150 } })
    const one = mountPlan(single, computeLayout(layoutInputOf(single))).unmountedPieceIds
    expect(one).toHaveLength(1)
    expect(explain(single).explained.need).toContain('A thin glue for the piece marked B, which has no clip.')
  })

  it("takes You'll do word for word from the guide", () => {
    for (const config of [DEFAULT_CONFIG, KEYS, CLIPS, BOTH, TABS, CLIP_TABS]) {
      const plan = computeLayout(layoutInputOf(config))
      const input = { config, plan, mount: mountPlan(config, plan), join: joinPlan(config, plan), tab: tabPlan(config, plan), accessories: accessoryParts(config, plan) }
      expect(explain(config).explained.steps).toEqual(mountingSummary(input))
      expect(explain(config).explained.steps.length).toBeLessThanOrEqual(3)
    }
  })

  it('gives two or three trade-offs in the design numbers, and nothing to flag', () => {
    for (const config of [DEFAULT_CONFIG, KEYS, CLIPS, BOTH, TABS, CLIP_TABS]) {
      const know = explain(config).explained.know
      expect(know.length).toBeGreaterThanOrEqual(2)
      expect(know.length).toBeLessThanOrEqual(3)
      expect(explain(config).explained.warning).toBeNull()
    }
    expect(explain(CLIPS).explained.know[0]).toBe(
      'Any tile comes off on its own: pull it straight off, and its 2 clips stay on the wall for when it goes back.',
    )
    expect(explain(CLIPS).explained.know).toContain(
      'The tiles sit on the wall with only the tape behind them, so the wall must be flat: fill any hollow first.',
    )
    expect(explain(KEYS).explained.know[1]).toBe(
      'You press the keys in with the tiles face down on a flat table as big as the panel: this wall is 1,200 × 600 mm. A big wall goes up in panels you can lift.',
    )
    // Keys lock in the plane of the wall; what holds them to it is named.
    expect(explain(KEYS).explained.know[0]).toMatch(/in the plane of the wall.*The adhesive holds them to the wall\.$/)
    expect(explain(BOTH).explained.know[0]).toMatch(/The clips hold them to the wall\.$/)
    // The tabs make the keys' promise, in the keys' own words, and say what they do not do.
    expect(explain(TABS).explained.know).toEqual([
      'Tabs lock each tile to the one beside it edge to edge, in the plane of the wall: joints stay even and rows stay straight. The adhesive holds them to the wall.',
      'Nothing locks one row to the next, so each row is its own strip, and the tiles go up one at a time along each row: a tab wall is never laid out face down on a table and lifted on.',
      'A tile brought to the wrong joint stands proud instead of lying down, so it cannot go on in the wrong place.',
    ])
    // On clips the clips hold them, and the clips keep their own two lines, with the order a tabbed row comes
    // apart in: a tile's own tab cannot rise past the ceiling of the socket it stands in.
    expect(explain(CLIP_TABS).explained.know[0]).toMatch(/^Tabs lock each tile .* The clips hold them to the wall\.$/)
    expect(explain(CLIP_TABS).explained.know[1]).toMatch(/^A tile comes off once the tile to its right is off, so take a row off from that end/)
    expect(explain(CLIP_TABS).explained.know.join(' ')).not.toMatch(/Any tile comes off on its own/)
  })

  it('names the pieces with no clip, and whether their keys keep them in line', () => {
    // A 12 mm bottom row is too low for a clip pocket.
    const strip = design({ mount: 'clips', surface: { width: 1200, height: 612 } })
    const { plan, explained } = explain(strip)
    const off = mountPlan(strip, plan).unmountedPieceIds
    expect(off.length).toBeGreaterThan(0)
    const marks = plan.pieces.filter((piece) => off.includes(piece.id)).map((piece) => piece.mark)
    expect(explained.know.join(' ')).toContain(`${marks.length === 1 ? `Piece ${marks[0]} has` : 'Pieces'}`)
    expect(explained.know.find((line) => line.includes('no room for a clip'))).toMatch(/glue (it|them) to the wall\.$/)
    const keyed = explain(design({ mount: 'clips', lock: 'keys', surface: { width: 1200, height: 612 } })).explained
    expect(keyed.know.find((line) => line.includes('no room for a clip'))).toMatch(/keys hold (it|them) in line with the tiles around, and a drop of glue/)
  })

  it('sends a piece with no clip to the same fix as the guide does, keyed ones apart from the rest', () => {
    // 930 × 620 mm with keys: F and H are keyed to their neighbours, I is keyed to nothing.
    const mixed = design({ mount: 'clips', lock: 'keys', surface: { width: 930, height: 620 } })
    const { plan, explained } = explain(mixed)
    const mount = mountPlan(mixed, plan)
    const join = joinPlan(mixed, plan)
    const marksOf = (ids: readonly string[]) => plan.pieces.filter((piece) => ids.includes(piece.id)).map((piece) => piece.mark)
    const keyed = marksOf(mount.unmountedPieceIds.filter((id) => !join.unkeyedPieceIds.includes(id)))
    const glued = marksOf(mount.unmountedPieceIds.filter((id) => join.unkeyedPieceIds.includes(id)))
    expect([keyed, glued]).toEqual([['F', 'H'], ['I']])
    expect(explained.know.find((line) => line.includes('no room for a clip'))).toBe(
      'Pieces F, H and I have no room for a clip: put a drop of glue in the key slots of F and H, whose keys hold them in line with the tiles around, and glue I to the wall.',
    )
    // The download guide splits the very same pieces the very same way.
    const steps = mountingGuide({ config: mixed, plan, mount, join, tab: tabPlan(mixed, plan), accessories: accessoryParts(mixed, plan) }).steps
    const body = steps.find((step) => step.key === 'no-clip')!.body
    expect(body[0]).toContain('Pieces F and H have no room for a clip, but their keys hold them')
    expect(body[1]).toContain('Piece I has no room for a clip: glue it to the wall')
  })

  it('promises a clip count per tile only while every tile it speaks of carries that many', () => {
    // 60 mm tiles inside a 30 mm raised frame: tile A takes two clips, the tiles under the frame one or none.
    const frame = design({
      mount: 'clips',
      tile: { width: 60, height: 60, thickness: 4 },
      surface: { width: 600, height: 300 },
      perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'frame', width: 30, drop: 1, land: 'valleys' },
    })
    const { plan, explained } = explain(frame)
    const counts = plan.pieces.filter((piece) => piece.kind === 'full').map((piece) => clipSites(frame, piece).length)
    expect(new Set(counts)).toEqual(new Set([2, 1, 0]))
    expect(explained.spoken).toBe('On clips: 70 wall clips to fit, up to 2 in a whole tile.')
    expect(explained.know[0]).toBe(
      'Any tile with clips comes off on its own: pull it straight off, and its clips stay on the wall for when it goes back.',
    )
    // Every piece of the default clipped wall carries two, so the number is said and every tile comes off.
    expect(explain(CLIPS).explained.spoken).toContain(', 2 in each whole tile.')
    expect(explain(CLIPS).explained.know[0]).toMatch(/^Any tile comes off on its own/)
  })
})

describe('the fit and the plate', () => {
  it('offers the fit only while fitted parts print, named after them', () => {
    expect(explain(DEFAULT_CONFIG).explained.fit).toBeNull()
    expect(explain(KEYS).explained.fit).toMatchObject({ label: 'Fit of the printed keys' })
    expect(explain(CLIPS).explained.fit).toMatchObject({ label: 'Fit of the printed clips' })
    // The note is the guide's own sentence, so the studio, the download's step 1 and the fit-test page agree.
    expect(explain(BOTH).explained.fit).toEqual({
      parts: { keys: true, clips: true, tabs: false },
      label: 'Fit of the printed keys and clips',
      note: fitChosenText(BOTH, 'both'),
    })
    expect(explain(BOTH).explained.fit?.note).toBe(
      'Your keys and clips are made at Standard, the fit with two notches (clearance per side: keys 0.1 mm and clips 0.2 mm). ' +
        'A new fit remakes only those parts, never the tiles.',
    )
    expect(explain(KEYS).explained.fit?.note).toBe(fitChosenText(KEYS, 'keys'))
    expect(explain(CLIPS).explained.fit?.note).toBe(fitChosenText(CLIPS, 'clips'))
  })

  it('offers the fit for a tabbed wall, which prints nothing, and says a new one remakes the tiles', () => {
    const fit = explain(TABS).explained.fit
    expect(fit).toEqual({ parts: { keys: false, clips: false, tabs: true }, label: 'Fit of the tabs and their sockets', note: fitChosenText(TABS, 'tabs') })
    expect(fit?.note).toBe(
      'Your tiles are made at Standard, the fit with two notches (clearance per side: sockets 0.3 mm). ' +
        'The socket is cut into the tile itself, so a new fit remakes every tile.',
    )
    const both = explain(CLIP_TABS).explained.fit
    expect(both?.label).toBe('Fit of the clips and the tabs')
    expect(both?.note).toContain('A new fit remakes the clips and, because the socket is cut into the tile itself, every tile.')
    // Tabs that place nothing carry no fit: the row only appears once the wall really cuts them.
    expect(explain(design({ lock: 'tabs', joint: 3 })).explained.fit).toBeNull()
  })

  it('says the plate moved when the undo history says it did, and speaks it', () => {
    const raised = withFixings(light(), { mount: 'clips' })
    const { explained } = explain(raised, 3)
    expect(explained.alsoChanged).toBe('Thickness moved from 3 mm to the Standard 4 mm plate: the clip pockets need it.')
    expect(explained.spoken).toBe(
      'On clips: 64 wall clips to fit, 2 in each whole tile. Thickness moved from 3 mm to the Standard 4 mm plate: the clip pockets need it.',
    )
    expect(explain(raised).explained.alsoChanged).toBeNull()
  })
})

describe('spoken', () => {
  it('sums up each system in one sentence', () => {
    expect(explain(DEFAULT_CONFIG).explained.spoken).toBe('Glued: nothing to print but your tiles.')
    expect(explain(KEYS).explained.spoken).toBe('Glued, with keys: 104 keys to fit, and your tiles come from 9 files.')
    expect(explain(CLIPS).explained.spoken).toBe('On clips: 64 wall clips to fit, 2 in each whole tile.')
    expect(explain(BOTH).explained.spoken).toBe('On clips, with keys: 64 wall clips and 104 keys to fit, and your tiles come from 9 files.')
    expect(explain(TABS).explained.spoken).toBe('Glued, with tabs: nothing extra to print, and your tiles come from 9 files.')
    expect(explain(CLIP_TABS).explained.spoken).toBe('On clips, with tabs: 64 wall clips to fit, 2 in each whole tile, and your tiles come from 9 files.')
  })
})

describe('copy rules', () => {
  it('writes no em-dash, no flush, no flat panel, no rails and no figures of strength or time', () => {
    const configs = [
      DEFAULT_CONFIG,
      KEYS,
      CLIPS,
      BOTH,
      design({ mount: 'clips', lock: 'keys', surface: { width: 1200, height: 612 } }),
      design({ mount: 'clips', tile: { width: 32, height: 32, thickness: 4 } }),
      TABS,
      CLIP_TABS,
      design({ lock: 'tabs', joint: 3 }),
      design({ lock: 'tabs', surface: { width: 1205, height: 600 } }),
    ]
    const cards = [...WALL_CARDS, ...JOIN_CARDS].flatMap((card) => [card.name, card.figure ?? '', card.note])
    for (const text of [...cards, ...configs.flatMap(allText)]) {
      expect(text).not.toContain(String.fromCharCode(0x2014))
      expect(text).not.toMatch(/\bflush\b|flat panel|\brails?\b|\bsnaps?\b|\bgauges?\b|no gap/i)
      expect(text).not.toMatch(/\d+\s*(kg|N|newton|lb|minutes?|hours?|seconds?|days?)\b/i)
    }
  })

  // A tab is rigid: it has no detent and nothing to click into. Only the clip ever clicks, and a tabbed
  // wall with clips says so of the clip alone, never of the tab.
  it('never lets a tab click or snap, on a glued wall or a clipped one', () => {
    const tabCard = JOIN_CARDS.find((card) => card.value === 'tabs')!
    for (const text of [tabCard.name, tabCard.note, ...allText(TABS)]) {
      expect(text).not.toMatch(/\bclicks?\b|\bclicked\b|\bsnaps?\b|\bsnapped\b/i)
    }
    for (const line of allText(CLIP_TABS)) {
      // With clips in the same wall, only a line about the clip may say it.
      if (/\bclicks?\b|\bclicked\b/i.test(line)) expect(line).toMatch(/\bclip/i)
      expect(line).not.toMatch(/\bsnaps?\b|\bsnapped\b/i)
    }
  })
})
