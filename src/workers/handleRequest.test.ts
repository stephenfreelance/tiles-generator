import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import { pieceFileName } from '@/core/export/filenames'
import { computeLayout } from '@/core/layout'
import { CHIP_SHADE_BUDGET_BYTES, renderReliefChip } from '@/core/textures/hillshade'
import type { DesignConfig } from '@/core/types'
import { ByteLru, CancelledError, chipShades, handleRequest, type HandlerContext } from './handleRequest'
import type { Progress } from './protocol'

// A small wall with one right-edge cut: 4 full columns of 100 mm and a 50 mm cut.
const config: DesignConfig = {
  ...structuredClone(DEFAULT_CONFIG),
  surface: { width: 450, height: 200 },
  tile: { width: 100, height: 100, thickness: 3 },
  joint: 0,
  layout: { origin: 'corner', rowOffset: 0 },
}
const plan = computeLayout({ surface: config.surface, tile: config.tile, joint: config.joint, layout: config.layout })

function context(cancelAfterProgress = Infinity): HandlerContext & { labels: string[] } {
  const labels: string[] = []
  return {
    labels,
    isCancelled: () => labels.length >= cancelAfterProgress,
    progress: (p: Progress) => labels.push(p.label),
  }
}

describe('handleRequest', () => {
  it('has a full tile and a cut to work with', () => {
    expect(plan.pieces.map((p) => p.kind)).toEqual(['full', 'edge'])
  })

  it('builds one preview mesh per piece and transfers every buffer once', async () => {
    const { result, transfer } = await handleRequest(
      { kind: 'preview', config, pieces: plan.pieces, cellMm: 2, normalMapTexelMm: 1 },
      context(),
    )
    expect(result.pieces.map((p) => p.pieceId)).toEqual(plan.pieces.map((p) => p.id))
    for (const piece of result.pieces) {
      expect(piece.mesh.topIndexCount).toBeGreaterThan(0)
      expect(piece.normalMap?.data.length).toBe((piece.normalMap?.width ?? 0) * (piece.normalMap?.height ?? 0) * 4)
      expect(transfer).toContain(piece.mesh.positions.buffer)
      expect(transfer).toContain(piece.mesh.indices.buffer)
    }
    expect(new Set(transfer).size).toBe(transfer.length)
  })

  it('skips the normal map when the texel size is 0', async () => {
    const { result } = await handleRequest({ kind: 'preview', config, pieces: plan.pieces, cellMm: 4, normalMapTexelMm: 0 }, context())
    expect(result.pieces.every((p) => p.normalMap === undefined)).toBe(true)
  })

  it('measures volumes between the base plate and the full relief', async () => {
    const { result } = await handleRequest({ kind: 'volumes', config, pieces: plan.pieces }, context())
    for (const piece of plan.pieces) {
      const area = piece.width * piece.height
      const volume = result.volumes[piece.id]
      expect(volume).toBeGreaterThan(area * config.tile.thickness * 0.95)
      expect(volume).toBeLessThan(area * (config.tile.thickness + config.texture.depth) * 1.01)
    }
  })

  it('exports STL files with stats and a zip holding the plan and the README', async () => {
    const ctx = context()
    const { result, transfer } = await handleRequest(
      { kind: 'export', config, plan, format: 'stl', quality: 'draft', zip: true },
      ctx,
    )
    expect(result.files.map((f) => f.name)).toEqual(plan.pieces.map((p) => pieceFileName(p, 'stl')))
    expect(result.stats.every((s) => s.triangles > 0 && s.bytes === 84 + 50 * s.triangles && s.volumeMm3 > 0)).toBe(true)
    expect(ctx.labels).toContain('Meshing full tile A (1 of 2)')
    expect(ctx.labels).toContain('Meshing cut B (2 of 2)')
    expect(ctx.labels.some((l) => l.startsWith('Zipping'))).toBe(true)
    expect(result.zip?.name).toMatch(/\.zip$/)
    const entries = unzipSync(result.zip!.data)
    expect(Object.keys(entries).sort()).toEqual([...result.files.map((f) => f.name), 'README.txt', 'setting-out-plan.svg'].sort())
    expect(strFromU8(entries['setting-out-plan.svg'])).toContain('<svg')
    expect(transfer).toContain(result.zip!.data.buffer)
  })

  it('exports only the requested pieces as STEP', async () => {
    const cut = plan.pieces[1]
    const { result } = await handleRequest(
      { kind: 'export', config, plan, format: 'step', quality: 'draft', zip: false, pieceIds: [cut.id] },
      context(),
    )
    expect(result.files).toHaveLength(1)
    expect(result.files[0]).toMatchObject({ pieceId: cut.id, mime: 'model/step', name: pieceFileName(cut, 'step') })
    expect(strFromU8(result.files[0].data.subarray(0, 13))).toBe('ISO-10303-21;')
    expect(result.zip).toBeUndefined()
  })

  it('renders chips as RGBA pixels', async () => {
    const { result, transfer } = await handleRequest(
      { kind: 'chips', sizePx: 48, items: [{ key: 'a', config }, { key: 'b', config, crop: plan.pieces[1].crop }] },
      context(),
    )
    expect(result.chips.map((c) => c.key)).toEqual(['a', 'b'])
    for (const chip of result.chips) expect(chip.data.length).toBe(chip.width * chip.height * 4)
    expect(transfer).toHaveLength(2)
  })

  it('re-tints a cached shade when only the colour changes, with the same bytes as a full render', async () => {
    chipShades.clear()
    const crop = plan.pieces[1].crop
    const red = { ...config, color: '#D7263D' }
    const gold = { ...config, color: '#F6C343' }
    const request = (design: DesignConfig) =>
      handleRequest({ kind: 'chips', sizePx: 40, items: [{ key: 'full', config: design }, { key: 'cut', config: design, crop }] }, context())

    const first = await request(red)
    expect(chipShades).toMatchObject({ size: 2, hits: 0, misses: 2 })
    const second = await request(gold)
    expect(chipShades).toMatchObject({ size: 2, hits: 2, misses: 2 })

    for (const [design, { result }] of [[red, first], [gold, second]] as const) {
      expect(result.chips[0].data).toEqual(renderReliefChip(design, { sizePx: 40 }).data)
      expect(result.chips[1].data).toEqual(renderReliefChip(design, { sizePx: 40, crop }).data)
    }
    expect(second.result.chips[0].data).not.toEqual(first.result.chips[0].data)
  })

  it('renders a new shade when anything but the colour changes', async () => {
    chipShades.clear()
    await handleRequest({ kind: 'chips', sizePx: 32, items: [{ key: 'a', config }] }, context())
    const deeper = { ...config, texture: { ...config.texture, depth: config.texture.depth + 0.5 } }
    await handleRequest({ kind: 'chips', sizePx: 32, items: [{ key: 'a', config: deeper }] }, context())
    await handleRequest({ kind: 'chips', sizePx: 36, items: [{ key: 'a', config }] }, context())
    // A picker chip of another texture, the Scale slider and the Invert toggle each need their own relief.
    const arches = { ...config, texture: { ...config.texture, id: 'arches' } }
    const scaled = { ...config, texture: { ...config.texture, scale: config.texture.scale + 10 } }
    const inverted = { ...config, texture: { ...config.texture, invert: !config.texture.invert } }
    for (const variant of [arches, scaled, inverted]) {
      await handleRequest({ kind: 'chips', sizePx: 32, items: [{ key: 'a', config: variant }] }, context())
    }
    expect(chipShades).toMatchObject({ size: 6, hits: 0, misses: 6 })
  })

  it('keeps the shade cache inside its byte budget, dropping the least recently used first', () => {
    const lru = new ByteLru<Uint8Array>(10, (value) => value.byteLength)
    lru.set('a', new Uint8Array(4))
    lru.set('b', new Uint8Array(4))
    lru.get('a')
    lru.set('c', new Uint8Array(4))
    expect([lru.get('a') !== undefined, lru.get('b') !== undefined, lru.get('c') !== undefined]).toEqual([true, false, true])
    expect(lru.bytes).toBe(8)
    // Too big to ever fit: not stored, and nothing else is pushed out for it.
    lru.set('huge', new Uint8Array(11))
    expect(lru.size).toBe(2)
    // Replacing a key counts only the new value.
    lru.set('a', new Uint8Array(6))
    expect(lru.bytes).toBe(10)
    expect(lru.size).toBe(2)
  })

  it('never lets the worker shade cache grow past its budget', async () => {
    chipShades.clear()
    // 600 px shades are about 8.6 MB each, so the third one has to push the first out.
    const items = [1, 2, 3].map((seed) => ({ key: `s${seed}`, config: { ...config, texture: { ...config.texture, seed } } }))
    for (const item of items) await handleRequest({ kind: 'chips', sizePx: 600, items: [item] }, context())
    expect(chipShades.maxBytes).toBe(CHIP_SHADE_BUDGET_BYTES)
    expect(chipShades.size).toBe(2)
    expect(chipShades.bytes).toBeLessThanOrEqual(CHIP_SHADE_BUDGET_BYTES)
    await handleRequest({ kind: 'chips', sizePx: 600, items: [items[2]] }, context())
    expect(chipShades.hits).toBe(1)
    chipShades.clear()
  })

  it('stops between pieces once cancelled', async () => {
    await expect(
      handleRequest({ kind: 'export', config, plan, format: 'stl', quality: 'draft', zip: true }, context(1)),
    ).rejects.toBeInstanceOf(CancelledError)
  })
})
