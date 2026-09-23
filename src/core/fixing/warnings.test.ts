import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_PERIMETER } from '../config'
import { computeLayout, layoutInputOf } from '../layout'
import { printerById } from '../printers'
import type { DesignConfig, FitWarning } from '../types'
import { accessoryParts } from './accessories'
import { mountingGuide } from './guide'
import { joinPlan, keyCoverageNote } from './joins'
import { mountPlan } from './mount'
import { tabPlan } from './tabs'
import { fixingWarnings } from './warnings'

const design = (over: Partial<DesignConfig> = {}): DesignConfig => ({ ...structuredClone(DEFAULT_CONFIG), ...over })
const planOf = (config: DesignConfig) => computeLayout(layoutInputOf(config, printerById(config.printerId)))
const notes = (config: DesignConfig) => fixingWarnings(config, planOf(config))

/** 150 mm tiles on 1210 x 600: a 10 mm strip down the right edge, too narrow for a clip or a key. */
const SLIVERED = { surface: { width: 1210, height: 600 } }
/** 150 mm tiles from the top-left corner on 1250 x 650: 50 mm cuts on the right and at the bottom, a 50 mm square in the corner. */
const CORNERED = { surface: { width: 1250, height: 650 }, layout: { origin: 'corner' as const, rowOffset: 0 as const } }

describe('fixing warnings', () => {
  it('says nothing about a default design, or a plain wall on clips', () => {
    expect(notes(DEFAULT_CONFIG)).toEqual([])
    expect(notes(design({ mount: 'clips' }))).toEqual([])
    expect(notes(design({ mount: 'clips', lock: 'keys' }))).toEqual([])
  })

  it('flags a base too thin for keys or clips, alone, with the Standard base as the fix', () => {
    const thin = { width: 150, height: 150, thickness: 3 }
    // Keys sit in slots and clips in pockets, and the note names only what the design asks for.
    const cases = [
      { over: { mount: 'clips' as const }, what: 'Wall clips need a base at least 4 mm thick to hold their pockets,' },
      { over: { lock: 'keys' as const }, what: 'Keys need a base at least 4 mm thick to hold their slots,' },
      { over: { mount: 'clips' as const, lock: 'keys' as const }, what: 'Keys and wall clips need a base at least 4 mm thick to hold their slots and pockets,' },
    ]
    for (const { over, what } of cases) {
      const list = notes(design({ ...over, tile: thin, ...SLIVERED }))
      expect(list.map((w) => w.code)).toEqual(['thin-base'])
      expect(list[0].message).toBe(`${what} so this 3 mm base leaves them out. Use the Standard base.`)
    }
    // A thin plate without keys or clips is fine.
    expect(notes(design({ tile: thin }))).toEqual([])
  })

  it('points at the biggest piece with no clip, and says why', () => {
    const config = design({ mount: 'clips', ...SLIVERED })
    const plan = planOf(config)
    const lost = mountPlan(config, plan).unmountedPieceIds
    expect(lost.length).toBeGreaterThan(0)
    const note = fixingWarnings(config, plan).find((w) => w.code === 'no-mount')
    const pieces = plan.pieces.filter((p) => lost.includes(p.id))
    const biggest = pieces.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a))
    expect(note?.pieceId).toBe(biggest.id)
    // Every piece left without is a 10 mm strip: narrow, not small.
    expect(note?.message).toMatch(/too narrow for a wall clip/)
    for (const p of pieces) expect(note?.message).toContain(p.mark)
    // No keys on this wall, so none is offered.
    expect(note?.message).toMatch(/: glue (it|them) to the wall\.$/)
    expect(note?.message).not.toMatch(/key/)
  })

  it('offers glued keys only for pieces keyed to a neighbour, and never a key the design cannot cut', () => {
    // A 10 mm strip takes no key either, so its only fix is glue.
    const slivers = notes(design({ mount: 'clips', lock: 'keys', ...SLIVERED })).find((w) => w.code === 'no-mount')
    expect(slivers?.message).toMatch(/: glue (it|them) to the wall\.$/)
    // Keys asked for on a joint edge too deep for a slot are not offered either.
    const deep = notes(design({ mount: 'clips', lock: 'keys', bevel: 3, ...SLIVERED })).find((w) => w.code === 'no-mount')
    expect(deep?.message).toMatch(/: glue (it|them) to the wall\.$/)
    // The 50 mm corner square takes no clip, but its keys tie it to its neighbours.
    const config = design({ mount: 'clips', lock: 'keys', ...CORNERED })
    const plan = planOf(config)
    const lost = mountPlan(config, plan).unmountedPieceIds
    const unkeyed = joinPlan(config, plan).unkeyedPieceIds
    expect(lost.length).toBeGreaterThan(0)
    expect(lost.every((id) => !unkeyed.includes(id))).toBe(true)
    const keyed = fixingWarnings(config, plan).find((w) => w.code === 'no-mount')
    // Keyed pieces get the fix the guide gives them, and only that one: a drop of glue in their slots.
    expect(keyed?.message).toMatch(/too small for a wall clip: put a drop of glue in (its|their) key slots so (its|their) keyed neighbours hold (it|them)\.$/)
  })

  it('counts the tiles that go on the wall, not the files, and splits the fix the way the guide does', () => {
    // 150 mm tiles on 930 x 620 with keys: a 20 mm row along the top, printed as three files over seven tiles.
    const config = design({ mount: 'clips', lock: 'keys', surface: { width: 930, height: 620 } })
    const plan = planOf(config)
    const mount = mountPlan(config, plan)
    const join = joinPlan(config, plan)
    const lost = new Set(mount.unmountedPieceIds)
    const pieces = plan.pieces.filter((p) => lost.has(p.id))
    const onWall = plan.placements.filter((p) => lost.has(p.pieceId)).length
    expect(onWall).toBeGreaterThan(pieces.length)
    const note = fixingWarnings(config, plan).find((w) => w.code === 'no-mount')
    expect(note?.message).toBe(
      'Pieces F, H and I (7 on the wall) are too small or too narrow for a wall clip: put a drop of glue in the key slots of F and H so their keyed neighbours hold them, and glue I to the wall.',
    )
    expect(note?.message).toContain(`(${onWall} on the wall)`)
    // The same split as the download guide's own step: the keyed pieces first, the glued one after.
    const step = mountingGuide({ config, plan, mount, join, tab: tabPlan(config, plan), accessories: accessoryParts(config, plan) }).steps.find((s) => s.key === 'no-clip')
    const keyed = pieces.filter((p) => !join.unkeyedPieceIds.includes(p.id)).map((p) => p.mark)
    const glued = pieces.filter((p) => join.unkeyedPieceIds.includes(p.id)).map((p) => p.mark)
    expect(keyed.length).toBeGreaterThan(0)
    expect(glued.length).toBeGreaterThan(0)
    expect(step?.body[0]).toContain(`Pieces ${keyed.join(' and ')} have`)
    expect(step?.body[1]).toContain(`Piece ${glued[0]} has`)
  })

  it('blames the key slots, not the size, when the same piece takes a clip with the keys off', () => {
    // 60 mm tiles on an exact 600 x 300 wall: with keys the whole tile is boxed in, without them every
    // piece clips on. The size is not the trouble, so the note does not say it is.
    const config = design({ mount: 'clips', lock: 'keys', tile: { width: 60, height: 60, thickness: 4 }, surface: { width: 600, height: 300 } })
    const plan = planOf(config)
    const note = fixingWarnings(config, plan).find((w) => w.code === 'no-mount')
    expect(note?.message).toContain('have no room for a wall clip beside their key slots')
    expect(note?.message).not.toContain('too small')
    const open = design({ ...config, lock: 'none' })
    expect(mountPlan(open, planOf(open)).unmountedPieceIds).toEqual([])
    // Not one piece of this wall takes a clip, and the keys are why: the note names the tile and the fix.
    const wall = design({ mount: 'clips', lock: 'keys', tile: { width: 56, height: 56, thickness: 4 }, surface: { width: 500, height: 300 }, layout: { origin: 'center', rowOffset: 0 } })
    const wallPlan = planOf(wall)
    expect(mountPlan(wall, wallPlan).clips).toBe(0)
    expect(fixingWarnings(wall, wallPlan).find((w) => w.code === 'no-mount')?.message).toBe(
      'Tiles of 56 × 56 mm have no room for a wall clip beside their key slots: turn the keys off for clips, glue them, or use bigger tiles.',
    )
    const unkeyed = design({ ...wall, lock: 'none' })
    expect(mountPlan(unkeyed, planOf(unkeyed)).clips).toBeGreaterThan(0)
  })

  it('says tiles too small for a clip get none, naming the tile and no piece', () => {
    for (const lock of ['none', 'keys', 'tabs'] as const) {
      const config = design({ mount: 'clips', lock, tile: { width: 32, height: 32, thickness: 4 } })
      const plan = planOf(config)
      expect(mountPlan(config, plan).clips).toBe(0)
      const list = fixingWarnings(config, plan).filter((w) => w.code === 'no-mount')
      expect(list).toHaveLength(1)
      expect(list[0].pieceId).toBeUndefined()
      expect(list[0].message).toBe('Tiles of 32 × 32 mm are too small for a wall clip: glue them, or use bigger tiles.')
    }
    // A slat is narrow rather than small.
    const slat = notes(design({ mount: 'clips', tile: { width: 300, height: 12, thickness: 4 } })).find((w) => w.code === 'no-mount')
    expect(slat?.message).toBe('Tiles of 300 × 12 mm are too narrow for a wall clip: glue them, or use bigger tiles.')
    // A thin base says so first, alone.
    expect(notes(design({ mount: 'clips', tile: { width: 32, height: 32, thickness: 3 } })).map((w) => w.code)).toEqual(['thin-base'])
  })

  it('names the pieces keyed to no neighbour, and nothing else', () => {
    const config = design({ lock: 'keys', ...SLIVERED })
    const plan = planOf(config)
    const loose = joinPlan(config, plan).unkeyedPieceIds
    expect(loose.length).toBeGreaterThan(0)
    const note = fixingWarnings(config, plan).find((w) => w.code === 'no-key')
    expect(note?.pieceId).toBe(loose[0])
    const marks = plan.pieces.filter((p) => loose.includes(p.id)).map((p) => p.mark)
    for (const mark of marks) expect(note?.message).toContain(mark)
    expect(note?.message).toMatch(/no joint long enough for a key: glue them/)
  })

  it('says nothing of short joints whose pieces are still keyed elsewhere', () => {
    // A 25 mm edge row: the joints between its strips take no key, but each strip is keyed to the tile below.
    const config = design({ lock: 'keys', surface: { width: 1200, height: 625 } })
    const plan = planOf(config)
    const join = joinPlan(config, plan)
    expect(join.unkeyedSeams).toBeGreaterThan(0)
    expect(join.unkeyedPieceIds).toEqual([])
    expect(fixingWarnings(config, plan)).toEqual([])
  })

  it('flags a joint edge too deep for a key slot on a thick enough base, and still checks the clips', () => {
    // A 3 mm chamfer (clamped to 2 mm on the 4 mm base) leaves no cover over a key slot.
    const deep = design({ lock: 'keys', bevel: 3 })
    expect(deep.tile.thickness).toBeGreaterThanOrEqual(4)
    const list = notes(deep)
    expect(list.map((w) => w.code)).toEqual(['thin-base'])
    expect(list[0].message).toMatch(/too deep for a key slot/)
    expect(list[0].message).toMatch(/Use the Sturdy base, or a smaller edge between tiles\.$/)
    // The plate still holds the clips' pockets, so their own note still comes.
    const clipped = notes(design({ lock: 'keys', bevel: 3, mount: 'clips', ...SLIVERED }))
    expect(clipped.map((w) => w.code)).toEqual(['thin-base', 'no-mount'])
    // A shallow edge leaves room, and the Sturdy base always does.
    expect(notes(design({ lock: 'keys', bevel: 1 }))).toEqual([])
    expect(notes(design({ lock: 'keys', bevel: 3, tile: { width: 150, height: 150, thickness: 6 } }))).toEqual([])
  })

  it('explains a clamped edge profile: the Sturdy base for the plate, narrower for the surface', () => {
    const plate = notes(design({ perimeter: { ...DEFAULT_PERIMETER, profile: 'chamfer', width: 6, drop: 8 } }))
    expect(plate.map((w) => w.code)).toEqual(['profile-clamped'])
    expect(plate[0].message).toMatch(/Use the Sturdy base\.$/)
    const surface = notes(design({ surface: { width: 50, height: 50 }, perimeter: { ...DEFAULT_PERIMETER, profile: 'margin', width: 30 } }))
    expect(surface.map((w) => w.code)).toEqual(['profile-clamped'])
    expect(surface[0].message).toMatch(/narrowed to fit/)
  })

  it('says when keys leave the wall in separate strips, naming no piece', () => {
    // Small tiles in a third bond: no key fits across a row joint, so every row is its own strip.
    const strips = design({ lock: 'keys', tile: { width: 40, height: 40, thickness: 4 }, layout: { origin: 'corner', rowOffset: 0.3333 } })
    expect(joinPlan(strips, planOf(strips)).blocks).toBeGreaterThan(1)
    const note = notes(strips).find((w) => w.code === 'no-key' && !w.pieceId)
    expect(note?.message).toMatch(/separate strips/)
    // One keyed block: no such note.
    expect(notes(design({ lock: 'keys' })).some((w) => w.code === 'no-key')).toBe(false)
  })

  it('never uses an em-dash, and never names rails, snaps or a hold', () => {
    const all: FitWarning[] = [
      ...notes(design({ mount: 'clips', lock: 'keys', tile: { width: 150, height: 150, thickness: 3 } })),
      ...notes(design({ mount: 'clips', ...SLIVERED })),
      ...notes(design({ mount: 'clips', lock: 'keys', ...CORNERED })),
      ...notes(design({ mount: 'clips', tile: { width: 32, height: 32, thickness: 4 } })),
      ...notes(design({ mount: 'clips', lock: 'keys', surface: { width: 930, height: 620 } })),
      ...notes(design({ mount: 'clips', lock: 'keys', tile: { width: 56, height: 56, thickness: 4 }, surface: { width: 500, height: 300 }, layout: { origin: 'center', rowOffset: 0 } })),
      ...notes(design({ perimeter: { ...DEFAULT_PERIMETER, profile: 'chamfer', width: 6, drop: 8 } })),
    ]
    expect(all.length).toBeGreaterThan(4)
    for (const w of all) {
      expect(w.message).not.toContain(String.fromCharCode(0x2014))
      expect(w.message).not.toMatch(/\brails?\b|\bsnaps?\b|\bflush\b|\d\s*(N|kg)\b/)
    }
  })
})

// The tabs place nothing where the plate, the joint or the piece will not take a socket, and the note has to
// say which of the three it was. What it must never report is the one strip per row: nothing of the tabs
// crosses a row joint by design, so keyCoverageNote is not theirs to fire.
describe('the tabs', () => {
  const tabbed = (over: Partial<DesignConfig> = {}): DesignConfig => design({ lock: 'tabs', ...over })

  it('says nothing about a wall whose every joint takes a tab', () => {
    expect(notes(tabbed())).toEqual([])
    expect(notes(tabbed({ mount: 'clips' }))).toEqual([])
    // Nine of this wall's twelve row joints lock, and only the three 10 mm strips are named.
    expect(notes(tabbed({ tile: { width: 100, height: 100, thickness: 4 }, surface: { width: 400, height: 300 } }))).toEqual([])
  })

  it('names the sockets, not the slots, when the base or the edge between tiles will not hold one', () => {
    const thin = notes(tabbed({ tile: { width: 150, height: 150, thickness: 3 } }))
    expect(thin.map((w) => w.code)).toEqual(['thin-base'])
    expect(thin[0].message).toBe('Tabs need a base at least 4 mm thick to hold their sockets, so this 3 mm base leaves them out. Use the Standard base.')
    const both = notes(tabbed({ mount: 'clips', tile: { width: 150, height: 150, thickness: 3 } }))
    expect(both[0].message).toContain('Tabs and wall clips need a base at least 4 mm thick to hold their sockets and pockets,')
    // A socket needs more plate under the rim than a key slot, so a 1 mm edge leaves a key room and a tab none.
    const deep = notes(tabbed({ bevel: 1 }))
    expect(deep.map((w) => w.code)).toEqual(['thin-base'])
    expect(deep[0].message).toBe(
      'The edge between tiles is too deep for a socket under it on this 4 mm base, so the tabs are left out. Use the Sturdy base, or a smaller edge between tiles.',
    )
    expect(notes(design({ lock: 'keys', bevel: 1 }))).toEqual([])
  })

  it('says a wide joint would show the tab, and names closing the joint', () => {
    const wide = notes(tabbed({ joint: 3 }))
    expect(wide.map((w) => w.code)).toEqual(['no-lock'])
    expect(wide[0].pieceId).toBeUndefined()
    expect(wide[0].message).toBe(
      'A tab crosses the joint between tiles and sits under the rim of the edge, so it needs a joint of 2 mm or less: ' +
        'this 3 mm joint would show it, so the tabs are left out. Close the joint.',
    )
    // At the cap itself the tabs are cut, so nothing is said.
    expect(notes(tabbed({ joint: 2 }))).toEqual([])
    // A base too thin says so first and alone: one cause at a time.
    expect(notes(tabbed({ joint: 3, tile: { width: 150, height: 150, thickness: 3 } })).map((w) => w.code)).toEqual(['thin-base'])
  })

  it('says a wall one tile wide locks nothing, naming no piece', () => {
    const one = notes(tabbed({ tile: { width: 150, height: 150, thickness: 4 }, surface: { width: 150, height: 600 } }))
    expect(one.map((w) => w.code)).toEqual(['no-lock'])
    expect(one[0].pieceId).toBeUndefined()
    expect(one[0].message).toBe('No joint of this wall takes a tab: the wall is one tile wide, so the tiles go up side by side.')
  })

  it('names the pieces too narrow for a socket, in their own terms, with the fix the guide gives them', () => {
    // 100 mm tiles on 410 mm: a 10 mm strip down the right edge, under the 11.7 mm a socket needs.
    const config = tabbed({ tile: { width: 100, height: 100, thickness: 4 }, surface: { width: 410, height: 300 } })
    const plan = planOf(config)
    const list = fixingWarnings(config, plan).filter((w) => w.code === 'no-lock')
    expect(list).toHaveLength(1)
    const marks = plan.pieces.filter((p) => p.width === 10).map((p) => p.mark)
    expect(marks).toHaveLength(3)
    expect(list[0].pieceId).toBe(plan.pieces.find((p) => p.mark === marks[0])?.id)
    expect(list[0].message).toBe(
      `Pieces ${marks.slice(0, -1).join(', ')} and ${marks[2]} are too narrow for a socket, so no tab locks them to the ` +
        'tiles beside them: glue them to the tiles beside them as the wall goes up.',
    )
    // A piece too narrow for a socket is narrower still than a clip pocket, so on clips 'no-mount' already
    // tells it to glue itself to the wall: this note drops it rather than sending the maker two ways.
    const clipped = { ...config, mount: 'clips' as const }
    const onClips = fixingWarnings(clipped, planOf(clipped))
    expect(onClips.map((w) => w.code)).toEqual(['no-mount'])
    expect(onClips[0].message).toMatch(/: glue them to the wall\.$/)
  })

  it('never reports the one strip per row as a fault: that is the design, and the guide states it', () => {
    for (const over of [{}, { layout: { origin: 'corner' as const, rowOffset: 0.5 as const } }, { tile: { width: 40, height: 40, thickness: 4 } }]) {
      const config = tabbed(over)
      const plan = planOf(config)
      // Every row is its own strip on every tabbed wall, so keyCoverageNote would fire on all of them.
      expect(keyCoverageNote(config, plan)).toBeNull()
      expect(fixingWarnings(config, plan).some((w) => w.code === 'no-key')).toBe(false)
    }
  })

  it('says which pieces are too narrow themselves and which have only narrow neighbours', () => {
    // 100 mm tiles on 110 x 300 in a half brick: the offset rows lock (50 to 60 mm), the straight rows cannot,
    // because their second piece is a 10 mm strip. So the whole tiles of those rows are locked to nothing.
    const half = { origin: 'corner' as const, rowOffset: 0.5 as const }
    const config = tabbed({ tile: { width: 100, height: 100, thickness: 4 }, surface: { width: 110, height: 300 }, layout: half })
    const plan = planOf(config)
    expect(tabPlan(config, plan).tabs).toBeGreaterThan(0)
    const note = fixingWarnings(config, plan).find((w) => w.code === 'no-lock')
    expect(note?.message).toBe(
      'Pieces A, B, E and F are too narrow for a socket, or have no tile beside them that is wide enough for one, so no ' +
        'tab locks them to the tiles beside them: glue them to the tiles beside them as the wall goes up.',
    )
    // On clips the 10 mm strips take no clip either, so 'no-mount' owns them and this note drops them rather
    // than sending the maker two ways: the whole tiles it keeps go up on their own clips.
    const clipped = tabbed({ ...config, mount: 'clips' })
    const clippedPlan = planOf(clipped)
    const list = fixingWarnings(clipped, clippedPlan)
    expect(list.find((w) => w.code === 'no-mount')?.message).toBe('Pieces E and F are too narrow for a wall clip: glue them to the wall.')
    expect(list.find((w) => w.code === 'no-lock')?.message).toBe(
      'Pieces A and B have no tiles beside them wide enough for a socket, so no tab locks them to the tiles beside them: ' +
        'they go up on their own clips, level with the tiles around them.',
    )
  })

  it('never calls a socket a key slot, whatever the tile', () => {
    for (const size of [40, 56, 60, 80, 100, 150]) {
      const design = tabbed({ mount: 'clips', tile: { width: size, height: size, thickness: 4 }, surface: { width: size * 6, height: size * 4 } })
      for (const w of fixingWarnings(design, planOf(design))) expect(w.message, `${size} mm`).not.toContain('key slot')
    }
    // A socket that does box a clip in reads as a socket, and the fix is a drop of glue in the socket itself.
    const narrow = tabbed({ mount: 'clips', tile: { width: 30, height: 56, thickness: 4 }, surface: { width: 102, height: 151 }, layout: { origin: 'center', rowOffset: 0.5 } })
    const note = fixingWarnings(narrow, planOf(narrow)).find((w) => w.code === 'no-mount')
    expect(note?.message).toContain('have no room for one beside their sockets')
    expect(note?.message).toMatch(/put a drop of glue in the sockets of [A-Z, and]+ so the tabs in them hold them/)
  })

  it('keeps the copy rules: no em-dash, no rail, no snap, no figure of hold', () => {
    const all: FitWarning[] = [
      ...notes(tabbed({ tile: { width: 150, height: 150, thickness: 3 } })),
      ...notes(tabbed({ bevel: 1 })),
      ...notes(tabbed({ joint: 3 })),
      ...notes(tabbed({ surface: { width: 150, height: 600 } })),
      ...notes(tabbed({ tile: { width: 100, height: 100, thickness: 4 }, surface: { width: 410, height: 300 } })),
    ]
    expect(all.length).toBeGreaterThan(4)
    for (const w of all) {
      expect(w.message).not.toContain(String.fromCharCode(0x2014))
      expect(w.message).not.toMatch(/\brails?\b|\bsnaps?\b|\bflush\b|\bclicks?\b|\d\s*(N|kg)\b/i)
    }
  })
})
