// The export and volume pipeline with keys and wall clips, on synthetic parts and plans (testFixings.ts),
// so it does not depend on the real clip and key builders.
import { strFromU8, unzipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { accessoryFileName, accessoryZipPath, pieceFileName } from '@/core/export/filenames'
import { boxMesh, FIXED_CONFIG, FIXED_FIT_PARTS, FIXED_JOIN, FIXED_MOUNT, FIXED_PARTS, FIXED_WALL_PARTS, NO_TABS } from '@/core/export/testFixings'
import { mountingGuide } from '@/core/fixing/guide'
import { computeLayout, layoutInputOf } from '@/core/layout'
import type { AccessorySpec } from '@/core/fixing/types'
import { CancelledError, exportedAccessories, handleRequest, type HandlerContext } from './handleRequest'
import type { Progress } from './protocol'

const mesher = vi.hoisted(() => ({ failOn: null as string | null }))

vi.mock('@/core/fixing/accessories', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/core/fixing/accessories')>()
  return {
    ...original,
    accessoryParts: vi.fn(() => FIXED_PARTS),
    buildAccessoryMesh: vi.fn((_config: unknown, spec: AccessorySpec) => {
      if (spec.id === mesher.failOn) throw new Error('no mesher for this one')
      return boxMesh(spec)
    }),
  }
})
vi.mock('@/core/fixing/mount', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/fixing/mount')>()),
  mountPlan: vi.fn(() => FIXED_MOUNT),
}))
vi.mock('@/core/fixing/joins', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/fixing/joins')>()),
  joinPlan: vi.fn(() => FIXED_JOIN),
}))

const config = FIXED_CONFIG
const plan = computeLayout(layoutInputOf(config))
const CLIP = FIXED_PARTS.find((p) => p.mark === 'C1')!
const KEY = FIXED_PARTS.find((p) => p.mark === 'K1')!

function context(cancelAfterProgress = Infinity): HandlerContext & { labels: string[] } {
  const labels: string[] = []
  return {
    labels,
    isCancelled: () => labels.length >= cancelAfterProgress,
    progress: (p: Progress) => labels.push(p.label),
  }
}

const flatten = (text: string) => text.replace(/\s+/g, ' ')

beforeEach(() => {
  mesher.failOn = null
})

describe('exporting a design with keys and wall clips', () => {
  it('zips the tiles at the root and the wall\'s parts in their folders, with the tiling plan and the README only', async () => {
    const { result, transfer } = await handleRequest(
      { kind: 'export', config, plan, format: 'stl', quality: 'draft', zip: true, planSvg: '<svg/>' },
      context(),
    )
    const tileNames = plan.pieces.map((p) => pieceFileName(p, 'stl'))
    const partPaths = FIXED_WALL_PARTS.map((p) => `${p.group}/${accessoryFileName(p, 'stl')}`)
    expect(partPaths).toContain('mount/C1_wall-clip_standard-fit_x29.stl')
    expect(partPaths).toContain('join/K1_key_15.8mm_x20.stl')

    const entries = unzipSync(result.zip!.data)
    // Tiles, then the wall's parts in their folders, then the two documents: no mounting plan, the tiles
    // place their clips, and no fit test, which is downloaded from its own page.
    expect(Object.keys(entries)).toEqual([...tileNames, ...partPaths, 'setting-out-plan.svg', 'README.txt'])
    const folders = new Set(Object.keys(entries).filter((name) => name.includes('/')).map((name) => name.split('/')[0]))
    expect(folders).toEqual(new Set(['mount', 'join']))
    expect(FIXED_FIT_PARTS.length).toBeGreaterThan(0)
    for (const spec of FIXED_FIT_PARTS) expect(entries[accessoryZipPath(spec, 'stl')]).toBeUndefined()
    for (const spec of FIXED_WALL_PARTS) {
      const bytes = entries[accessoryZipPath(spec, 'stl')]
      // A box: 12 triangles.
      expect(bytes.byteLength).toBe(84 + 50 * 12)
      expect(strFromU8(bytes.subarray(0, 7))).toBe('Tessera')
    }
    expect(strFromU8(entries['setting-out-plan.svg'])).toBe('<svg/>')

    const readme = strFromU8(entries['README.txt'])
    for (const path of partPaths) expect(readme).toContain(path)
    expect(readme).not.toContain('fit-test/')
    expect(readme).toContain('KEYS BETWEEN TILES')
    expect(readme).toContain('\nMOUNTING ON WALL CLIPS\n')
    expect(readme).not.toMatch(/mounting-plan|\brails?\b|\bsnaps?\b|gauge/i)
    expect(readme).not.toContain('\u2014')
    // The steps are the download page's, numbered word for word.
    const guide = mountingGuide({ config, plan, mount: FIXED_MOUNT, join: FIXED_JOIN, tab: NO_TABS, accessories: FIXED_WALL_PARTS })
    expect(guide.system).toBe('both')
    guide.steps.forEach((step, i) => expect(flatten(readme)).toContain(`${i + 1}. ${step.title}. ${step.body.join(' ')}`))

    // Files come back one by one too: tiles first, then the parts, each tagged with its folder.
    expect(result.files.map((f) => f.name)).toEqual([...tileNames, ...FIXED_WALL_PARTS.map((p) => accessoryFileName(p, 'stl'))])
    const clipFile = result.files.find((f) => f.accessoryId === CLIP.id)
    expect(clipFile).toMatchObject({ folder: 'mount', mime: 'model/stl', name: 'C1_wall-clip_standard-fit_x29.stl' })
    expect(clipFile?.pieceId).toBeUndefined()
    expect(result.files.find((f) => f.accessoryId === KEY.id)).toMatchObject({ folder: 'join', name: 'K1_key_15.8mm_x20.stl' })
    expect(result.files.some((f) => f.folder === 'fit-test')).toBe(false)
    expect(result.stats.map((s) => s.partId)).toEqual([...plan.pieces.map((p) => p.id), ...FIXED_WALL_PARTS.map((p) => p.id)])
    for (const stat of result.stats.slice(plan.pieces.length)) {
      expect(stat).toMatchObject({ triangles: 12, bytes: 684 })
      expect(stat.pieceId).toBeUndefined()
      expect(stat.volumeMm3).toBeGreaterThan(0)
    }
    expect(new Set(transfer).size).toBe(transfer.length)
    expect(transfer).toContain(clipFile!.data.buffer)
  })

  it('reports progress over the parts too', async () => {
    const ctx = context()
    await handleRequest({ kind: 'export', config, plan, format: 'stl', quality: 'draft', zip: true, planSvg: '<svg/>' }, ctx)
    const n = FIXED_WALL_PARTS.length
    expect(ctx.labels).toContain(`Meshing C1 wall clip, standard fit (${FIXED_WALL_PARTS.indexOf(CLIP) + 1} of ${n})`)
    expect(ctx.labels).toContain(`Writing STL: K1 key, 15.8 mm (${n} of ${n})`)
    // Tiles, parts and the two documents.
    expect(ctx.labels).toContain(`Zipping ${plan.pieces.length + n + 2} files`)
  })

  it('stops between parts once cancelled', async () => {
    // Every tile takes two progress steps, so this lands inside the parts.
    const cancelAt = plan.pieces.length * 2 + 3
    const ctx = context(cancelAt)
    await expect(
      handleRequest({ kind: 'export', config, plan, format: 'stl', quality: 'draft', zip: true, planSvg: '<svg/>' }, ctx),
    ).rejects.toBeInstanceOf(CancelledError)
    expect(ctx.labels.at(-1)).toMatch(/^(Meshing|Writing STL:) K1 /)
  })

  it('writes one part on its own, as STEP, with no relief to build', async () => {
    const { result } = await handleRequest(
      { kind: 'export', config, plan, format: 'step', quality: 'fine', zip: false, pieceIds: [], accessoryIds: [CLIP.id] },
      context(),
    )
    expect(result.files).toHaveLength(1)
    expect(result.files[0]).toMatchObject({ name: 'C1_wall-clip_standard-fit_x29.step', accessoryId: CLIP.id, folder: 'mount', mime: 'model/step' })
    expect(strFromU8(result.files[0].data.subarray(0, 13))).toBe('ISO-10303-21;')
    expect(result.zip).toBeUndefined()
  })

  it('leaves the parts out of a pick of pieces, and out of everything when asked', async () => {
    const piece = plan.pieces[0]
    const one = await handleRequest({ kind: 'export', config, plan, format: 'stl', quality: 'draft', zip: false, pieceIds: [piece.id] }, context())
    expect(one.result.files.map((f) => f.pieceId)).toEqual([piece.id])

    const tilesOnly = await handleRequest(
      { kind: 'export', config, plan, format: 'stl', quality: 'draft', zip: true, accessories: false, planSvg: '<svg/>' },
      context(),
    )
    const unzipped = unzipSync(tilesOnly.result.zip!.data)
    expect(Object.keys(unzipped)).toEqual([...plan.pieces.map((p) => pieceFileName(p, 'stl')), 'setting-out-plan.svg', 'README.txt'])
    expect(tilesOnly.result.files.every((f) => f.accessoryId === undefined)).toBe(true)
    // The wall still goes up on clips, so the README keeps its steps, naming the parts by mark but listing no file.
    const readme = flatten(strFromU8(unzipped['README.txt']))
    expect(readme).not.toContain('Printed parts, each in its folder')
    expect(readme).not.toMatch(/(fit-test|mount|join)\//)
    expect(readme).toContain('MOUNTING ON WALL CLIPS')
    expect(readme).toContain('press a clip (C1) into every pocket')
    // Step 1 points at the fit test wherever the maker ran it: the zip never holds one.
    expect(readme).toContain('print the fit test first: it prints the keys and clips in all three fits on small coupons')
  })

  it('picks parts by id, alone or with tiles', () => {
    const base = { config, plan }
    // A full export writes the wall's parts; the fit test comes only when its ids are named.
    expect(exportedAccessories(base).map((p) => p.id)).toEqual(FIXED_WALL_PARTS.map((p) => p.id))
    expect(exportedAccessories({ ...base, pieceIds: [], accessoryIds: FIXED_FIT_PARTS.map((p) => p.id) }).map((p) => p.mark)).toEqual(
      FIXED_FIT_PARTS.map((p) => p.mark),
    )
    expect(exportedAccessories({ ...base, pieceIds: ['full'] })).toEqual([])
    expect(exportedAccessories({ ...base, pieceIds: ['full'], accessoryIds: [KEY.id] }).map((p) => p.mark)).toEqual(['K1'])
    expect(exportedAccessories({ ...base, accessoryIds: [CLIP.id, KEY.id] }).map((p) => p.mark)).toEqual(['C1', 'K1'])
    expect(exportedAccessories({ ...base, accessoryIds: [KEY.id, 'nope'], accessories: false })).toEqual([])
    expect(exportedAccessories({ ...base, accessoryIds: ['nope'] })).toEqual([])
  })

  it('refuses an export with nothing in it', async () => {
    await expect(
      handleRequest({ kind: 'export', config, plan, format: 'stl', quality: 'draft', zip: false, pieceIds: [], accessoryIds: [] }, context()),
    ).rejects.toThrow(/Nothing to export/)
  })

  it('names the part whose mesher fails instead of shipping a zip without it', async () => {
    mesher.failOn = CLIP.id
    await expect(
      handleRequest({ kind: 'export', config, plan, format: 'stl', quality: 'draft', zip: true, planSvg: '<svg/>' }, context()),
    ).rejects.toThrow(/C1 \(Wall clip, standard fit\) could not be built: no mesher for this one/)
  })
})

describe('measuring the parts for the estimate', () => {
  it('measures every part next to the tiles, keyed by its id', async () => {
    const { result } = await handleRequest({ kind: 'volumes', config, pieces: plan.pieces, accessories: FIXED_PARTS }, context())
    for (const piece of plan.pieces) expect(result.volumes[piece.id]).toBeGreaterThan(0)
    // The box meshes are float32, so their volumes match to a few parts in a million.
    for (const spec of FIXED_PARTS) {
      const box = spec.size.x * spec.size.y * spec.size.z
      expect(Math.abs(result.volumes[spec.id] - box) / box).toBeLessThan(1e-5)
    }
  })

  it('keeps every other volume when one part cannot be built yet', async () => {
    mesher.failOn = CLIP.id
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = await handleRequest({ kind: 'volumes', config, pieces: [], accessories: FIXED_PARTS }, context())
    expect(result.volumes[CLIP.id]).toBeUndefined()
    expect(Object.keys(result.volumes)).toHaveLength(FIXED_PARTS.length - 1)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
