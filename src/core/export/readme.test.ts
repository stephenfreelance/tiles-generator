import { describe, expect, it } from 'vitest'
import { computeLayout, layoutInputOf } from '../layout'
import { testConfig } from '../geometry/testFields'
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
} from './testFixings'

// The README names the texture through the registry, which another engineer owns; skip until it lands.
const hasRegistry = Object.keys(import.meta.glob('../textures/registry.ts')).length > 0

const plan = computeLayout({
  surface: { width: 1000, height: 800 },
  tile: { width: 150, height: 150 },
  joint: 2,
  layout: { origin: 'balanced', rowOffset: 0.5 },
})

describe.skipIf(!hasRegistry)('buildReadme', () => {
  it('describes the design, the pieces and how to print them', async () => {
    const { buildReadme } = await import('./readme')
    const config = testConfig({
      name: 'Kitchen splashback',
      joint: 2,
      layout: { origin: 'balanced', rowOffset: 0.5 },
    })
    const readme = buildReadme(config, plan, 'stl')

    expect(readme).toContain('Kitchen splashback')
    expect(readme).toContain('150 x 150 x 4 mm')
    expect(readme).toContain('Running bond')
    expect(readme).toContain('setting-out-plan.svg')
    expect(readme).toContain('Print face up')
    expect(readme).toContain('No supports')
    expect(readme).toContain('0.12 to 0.2 mm')
    expect(readme).toContain('3 perimeters')
    expect(readme).toContain('15%')
    expect(readme).toContain('brim')
    expect(readme).toMatch(/tile adhesive|mounting tape/)
    for (const piece of plan.pieces) expect(readme).toContain(piece.mark)
  })

  it('names the color by preset, or as custom, with its hex and nothing about materials', async () => {
    const { buildReadme } = await import('./readme')
    const preset = buildReadme(testConfig({ color: '#C0582F' }), plan, 'stl')
    expect(preset).toMatch(/Color +Terracotta \(#C0582F\)/)
    const custom = buildReadme(testConfig({ color: '#12AB34' }), plan, 'stl')
    expect(custom).toMatch(/Color +Custom \(#12AB34\)/)
    for (const word of ['FILAMENT', 'Line', 'Matte', 'Silk', 'PETG']) expect(custom).not.toContain(word)
  })

  it('names the corner the whole tiles are really read from', async () => {
    const { buildReadme } = await import('./readme')
    const layout = { origin: 'corner', rowOffset: 0 } as const
    const cornerPlan = computeLayout({
      surface: { width: 1000, height: 800 },
      tile: { width: 150, height: 150 },
      joint: 0,
      layout,
    })
    // This wall really does cut the bottom and the right, so the whole tiles start at the top-left.
    expect(cornerPlan.pieces.map((p) => p.label)).toEqual(
      expect.arrayContaining(['Bottom edge', 'Right edge', 'Bottom-right corner']),
    )
    const readme = buildReadme(testConfig({ layout, surface: { width: 1000, height: 800 } }), cornerPlan, 'stl')
    expect(readme).toContain('Set out from the left edge, cuts on the right and bottom edges')
    // Step 2 measures the same set-out point the plan and the studio draw, above the bottom strip.
    expect(readme.replace(/\s+/g, ' ')).toContain('measure 50 mm up from the bottom edge at the left and draw a level line')
    expect(readme).not.toContain('top-left')
    // The old sheet sent the installer to the corner where the narrow cuts actually go.
    expect(readme).not.toContain('bottom-left corner')
  })

  it('names every cut edge of a running bond, and does not leave its cuts for last', async () => {
    const { buildReadme } = await import('./readme')
    const layout = { origin: 'corner', rowOffset: 0.3333 } as const
    const surface = { width: 1250, height: 640 }
    const tile = { width: 100, height: 100, thickness: 4 }
    const bondPlan = computeLayout({ surface, tile, joint: 0, layout })
    const readme = buildReadme(testConfig({ surface, tile, joint: 0, layout }), bondPlan, 'stl')
    expect(readme).toContain('cuts on the right, bottom and left edges')
    expect(readme.replace(/\s+/g, ' ')).toContain('Lay each row from its first piece')
    expect(readme).not.toContain('Lay the full tiles first')
  })

  it('lists one file line per piece and never uses an em-dash', async () => {
    const { buildReadme } = await import('./readme')
    const { pieceFileName } = await import('./filenames')
    const readme = buildReadme(testConfig(), plan, 'step')
    for (const piece of plan.pieces) expect(readme).toContain(pieceFileName(piece, 'step'))
    expect(readme).not.toContain('\u2014')
  })
})

describe.skipIf(!hasRegistry)('buildReadme with edges, keys and wall clips', () => {
  const fixed = { parts: FIXED_PARTS, mount: FIXED_MOUNT, join: FIXED_JOIN }
  const noClips = { clips: 0, sites: [], unmountedPieceIds: [] }
  const noKeys = { keys: 0, sites: [], unkeyedSeams: 0, unkeyedPieceIds: [] }
  /** The design's parts without the clips, as a keyed wall would print them: its coupons hold key slots only. */
  const keyParts = FIXED_PARTS.filter((p) => p.kind === 'key' || (p.kind === 'fit-test' && p.id.includes('-k'))).map((p) =>
    p.id === 'fit-coupon-c-k' ? { ...p, id: 'fit-coupon-k', label: 'Test coupon A with a key slot' } : p,
  )
  /** The design's parts without the keys: one coupon, with a clip pocket only. */
  const clipParts = FIXED_PARTS.filter((p) => p.kind === 'clip' || p.id === 'fit-coupon-c-k').map((p) =>
    p.id === 'fit-coupon-c-k' ? { ...p, id: 'fit-coupon-c', label: 'Test coupon with a clip pocket' } : p,
  )
  const flatten = (text: string) => text.replace(/\s+/g, ' ')

  it('adds nothing to a plain glued design', async () => {
    const { buildReadme } = await import('./readme')
    const config = testConfig()
    const readme = buildReadme(config, plan, 'stl')
    expect(buildReadme(config, plan, 'stl', { parts: [], mount: noClips, join: noKeys })).toBe(readme)
    expect(readme).toMatch(/Bevel +0\.6 mm chamfer on every tile edge/)
    expect(readme).toContain('3 perimeters, so the chamfered edges stay crisp.')
    for (const section of ['EDGES', 'KEYS', 'CLIPS', 'clip', 'Printed parts', 'mounting-plan', 'fit-test', 'Elephant foot']) {
      expect(readme).not.toContain(section)
    }
    expect(readme).toContain('MOUNTING\n  Glue the tiles with tile adhesive')
  })

  it("keeps the default design's files, laying out, printing and mounting byte for byte", async () => {
    const { buildReadme } = await import('./readme')
    const { DEFAULT_CONFIG } = await import('../config')
    const readme = buildReadme(DEFAULT_CONFIG, computeLayout(layoutInputOf(DEFAULT_CONFIG)), 'stl')
    expect(readme.slice(readme.indexOf('MODELS (STL)'))).toBe(
      [
        'MODELS (STL)',
        '  Mark  Piece                     Size            Copies  File',
        '  A     Full tile                 150 x 150 mm    32      A_full-tile_150x150_x32.stl',
        '',
        '  setting-out-plan.svg    Where every piece goes, with its mark and size.',
        '  README.txt              This file.',
        '',
        'LAYING OUT',
        '  1. Open setting-out-plan.svg. It shows the surface seen from the front, with each',
        '     tile position marked A, B, C and so on, and the cut pieces dimensioned.',
        '  2. Start in the bottom-left corner, at the setting-out point marked SO on the plan.',
        '  3. Lay the full tiles first, working from the bottom up, then fill the edges with the',
        '     cut pieces. Every cut piece carries the slice of pattern it replaces, so the relief',
        '     runs continuously across the joints when each piece sits on its mark.',
        '',
        'PRINTING',
        '  Print face up, relief upwards, flat on the plate. No supports are needed:',
        '  the relief has no overhangs.',
        '  Layer height    0.12 to 0.2 mm. Thinner layers show more of the relief.',
        '  Walls           3 perimeters, so the chamfered edges stay crisp.',
        '  Infill          15%, gyroid or grid.',
        '  Brim            Add a brim for the small cut pieces; they have little bed contact.',
        '  Filament        Any PLA in the color listed under SURFACE.',
        '',
        'MOUNTING',
        '  Glue the tiles with tile adhesive, or with double-sided mounting tape for a',
        '  removable finish. Check each piece against the plan before the adhesive sets.',
        '',
      ].join('\n'),
    )
  })

  it('numbers the very steps the download page shows, word for word, for keys and clips', async () => {
    const { buildReadme } = await import('./readme')
    const { mountingGuide } = await import('../fixing/guide')
    const readme = buildReadme(FIXED_CONFIG, FIXED_PLAN, 'stl', fixed)
    const flat = flatten(readme)
    const guide = mountingGuide({ config: FIXED_CONFIG, plan: FIXED_PLAN, mount: FIXED_MOUNT, join: FIXED_JOIN, tab: NO_TABS, accessories: FIXED_PARTS })
    expect(guide.system).toBe('both')
    expect(readme).toContain('\nMOUNTING ON WALL CLIPS\n')
    // The lede as the guide words it, and nothing after it.
    expect(flat).toContain(`MOUNTING ON WALL CLIPS ${guide.lede} You will need ${guide.needs}`)
    expect(guide.steps.length).toBeGreaterThan(5)
    guide.steps.forEach((step, i) => expect(flat).toContain(`${i + 1}. ${step.title}. ${step.body.join(' ')}`))
    // Numbered in order, from 1, under "Steps", and nothing numbered after the last.
    const section = readme.slice(readme.indexOf('\nMOUNTING ON WALL CLIPS\n'))
    const numbers = [...section.matchAll(/\n {2}(\d+)\. /g)].map((m) => Number(m[1]))
    expect(numbers).toEqual(guide.steps.map((_, i) => i + 1))
    expect(section).toContain('\n  Steps\n  1. ')
  })

  it('says nothing of rails, snaps, gauges or a mounting plan, and keeps its copy rules', async () => {
    const { buildReadme } = await import('./readme')
    for (const config of [FIXED_CONFIG, { ...FIXED_CONFIG, lock: 'none' as const }]) {
      for (const format of ['stl', 'step'] as const) {
        const readme = buildReadme(config, FIXED_PLAN, format, config.lock === 'keys' ? fixed : { ...fixed, parts: clipParts, join: noKeys })
        expect(readme).not.toMatch(/\brails?\b|\bsnaps?\b|gauge|mounting-plan|flush|flat panel/i)
        // No invented strength figures, no em-dash, and the prose stays within the file's measure.
        expect(readme).not.toMatch(/\d+ ?(N|kg|kgf|lb)\b/)
        expect(readme).not.toContain('\u2014')
        const prose = readme.split('\n').filter((line) => !/^ {2}\S+ {2,}\S/.test(line) && !/^ {20,}\S/.test(line))
        for (const line of prose) expect(line.length).toBeLessThanOrEqual(90)
        // A length never parts from its unit at a line break ("5" at the end of one line, "mm" on the next).
        expect(readme).not.toMatch(/\d\n +mm\b/)
        expect(readme).not.toContain('\u00a0')
      }
    }
  })

  it('lists every printed part with its folder, and the documents without a mounting plan', async () => {
    const { buildReadme } = await import('./readme')
    const { accessoryZipPath } = await import('./filenames')
    const readme = buildReadme(FIXED_CONFIG, FIXED_PLAN, 'step', fixed)
    for (const part of FIXED_PARTS) expect(readme).toContain(accessoryZipPath(part, 'step'))
    expect(readme).toContain('fit-test/F1_')
    expect(readme).toContain('mount/C1_wall-clip_standard-fit_x29.step')
    expect(readme).toContain('join/K1_key_15.8mm_x20.step')
    const documents = readme.slice(readme.indexOf('  setting-out-plan.svg'), readme.indexOf('\nLAYING OUT'))
    expect(documents).toBe(
      '  setting-out-plan.svg    Where every piece goes, with its mark and size.\n  README.txt              This file.\n',
    )
    // Each kind of part gets its print advice, from the wall's own part.
    const flat = flatten(readme)
    const clip = FIXED_PARTS.find((p) => p.mark === 'C1')!
    const key = FIXED_PARTS.find((p) => p.mark === 'K1')!
    expect(flat).toContain(`Wall clips ${clip.printNote}`)
    expect(flat).toContain(`Keys ${key.printNote}`)
    // The fit test is not this zip's business any more: it has its own page, its own zip and its own README.
    expect(flat).not.toContain('Fit test ')
    expect(flat).toContain('Printed parts: set the fit first (step 1 below), then print them.')
    expect(flat).toContain("Elephant foot Turn on your slicer's elephant-foot compensation")
  })

  it('keeps the parts table in its columns, a long label on a line of its own, sizes to the tenth', async () => {
    const { buildReadme } = await import('./readme')
    const readme = buildReadme(FIXED_CONFIG, FIXED_PLAN, 'stl', fixed)
    const table = readme.slice(readme.indexOf('  Printed parts, each in its folder:'))
    const lines = table.split('\n').slice(1, 14)
    const sizeColumn = lines[0].indexOf('Size')
    expect(lines[1]).toBe('  F1    Test coupon A with a clip pocket and a key slot')
    expect(lines[2].indexOf('67 x 23 x 6.6 mm')).toBe(sizeColumn)
    // A wall clip 14.54 mm wide reads to the tenth.
    const clipRow = lines.find((line) => line.startsWith('  C1    Wall clip, standard fit'))!
    expect(clipRow.indexOf('48 x 14.5 x 2.8 mm')).toBe(sizeColumn)
    expect(table).not.toContain('14.54')
    // Every row's copies and file start in the same columns.
    const copies = lines[0].indexOf('Copies')
    for (const line of lines.slice(4, 12)) expect(line.slice(copies - 2, copies)).toBe('  ')
  })

  it('sends a wall on clips to the start line and its own order, not to the glue setting-out point', async () => {
    const { buildReadme } = await import('./readme')
    for (const config of [FIXED_CONFIG, { ...FIXED_CONFIG, lock: 'none' as const }]) {
      const flat = flatten(buildReadme(config, FIXED_PLAN, 'stl', config.lock === 'keys' ? fixed : { ...fixed, parts: clipParts, join: noKeys }))
      expect(flat).toContain('2. With wall clips the start line sets the wall out, not the setting-out point (SO) the plan marks for glue')
      expect(flat).toContain('follow MOUNTING ON WALL CLIPS below.')
      expect(flat).toContain('3. Press the tiles on row by row from the bottom up, each row from its first piece')
      expect(flat).toContain('in the order MOUNTING ON WALL CLIPS gives.')
      expect(flat).not.toContain('Lay the full tiles first')
      expect(flat).not.toContain('MOUNTING WITH KEYS')
    }
  })

  it('has the keys lock the tiles in line while the clips and the wall do the rest', async () => {
    const { buildReadme } = await import('./readme')
    const flat = flatten(buildReadme(FIXED_CONFIG, FIXED_PLAN, 'stl', fixed))
    expect(flat).toContain('KEYS BETWEEN TILES')
    expect(flat).toContain('17 keys go between them. Print the key file (join/K1_key_15.8mm_x20.stl) 20 times, spares included.')
    expect(flat).toContain('The keys lock neighbouring tiles edge to edge in the plane of the wall: in line, with even joints.')
    expect(flat).toContain('They do not hold anything to the wall: the clips do, and the wall keeps the tiles flat.')
    expect(flat).toContain('They go in as the tiles go up: see the steps under MOUNTING ON WALL CLIPS.')
    expect(flat).not.toContain('keyed panel')
    // Clips alone: no keys section, and no keys in the steps.
    const clipsOnly = flatten(buildReadme({ ...FIXED_CONFIG, lock: 'none' as const }, FIXED_PLAN, 'stl', { ...fixed, parts: clipParts, join: noKeys }))
    expect(clipsOnly).not.toContain('KEYS BETWEEN TILES')
    expect(clipsOnly).not.toMatch(/\bkeys?\b/i)
    expect(clipsOnly).toContain('MOUNTING ON WALL CLIPS')
  })

  it('names the pieces with no clip, as the guide does, and a keyless piece on its clips alone', async () => {
    const { buildReadme } = await import('./readme')
    const { mountingGuide } = await import('../fixing/guide')
    const [first, second] = FIXED_PLAN.pieces
    const mount = { ...FIXED_MOUNT, unmountedPieceIds: [first.id] }
    const join = { ...FIXED_JOIN, unkeyedPieceIds: [first.id, second.id] }
    const flat = flatten(buildReadme(FIXED_CONFIG, FIXED_PLAN, 'stl', { ...fixed, mount, join }))
    const guide = mountingGuide({ config: FIXED_CONFIG, plan: FIXED_PLAN, mount, join, tab: NO_TABS, accessories: FIXED_PARTS })
    const noClip = guide.steps.find((step) => step.body.join(' ').includes(first.mark) && step.key !== 'fit')
    expect(noClip).toBeDefined()
    expect(flat).toContain(`${noClip!.title}. ${noClip!.body.join(' ')}`)
    // The keys section leaves the piece with neither to that step, and says the other goes up on its clips.
    expect(flat).toContain(`Piece ${second.mark} has no joint long enough for a key: it goes up on its clips alone.`)
    expect(flat).not.toContain(`Piece ${first.mark} has no joint long enough for a key`)
    expect(flat).not.toContain('to the tiles beside')
  })

  it('explains the keys, the fit and a permanent panel on a glued wall', async () => {
    const { buildReadme } = await import('./readme')
    const config = { ...FIXED_CONFIG, mount: 'glue' as const }
    const flat = flatten(buildReadme(config, FIXED_PLAN, 'stl', { parts: keyParts, mount: noClips, join: FIXED_JOIN }))
    expect(flat).toContain('KEYS BETWEEN TILES')
    expect(flat).toContain('17 keys go between them. Print the key file (join/K1_key_15.8mm_x20.stl) 20 times, spares included.')
    expect(flat).toContain('A new fit remakes only those parts, never the tiles.')
    expect(flat).toContain('print the fit test first: it prints the keys in all three fits on small coupons')
    expect(flat).toContain('Press a key into each pair of slots that meet across a joint')
    expect(flat).toContain('put a drop of glue in each slot before its key')
    expect(flat).toContain('MOUNTING WITH KEYS')
    expect(flat).toContain('glue or tape the keyed tiles to the wall, bottom edge first, on the line.')
    // Keys set the wall out from the panel's bottom edge, as the tiling plan's notes say, not from SO.
    expect(flat).toContain(
      "2. With keys the panel's bottom edge sets the wall out, not the setting-out point (SO) the plan marks for glue: draw a level line where the bottom edge of the surface will be and put the panel up with its bottom edge on it.",
    )
    expect(flat).toContain('The keys set the order: key every piece to its neighbours face down, cut pieces included')
    expect(flat).not.toContain('first full-height row')
    expect(flat).not.toContain('Lay the full tiles first')
    expect(flat).toContain('so carry a keyed panel flat, supported under its whole face.')
    expect(flat).not.toMatch(/\bclips?\b|WALL CLIPS/)
    // A short joint whose pieces are keyed elsewhere is no news; a piece keyed to nothing is.
    expect(flat).not.toMatch(/too short for a key|long enough for a key/)
    const [loose] = FIXED_PLAN.pieces
    const join = { ...FIXED_JOIN, unkeyedPieceIds: [loose.id] }
    const named = flatten(buildReadme(config, FIXED_PLAN, 'stl', { parts: keyParts, mount: noClips, join }))
    expect(named).toContain(`Piece ${loose.mark} has no joint long enough for a key: glue it to the tiles beside it.`)
  })

  it('says so when no key fits, and numbers the same step 1 whatever the zip holds', async () => {
    const { buildReadme } = await import('./readme')
    const { mountingGuide } = await import('../fixing/guide')
    const glued = { ...FIXED_CONFIG, mount: 'glue' as const }
    const unkeyed = buildReadme(glued, FIXED_PLAN, 'stl', { parts: [], mount: noClips, join: noKeys })
    expect(flatten(unkeyed)).toContain('No key fits this design: its joints are too short or its base too thin for the slots, so the tiles are not keyed. Glue them as below.')
    expect(unkeyed).toContain('MOUNTING\n  Glue the tiles with tile adhesive')
    expect(unkeyed).not.toContain('Elephant foot')
    // On clips the tiles still go up on them: nothing to glue.
    const clipped = flatten(buildReadme(FIXED_CONFIG, FIXED_PLAN, 'stl', { ...fixed, parts: clipParts, join: noKeys }))
    expect(clipped).toContain('so the tiles are not keyed. MOUNTING ON WALL CLIPS')
    // A zip of the wall's parts alone (what the download now holds): step 1 is the same pointer.
    const flat = flatten(buildReadme(FIXED_CONFIG, FIXED_PLAN, 'stl', { ...fixed, parts: FIXED_WALL_PARTS, zipped: FIXED_WALL_PARTS }))
    const guide = mountingGuide({ config: FIXED_CONFIG, plan: FIXED_PLAN, mount: FIXED_MOUNT, join: FIXED_JOIN, tab: NO_TABS, accessories: FIXED_WALL_PARTS })
    expect(flat).toContain(`1. ${guide.steps[0].title}. ${guide.steps[0].body.join(' ')}`)
    expect(flat).not.toContain('fit-test/')
    expect(flat).toContain('Printed parts: set the fit first (step 1 below), then print them.')
  })

  it('describes the edge between tiles and the profile around the wall with the numbers printed', async () => {
    const { buildReadme } = await import('./readme')
    const { resolvePerimeter } = await import('../geometry/profiles')
    const config = testConfig({
      jointEdge: 'pillow',
      bevel: 0.8,
      perimeter: { profile: 'frame', sides: { top: true, right: true, bottom: false, left: true }, width: 10, drop: 1, fade: 0, land: 'valleys' },
    })
    const edged = computeLayout(layoutInputOf(config))
    const readme = buildReadme(config, edged, 'stl', { parts: [], mount: noClips, join: FIXED_JOIN })
    const flat = readme.replace(/\s+/g, ' ')
    const e = resolvePerimeter(config)!
    expect(readme).toContain('\nEDGES\n')
    expect(readme).not.toContain('Bevel ')
    expect(flat).toContain('Between tiles Pillowed: a soft roll 0.8 mm deep and 3.2 mm wide on every side where two tiles meet.')
    expect(flat).toContain('Around the wall Raised frame along the top, right and left edges of the surface: 10 mm wide, standing 1 mm above the relief peaks.')
    expect(flat).toContain(`Border pieces stand ${Number(e.Zf.toFixed(2))} mm tall`)
    expect(flat).toContain('lettered on the plan')
    expect(flat).toContain('so the edges stay crisp')
  })

  it('says when a profile was lowered to fit the plate', async () => {
    const { buildReadme } = await import('./readme')
    const config = testConfig({
      tile: { width: 150, height: 150, thickness: 3 },
      perimeter: { profile: 'bullnose', sides: { top: true, right: true, bottom: true, left: true }, width: 6, drop: 8, fade: 0, land: 'valleys' },
    })
    const flat = buildReadme(config, computeLayout(layoutInputOf(config)), 'stl', { parts: [], mount: noClips }).replace(/\s+/g, ' ')
    expect(flat).toContain('Rounded edge (bullnose) along all four edges of the surface')
    expect(flat).toContain('It was lowered to leave the rim enough base plate')
  })

  it('says an edge that cuts the relief never fills its valleys, and names no fade', async () => {
    const { buildReadme } = await import('./readme')
    const config = testConfig({
      perimeter: { profile: 'chamfer', sides: { top: true, right: true, bottom: true, left: true }, width: 4, drop: 2, fade: 0, land: 'cut' },
    })
    const flat = buildReadme(config, computeLayout(layoutInputOf(config)), 'stl', { parts: [], mount: noClips }).replace(/\s+/g, ' ')
    expect(flat).toContain('Chamfered edge along all four edges of the surface: 4 mm wide, dropping 2 mm to the rim.')
    expect(flat).toContain('It cuts through the relief from its peaks down and only takes material away: the valleys stay open right to the rim, never filled.')
    expect(flat).not.toContain('fades out')
    // The same edge over a flat band still says how the relief settles into it.
    const peaks = { ...config, perimeter: { ...config.perimeter, land: 'peaks' as const } }
    const settled = buildReadme(peaks, computeLayout(layoutInputOf(peaks)), 'stl', { parts: [], mount: noClips }).replace(/\s+/g, ' ')
    expect(settled).toContain('into a flat band level with its peaks before the profile starts.')
    expect(settled).not.toContain('cuts through the relief')
  })
})

describe.skipIf(!hasRegistry)('buildFitTestReadme', () => {
  const flatten = (text: string) => text.replace(/\s+/g, ' ')

  it("numbers the fit-test guide's steps word for word, with every part at the root of the zip", async () => {
    const { buildFitTestReadme } = await import('./readme')
    const { fitChosenText, fitTestGuide } = await import('../fixing/guide')
    const { accessoryFileName } = await import('./filenames')
    const readme = buildFitTestReadme(FIXED_CONFIG, FIXED_FIT_PARTS, 'stl')
    const flat = flatten(readme)
    const guide = fitTestGuide({ config: FIXED_CONFIG, parts: FIXED_FIT_PARTS })!
    expect(readme.startsWith('TESSERA / Hall panel / fit test')).toBe(true)
    expect(flat).toContain(flatten(guide.lede))
    expect(flat).toContain(`You will need ${guide.needs}`)
    expect(guide.steps).toHaveLength(4)
    guide.steps.forEach((step, i) => expect(flat).toContain(`${i + 1}. ${step.title}. ${step.body.join(' ')}`))
    for (const part of FIXED_FIT_PARTS) {
      expect(readme).toContain(accessoryFileName(part, 'stl'))
      expect(readme).toContain(part.mark)
    }
    // A zip of parts alone: no folder, no tiling plan, no wall part and no mounting section.
    expect(readme).not.toContain('fit-test/')
    expect(readme).not.toContain('setting-out-plan.svg')
    expect(readme).not.toMatch(/MOUNTING|MODELS|LAYING OUT/)
    expect(readme).not.toContain('C1')
    // The fit is said once, last, in the one sentence the page shows under its picker.
    expect(flat.trimEnd().endsWith(fitChosenText(FIXED_CONFIG, 'both'))).toBe(true)
    expect(readme).not.toContain('\u2014')
    expect(readme).not.toContain('\u00a0')
  })

  it('drops the step and the board a keys-only wall has no clip for', async () => {
    const { buildFitTestReadme } = await import('./readme')
    const { fitTestFor } = await import('../fixing/accessories')
    const keyed = { ...FIXED_CONFIG, mount: 'glue' as const }
    const parts = fitTestFor(keyed, FIXED_PLAN)
    expect(parts.map((p) => p.kind)).toEqual(['fit-test', 'fit-test', 'key', 'key', 'key'])
    const flat = flatten(buildFitTestReadme(keyed, parts, 'step'))
    expect(flat).toContain('1. Print the fit test.')
    expect(flat).toContain('2. Press a test key across a real joint.')
    expect(flat).toContain('3. Set the fit you kept.')
    expect(flat).not.toContain('4.')
    expect(flat).not.toMatch(/You will need|smooth board|\bclips?\b/)
    expect(flat).toContain('A new fit remakes only those parts, never the tiles.')
  })

  it('says a design with nothing to test has no fit test', async () => {
    const { buildFitTestReadme } = await import('./readme')
    const readme = buildFitTestReadme({ ...FIXED_CONFIG, lock: 'none' as const, mount: 'glue' }, [], 'stl')
    expect(flatten(readme)).toContain('This design has no fit test: its tiles go up with glue or tape')
    expect(readme).not.toContain('Steps')
  })
})

// The tabs are the one lock that prints nothing, so the README has to say what is in the tiles instead, and
// say the same steps the download page shows. It also carries the one plate fact: the file is wider than the
// tile, because the tab stands out past its side.
describe.skipIf(!hasRegistry)('buildReadme with tabs', () => {
  const flatten = (text: string) => text.replace(/\s+/g, ' ')
  const readmeOf = async (tab = TABBED_TAB) => {
    const { buildReadme } = await import('./readme')
    return flatten(buildReadme(TABBED_CONFIG, TABBED_PLAN, 'stl', { parts: TABBED_FIT_PARTS, zipped: [], tab }))
  }

  it('says what the tabs are, how many joints they hold and that nothing is printed for them', async () => {
    const readme = await readmeOf()
    expect(readme).toContain('TABS BETWEEN TILES')
    expect(readme).toContain(
      'Each tile has a tab in the back of its right edge and the socket that tab goes into in the back of its left: ' +
        `${TABBED_TAB.joints} joints between tiles are held shut by them. Nothing is printed for them: a tab goes into ` +
        'its socket as its tile is pressed on.',
    )
    expect(readme).toContain(
      'The tabs lock neighbouring tiles edge to edge in the plane of the wall: in line, with even joints. They do not ' +
        'hold anything to the wall: the adhesive or the tape does, and the wall keeps the tiles flat. Nothing locks one ' +
        'row to the next, so each row is its own strip.',
    )
    expect(readme).toContain('How the tiles go up: see the steps under MOUNTING WITH TABS.')
    // No printed part, so no parts table and no key or clip anywhere.
    expect(readme).not.toContain('Printed parts')
    expect(readme).not.toMatch(/\bkeys?\b|\bclips?\b/i)
  })

  it('states the one plate fact twice over, in the words tabLimits gives', async () => {
    const readme = await readmeOf()
    expect(readme).toContain('The tabs stand 8 mm past one side of each tile: leave that much between tiles on the plate.')
    expect(readme).toContain(
      "Each tile's file is 8 mm wider than the tile, because its tab stands out past its right side: leave that much " +
        "between tiles on the plate. Every other size here is the tile's own.",
    )
    // The MODELS table still gives the nominal tile, which is what the plan's dimensions sum to.
    expect(readme).toContain('A Full tile 100 x 100 mm')
  })

  it('names the pieces no tab locks, and the models that carry no tab', async () => {
    const readme = await readmeOf()
    const marks = TABBED_PLAN.pieces.filter((p) => TABBED_TAB.unlockedPieceIds.includes(p.id)).map((p) => p.mark)
    expect(readme).toContain(
      `Pieces ${marks.slice(0, -1).join(', ')} and ${marks[2]} have no room for a socket, so no tab locks them: glue them to the tiles beside them.`,
    )
    // A whole tile whose right neighbour is too narrow is its own model, and the label says why.
    expect(readme).toContain('B Full tile, no tab 100 x 100 mm')
  })

  it('numbers the very steps the download page shows, and orders the wall left to right', async () => {
    const { buildReadme } = await import('./readme')
    const { mountingGuide } = await import('../fixing/guide')
    const guide = mountingGuide({ config: TABBED_CONFIG, plan: TABBED_PLAN, mount: FIXED_MOUNT, join: FIXED_JOIN, tab: TABBED_TAB, accessories: TABBED_FIT_PARTS })
    const readme = flatten(buildReadme(TABBED_CONFIG, TABBED_PLAN, 'stl', { parts: TABBED_FIT_PARTS, zipped: [], tab: TABBED_TAB }))
    expect(guide.system).toBe('tabs')
    expect(readme).toContain(flatten(guide.lede))
    expect(readme).toContain(flatten(guide.needs ?? ''))
    guide.steps.forEach((step, i) => expect(readme, step.key).toContain(flatten(`${i + 1}. ${step.title}. ${step.body.join(' ')}`)))
    expect(readme).toContain(
      'The tabs set the order: work from the bottom row up, each row strictly from left to right, so every tile goes on ' +
        'after the one to its left, as MOUNTING WITH TABS says below.',
    )
    // The setting-out point still sets the wall out: a tabbed wall is glued in every other respect.
    expect(readme).toContain('at the setting-out point marked SO on the plan')
  })

  it('says so when no tab fits, and keeps the glued mounting note', async () => {
    const readme = await readmeOf(NO_TABS)
    expect(readme).toContain(
      'No tab fits this design: its joints are too wide, its pieces too narrow or its base too thin for the sockets, ' +
        'so the tiles are not locked to each other. Glue them as below.',
    )
    expect(readme).toContain('MOUNTING Glue the tiles with tile adhesive')
    expect(readme).not.toContain('MOUNTING WITH TABS')
  })
})
