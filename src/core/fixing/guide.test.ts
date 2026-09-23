import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config'
import {
  FIXED_CONFIG,
  FIXED_FIT_PARTS,
  FIXED_JOIN,
  FIXED_MOUNT,
  FIXED_PARTS,
  FIXED_PLAN,
  FIXED_WALL_PARTS,
  NO_TABS,
  TABBED_CONFIG,
  TABBED_FIT_PARTS,
  TABBED_PLAN,
  TABBED_TAB,
} from '../export/testFixings'
import { computeLayout, layoutInputOf } from '../layout'
import { printerById } from '../printers'
import type { DesignConfig, LayoutPlan } from '../types'
import { formatNumber } from '../units'
import { accessoryParts, fitClearance, fitTestFor, wallParts } from './accessories'
import {
  FIT_MARKS,
  fitChosenText,
  fitTestGuide,
  fixingSystem,
  listText,
  marksText,
  mountingGuide,
  mountingSummary,
  type GuideInput,
  type MountingGuide,
} from './guide'
import { joinPlan } from './joins'
import { mountPlan } from './mount'
import { SOCKET_CLEARANCE, tabPlan, type TabPlan } from './tabs'
import type { AccessorySpec, JoinPlan, MountPlan } from './types'

const design = (patch: Partial<DesignConfig> = {}): DesignConfig => ({
  ...DEFAULT_CONFIG,
  tile: { ...DEFAULT_CONFIG.tile, thickness: 4 },
  ...patch,
})

const layout = (config: DesignConfig): LayoutPlan => computeLayout(layoutInputOf(config))

const EMPTY_MOUNT: MountPlan = { clips: 0, sites: [], unmountedPieceIds: [] }
const EMPTY_JOIN: JoinPlan = { keys: 0, sites: [], unkeyedSeams: 0, unkeyedPieceIds: [] }
const KEYED = (keys: number, patch: Partial<JoinPlan> = {}): JoinPlan => ({ ...EMPTY_JOIN, keys, ...patch })
const TABBED = (tabs: number, patch: Partial<TabPlan> = {}): TabPlan => ({ ...NO_TABS, tabs, joints: tabs, ...patch })

const part = (patch: Partial<AccessorySpec> & Pick<AccessorySpec, 'id' | 'kind' | 'mark' | 'group'>): AccessorySpec => ({
  label: patch.kind,
  count: 1,
  size: { x: 10, y: 10, z: 2 },
  printNote: 'Flat.',
  shape: {},
  ...patch,
})

/** A keys-only fit test and key file, as the wall of a glued keyed panel prints them. */
const KEY_PARTS: AccessorySpec[] = [
  part({ id: 'fit-coupon', kind: 'fit-test', mark: 'F1', group: 'fit-test', label: 'Test coupon A with a key slot' }),
  part({ id: 'fit-coupon-b', kind: 'fit-test', mark: 'F2', group: 'fit-test', label: 'Test coupon B with the facing key slot' }),
  part({ id: 'fk1', kind: 'key', mark: 'F3', group: 'fit-test', label: 'Test key 1, snug' }),
  part({ id: 'fk2', kind: 'key', mark: 'F4', group: 'fit-test', label: 'Test key 2, standard' }),
  part({ id: 'fk3', kind: 'key', mark: 'F5', group: 'fit-test', label: 'Test key 3, loose' }),
  part({ id: 'key', kind: 'key', mark: 'K1', group: 'join', label: 'Key', count: 110 }),
]

/** A clips-only fit test (one coupon, three clips) and the clip file: 27 to fit and 2 spares. */
const CLIP_PARTS: AccessorySpec[] = [
  part({ id: 'fit-coupon-c', kind: 'fit-test', mark: 'F1', group: 'fit-test', label: 'Test coupon with a clip pocket' }),
  part({ id: 'fc1', kind: 'clip', mark: 'F2', group: 'fit-test', label: 'Test clip 1, snug' }),
  part({ id: 'fc2', kind: 'clip', mark: 'F3', group: 'fit-test', label: 'Test clip 2, standard' }),
  part({ id: 'fc3', kind: 'clip', mark: 'F4', group: 'fit-test', label: 'Test clip 3, loose' }),
  part({ id: 'clip', kind: 'clip', mark: 'C1', group: 'mount', label: 'Wall clip', count: 29 }),
]

const CLIPS_ONLY: DesignConfig = { ...FIXED_CONFIG, lock: 'none' }

function input(config: DesignConfig, patch: Partial<GuideInput> = {}): GuideInput {
  return { config, plan: layout(config), mount: EMPTY_MOUNT, join: EMPTY_JOIN, tab: NO_TABS, accessories: [], ...patch }
}

const clipsInput = (patch: Partial<GuideInput> = {}): GuideInput => ({
  config: CLIPS_ONLY,
  plan: FIXED_PLAN,
  mount: FIXED_MOUNT,
  join: EMPTY_JOIN,
  tab: NO_TABS,
  accessories: CLIP_PARTS,
  ...patch,
})

const bothInput = (patch: Partial<GuideInput> = {}): GuideInput => ({
  config: FIXED_CONFIG,
  plan: FIXED_PLAN,
  mount: FIXED_MOUNT,
  join: FIXED_JOIN,
  tab: NO_TABS,
  accessories: FIXED_PARTS,
  ...patch,
})

/** The tabbed wall of testFixings: nothing printed, nine joints locked, three right-edge strips locked to nothing. */
const tabsInput = (patch: Partial<GuideInput> = {}): GuideInput => ({
  config: TABBED_CONFIG,
  plan: TABBED_PLAN,
  mount: EMPTY_MOUNT,
  join: EMPTY_JOIN,
  tab: TABBED_TAB,
  accessories: [],
  ...patch,
})

const allText = (guide: MountingGuide): string =>
  [guide.lede, guide.needs ?? '', ...guide.steps.flatMap((step) => [step.title, ...step.body])].join('\n')

const stepText = (guide: MountingGuide, key: string): string => guide.steps.find((step) => step.key === key)?.body.join(' ') ?? ''

/** A clearance as the guide says it: hundredths, no trailing zeros. */
const fine = (mm: number) => `${formatNumber(mm, 2)} mm`

describe('fixingSystem', () => {
  it('names the four ways a wall goes up, from what the plans really place', () => {
    const clipped = { clips: 12 }
    expect(fixingSystem({ lock: 'none', mount: 'glue' }, EMPTY_MOUNT, EMPTY_JOIN, NO_TABS)).toBe('glue')
    expect(fixingSystem({ lock: 'keys', mount: 'glue' }, EMPTY_MOUNT, KEYED(3), NO_TABS)).toBe('keys')
    expect(fixingSystem({ lock: 'none', mount: 'clips' }, clipped, EMPTY_JOIN, NO_TABS)).toBe('clips')
    expect(fixingSystem({ lock: 'keys', mount: 'clips' }, clipped, KEYED(3), NO_TABS)).toBe('both')
    expect(fixingSystem({ lock: 'tabs', mount: 'glue' }, EMPTY_MOUNT, EMPTY_JOIN, TABBED(6))).toBe('tabs')
    expect(fixingSystem({ lock: 'tabs', mount: 'clips' }, clipped, EMPTY_JOIN, TABBED(6))).toBe('clips-tabs')
    // Asked for, but nothing placed (a thin base, a deep joint edge, a wide joint, tiles too small): glue.
    expect(fixingSystem({ lock: 'keys', mount: 'clips' }, EMPTY_MOUNT, EMPTY_JOIN, NO_TABS)).toBe('glue')
    expect(fixingSystem({ lock: 'keys', mount: 'clips' }, clipped, EMPTY_JOIN, NO_TABS)).toBe('clips')
    expect(fixingSystem({ lock: 'keys', mount: 'clips' }, EMPTY_MOUNT, KEYED(3), NO_TABS)).toBe('keys')
    expect(fixingSystem({ lock: 'tabs', mount: 'glue' }, EMPTY_MOUNT, EMPTY_JOIN, NO_TABS)).toBe('glue')
    expect(fixingSystem({ lock: 'tabs', mount: 'clips' }, clipped, EMPTY_JOIN, NO_TABS)).toBe('clips')
    // One lock at a time: a plan for the other one never shows through.
    expect(fixingSystem({ lock: 'keys', mount: 'glue' }, EMPTY_MOUNT, KEYED(3), TABBED(6))).toBe('keys')
    expect(fixingSystem({ lock: 'tabs', mount: 'glue' }, EMPTY_MOUNT, KEYED(3), TABBED(6))).toBe('tabs')
    // A plan that places clips on a glued design (never from mountPlan, but the switch still decides).
    expect(fixingSystem({ lock: 'none', mount: 'glue' }, clipped, EMPTY_JOIN, NO_TABS)).toBe('glue')
  })
})

describe('listText and marksText', () => {
  it('joins with commas and a final and', () => {
    expect(listText([])).toBe('')
    expect(listText(['A'])).toBe('A')
    expect(listText(['A', 'B'])).toBe('A and B')
    expect(listText(['A', 'B', 'C'])).toBe('A, B and C')
  })

  it('reads a numbered run of three or more as a range, anything else as a list', () => {
    expect(marksText(['F1', 'F2', 'F3', 'F4'])).toBe('F1 to F4')
    expect(marksText(['F3', 'F4'])).toBe('F3 and F4')
    expect(marksText(['F1', 'F3', 'F4'])).toBe('F1, F3 and F4')
    expect(marksText(['F1', 'C2', 'C3'])).toBe('F1, C2 and C3')
    expect(marksText(['K1'])).toBe('K1')
  })
})

describe('mountingGuide: glue (frozen)', () => {
  const so = 'the setting-out point (SO) on the tiling plan (setting-out-plan.svg)'
  const lede = (order: string) =>
    `Tile adhesive or double-sided mounting tape, straight onto the flat backs. ${order} Mounting tape lets the wall come down again; tile adhesive is for good.`

  it('is the same short note it always was, with no steps', () => {
    const guide = mountingGuide(input(DEFAULT_CONFIG))
    expect(guide).toEqual({ system: 'glue', lede: lede(`Set the tiles from the bottom row up, starting at ${so}.`), needs: null, steps: [] })
  })

  it('orders a glued wall as the tiling plan does: whole tiles first unless the setting-out tile is a cut', () => {
    const tile = { width: 100, height: 100, thickness: 4 }
    const cases = [
      // A 40 mm strip along the bottom: the first whole row sits on the setting-out line.
      { config: design({ surface: { width: 1000, height: 640 } }), order: `Set the whole tiles first, from ${so}, then the cut pieces.` },
      // A third bond whose setting-out row starts on a cut cannot leave its cuts for last.
      {
        config: design({ surface: { width: 1250, height: 640 }, tile, layout: { origin: 'corner', rowOffset: 0.3333 } }),
        order: `Set each row from its first piece, from ${so}, fitting the cut pieces as you reach them.`,
      },
      { config: design({ surface: { width: 1210, height: 700 }, layout: { origin: 'center', rowOffset: 0.5 } }), order: `Set the whole tiles first, from ${so}, then the cut pieces.` },
    ]
    for (const { config, order } of cases) expect(mountingGuide(input(config)).lede).toBe(lede(order))
  })

  it('is the glue note when keys or clips place nothing', () => {
    for (const patch of [{ lock: 'keys' as const }, { mount: 'clips' as const }, { lock: 'keys' as const, mount: 'clips' as const }]) {
      const guide = mountingGuide(input(design(patch)))
      expect(guide.system).toBe('glue')
      expect(guide.steps).toEqual([])
      expect(guide.lede).toBe(mountingGuide(input(design())).lede)
    }
  })
})

describe('mountingGuide: keys on a glued panel (as before)', () => {
  it('keeps every word of the keys-only guide', () => {
    const config = design({ lock: 'keys', surface: { width: 1210, height: 600 } })
    const plan = layout(config)
    const loose = plan.pieces.slice(-2)
    const guide = mountingGuide({ config, plan, mount: EMPTY_MOUNT, join: KEYED(104, { unkeyedSeams: 5, unkeyedPieceIds: loose.map((p) => p.id) }), tab: NO_TABS, accessories: KEY_PARTS })
    expect(guide).toEqual({
      system: 'keys',
      lede: 'Keys lock the tiles edge to edge from the back, in line, with even joints. Then the keyed panel goes up with adhesive or tape.',
      needs: 'Tile adhesive or double-sided mounting tape, and a flat table as big as the panel you key.',
      steps: [
        {
          key: 'fit',
          title: 'Set the fit before you print the parts',
          body: [
            `Your keys are made at Standard, the fit with two notches (clearance per side: keys ${fine(fitClearance('standard', 'key'))}). A new fit remakes only those parts, never the tiles.`,
            'If you have not tried that fit on this design yet, print the fit test first: it prints the keys in all three fits on small coupons, so a fit you do not like costs a reprint of keys and never of a tile. The fit test has a page of its own, linked from the studio under Putting it up.',
          ],
          drawing: 'fit-test',
        },
        {
          key: 'face-down',
          title: 'Lay the tiles face down',
          body: [
            'On a flat, clean table, lay the tiles face down in the order of the tiling plan (setting-out-plan.svg). Face down, the plan reads mirrored: the left edge of the wall is on your right.',
          ],
          drawing: 'keys-back',
        },
        {
          key: 'keys-in',
          title: 'Press in the keys',
          body: [
            'Press a key into each pair of slots that meet across a joint, with your thumb, until it seats in both. You have 104 keys to fit, and 6 spares. For a panel that stays together for good, put a drop of glue in each slot before its key.',
            `Pieces ${loose[0].mark} and ${loose[1].mark} have no joint long enough for a key: glue them to the tiles beside them as the panel goes up.`,
          ],
          drawing: 'keys-in',
        },
        {
          key: 'panel-up',
          title: 'Put the panel up',
          body: [
            'Draw a level line where the bottom edge of the tiles will be, then glue or tape the keyed tiles to the wall, bottom edge first, on the line. The keys hold the tiles to each other, in line and evenly spaced, but not to the wall: the wall keeps them flat. On a large wall, key the tiles in panels you can lift and put them up one panel at a time.',
          ],
          drawing: 'panel-up',
        },
      ],
    })
  })

  it('points at the fit test instead of running it, whatever parts the zip holds', () => {
    const config = design({ lock: 'keys', fit: 'loose' })
    const text = allText(mountingGuide(input(config, { join: KEYED(4), accessories: KEY_PARTS })))
    expect(text).toContain(`Your keys are made at Loose, the fit with three notches (clearance per side: keys ${fine(fitClearance('loose', 'key'))}).`)
    expect(text).toContain('print the fit test first: it prints the keys in all three fits on small coupons')
    // The procedure lives on the fit-test page now: no marks, no reading of a test key here.
    expect(text).not.toMatch(/F\d|test coupon|clip/)
  })
})

describe('mountingGuide: wall clips', () => {
  it('goes fit test, clips in, tape, start line, press on, screws, taking one off', () => {
    const guide = mountingGuide(clipsInput())
    expect(guide.system).toBe('clips')
    expect(guide.steps.map((step) => [step.key, step.drawing])).toEqual([
      ['fit', 'fit-test'],
      ['clips-in', 'clips-in'],
      ['tape', 'tape'],
      ['start', 'start-line'],
      ['press-on', 'press-on'],
      ['screws', 'screws'],
      ['remove', 'remove'],
    ])
    expect(guide.steps.map((step) => step.title)).toEqual([
      'Set the fit before you print the parts',
      'Click the clips into the tiles',
      'Put tape on the clips',
      'Draw the start line',
      'Press the tiles on, bottom row first',
      'Screw the clips on (optional)',
      'To take a tile off',
    ])
    expect(allText(guide)).not.toMatch(/\bkeys?\b/)
  })

  it('says the fit its files are made at and sends the maker to the fit test for it', () => {
    const fit = stepText(mountingGuide(clipsInput()), 'fit')
    expect(fit).toContain(`(clearance per side: clips ${fine(fitClearance('standard', 'clip'))})`)
    expect(fit).toContain('A new fit remakes only those parts, never the tiles.')
    expect(fit).toContain(
      'If you have not tried that fit on this design yet, print the fit test first: it prints the clips in all three fits on small coupons, so a fit you do not like costs a reprint of clips and never of a tile. The fit test has a page of its own, linked from the studio under Putting it up.',
    )
    // The procedure is fitTestGuide's, on its own page: nothing of it is worded twice.
    expect(fit).not.toMatch(/smooth board|test coupon|notches: snug/)
    // Loose is the fit with three notches, whatever the clearance.
    expect(stepText(mountingGuide(clipsInput({ config: { ...CLIPS_ONLY, fit: 'loose' } })), 'fit')).toContain('Loose, the fit with three notches')
  })

  it('counts the clips, the tiles that carry them and the spares, and names the clip file', () => {
    const guide = mountingGuide(clipsInput())
    expect(FIXED_MOUNT.clips).toBe(27)
    expect(stepText(guide, 'clips-in')).toContain(`press a clip (C1) into every pocket on its back, flat side out`)
    // Clicked in on its stops: that is where the clip stays, on the wall or off it, whatever the tape.
    expect(stepText(guide, 'clips-in')).toContain(
      "until it clicks and its stops touch the bottom of the pocket: its back then lies level with the tile's back.",
    )
    expect(stepText(guide, 'clips-in')).toContain(`That is 27 clips for ${FIXED_PLAN.placements.length} tiles, and 2 spares.`)
    // One clip, and no spare file: no plural, no spares.
    const one = mountingGuide(clipsInput({ mount: { ...FIXED_MOUNT, clips: 1 }, accessories: CLIP_PARTS.map((p) => (p.group === 'mount' ? { ...p, count: 1 } : p)) }))
    expect(stepText(one, 'clips-in')).toMatch(/That is 1 clip for \d+ tiles\. /)
  })

  it('puts thin tape on the centre block only, never foam, and the same tape as the fit test', () => {
    const tape = stepText(mountingGuide(clipsInput()), 'tape')
    expect(tape).toContain("thin double-sided tape (film or carpet tape) on each clip's centre block")
    expect(tape).toContain('Use the tape you tried the fit test with.')
    expect(tape).toContain('Keep the tape off the springy arms')
    expect(tape).toContain('Not foam tape')
    // The tile sits a tape's thickness off the wall: said so, never claimed away.
    expect(tape).toContain("the tile's back sits a tape's thickness off it")
  })

  it('draws the start line the width of the wall and stands the bottom row on a batten', () => {
    const start = stepText(mountingGuide(clipsInput()), 'start')
    expect(start).toContain('Draw a level line where the bottom edge of the tiles will be, 450 mm long')
    expect(start).toMatch(/straight batten/)
    expect(start).toMatch(/Wipe the wall clean and dry/)
    expect(start).toContain('The tiles sit on the wall with only the tape behind them')
  })

  it('presses the tiles on from the bottom row, with the joint the design asks for', () => {
    const butt = stepText(mountingGuide(clipsInput()), 'press-on')
    expect(butt).toContain('Set the bottom row on the batten first, placed along it as the tiling plan (setting-out-plan.svg) sets it out')
    expect(butt).toContain('Hold each tile against its neighbour as you press it on, so the joints close.')
    expect(butt).toContain('The clips stay where the tile puts them.')
    // Pressed over each clip, the stops carry the press to the tape.
    expect(butt).toContain('press firmly over each clip: its stops carry the press through the clip, so the tape grips.')
    expect(butt).not.toContain('left to right')
    const gapped = stepText(mountingGuide(clipsInput({ config: { ...CLIPS_ONLY, joint: 2 } })), 'press-on')
    expect(gapped).toContain('Leave a 2 mm joint to each neighbour; spacers of that size help.')
  })

  it('offers screws through each clip, with generic hardware and one of each per clip', () => {
    const guide = mountingGuide(clipsInput())
    const screws = stepText(guide, 'screws')
    expect(screws).toContain('each clip is its own drill guide')
    expect(screws).toContain('5 mm wall plug')
    expect(screws).toContain('3.5 mm countersunk screw')
    expect(screws).toMatch(/cables and pipes with a detector/)
    expect(guide.needs).toContain('Thin double-sided tape (film or carpet tape, not foam)')
    expect(guide.needs).toContain('27 wall plugs (5 mm) and 27 countersunk screws (3.5 mm) to suit them.')
  })

  it('takes a tile off by pulling it straight off, its clips left on the wall', () => {
    const guide = mountingGuide(clipsInput())
    const remove = stepText(guide, 'remove')
    expect(remove).toContain('Pull it straight off the wall')
    expect(remove).toContain('Its clips stay on the wall; push the tile back on to refit it.')
    expect(remove).not.toMatch(/\bkeys?\b/)
    expect(guide.lede).toContain('A tile pulls straight off again and leaves its clips behind.')
    expect(guide.lede).not.toMatch(/keys/)
  })
})

describe('mountingGuide: keys and clips', () => {
  it('adds the keys as the tiles go on, and says a tile still comes off alone', () => {
    const guide = mountingGuide(bothInput())
    expect(guide.system).toBe('both')
    const keys = guide.steps.map((step) => step.key)
    expect(keys).toEqual(['fit', 'clips-in', 'tape', 'start', 'keys-as-you-go', 'press-on', 'screws', 'remove'])
    expect(stepText(guide, 'keys-as-you-go')).toContain('You have 17 keys to fit, and 3 spares.')
    expect(stepText(guide, 'keys-as-you-go')).toContain('go over them as you press it on.')
    expect(stepText(guide, 'press-on')).toContain('following the letters, each row from left to right.')
    expect(stepText(guide, 'remove')).toContain('comes off on its own: press any key back into its slot before you refit it.')
    expect(guide.lede).toMatch(/The keys lock neighbouring tiles edge to edge as you go\.$/)
  })

  it('names both clearances in step 1, and neither test in it', () => {
    const fit = stepText(mountingGuide(bothInput()), 'fit')
    expect(fit).toContain(`clearance per side: keys ${fine(fitClearance('standard', 'key'))} and clips ${fine(fitClearance('standard', 'clip'))}`)
    expect(fit).toContain('A new fit remakes only those parts, never the tiles.')
    expect(fit).toContain('it prints the keys and clips in all three fits on small coupons')
    expect(fit).not.toMatch(/coupons A and B|smooth board/)
  })
})

describe('mountingGuide: pieces with no clip', () => {
  const [a, b, c] = FIXED_PLAN.pieces.slice(-3)
  const mount: MountPlan = { ...FIXED_MOUNT, unmountedPieceIds: [a.id, b.id, c.id] }

  it('glues them level with their neighbours, or glues their keys in, and counts only the tiles with clips', () => {
    const both = mountingGuide(bothInput({ mount, join: KEYED(40, { unkeyedPieceIds: [c.id] }) }))
    const keys = both.steps.map((step) => step.key)
    expect(keys.indexOf('no-clip')).toBe(keys.indexOf('press-on') + 1)
    const step = both.steps.find((s) => s.key === 'no-clip')
    expect(step?.title).toBe('Fix the pieces with no clip')
    expect(step?.drawing).toBeNull()
    expect(step?.body).toEqual([
      `Pieces ${a.mark} and ${b.mark} have no room for a clip, but their keys hold them in line with the tiles around (not against the wall): put a drop of glue in their key slots as they go up.`,
      `Piece ${c.mark} has no room for a clip: glue it to the wall when its turn comes, with a thin glue or the same tape, so it sits level with the tiles around it.`,
    ])
    const onTiles = FIXED_PLAN.placements.filter((p) => ![a.id, b.id, c.id].includes(p.pieceId)).length
    expect(onTiles).toBeLessThan(FIXED_PLAN.placements.length)
    expect(stepText(both, 'clips-in')).toContain(`for ${onTiles} tiles`)

    const clipsOnly = mountingGuide(clipsInput({ mount }))
    expect(clipsOnly.steps.find((s) => s.key === 'no-clip')?.body).toEqual([
      `Pieces ${a.mark}, ${b.mark} and ${c.mark} have no room for a clip: glue them to the wall when their turn comes, with a thin glue or the same tape, so they sit level with the tiles around them.`,
    ])
  })

  it('has no such step when every piece takes a clip', () => {
    expect(mountingGuide(clipsInput()).steps.some((step) => step.key === 'no-clip')).toBe(false)
  })
})

// The tabs print nothing, cannot be assembled off the wall and carry the fit inside the tile, so all three
// facts are worded here and only here. No click and no detent exists to describe: what the maker gets instead
// is that a tile at the wrong joint will not lie down.
describe('mountingGuide: tabs on a glued wall', () => {
  const marksOf = (ids: readonly string[]) => TABBED_PLAN.pieces.filter((p) => ids.includes(p.id)).map((p) => p.mark)

  it('goes fit test, start line, setting the tiles, then the pieces nothing locks', () => {
    const guide = mountingGuide(tabsInput())
    expect(guide.system).toBe('tabs')
    expect(guide.steps.map((step) => [step.key, step.drawing])).toEqual([
      ['fit', 'fit-test'],
      ['start', 'start-line'],
      ['tabs-in', 'tabs-in'],
      ['no-lock', null],
    ])
    expect(guide.steps.map((step) => step.title)).toEqual([
      'Set the fit before you print anything',
      'Draw the start line',
      'Set the tiles, bottom row first and left to right',
      'The pieces no tab locks',
    ])
    // Nothing is printed for them, and nothing is clicked into anything.
    expect(allText(guide)).not.toMatch(/\bclip|\bkeys?\b|\bclick/i)
  })

  it('promises what the keys promise and no more: the joints, never the wall', () => {
    const guide = mountingGuide(tabsInput())
    expect(guide.lede).toBe(
      'A tab in the back of each tile goes into the socket of the tile beside it as the tile is pressed on, so the tiles ' +
        'of a row lock edge to edge, in line, with even joints. Nothing is printed for them. The adhesive or the tape ' +
        'holds the tiles to the wall, and nothing locks one row to the next, so each row is its own strip.',
    )
    expect(guide.needs).toBe(
      'Tile adhesive or double-sided mounting tape, a spirit or laser level, and a straight batten for the bottom row to stand on.',
    )
    expect(guide.lede).not.toMatch(/tabs? (hold|keep) (the tiles|them) (on|to) the wall/i)
  })

  it('sets the tiles one at a time, left to right, and says why they cannot be panelled up', () => {
    const body = mountingGuide(tabsInput()).steps.find((step) => step.key === 'tabs-in')?.body ?? []
    expect(body[0]).toContain('each row from left to right')
    expect(body[0]).toContain('Each tile goes on after the one to its left')
    expect(body[0]).toContain('the tab standing in that joint goes into the socket in its back as the tile lies down')
    expect(body[0]).toContain('Hold each tile against its neighbour as you press it on, so the joints close.')
    // The feedback that exists, in place of the click that does not: the head never passes the throat.
    expect(body[1]).toContain('nothing has to be pressed in after it')
    expect(body[1]).toContain("The tab's head is wider than the throat of its socket at every depth")
    expect(body[1]).toContain('stands proud instead of lying down, until it is eased along and drops in')
    expect(body[2]).toContain('cannot be laid out face down on a table and lifted on')
    expect(body[2]).toContain('the sockets open away from the table')
  })

  it('names the pieces no tab locks and what to do with them, by what the plan found', () => {
    const marks = marksOf(TABBED_TAB.unlockedPieceIds)
    expect(marks).toHaveLength(3)
    expect(mountingGuide(tabsInput()).steps.find((step) => step.key === 'no-lock')?.body).toEqual([
      `Pieces ${listText(marks)} have no room for a socket, so no tab locks them to the tiles beside them: glue them to the tiles beside them as the row goes up.`,
    ])
    // Every joint locked: no such step.
    expect(mountingGuide(tabsInput({ tab: TABBED(18) })).steps.some((step) => step.key === 'no-lock')).toBe(false)
  })

  it('opens with the fit, and says the reprint a new one costs is the tiles', () => {
    const fit = stepText(mountingGuide(tabsInput()), 'fit')
    expect(fit).toContain(`Your tiles are made at Standard, the fit with two notches (clearance per side: sockets ${fine(0.3)}).`)
    expect(fit).toContain('The socket is cut into the tile itself, so a new fit remakes every tile.')
    expect(fit).toContain('it prints the sockets in all three fits on small coupons')
    expect(fit).toContain('because the socket is cut into the tile and a fit changed after that means printing the tiles again')
    expect(fit).not.toMatch(/never of a tile/)
  })

  it('leaves the wall glued when the tabs place nothing, whatever the design asks for', () => {
    const guide = mountingGuide(tabsInput({ tab: NO_TABS }))
    expect(guide.system).toBe('glue')
    expect(guide.steps).toEqual([])
  })
})

describe('mountingGuide: tabs and wall clips', () => {
  const input = (patch: Partial<GuideInput> = {}): GuideInput =>
    clipsInput({ config: { ...CLIPS_ONLY, lock: 'tabs' as const }, tab: TABBED(20), ...patch })

  it('keeps the clips path step for step, with no step of its own for the tabs', () => {
    const guide = mountingGuide(input())
    expect(guide.system).toBe('clips-tabs')
    expect(guide.steps.map((step) => step.key)).toEqual(['fit', 'clips-in', 'tape', 'start', 'press-on', 'screws', 'remove'])
    expect(guide.lede).toMatch(/The tabs lock neighbouring tiles edge to edge as each one goes on, and a row comes off again from its right-hand end\.$/)
  })

  it('adds the order and the tab to pressing on, and says which end a row comes off from', () => {
    const guide = mountingGuide(input())
    expect(stepText(guide, 'press-on')).toContain('following the letters, each row from left to right.')
    expect(stepText(guide, 'press-on')).toContain('Each tile goes on after the one to its left')
    expect(stepText(guide, 'press-on')).toContain("The tab's head is wider than the throat of its socket at every depth")
    // A tile lifts its own socket off the tab beside it, but its own tab cannot rise past the ceiling of the
    // socket it stands in, so the tile to its right comes off first. Both steps that take a tile off say so.
    const off =
      'The socket in its back comes off the tab beside it as the tile goes, but its own tab sits under the socket of the ' +
      'tile to its right, so take that one off first: a row comes off from its right-hand end and goes back on left to ' +
      'right, with nothing to press in either way.'
    expect(stepText(guide, 'remove')).toContain(off)
    expect(stepText(guide, 'screws')).toContain(off)
    expect(stepText(guide, 'remove')).not.toContain('it still comes off on its own')
    // The clips keep their own words: the start line still reads the wall's flatness first.
    expect(stepText(guide, 'start')).toMatch(/Wipe the wall clean and dry/)
    expect(stepText(guide, 'fit')).toContain(`clearance per side: clips ${fine(fitClearance('standard', 'clip'))} and sockets ${fine(0.3)}`)
    expect(stepText(guide, 'fit')).toContain('A new fit remakes the clips and, because the socket is cut into the tile itself, every tile.')
  })

  it('glues a piece with no clip into its socket, the way it glues a keyed one into its slots', () => {
    const [a, b] = TABBED_PLAN.pieces
    const guide = mountingGuide(
      input({ plan: TABBED_PLAN, mount: { ...FIXED_MOUNT, unmountedPieceIds: [a.id, b.id] }, tab: TABBED(20, { unlockedPieceIds: [b.id] }) }),
    )
    expect(guide.steps.find((step) => step.key === 'no-clip')?.body).toEqual([
      `Piece ${a.mark} has no room for a clip, but the tab in its socket holds it in line with the tiles around (not against the wall): put a drop of glue in its socket as it goes up.`,
      `Piece ${b.mark} has no room for a clip: glue it to the wall when its turn comes, with a thin glue or the same tape, so it sits level with the tiles around it.`,
    ])
    // Piece B has neither a clip nor a tab, so the step above already tells it to glue itself to the wall:
    // it is not named again here, or the maker would be sent two ways for one piece.
    expect(guide.steps.some((step) => step.key === 'no-lock')).toBe(false)
  })

  it('names a piece its own clips do carry but no tab locks, and says it goes up on them', () => {
    const [a, b] = TABBED_PLAN.pieces
    const guide = mountingGuide(input({ plan: TABBED_PLAN, tab: TABBED(20, { unlockedPieceIds: [a.id, b.id] }) }))
    expect(guide.steps.map((step) => step.key)).toContain('no-lock')
    expect(guide.steps.find((step) => step.key === 'no-lock')?.body).toEqual([
      `Pieces ${a.mark} and ${b.mark} have no room for a socket, so no tab locks them to the tiles beside them: they go up on their own clips, level with the tiles around them.`,
    ])
  })
})

describe('mountingSummary', () => {
  it('says a glued wall in the words of its note', () => {
    const glue = input(DEFAULT_CONFIG)
    const lines = mountingSummary(glue)
    expect(lines).toEqual([
      'Put tile adhesive or double-sided mounting tape straight onto the flat backs.',
      'Set the tiles from the bottom row up, starting at the setting-out point (SO) on the tiling plan.',
    ])
    // The same sentence as the guide's, less the file name the studio has not made yet.
    expect(mountingGuide(glue).lede).toContain(lines[1].replace('tiling plan', 'tiling plan (setting-out-plan.svg)'))
    const strip = input(design({ surface: { width: 1000, height: 640 } }))
    expect(mountingSummary(strip)[1]).toBe('Set the whole tiles first, from the setting-out point (SO) on the tiling plan, then the cut pieces.')
  })

  it('says each fixed wall in three lines, in the words of its steps', () => {
    const keys = mountingSummary({ ...input(design({ lock: 'keys' })), join: KEYED(4), accessories: KEY_PARTS })
    expect(keys).toEqual([
      'Print the fit test and set the fit.',
      'Lay the tiles face down and press a key into each pair of slots that meet across a joint.',
      'Put the panel up with adhesive or tape, bottom edge first, on a level line.',
    ])
    const clips = mountingSummary(clipsInput())
    expect(clips).toEqual([
      'Print the fit test and set the fit.',
      'Click a clip into each pocket until its stops touch the bottom, and put thin double-sided tape on it.',
      'Press the tiles on, bottom row first: the clips stay where the tile puts them.',
    ])
    const both = mountingSummary(bothInput())
    expect(both[2]).toBe('Press the tiles on, bottom row first, with keys in the slots that meet a tile not up yet.')
    // Every line's words come from the guide itself: its step titles and bodies.
    const guide = allText(mountingGuide(clipsInput()))
    for (const phrase of [
      'print the fit test first',
      'Press the tiles on, bottom row first',
      'The clips stay where the tile puts them',
      'thin double-sided tape',
      'click',
      'its stops touch the bottom',
    ]) {
      expect(guide.toLowerCase()).toContain(phrase.toLowerCase())
    }
    expect(allText(mountingGuide(bothInput()))).toContain('meet a tile not up yet')
    for (const lines of [keys, clips, both]) expect(lines.length).toBeLessThanOrEqual(3)
  })

  it('says a tabbed wall in three lines, and says the fit is in the tile in the first', () => {
    const tabs = mountingSummary(tabsInput())
    expect(tabs).toEqual([
      'Print the fit test and set the fit: the socket is cut into the tile itself.',
      'Glue or tape the tiles on, bottom row first and each row from left to right.',
      'Bring each tile square to the wall over the tab of the tile to its left, so the tab goes into the socket in its back.',
    ])
    const clipped = mountingSummary(clipsInput({ config: { ...CLIPS_ONLY, lock: 'tabs' }, tab: TABBED(20) }))
    expect(clipped[0]).toBe(tabs[0])
    expect(clipped[2]).toBe("Press the tiles on, bottom row first and each row from left to right, so each tab goes into its neighbour's socket.")
    // Every line's words come from the guide itself.
    const guide = allText(mountingGuide(tabsInput()))
    for (const phrase of ['the socket is cut into the tile itself', 'each row from left to right', 'the socket in its back']) {
      expect(guide.toLowerCase()).toContain(phrase.toLowerCase())
    }
    for (const lines of [tabs, clipped]) expect(lines.length).toBeLessThanOrEqual(3)
  })
})

describe('mountingGuide on the real plans', () => {
  const real = (config: DesignConfig): GuideInput => {
    const plan = computeLayout(layoutInputOf(config, printerById(config.printerId)))
    return { config, plan, mount: mountPlan(config, plan), join: joinPlan(config, plan), tab: tabPlan(config, plan), accessories: accessoryParts(config, plan) }
  }

  it('reads a keyed wall on clips: every mark from accessoryParts, no gaps in the words', () => {
    for (const config of [design({ mount: 'clips', lock: 'keys' }), design({ mount: 'clips' })]) {
      const source = real(config)
      const guide = mountingGuide(source)
      expect(guide.system).toBe(config.lock === 'keys' ? 'both' : 'clips')
      expect(source.mount.clips).toBeGreaterThan(0)
      const text = allText(guide)
      expect(text).not.toMatch(/undefined|NaN|\?|\(\)/)
      const clip = source.accessories.find((p) => p.kind === 'clip' && p.group === 'mount')
      expect(clip?.mark).toBe('C1')
      expect(text).toContain('a clip (C1)')
      // The wall's guide points at the fit test; only the fit test's own guide names its marks.
      expect(source.accessories.filter((p) => p.group === 'fit-test').length).toBeGreaterThan(0)
      expect(text).toContain('print the fit test first')
      expect(text).not.toMatch(/\bF\d/)
      expect(text).toContain(`That is ${formatNumber(source.mount.clips, 0)} clips`)
      expect(mountingSummary(source)).toHaveLength(3)
    }
  })
})

describe('the copy rules', () => {
  const variants = (): MountingGuide[] => [
    mountingGuide(input(DEFAULT_CONFIG)),
    mountingGuide({ ...input(design({ lock: 'keys', joint: 2 })), join: KEYED(3, { unkeyedSeams: 1 }), accessories: KEY_PARTS }),
    mountingGuide(clipsInput({ config: { ...CLIPS_ONLY, joint: 2 } })),
    mountingGuide(clipsInput({ mount: { ...FIXED_MOUNT, unmountedPieceIds: [FIXED_PLAN.pieces[0].id] } })),
    mountingGuide(bothInput()),
  ]
  /** The tabbed walls, which are the only guides that may say "tab" at all. */
  const tabVariants = (): MountingGuide[] => [
    mountingGuide(tabsInput()),
    mountingGuide(tabsInput({ config: { ...TABBED_CONFIG, joint: 2 } })),
    mountingGuide(clipsInput({ config: { ...CLIPS_ONLY, lock: 'tabs' }, tab: TABBED(20) })),
  ]
  const summaries = (): string[] => [
    ...mountingSummary(input(DEFAULT_CONFIG)),
    ...mountingSummary(clipsInput()),
    ...mountingSummary(bothInput()),
    ...mountingSummary({ ...input(design({ lock: 'keys' })), join: KEYED(4), accessories: KEY_PARTS }),
  ]
  const tabSummaries = (): string[] => [
    ...mountingSummary(tabsInput()),
    ...mountingSummary(clipsInput({ config: { ...CLIPS_ONLY, lock: 'tabs' }, tab: TABBED(20) })),
  ]
  const everything = (): string[] => [...variants().map(allText), ...tabVariants().map(allText), ...summaries(), ...tabSummaries()]

  it('names no rail, snap, gauge or mounting plan anywhere', () => {
    for (const text of everything()) {
      expect(text).not.toMatch(/\brails?\b|\bsnaps?\b|\bgauges?\b|mounting.plan|snap line/i)
    }
  })

  it('keeps the stops: nothing to break off a clip, and never claims no gap behind a tile', () => {
    for (const text of [...variants().map(allText), ...summaries()]) {
      // A clip's stops are not tabs, and nothing on a clipped or keyed wall is: only a tabbed one may say it.
      expect(text).not.toMatch(/\btabs?\b/i)
    }
    for (const text of everything()) {
      expect(text).not.toMatch(/\bbreak|\bsnap (it|them) off/i)
      expect(text).not.toMatch(/no gap|nothing behind|right on the wall|back (flat )?(on|against) the wall/i)
    }
  })

  it('writes no em-dash, no flush, no flat panel and no timing or strength figure', () => {
    for (const text of everything()) {
      expect(text).not.toContain(String.fromCharCode(0x2014))
      expect(text).not.toMatch(/\bflush\b|flat panel/i)
      expect(text).not.toMatch(/\d\s*(sec|seconds?|min|minutes?|hours?|days?|s|N|kg|kgf|lbs?|newtons?)\b/i)
      // Nothing slides: a tile pushes on and pulls straight off.
      expect(text).not.toMatch(/\bslid(e|es|ing)\b/i)
    }
  })

  it('claims only what keys do: in line, even joints, the wall or the clips keep them flat', () => {
    const keys = allText(mountingGuide({ ...input(design({ lock: 'keys' })), join: KEYED(3), accessories: KEY_PARTS }))
    expect(keys).toMatch(/in line, with even joints/)
    const both = allText(mountingGuide(bothInput()))
    expect(both).toContain('The keys lock neighbouring tiles edge to edge as you go.')
    expect(both).not.toMatch(/keys (hold|keep) (the tiles|them) (on|to) the wall/i)
  })

  it('makes the tabs the keys\' promise, never a click and never a hold on the wall', () => {
    const texts = [
      ...tabVariants().map(allText),
      mountingSummary(tabsInput()).join('\n'),
      mountingSummary(clipsInput({ config: { ...CLIPS_ONLY, lock: 'tabs' }, tab: TABBED(20) })).join('\n'),
    ]
    for (const text of texts) {
      expect(text).toMatch(/\btabs?\b/)
      expect(text).not.toMatch(/tabs? (hold|holds|keep|keeps) (the tiles?|them|it) (on|to|against) the wall/i)
    }
    // A clip clicks into its pocket; a tab never clicks into anything, because it is rigid and nothing gives.
    // Nothing about it is called strong or stiff either: no tab has been printed.
    const aboutTabs = texts.flatMap((text) => text.split(/(?<=[.:])\s+/).filter((sentence) => /\btabs?\b|\bsockets?\b/i.test(sentence)))
    expect(aboutTabs.length).toBeGreaterThan(10)
    for (const sentence of aboutTabs) {
      expect(sentence).not.toMatch(/\bclicks?\b|\bclicked\b|\bdetent\b|\bsnap/i)
      expect(sentence).not.toMatch(/\bstrong|\bstiff|\bfirmly held|\bsecure\b/i)
    }
    // The in-plane promise, in the words the keys already use.
    expect(allText(mountingGuide(tabsInput()))).toMatch(/lock edge to edge, in line, with even joints/)
    // And the one fact no warning may ever report as a fault.
    expect(allText(mountingGuide(tabsInput()))).toContain('nothing locks one row to the next')
  })
})

describe('the shared fixtures (export/testFixings.ts)', () => {
  it('match what the real builders give their wall, but for the key count', () => {
    const real = mountPlan(FIXED_CONFIG, FIXED_PLAN)
    expect(FIXED_MOUNT.clips).toBe(real.clips)
    expect(FIXED_MOUNT.unmountedPieceIds).toEqual(real.unmountedPieceIds)
    expect(FIXED_MOUNT.sites.map((s) => [s.pieceId, s.axis])).toEqual(real.sites.map((s) => [s.pieceId, s.axis]))
    FIXED_MOUNT.sites.forEach((site, i) => {
      expect(site.x).toBeCloseTo(real.sites[i].x, 1)
      expect(site.y).toBeCloseTo(real.sites[i].y, 1)
    })
    const parts = accessoryParts(FIXED_CONFIG, FIXED_PLAN)
    const face = (p: AccessorySpec) => [p.id, p.kind, p.mark, p.label, p.group, p.size, p.printNote]
    expect(FIXED_PARTS.map(face)).toEqual(parts.map(face))
    expect(FIXED_PARTS.find((p) => p.mark === 'C1')?.count).toBe(parts.find((p) => p.mark === 'C1')?.count)
  })

  it('splits into the same two named lists the code has', () => {
    const face = (p: AccessorySpec) => [p.id, p.kind, p.mark, p.label, p.group, p.size, p.printNote]
    expect(FIXED_WALL_PARTS.map(face)).toEqual(wallParts(FIXED_CONFIG, FIXED_PLAN).map(face))
    expect(FIXED_FIT_PARTS.map(face)).toEqual(fitTestFor(FIXED_CONFIG, FIXED_PLAN).map(face))
    // The catalogue is the composition of the two, in that order: the fixture cannot drift from either.
    expect(FIXED_PARTS).toEqual([...FIXED_FIT_PARTS, ...FIXED_WALL_PARTS])
    expect(FIXED_WALL_PARTS.map((p) => p.mark)).toEqual(['C1', 'K1'])
    expect(FIXED_FIT_PARTS.map((p) => p.mark)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'])
  })

  it('holds the tabbed wall to the real builders too: its plan, its fit test and its empty wall list', () => {
    expect(tabPlan(TABBED_CONFIG, TABBED_PLAN)).toEqual(TABBED_TAB)
    // Nothing is printed for the tabs, so the wall's own list is empty and every part is the fit test's.
    expect(wallParts(TABBED_CONFIG, TABBED_PLAN)).toEqual([])
    const face = (p: AccessorySpec) => [p.id, p.kind, p.mark, p.label, p.group, p.size, p.printNote]
    expect(TABBED_FIT_PARTS.map(face)).toEqual(fitTestFor(TABBED_CONFIG, TABBED_PLAN).map(face))
    expect(accessoryParts(TABBED_CONFIG, TABBED_PLAN).map(face)).toEqual(TABBED_FIT_PARTS.map(face))
    // The three right-edge strips are 10 mm wide, under the 11.7 mm a socket needs.
    const unlocked = TABBED_PLAN.pieces.filter((p) => TABBED_TAB.unlockedPieceIds.includes(p.id))
    expect(unlocked).toHaveLength(3)
    for (const piece of unlocked) expect(piece.width).toBe(10)
  })
})

describe('fitChosenText', () => {
  it('names the fit, its notches, the clearance per side and what a new fit remakes', () => {
    for (const fit of ['snug', 'standard', 'loose'] as const) {
      const config = design({ fit })
      const { name, notches } = FIT_MARKS[fit]
      expect(fitChosenText(config, 'both')).toBe(
        `Your keys and clips are made at ${name}, the fit with ${notches} (clearance per side: keys ${fine(fitClearance(fit, 'key'))} and ` +
          `clips ${fine(fitClearance(fit, 'clip'))}). A new fit remakes only those parts, never the tiles.`,
      )
      expect(fitChosenText(config, 'keys')).toContain(`the fit with ${notches} (clearance per side: keys ${fine(fitClearance(fit, 'key'))})`)
      expect(fitChosenText(config, 'keys')).toMatch(/^Your keys are made at .* remakes only those parts, never the tiles\.$/)
      expect(fitChosenText(config, 'clips')).toContain(`(clearance per side: clips ${fine(fitClearance(fit, 'clip'))})`)
      expect(fitChosenText(config, 'clips')).toMatch(/^Your clips are made at .* remakes only those parts, never the tiles\.$/)
    }
  })

  it('puts the tiles on the list for the tabs, because their socket is cut into one', () => {
    for (const fit of ['snug', 'standard', 'loose'] as const) {
      const config = design({ lock: 'tabs', fit })
      const { name, notches } = FIT_MARKS[fit]
      expect(fitChosenText(config, 'tabs')).toBe(
        `Your tiles are made at ${name}, the fit with ${notches} (clearance per side: sockets ${fine(SOCKET_CLEARANCE[fit])}). ` +
          'The socket is cut into the tile itself, so a new fit remakes every tile.',
      )
      expect(fitChosenText(config, 'clips-tabs')).toBe(
        `Your clips and tiles are made at ${name}, the fit with ${notches} (clearance per side: clips ` +
          `${fine(fitClearance(fit, 'clip'))} and sockets ${fine(SOCKET_CLEARANCE[fit])}). A new fit remakes the clips and, ` +
          'because the socket is cut into the tile itself, every tile.',
      )
      // The promise the keys and clips keep, and the one place it is broken.
      expect(fitChosenText(config, 'keys')).toContain('never the tiles')
      expect(fitChosenText(config, 'tabs')).not.toContain('never the tiles')
    }
  })

  it('claims no fit on a glued wall, which carries none', () => {
    expect(fitChosenText(design(), 'glue')).toBe(
      'Fit is set to Standard, the fit with two notches. This wall prints no keys or clips, so nothing carries it.',
    )
  })

  it('is the very sentence step 1 of the wall guide opens with', () => {
    for (const source of [clipsInput(), bothInput()]) {
      const guide = mountingGuide(source)
      expect(guide.steps[0].key).toBe('fit')
      expect(guide.steps[0].body[0]).toBe(fitChosenText(source.config, guide.system))
    }
  })
})

describe('fitTestGuide', () => {
  /** The real fit test of a design, and its guide, as the fit-test page builds them. */
  const fitTest = (config: DesignConfig) => {
    const plan = layout(config)
    const parts = fitTestFor(config, plan)
    const system = fixingSystem(config, mountPlan(config, plan), joinPlan(config, plan), tabPlan(config, plan))
    return { parts, guide: fitTestGuide({ config, parts, system }) }
  }
  const body = (guide: NonNullable<ReturnType<typeof fitTestGuide>>, key: string) => guide.steps.find((s) => s.key === key)?.body.join(' ') ?? ''

  it('has nothing to run when the design prints no fitted part', () => {
    expect(fitTestGuide({ config: DEFAULT_CONFIG, parts: [] })).toBeNull()
    const glued = fitTest(DEFAULT_CONFIG)
    expect(glued.parts).toEqual([])
    expect(glued.guide).toBeNull()
  })

  it('prints, tries the keys, tries the clips, then sets the fit', () => {
    const { parts, guide } = fitTest(design({ mount: 'clips', lock: 'keys' }))
    expect(parts).toHaveLength(8)
    expect(guide?.system).toBe('both')
    expect(guide?.steps.map((step) => [step.key, step.drawing])).toEqual([
      ['fit-print', 'fit-test'],
      ['fit-keys', 'fit-keys'],
      ['fit-clips', 'fit-clips'],
      ['fit-set', null],
    ])
    expect(guide?.steps.map((step) => step.title)).toEqual([
      'Print the fit test',
      'Press a test key across a real joint',
      'Click a coupon onto each test clip',
      'Set the fit you kept',
    ])
    expect(guide?.needs).toBe(
      'The thin double-sided tape you will use on the wall, and a smooth flat board to stick the test clips to (a spare tile, a table top, a piece of board).',
    )
    expect(guide?.lede).toContain('Printed keys and clips have to click into printed slots')
  })

  it('carries the key test and the clip test word for word, with their marks', () => {
    const { guide } = fitTest(design({ mount: 'clips', lock: 'keys' }))
    expect(body(guide!, 'fit-keys')).toBe(
      'Lay test coupons A and B (F1 and F2) face down with their key slots together and the joint closed, then press each ' +
        'test key in across the joint: keep the one that goes in with your thumb and stays. If none will seat with the ' +
        'joint closed, the first layer is bulging: turn on elephant-foot compensation.',
    )
    expect(body(guide!, 'fit-clips')).toBe(
      'Stick the test clips (F3 to F5) flat side down on a smooth board, each with a piece of the tape you will use on the ' +
        'wall, then press test coupon A (F1) onto each one in turn and pull it straight off again: keep the snuggest clip ' +
        'that lets the coupon click on, sit flat on the board and not rattle, and that stays on the board as the coupon ' +
        'comes off. If the tape lets go of a clip before the coupon does, take the next looser clip, or a thin tape that ' +
        'grips better.',
    )
    expect(body(guide!, 'fit-print')).toContain('the coupons face up like a tile, first layer included, the keys and clips flat and solid')
    expect(body(guide!, 'fit-set')).toBe(
      'Set Fit to the one you kept: one notch is snug, two standard, three loose. Then download your keys and clips at that fit.',
    )
  })

  it('drops the step the wall has no fastener for', () => {
    const clips = fitTest(design({ mount: 'clips' }))
    expect(clips.guide?.steps.map((step) => step.key)).toEqual(['fit-print', 'fit-clips', 'fit-set'])
    expect(clips.guide?.system).toBe('clips')
    // One coupon, so it is "the test coupon", not coupon A.
    expect(body(clips.guide!, 'fit-clips')).toContain('then press the test coupon (F1) onto each one in turn')
    expect([clips.guide?.lede, ...(clips.guide?.steps ?? []).flatMap((s) => [s.title, ...s.body])].join(' ')).not.toMatch(/\bkeys?\b/)

    const keys = fitTest(design({ lock: 'keys' }))
    expect(keys.guide?.steps.map((step) => step.key)).toEqual(['fit-print', 'fit-keys', 'fit-set'])
    expect(keys.guide?.system).toBe('keys')
    // Nothing but a thumb is needed to try a key.
    expect(keys.guide?.needs).toBeNull()
    expect(keys.guide?.steps.flatMap((s) => s.body).join(' ')).not.toMatch(/\bclips?\b/)
  })

  it('reads the fasteners off its own parts when no system is given', () => {
    const { parts } = fitTest(design({ mount: 'clips', lock: 'keys' }))
    expect(fitTestGuide({ config: design({ mount: 'clips', lock: 'keys' }), parts })?.system).toBe('both')
    expect(fitTestGuide({ config: design({ mount: 'clips' }), parts: fitTest(design({ mount: 'clips' })).parts })?.system).toBe('clips')
  })

  it('presses each socket coupon down over the tab, and sets the fit before a tile is printed', () => {
    const { parts, guide } = fitTest(design({ lock: 'tabs' }))
    expect(parts).toHaveLength(4)
    expect(guide?.system).toBe('tabs')
    expect(guide?.steps.map((step) => [step.key, step.drawing])).toEqual([
      ['fit-print', 'fit-test'],
      ['fit-tabs', 'fit-tabs'],
      ['fit-set', null],
    ])
    expect(guide?.steps.map((step) => step.title)).toEqual(['Print the fit test', 'Press each socket coupon down over the tab', 'Set the fit you kept'])
    expect(guide?.lede).toBe(
      'The tab in each tile and the socket in the next have to go together, and how tight that is depends on your ' +
        'printer. The fit test prints the socket in all three fits on small coupons of this design, so you can set the ' +
        'fit before you print a single tile.',
    )
    expect(guide?.needs).toBe('A flat, hard surface to press the coupons down on (a table top, a spare tile, a piece of board).')
    expect(body(guide!, 'fit-tabs')).toBe(
      'Lay test coupon A (F1) back down on a flat board, then bring each socket coupon (F2 to F4) down over its tab with ' +
        'the joint closed, one at a time: keep the snuggest one that goes together with both backs flat on the board and ' +
        'leaves no play across the joint. One notch is snug, two standard, three loose. If none will go together with the ' +
        'joint closed, the first layer is bulging: turn on elephant-foot compensation. ' +
        'What you keep here is what the tiles are cut at, so settle it before you print any of them.',
    )
    expect(body(guide!, 'fit-print')).toContain('every coupon face up like a tile, first layer included.')
    expect(body(guide!, 'fit-set')).toBe('Set Fit to the one you kept: one notch is snug, two standard, three loose. Then download your tiles at that fit.')
    // No fastener is printed, so no key or clip step and no key or clip in the words.
    expect([guide?.lede, ...(guide?.steps ?? []).flatMap((step) => [step.title, ...step.body])].join(' ')).not.toMatch(/\bkeys?\b|\bclips?\b/i)
  })

  it('adds the clips to a tabbed wall on clips, and reads the tabs off the socket coupons alone', () => {
    const { parts, guide } = fitTest(design({ mount: 'clips', lock: 'tabs' }))
    expect(guide?.system).toBe('clips-tabs')
    expect(guide?.steps.map((step) => step.key)).toEqual(['fit-print', 'fit-tabs', 'fit-clips', 'fit-set'])
    expect(body(guide!, 'fit-print')).toContain('every coupon face up like a tile, first layer included, the clips flat and solid.')
    expect(body(guide!, 'fit-set')).toContain('download your clips and tiles at that fit')
    // Read off its own parts: the socket coupons are the only witness, since the tabs print no fastener.
    expect(fitTestGuide({ config: design({ mount: 'clips', lock: 'tabs' }), parts })?.system).toBe('clips-tabs')
    expect(fitTestGuide({ config: design({ lock: 'tabs' }), parts: fitTest(design({ lock: 'tabs' })).parts })?.system).toBe('tabs')
  })

  it('keeps the copy rules for the tabs too, with no click and no figure', () => {
    for (const config of [design({ lock: 'tabs' }), design({ mount: 'clips', lock: 'tabs' })]) {
      const { guide } = fitTest(config)
      const text = [guide?.lede, guide?.needs ?? '', ...(guide?.steps ?? []).flatMap((step) => [step.title, ...step.body])].join('\n')
      expect(text).not.toContain(String.fromCharCode(0x2014))
      expect(text).not.toMatch(/undefined|NaN|\(\)/)
      expect(text).not.toMatch(/\brails?\b|\bflush\b|flat panel|\bsnaps?\b/i)
      expect(text).not.toMatch(/\d\s*(sec|seconds?|min|minutes?|hours?|days?|N|kg|kgf|lbs?|newtons?)\b/i)
      // A socket never clicks onto a tab: the coupons are pressed together and read by eye.
      for (const sentence of text.split(/(?<=[.:])\s+/)) {
        if (/\btabs?\b|\bsockets?\b/i.test(sentence)) expect(sentence).not.toMatch(/\bclicks?\b/i)
      }
    }
  })

  it('keeps the copy rules', () => {
    for (const config of [design({ mount: 'clips', lock: 'keys' }), design({ mount: 'clips' }), design({ lock: 'keys' })]) {
      const { guide } = fitTest(config)
      const text = [guide?.lede, guide?.needs ?? '', ...(guide?.steps ?? []).flatMap((step) => [step.title, ...step.body])].join('\n')
      expect(text).not.toContain(String.fromCharCode(0x2014))
      expect(text).not.toMatch(/undefined|NaN|\(\)/)
      expect(text).not.toMatch(/\brails?\b|\btabs?\b|\bflush\b|flat panel/i)
      expect(text).not.toMatch(/\d\s*(sec|seconds?|min|minutes?|hours?|days?|N|kg|kgf|lbs?|newtons?)\b/i)
    }
  })
})

describe('the fit test a non-glued wall always has', () => {
  it('is never empty where the guide sends the maker to it, which is why step 1 has one branch', () => {
    const configs = [
      design({ mount: 'clips' }),
      design({ lock: 'keys' }),
      design({ mount: 'clips', lock: 'keys' }),
      design({ mount: 'clips', lock: 'keys', bevel: 3 }),
      design({ mount: 'clips', lock: 'keys', tile: { width: 50, height: 50, thickness: 4 }, surface: { width: 400, height: 300 } }),
      design({ mount: 'clips', lock: 'keys', tile: { width: 150, height: 150, thickness: 3 } }),
      design({ lock: 'keys', surface: { width: 160, height: 150 } }),
      design({ lock: 'tabs' }),
      design({ mount: 'clips', lock: 'tabs' }),
      design({ lock: 'tabs', joint: 3 }),
      design({ lock: 'tabs', surface: { width: 160, height: 150 } }),
      TABBED_CONFIG,
      FIXED_CONFIG,
      { ...FIXED_CONFIG, lock: 'none' as const },
      DEFAULT_CONFIG,
    ]
    for (const config of configs) {
      const plan = layout(config)
      const wall = wallParts(config, plan)
      const system = fixingSystem(config, mountPlan(config, plan), joinPlan(config, plan), tabPlan(config, plan))
      const parts = fitTestFor(config, plan, wall)
      if (system === 'glue') continue
      expect(parts.length, config.name).toBeGreaterThan(0)
      expect(fitTestGuide({ config, parts, system }), config.name).not.toBeNull()
    }
  })
})
