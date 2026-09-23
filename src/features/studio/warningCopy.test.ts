import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { computeLayout, layoutInputOf } from '@/core/layout'
import { accessoryParts } from '@/core/fixing/accessories'
import { mountingGuide } from '@/core/fixing/guide'
import { joinPlan } from '@/core/fixing/joins'
import { mountPlan } from '@/core/fixing/mount'
import { tabPlan } from '@/core/fixing/tabs'
import { fixingWarnings } from '@/core/fixing/warnings'
import type { DesignConfig, FitWarning, LayoutPlan } from '@/core/types'
import { plainWarning } from './warningCopy'

// The fixings' notes in the maker's words, rebuilt from the design rather than parsed from the checker.

const note = (code: FitWarning['code'], message = 'The checker said so.'): FitWarning => ({ code, message })
const design = (over: Partial<DesignConfig>): DesignConfig => normalizeConfig({ ...DEFAULT_CONFIG, ...over })
const planOf = (config: DesignConfig): LayoutPlan => computeLayout(layoutInputOf(config))
const say = (code: FitWarning['code'], config: DesignConfig, message?: string) => plainWarning(note(code, message), config, planOf(config))

describe('plainWarning for the fixings', () => {
  it('names the pieces keyed to nothing, from the plan itself', () => {
    const thin = design({ lock: 'keys', surface: { width: 910, height: 600 } })
    const strips = planOf(thin).pieces.filter((p) => p.width === 10).map((p) => p.mark)
    expect(say('no-key', thin)).toBe(`Pieces ${strips.slice(0, -1).join(', ')} and ${strips.at(-1)} have no joint long enough for a key, so glue them to the tiles beside them.`)
    // A whole tile beside a sliver is left unkeyed with it.
    const pair = design({ lock: 'keys', surface: { width: 160, height: 150 } })
    expect(say('no-key', pair)).toBe('Pieces A and B have no joint long enough for a key, so glue them to the tiles beside them.')
    const one = design({ lock: 'keys', surface: { width: 310, height: 150 } })
    expect(say('no-key', one)).toMatch(/^Piece [A-Z] has no joint long enough for a key, so glue it to the tiles beside it\.$/)
    // Nothing unkeyed to count: the checker's own words stand.
    expect(say('no-key', design({ lock: 'keys' }), 'Fallback.')).toBe('Fallback.')
  })

  it('raises no key note when every piece is still keyed to a neighbour', () => {
    // A 12 mm bottom row: too low for keys between its strips, deep enough for one into the row above.
    const strip = design({ lock: 'keys', surface: { width: 1200, height: 612 } })
    expect(fixingWarnings(strip, planOf(strip)).some((w) => w.code === 'no-key')).toBe(false)
    expect(say('no-key', strip, 'Fallback.')).toBe('Fallback.')
  })

  it('names the pieces with no room for a wall clip, and whether their keys hold them instead', () => {
    // A 12 mm bottom row: every strip of it is too narrow for a clip. One piece file, eight tiles on the wall.
    const glued = design({ mount: 'clips', surface: { width: 1200, height: 612 } })
    const noted = (config: DesignConfig) => fixingWarnings(config, planOf(config)).find((w) => w.code === 'no-mount')!
    const strips = planOf(glued).pieces.filter((p) => mountPlan(glued, planOf(glued)).unmountedPieceIds.includes(p.id))
    expect(strips.length).toBe(1)
    expect(plainWarning(noted(glued), glued, planOf(glued))).toBe('Piece B (8 on the wall) is too narrow for a wall clip: glue it to the wall.')
    const keyed = design({ mount: 'clips', lock: 'keys', surface: { width: 1200, height: 612 } })
    expect(plainWarning(noted(keyed), keyed, planOf(keyed))).toMatch(
      /too narrow for a wall clip: (its|their) keys hold (it|them) in line with the tiles around, and a drop of glue in (its|their) key slots keeps (it|them) on the wall\.$/,
    )
  })

  it('splits the pieces with no clip the way the guide does, keyed ones apart from the glued', () => {
    // 930 × 620 mm with keys: F and H are keyed to their neighbours, I is keyed to nothing.
    const mixed = design({ mount: 'clips', lock: 'keys', surface: { width: 930, height: 620 } })
    const plan = planOf(mixed)
    const warning = fixingWarnings(mixed, plan).find((w) => w.code === 'no-mount')!
    expect(plainWarning(warning, mixed, plan)).toBe(
      'Pieces F, H and I (7 on the wall) are too small or too narrow for a wall clip: put a drop of glue in the key slots of F and H, whose keys hold them in line with the tiles around, and glue I to the wall.',
    )
    // The very same split as guide.ts's own step, which the download page and the README show.
    const steps = mountingGuide({ config: mixed, plan, mount: mountPlan(mixed, plan), join: joinPlan(mixed, plan), tab: tabPlan(mixed, plan), accessories: accessoryParts(mixed, plan) }).steps
    const body = steps.find((step) => step.key === 'no-clip')!.body
    expect(body[0]).toContain('Pieces F and H have no room for a clip, but their keys hold them')
    expect(body[1]).toContain('Piece I has no room for a clip: glue it to the wall')
  })

  it('names the key slots as the cause when the tile is big enough but its slots take the room', () => {
    // 56 mm tiles with keys: no piece of the wall has room left for a pocket; without keys, 136 clips fit.
    const all = design({
      mount: 'clips',
      lock: 'keys',
      tile: { width: 56, height: 56, thickness: 4 },
      surface: { width: 600, height: 400 },
      perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'margin' },
    })
    expect(mountPlan(all, planOf(all)).clips).toBe(0)
    expect(plainWarning(fixingWarnings(all, planOf(all)).find((w) => w.code === 'no-mount')!, all, planOf(all))).toBe(
      'Tiles of 56 × 56 mm have no room for a wall clip beside their key slots, so this wall goes up with glue or tape. Leave the keys out for clips, or use bigger tiles.',
    )
    // The same cause, piece by piece, on a wall where only some pieces lose their clip to the slots.
    const some = design({ mount: 'clips', lock: 'keys', tile: { width: 60, height: 60, thickness: 4 }, surface: { width: 600, height: 400 } })
    const note = fixingWarnings(some, planOf(some)).find((w) => w.code === 'no-mount')!
    expect(plainWarning(note, some, planOf(some))).toMatch(
      /^Pieces [A-Z, and]+ \(\d+ on the wall\) have no room for a wall clip beside their key slots: their keys hold them in line/,
    )
  })

  it('says the tiles are too small when no piece of the wall takes a clip', () => {
    const tiny = design({ mount: 'clips', tile: { width: 32, height: 32, thickness: 4 }, surface: { width: 320, height: 320 } })
    const warning = fixingWarnings(tiny, planOf(tiny)).find((w) => w.code === 'no-mount')!
    expect(warning.pieceId).toBeUndefined()
    expect(plainWarning(warning, tiny, planOf(tiny))).toBe(
      'Tiles of 32 × 32 mm are too small for a wall clip, so this wall goes up with glue or tape. Use bigger tiles for clips.',
    )
  })

  it('names the pieces no tab locks, in the piece own terms, and what to do about them', () => {
    // A 1205 mm wall ends in a 5 mm cut: too narrow for a socket, so nothing locks it or its neighbour.
    const cut = design({ lock: 'tabs', surface: { width: 1205, height: 600 } })
    expect(tabPlan(cut, planOf(cut)).unlockedPieceIds.length).toBeGreaterThan(0)
    expect(say('no-lock', cut)).toBe(
      'Pieces J, K and L (4 on the wall) are too narrow for a socket, so no tab locks them: glue them to the tiles beside them.',
    )
    // On clips the very same pieces have no clip either, and 'no-mount' already glues them to the wall:
    // the checker leaves them out of this note rather than sending one piece two ways.
    const clipped = design({ lock: 'tabs', mount: 'clips', surface: { width: 1205, height: 600 } })
    expect(fixingWarnings(clipped, planOf(clipped)).some((w) => w.code === 'no-lock')).toBe(false)
  })

  it('says why a wall locks nothing at all: the joint, the width, or having no joint', () => {
    // A tab sits under the rim of the joint edge, so a wider joint would show it in the gap.
    expect(say('no-lock', design({ lock: 'tabs', joint: 3 }))).toBe(
      'A tab crosses the joint between tiles and a gap wider than 2 mm would show it, so this 3 mm joint leaves the tabs out. Close the joint.',
    )
    expect(say('no-lock', design({ lock: 'tabs', surface: { width: 150, height: 600 } }))).toBe(
      'This wall is one tile wide, so it has no joint for a tab to cross: the tiles go up side by side.',
    )
    // Nothing unlocked to name: the checker's own words stand.
    expect(say('no-lock', design({ lock: 'tabs' }), 'Fallback.')).toBe('Fallback.')
  })

  it('never reports the rows a tab wall leaves unlocked: that is the design, not a fault', () => {
    // Every tab wall is one strip per row by construction, so the keys' own coverage note must stay away.
    for (const surface of [{ width: 1200, height: 600 }, { width: 600, height: 1200 }, { width: 450, height: 300 }]) {
      const wall = design({ lock: 'tabs', surface })
      const notes = fixingWarnings(wall, planOf(wall)).filter((w) => w.code === 'no-key' || w.code === 'no-lock')
      for (const warn of notes) expect(plainWarning(warn, wall, planOf(wall))).not.toMatch(/row|strip|block/i)
    }
  })

  it('names the fixings a thin base cannot hold, and the numbers', () => {
    const light = { width: 150, height: 150, thickness: 3 }
    expect(say('thin-base', design({ mount: 'clips', tile: light }))).toBe(
      'Wall clips need a base at least 4 mm thick to hold their pockets; this one is 3 mm.',
    )
    expect(say('thin-base', design({ lock: 'keys', tile: light }))).toBe('Keys need a base at least 4 mm thick to hold their slots; this one is 3 mm.')
    expect(say('thin-base', design({ lock: 'keys', mount: 'clips', tile: light }))).toBe(
      'Keys and wall clips need a base at least 4 mm thick to hold their slots and pockets; this one is 3 mm.',
    )
    expect(say('thin-base', design({ lock: 'keys', jointEdge: 'round', bevel: 3 }))).toBe(
      'The edge between tiles is so deep that no key slot fits under it: use a thicker base or a smaller edge.',
    )
    // Tabs sit in sockets, which need deeper plate still: the note names the socket, not the slot.
    expect(say('thin-base', design({ lock: 'tabs', tile: light }))).toBe('Tabs need a base at least 4 mm thick to hold their sockets; this one is 3 mm.')
    expect(say('thin-base', design({ lock: 'tabs', mount: 'clips', tile: light }))).toBe(
      'Tabs and wall clips need a base at least 4 mm thick to hold their sockets and pockets; this one is 3 mm.',
    )
    expect(say('thin-base', design({ lock: 'tabs', jointEdge: 'round', bevel: 3 }))).toBe(
      'The edge between tiles is so deep that no socket fits under it: use a thicker base or a smaller edge.',
    )
  })

  it('says what the edge profile really prints with', () => {
    const plate = design({ perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'bullnose', width: 4, drop: 3, land: 'valleys' } })
    expect(say('profile-clamped', plate)).toBe('The edge around the wall drops 2.3 mm, not the 3 mm you set: a 4 mm base has no room for more.')
    // A room floating point leaves a hair under 4.9 mm reads as 4.9 mm, the drop the fix beside it offers.
    const peaks = design({ perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'bullnose', width: 6, drop: 8, fade: 0, land: 'peaks' } })
    expect(say('profile-clamped', peaks)).toBe('The edge around the wall drops 4.9 mm, not the 8 mm you set: a 4 mm base has no room for more.')
    const small = design({ surface: { width: 60, height: 60 }, perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'chamfer', width: 30, drop: 2 } })
    expect(say('profile-clamped', small)).toBe('The edge around the wall is narrowed to 28 mm to fit this wall.')
    const fade = design({ surface: { width: 60, height: 60 }, perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'chamfer', width: 22.5, drop: 2, fade: 8 } })
    expect(say('profile-clamped', fade)).toBe('The pattern fades into the edge around the wall over a shorter band, to fit this wall.')
    // A cut never fades, so even a narrowing under 0.05 mm is a narrower edge: 63.95 / 2 - 2 = 29.975 mm.
    const hair = design({ surface: { width: 63.95, height: 600 }, perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'chamfer', width: 30, drop: 3, land: 'cut' } })
    expect(say('profile-clamped', hair)).toBe('The edge around the wall is narrowed to 29.9 mm to fit this wall.')
    expect(say('profile-clamped', design({}), 'Fallback.')).toBe('Fallback.')
  })

  it('keeps the checker words for a piece with no clip when the plan has none', () => {
    expect(say('no-mount', design({ mount: 'clips' }), 'Fallback.')).toBe('Fallback.')
  })

  it('says where extra models come from when the border makes them', () => {
    const edged = design({
      surface: { width: 1210, height: 610 },
      perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'chamfer', width: 4, drop: 2, fade: 16 },
    })
    const plan = planOf(edged)
    expect(plainWarning(note('many-pieces'), edged, plan)).toMatch(
      new RegExp(`^This layout needs ${plan.pieces.length} different tiles to print, \\d+ of them only because they sit on the border`),
    )
    const bond = design({ surface: { width: 1250, height: 640 }, tile: { width: 100, height: 100, thickness: 4 }, layout: { origin: 'center', rowOffset: 0.3333 } })
    expect(say('many-pieces', bond)).toBe(`This layout needs ${planOf(bond).pieces.length} different tiles to print, which is a long download.`)
  })

  it('never writes an em-dash, and never names rails, snaps or flush', () => {
    const emDash = String.fromCharCode(0x2014)
    const configs = [
      design({ lock: 'tabs', surface: { width: 1205, height: 600 } }),
      design({ lock: 'tabs', mount: 'clips', tile: { width: 56, height: 28, thickness: 4 }, surface: { width: 336, height: 168 } }),
      design({ lock: 'tabs', joint: 3 }),
      design({ lock: 'keys', surface: { width: 910, height: 600 } }),
      design({ mount: 'clips', tile: { width: 150, height: 150, thickness: 3 } }),
      design({ mount: 'clips', lock: 'keys', surface: { width: 1200, height: 612 } }),
      design({ mount: 'clips', tile: { width: 32, height: 32, thickness: 4 }, surface: { width: 320, height: 320 } }),
      design({ mount: 'clips', lock: 'keys', surface: { width: 930, height: 620 } }),
      design({ mount: 'clips', lock: 'keys', tile: { width: 56, height: 56, thickness: 4 }, surface: { width: 600, height: 400 }, perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'margin' } }),
      design({ perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'bullnose', width: 4, drop: 3, land: 'valleys' } }),
    ]
    for (const config of configs) {
      for (const code of ['no-key', 'no-lock', 'no-mount', 'thin-base', 'profile-clamped', 'many-pieces'] as const) {
        expect(say(code, config)).not.toContain(emDash)
        expect(say(code, config)).not.toMatch(/\brails?\b|\bsnaps?\b|\bflush\b/i)
      }
    }
  })
})
