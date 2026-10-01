import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { accessoryParts } from '@/core/fixing/accessories'
import { fitChosenText } from '@/core/fixing/guide'
import { clipSites } from '@/core/fixing/mount'
import { computeLayout, layoutInputOf } from '@/core/layout'
import type { DesignConfig } from '@/core/types'
import { tileModels, withFixings } from './edges'
import { explainMounting, JOIN_CARDS, mountingNow, pieceName, WALL_CARDS } from './mountingCopy'

// Step 7's well says what the plans place, in the design's own numbers: it is checked against those plans.
// What to print, buy and do is the download page's guide, tested with it in core/fixing/guide.test.ts.

const design = (over: Partial<DesignConfig> = {}): DesignConfig => normalizeConfig({ ...DEFAULT_CONFIG, ...over })
const light = (over: Partial<DesignConfig> = {}) => design({ ...over, tile: { ...DEFAULT_CONFIG.tile, thickness: 3 } })

const explain = (config: DesignConfig, raisedFrom: number | null = null) => {
  const plan = computeLayout(layoutInputOf(config))
  return { plan, explained: explainMounting(config, plan, accessoryParts(config, plan), tileModels(config), raisedFrom) }
}

const allText = (config: DesignConfig) => {
  const { explained: e } = explain(config)
  return [e.now, e.back?.caption ?? '', e.back?.peek ?? '', e.warning ?? '', e.fit?.label ?? '', e.fit?.note ?? '', e.spoken]
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
      'Your keys and clips are made at Standard, the fit marked 2 (clearance per side: keys 0.1 mm and clips 0.2 mm). ' +
        'A new fit remakes only those parts, never the tiles.',
    )
    expect(explain(KEYS).explained.fit?.note).toBe(fitChosenText(KEYS, 'keys'))
    expect(explain(CLIPS).explained.fit?.note).toBe(fitChosenText(CLIPS, 'clips'))
  })

  it('offers the fit for a tabbed wall, which prints nothing, and says a new one remakes the tiles', () => {
    const fit = explain(TABS).explained.fit
    expect(fit).toEqual({ parts: { keys: false, clips: false, tabs: true }, label: 'Fit of the tabs and their sockets', note: fitChosenText(TABS, 'tabs') })
    expect(fit?.note).toBe(
      'Your tiles are made at Standard, the fit marked 2 (clearance per side: sockets 0.3 mm). ' +
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

  it('promises a clip count per tile only while every whole tile carries that many', () => {
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
    // Every piece of the default clipped wall carries two, so the number is said.
    expect(explain(CLIPS).explained.spoken).toContain(', 2 in each whole tile.')
  })

  it('flags nothing on a wall that places what it asks for', () => {
    for (const config of [DEFAULT_CONFIG, KEYS, CLIPS, BOTH, TABS, CLIP_TABS]) expect(explain(config).explained.warning).toBeNull()
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
