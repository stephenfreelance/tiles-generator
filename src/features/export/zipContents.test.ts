import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import { accessoryZipPath } from '@/core/export/filenames'
import { FIXED_CONFIG, FIXED_JOIN, FIXED_MOUNT, FIXED_PLAN, FIXED_WALL_PARTS } from '@/core/export/testFixings'
import { wallParts } from '@/core/fixing/accessories'
import { joinPlan } from '@/core/fixing/joins'
import { mountPlan } from '@/core/fixing/mount'
import { tabPlan, type TabPlan } from '@/core/fixing/tabs'
import type { AccessorySpec, JoinPlan, MountPlan } from '@/core/fixing/types'
import { computeLayout, layoutInputOf } from '@/core/layout'
import type { DesignConfig } from '@/core/types'
import { ACCESSORY_GROUPS, partsTitle, zipContents } from './zipContents'

const part = (patch: Partial<AccessorySpec> & Pick<AccessorySpec, 'id' | 'kind' | 'group'>): AccessorySpec => ({
  mark: 'X1',
  label: patch.kind,
  count: 1,
  size: { x: 10, y: 10, z: 2 },
  printNote: 'Flat.',
  shape: {},
  ...patch,
})

// The wall's own parts: the download holds these and nothing else (the fit test has its own zip).
const PARTS: AccessorySpec[] = [
  part({ id: 'clip', kind: 'clip', group: 'mount', count: 68 }),
  part({ id: 'key', kind: 'key', group: 'join', count: 58 }),
]

const NO_CLIPS: Pick<MountPlan, 'clips'> = { clips: 0 }
const CLIPS: Pick<MountPlan, 'clips'> = { clips: 64 }
const NO_KEYS: Pick<JoinPlan, 'keys'> = { keys: 0 }
const KEYS: Pick<JoinPlan, 'keys'> = { keys: 55 }
const NO_TABS: Pick<TabPlan, 'tabs'> = { tabs: 0 }

const design = (patch: Partial<DesignConfig> = {}): DesignConfig => ({ ...DEFAULT_CONFIG, ...patch })
const planOf = (config: DesignConfig) => computeLayout(layoutInputOf(config))
const textOf = (lines: readonly { kind: string; text: string }[]) => Object.fromEntries(lines.map((line) => [line.kind, line.text]))

describe('zipContents', () => {
  it('a default design: the tile models, the plan and the README, exactly as before', () => {
    const config = design()
    const plan = planOf(config)
    const zip = zipContents(config, plan, NO_CLIPS, NO_KEYS, NO_TABS, [], 'stl')
    expect(zip.files).toBe(plan.pieces.length + 2)
    expect(zip.lines.map((line) => line.kind)).toEqual(['tiles', 'plan', 'readme'])
    expect(zip.lines[2].text).toBe('A README, your settings and printing advice')
  })

  it('counts every printed part as a file, and no mounting plan', () => {
    const config = design({ mount: 'clips', lock: 'keys' })
    const plan = planOf(config)
    const zip = zipContents(config, plan, CLIPS, KEYS, NO_TABS, PARTS, 'step')
    expect(zip.files).toBe(plan.pieces.length + PARTS.length + 2)
    expect(zip.lines.map((line) => line.kind)).toEqual(['tiles', 'mount', 'join', 'plan', 'readme'])
    const text = textOf(zip.lines)
    // Printed copies, with what goes on the wall and what is spare, so they match the counts elsewhere.
    expect(text.mount).toBe('68 wall clips (64 to fit, 4 spares), from one file in mount/')
    expect(text.join).toBe('58 keys (55 to fit, 3 spares), from one file in join/')
    expect(text.tiles).toMatch(/\(STEP\)/)
    expect(text.readme).toMatch(/how to put it up/)
  })

  it('agrees with the real plans and parts of a keyed wall on clips', () => {
    const zip = zipContents(FIXED_CONFIG, FIXED_PLAN, FIXED_MOUNT, FIXED_JOIN, NO_TABS, FIXED_WALL_PARTS, 'stl')
    expect(zip.files).toBe(FIXED_PLAN.pieces.length + FIXED_WALL_PARTS.length + 2)
    const text = textOf(zip.lines)
    expect(text.mount).toBe(`29 wall clips (${FIXED_MOUNT.clips} to fit, 2 spares), from one file in mount/`)

    // The page hands the builders' own parts and plans in, never the fixtures: they must agree too.
    const parts = wallParts(FIXED_CONFIG, FIXED_PLAN)
    const real = zipContents(FIXED_CONFIG, FIXED_PLAN, mountPlan(FIXED_CONFIG, FIXED_PLAN), joinPlan(FIXED_CONFIG, FIXED_PLAN), tabPlan(FIXED_CONFIG, FIXED_PLAN), parts, 'stl')
    expect(real.lines.map((line) => line.kind)).toEqual(['tiles', 'mount', 'join', 'plan', 'readme'])
    expect(real.files).toBe(FIXED_PLAN.pieces.length + parts.length + 2)
    expect(textOf(real.lines).mount).toMatch(/^\d+ wall clips \(\d+ to fit, \d+ spares?\), from one file in mount\/$/)
  })

  it('keys alone: the keys, and no line for the fit test the page downloads on its own', () => {
    const config = design({ lock: 'keys' })
    const zip = zipContents(config, planOf(config), NO_CLIPS, KEYS, NO_TABS, PARTS.filter((p) => p.kind === 'key'), 'stl')
    expect(zip.lines.map((line) => line.kind)).toEqual(['tiles', 'join', 'plan', 'readme'])
    expect(textOf(zip.lines).readme).toMatch(/how to put it up/)
  })

  it('never names the fit test, for any design: the download holds the wall\'s parts only', () => {
    for (const patch of [{}, { lock: 'keys' as const }, { lock: 'tabs' as const }, { mount: 'clips' as const }, { mount: 'clips' as const, lock: 'keys' as const }]) {
      const config = design(patch)
      const plan = planOf(config)
      const parts = wallParts(config, plan)
      const zip = zipContents(config, plan, mountPlan(config, plan), joinPlan(config, plan), tabPlan(config, plan), parts, 'stl')
      expect(zip.lines.map((line) => line.kind)).not.toContain('fit-test')
      expect(zip.lines.map((line) => line.text).join(' ')).not.toMatch(/fit test/i)
      expect(zip.files).toBe(plan.pieces.length + parts.length + 2)
    }
  })

  it('reads sensibly while the plans still count nothing', () => {
    // Clips asked for, none placed: the design is glued, so the README promises no steps.
    const config = design({ mount: 'clips' })
    const plan = planOf(config)
    const zip = zipContents(config, plan, NO_CLIPS, NO_KEYS, NO_TABS, [], 'stl')
    expect(zip.files).toBe(plan.pieces.length + 2)
    expect(zip.lines.map((line) => line.kind)).toEqual(['tiles', 'plan', 'readme'])
    expect(zip.lines[2].text).toBe('A README, your settings and printing advice')
    const oddMount = zipContents(config, plan, CLIPS, NO_KEYS, NO_TABS, [part({ id: 'c', kind: 'clip', group: 'mount', count: 0 })], 'stl')
    expect(textOf(oddMount.lines).mount).toBe('Wall clips, one file in mount/')
  })

  it('says a printed count plainly when nothing of it is spare', () => {
    const config = design({ mount: 'clips', lock: 'keys' })
    const zip = zipContents(config, planOf(config), { clips: 68 }, { keys: 58 }, NO_TABS, PARTS, 'stl')
    const text = textOf(zip.lines)
    expect(text.mount).toBe('68 wall clips, from one file in mount/')
    expect(text.join).toBe('58 keys between the tiles, from one file in join/')
  })

  it('names the folder each group unzips into, as the exporter writes it', () => {
    const config = design({ mount: 'clips', lock: 'keys' })
    for (const format of ['stl', 'step'] as const) {
      const text = textOf(zipContents(config, planOf(config), CLIPS, KEYS, NO_TABS, PARTS, format).lines)
      for (const group of ['mount', 'join'] as const) {
        const folder = accessoryZipPath(PARTS.find((p) => p.group === group)!, format).split('/')[0]
        expect(text[group].endsWith(` in ${folder}/`), group).toBe(true)
      }
    }
  })

  it('a tabbed wall prints nothing extra, and its README still carries the steps', () => {
    const config = design({ lock: 'tabs' })
    const plan = planOf(config)
    const tab = tabPlan(config, plan)
    expect(tab.tabs).toBeGreaterThan(0)
    const zip = zipContents(config, plan, NO_CLIPS, NO_KEYS, tab, [], 'stl')
    // The tabs place no accessory group at all: the tiles, the plan and the README, and nothing between.
    expect(zip.lines.map((line) => line.kind)).toEqual(['tiles', 'plan', 'readme'])
    expect(zip.files).toBe(plan.pieces.length + 2)
    expect(textOf(zip.lines).readme).toMatch(/how to put it up/)
    // Tabs the wall does not place leave it glued, and then the README promises no steps.
    const none = zipContents(config, plan, NO_CLIPS, NO_KEYS, { tabs: 0 }, [], 'stl')
    expect(textOf(none.lines).readme).toBe('A README, your settings and printing advice')
  })

  it('names the groups in the order the page lists them', () => {
    expect(ACCESSORY_GROUPS.map((entry) => entry.title)).toEqual(['Wall clips', 'Keys'])
  })

  it('never names a rail, a snap, a gauge or a mounting plan', () => {
    const config = design({ mount: 'clips', lock: 'keys' })
    const zip = zipContents(config, planOf(config), CLIPS, KEYS, NO_TABS, PARTS, 'stl')
    const words = [...zip.lines.map((line) => line.text), ...ACCESSORY_GROUPS.map((entry) => entry.title), partsTitle(PARTS)].join(' ')
    expect(words).not.toMatch(/rail|snap|gauge|mounting plan/i)
  })
})

describe('partsTitle', () => {
  it('names only the groups printed', () => {
    expect(partsTitle(PARTS)).toBe('Keys and wall clips')
    expect(partsTitle(PARTS.filter((p) => p.group !== 'join'))).toBe('Wall clips')
    expect(partsTitle(PARTS.filter((p) => p.group === 'join'))).toBe('Keys')
    expect(partsTitle([])).toBe('Printed parts')
  })
})
