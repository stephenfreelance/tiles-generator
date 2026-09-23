import { describe, expect, it } from 'vitest'
import { DEFAULT_COLOR } from './colors'
import { cutsRelief, DEFAULT_CONFIG, DEFAULT_PERIMETER, LIMITS, normalizeConfig, PERIMETER_PROFILES, sameConfig } from './config'
import { DEFAULT_PRINTER_ID } from './printers'

// normalizeConfig is the only door into the app for untrusted data (localStorage, history entries,
// every edit), so these cases are the shapes a hand-edited or half-written store can really take.

describe('normalizeConfig', () => {
  it('falls back to the defaults for anything that is not a config', () => {
    for (const input of [undefined, null, 42, 'kitchen splashback', true, [], () => {}]) {
      expect(normalizeConfig(input)).toEqual(DEFAULT_CONFIG)
    }
  })

  it('rejects non-finite numbers but clamps finite ones', () => {
    // NaN and the infinities carry no intent, so they take the default; a real number out of range
    // is a measurement the user meant, so it lands on the nearest bound.
    const broken = normalizeConfig({ surface: { width: Number.NaN, height: Number.POSITIVE_INFINITY } })
    expect(broken.surface).toEqual(DEFAULT_CONFIG.surface)

    const out = normalizeConfig({ surface: { width: -400, height: 99_999 } })
    expect(out.surface).toEqual({ width: LIMITS.surface.min, height: LIMITS.surface.max })

    expect(normalizeConfig({ joint: -3 }).joint).toBe(LIMITS.joint.min)
    expect(normalizeConfig({ tile: { thickness: 0.1 } }).tile.thickness).toBe(LIMITS.thickness.min)
    expect(normalizeConfig({ texture: { depth: 1e308 * 10 } }).texture.depth).toBe(DEFAULT_CONFIG.texture.depth)
  })

  it('refuses numeric strings rather than parsing them', () => {
    // A number that arrived as text means something upstream skipped its own parsing step.
    const config = normalizeConfig({ surface: { width: '900' }, joint: '2', tile: { width: '100' } })
    expect(config.surface.width).toBe(DEFAULT_CONFIG.surface.width)
    expect(config.joint).toBe(DEFAULT_CONFIG.joint)
    expect(config.tile.width).toBe(DEFAULT_CONFIG.tile.width)
  })

  it('survives missing and wrongly typed nested objects', () => {
    expect(normalizeConfig({ surface: null, tile: undefined, layout: 7, texture: 'wavy' })).toEqual(DEFAULT_CONFIG)
    for (const params of [null, undefined, 5, 'scale', []]) {
      expect(normalizeConfig({ texture: { params } }).texture.params).toEqual({})
    }
  })

  it('keeps only finite texture params', () => {
    const params = normalizeConfig({
      texture: { params: { ribs: 4, tilt: Number.NaN, drift: '3', gap: null, rise: -2 } },
    }).texture.params
    expect(params).toEqual({ ribs: 4, rise: -2 })
  })

  it('resolves an unreadable color and an unknown printer id, and leaves an unknown texture id to the registry', () => {
    const config = normalizeConfig({
      color: 'not-a-color',
      printerId: 'anycubic-imaginary',
      texture: { id: 'not-a-texture' },
    })
    expect(config.color).toBe(DEFAULT_COLOR)
    expect(config.printerId).toBe(DEFAULT_PRINTER_ID)
    // Deliberate asymmetry: the texture registry owns that fallback, so the id passes through here.
    expect(config.texture.id).toBe('not-a-texture')
    expect(normalizeConfig({ texture: { id: 42 } }).texture.id).toBe(DEFAULT_CONFIG.texture.id)
  })

  it('stores any readable hex as uppercase #RRGGBB', () => {
    expect(normalizeConfig({ color: '#c0582f' }).color).toBe('#C0582F')
    expect(normalizeConfig({ color: ' 12ab34 ' }).color).toBe('#12AB34')
    expect(normalizeConfig({ color: '#abc' }).color).toBe('#AABBCC')
    for (const color of ['#12345', '#GGGGGG', '', 42, null, ['#FFFFFF']]) {
      expect(normalizeConfig({ color }).color).toBe(DEFAULT_COLOR)
    }
  })

  it('keeps the color of a design saved with a retired filament id', () => {
    expect(normalizeConfig({ colorId: 'pla-matte-terracotta' }).color).toBe('#B15533')
    expect(normalizeConfig({ colorId: 'pla-cf-matcha-green' }).color).toBe(DEFAULT_COLOR)
    // A readable hex wins over a stale id, and ids that are not in the retired catalog fall back.
    expect(normalizeConfig({ color: '#1E63C4', colorId: 'pla-matte-terracotta' }).color).toBe('#1E63C4')
    for (const colorId of ['pla-matte-none-such', 'constructor', '__proto__', 42]) {
      expect(normalizeConfig({ colorId }).color).toBe(DEFAULT_COLOR)
    }
    expect(normalizeConfig({ colorId: 'pla-matte-terracotta' })).not.toHaveProperty('colorId')
  })

  it('keeps a known enum value and replaces an unknown one', () => {
    expect(normalizeConfig({ surfaceUnit: 'm' }).surfaceUnit).toBe('m')
    expect(normalizeConfig({ surfaceUnit: 'in' }).surfaceUnit).toBe(DEFAULT_CONFIG.surfaceUnit)
    expect(normalizeConfig({ layout: { origin: 'center', rowOffset: 0.5 } }).layout).toEqual({
      origin: 'center',
      rowOffset: 0.5,
    })
    // 0.33 is not the third-bond value the layout engine knows (0.3333), so it is not a near miss to accept.
    expect(normalizeConfig({ layout: { origin: 'diagonal', rowOffset: 0.33 } }).layout).toEqual(DEFAULT_CONFIG.layout)
    expect(normalizeConfig({ layout: { rowOffset: '0.5' } }).layout.rowOffset).toBe(DEFAULT_CONFIG.layout.rowOffset)
  })

  it('caps an oversize name and ignores an empty one', () => {
    expect(normalizeConfig({ name: 'a'.repeat(500) }).name).toHaveLength(80)
    expect(normalizeConfig({ name: '   ' }).name).toBe(DEFAULT_CONFIG.name)
    expect(normalizeConfig({ name: '' }).name).toBe(DEFAULT_CONFIG.name)
    expect(normalizeConfig({ name: 42 }).name).toBe(DEFAULT_CONFIG.name)
    expect(normalizeConfig({ name: 'Hallway floor' }).name).toBe('Hallway floor')
  })

  it('normalizes the seed to a whole number in range', () => {
    expect(normalizeConfig({ texture: { seed: 3.7 } }).texture.seed).toBe(4)
    expect(normalizeConfig({ texture: { seed: -10 } }).texture.seed).toBe(0)
    expect(normalizeConfig({ texture: { seed: 5e9 } }).texture.seed).toBe(999_999)
    expect(normalizeConfig({ texture: { seed: Number.NaN } }).texture.seed).toBe(DEFAULT_CONFIG.texture.seed)
  })

  it('takes booleans only for the texture flags', () => {
    expect(normalizeConfig({ texture: { invert: true, rotate: true } }).texture).toMatchObject({
      invert: true,
      rotate: true,
    })
    expect(normalizeConfig({ texture: { invert: 1, rotate: 'yes' } }).texture).toMatchObject({
      invert: false,
      rotate: false,
    })
  })

  it('clamps the bevel against the tile it will be cut into, not just its own limit', () => {
    // The chamfer eats the rim from every side, so on a small tile the limit is the tile, not LIMITS.bevel.
    expect(normalizeConfig({ bevel: 3, tile: { width: 20, height: 20 } }).bevel).toBe(2.5)
    expect(normalizeConfig({ bevel: 3, tile: { width: 150, height: 24 } }).bevel).toBe(3)
    expect(normalizeConfig({ bevel: 99, tile: { width: 400, height: 400 } }).bevel).toBe(LIMITS.bevel.max)
    // The tile is clamped first, so an undersized tile widens the bevel ceiling to the clamped 20 mm.
    expect(normalizeConfig({ bevel: 3, tile: { width: 2, height: 2 } })).toMatchObject({
      bevel: 2.5,
      tile: { width: LIMITS.tile.min, height: LIMITS.tile.min },
    })
  })

  it('pins the version and every limit whatever the input claims', () => {
    const config = normalizeConfig({
      version: 7,
      surface: { width: 1e9, height: -1 },
      tile: { width: 1e9, height: -1, thickness: 1e9 },
      joint: 1e9,
      bevel: 1e9,
      texture: { depth: 1e9, scale: -1 },
    })
    expect(config.version).toBe(1)
    expect(config.surface).toEqual({ width: LIMITS.surface.max, height: LIMITS.surface.min })
    expect(config.tile).toEqual({ width: LIMITS.tile.max, height: LIMITS.tile.min, thickness: LIMITS.thickness.max })
    expect(config.joint).toBe(LIMITS.joint.max)
    expect(config.texture.depth).toBe(LIMITS.depth.max)
    expect(config.texture.scale).toBe(LIMITS.scale.min)
    expect(config.bevel).toBeLessThanOrEqual(Math.min(config.tile.width, config.tile.height) / 8)
  })

  it('is idempotent, so re-reading a stored design never drifts', () => {
    const once = normalizeConfig({ surface: { width: 3333.7 }, name: 'b'.repeat(200), texture: { seed: 2.4 } })
    expect(normalizeConfig(once)).toEqual(once)
  })
})

describe('sameConfig', () => {
  it('ignores key order, which is what lets the stores compare with JSON.stringify', () => {
    const a = normalizeConfig({ name: 'Niche', surface: { width: 300, height: 600 }, joint: 2 })
    const b = normalizeConfig({ joint: 2, surface: { height: 600, width: 300 }, name: 'Niche' })
    expect(sameConfig(a, b)).toBe(true)
  })

  it('sees a single changed measurement', () => {
    const a = normalizeConfig({ joint: 2 })
    expect(sameConfig(a, normalizeConfig({ joint: 2.5 }))).toBe(false)
  })
})

describe('normalizeConfig edges and fixings', () => {
  it('loads a design saved before edge shapes with a 0 mm edge as square, and any other as chamfer', () => {
    expect(normalizeConfig({ ...DEFAULT_CONFIG, jointEdge: undefined, bevel: 0 }).jointEdge).toBe('square')
    expect(normalizeConfig({ ...DEFAULT_CONFIG, jointEdge: undefined, bevel: 0.5 }).jointEdge).toBe('chamfer')
    // A chosen shape is kept even at size 0: the maker picked it.
    expect(normalizeConfig({ ...DEFAULT_CONFIG, jointEdge: 'round', bevel: 0 }).jointEdge).toBe('round')
  })

  it('gives a design saved before the fixings every one of them off', () => {
    const { perimeter, lock, mount, fit, ...old } = DEFAULT_CONFIG
    void perimeter
    void lock
    void mount
    void fit
    const loaded = normalizeConfig(old)
    expect(loaded.perimeter.profile).toBe('none')
    expect(loaded.lock).toBe('none')
    expect(loaded.mount).toBe('glue')
    expect(loaded.fit).toBe('standard')
  })

  it('reads the keys switch of a design saved before the tabs, and refuses an unknown lock', () => {
    const { lock, ...noLock } = DEFAULT_CONFIG
    void lock
    // `joins` was a boolean: true was Keys, false was Side by side. No store version bump is needed, exactly
    // as the colorId to color rename needed none, because every path out of storage normalizes on read.
    expect(normalizeConfig({ ...noLock, joins: true }).lock).toBe('keys')
    expect(normalizeConfig({ ...noLock, joins: false }).lock).toBe('none')
    expect(normalizeConfig(noLock).lock).toBe('none')
    // A lock of its own wins over the legacy switch, and anything unknown reads as nothing locked.
    expect(normalizeConfig({ ...noLock, lock: 'tabs', joins: true }).lock).toBe('tabs')
    expect(normalizeConfig({ ...noLock, lock: 'dowels' }).lock).toBe('none')
    expect(normalizeConfig({ ...noLock, lock: 'dowels', joins: true }).lock).toBe('keys')
    expect(DEFAULT_CONFIG.lock).toBe('none')
  })

  it('clamps perimeter numbers to the chosen profile and refuses unknown values', () => {
    const wild = normalizeConfig({
      ...DEFAULT_CONFIG,
      perimeter: { profile: 'frame', sides: { top: 'yes' }, width: 999, drop: -3, fade: 99, land: 'up' },
      mount: 'magnets',
      fit: 'tight',
    })
    expect(wild.perimeter).toEqual({
      profile: 'frame',
      sides: { bottom: true, right: true, top: true, left: true },
      width: 30,
      drop: 0,
      fade: 30,
      land: 'valleys',
    })
    expect(wild.mount).toBe('glue')
    expect(wild.fit).toBe('standard')
  })

  it('lets only the profiles that drop to the rim cut the relief, and starts them there', () => {
    const land = (profile: string, value: unknown) =>
      normalizeConfig({ ...DEFAULT_CONFIG, perimeter: { ...DEFAULT_PERIMETER, profile, land: value } }).perimeter.land
    for (const profile of ['chamfer', 'bullnose', 'ogee'] as const) {
      expect(cutsRelief(profile)).toBe(true)
      expect(PERIMETER_PROFILES[profile].land).toBe('cut')
      expect(land(profile, 'cut')).toBe('cut')
      // A design saved before the cut keeps the land it printed with.
      expect(land(profile, 'peaks')).toBe('peaks')
      expect(land(profile, 'valleys')).toBe('valleys')
      expect(land(profile, 'up')).toBe('cut')
    }
    // Margin and frame flatten the relief; a cut there falls back to their own land, as does none.
    for (const profile of ['margin', 'frame', 'none'] as const) {
      expect(cutsRelief(profile)).toBe(false)
      expect(land(profile, 'cut')).toBe('valleys')
      expect(land(profile, 'peaks')).toBe('peaks')
    }
    // The default design stays the plain wall it was.
    expect(DEFAULT_CONFIG.perimeter).toMatchObject({ profile: 'none', land: 'valleys' })
  })

  it('reads a cut back unchanged, time after time', () => {
    for (const profile of ['chamfer', 'bullnose', 'ogee'] as const) {
      const once = normalizeConfig({ ...DEFAULT_CONFIG, perimeter: { ...DEFAULT_PERIMETER, profile, land: 'cut' } })
      expect(normalizeConfig(once)).toEqual(once)
      expect(normalizeConfig(JSON.parse(JSON.stringify(once)))).toEqual(once)
    }
  })
})
