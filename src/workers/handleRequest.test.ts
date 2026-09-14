import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import { pieceFileName } from '@/core/export/filenames'
import { computeLayout } from '@/core/layout'
import type { DesignConfig } from '@/core/types'
import { CancelledError, handleRequest, type HandlerContext } from './handleRequest'
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

  it('stops between pieces once cancelled', async () => {
    await expect(
      handleRequest({ kind: 'export', config, plan, format: 'stl', quality: 'draft', zip: true }, context(1)),
    ).rejects.toBeInstanceOf(CancelledError)
  })
})
