import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { accessoryFileName, README_FILE, SETTING_OUT_PLAN_FILE } from '@/core/export/filenames'
import { FIXED_CONFIG, FIXED_FIT_PARTS } from '@/core/export/testFixings'
import { fitTestGuide } from '@/core/fixing/guide'
import type { AccessorySpec } from '@/core/fixing/types'
import type { ExportFormat } from '@/core/types'
import { fitTestZip, type WrittenFile } from './fitTestZip'

/** What the worker hands back for a parts-only export: one file per part, named and with no folder. */
const written = (parts: readonly AccessorySpec[], format: ExportFormat): WrittenFile[] =>
  parts.map((part, i) => ({ name: accessoryFileName(part, format), data: new Uint8Array(200).fill(i + 1) }))

const entries = (parts: readonly AccessorySpec[], format: ExportFormat = 'stl') =>
  unzipSync(fitTestZip(FIXED_CONFIG, parts, written(parts, format), format).data)

const readmeOf = (parts: readonly AccessorySpec[], format: ExportFormat = 'stl') =>
  new TextDecoder().decode(entries(parts, format)[README_FILE])

describe('fitTestZip', () => {
  it('holds one entry per written part, flat, plus its own README', () => {
    const unzipped = entries(FIXED_FIT_PARTS)
    expect(Object.keys(unzipped).sort()).toEqual(
      [...FIXED_FIT_PARTS.map((part) => accessoryFileName(part, 'stl')), README_FILE].sort(),
    )
    // Flat: no part carries its group's folder, because the whole zip is that group.
    expect(Object.keys(unzipped).some((name) => name.includes('/'))).toBe(false)
  })

  it('carries none of the wall download: no setting-out plan and no tile', () => {
    const unzipped = entries(FIXED_FIT_PARTS)
    expect(unzipped[SETTING_OUT_PLAN_FILE]).toBeUndefined()
    expect(Object.keys(unzipped).filter((name) => /^[A-E]_/.test(name))).toEqual([])
  })

  it('keeps each written part byte for byte', () => {
    const files = written(FIXED_FIT_PARTS, 'stl')
    const unzipped = unzipSync(fitTestZip(FIXED_CONFIG, FIXED_FIT_PARTS, files, 'stl').data)
    for (const file of files) expect(unzipped[file.name]).toEqual(file.data)
  })

  it('is named after the design, the test and the format', () => {
    expect(fitTestZip(FIXED_CONFIG, FIXED_FIT_PARTS, [], 'stl').name).toBe('hall-panel-fit-test-stl.zip')
    expect(fitTestZip(FIXED_CONFIG, FIXED_FIT_PARTS, [], 'step').name).toBe('hall-panel-fit-test-step.zip')
    // A name of nothing but punctuation still gives a file a maker can find.
    expect(fitTestZip({ ...FIXED_CONFIG, name: '///' }, FIXED_FIT_PARTS, [], 'stl').name).toBe('tessera-fit-test-stl.zip')
  })

  it("README carries the guide's own steps and names every part's file", () => {
    const readme = readmeOf(FIXED_FIT_PARTS)
    const guide = fitTestGuide({ config: FIXED_CONFIG, parts: FIXED_FIT_PARTS })
    if (!guide) throw new Error('the fixture wall prints keys and clips, so it has a fit test')
    expect(guide.steps).toHaveLength(4)
    for (const [i, step] of guide.steps.entries()) expect(readme).toContain(`${i + 1}. ${step.title}`)
    for (const part of FIXED_FIT_PARTS) expect(readme).toContain(accessoryFileName(part, 'stl'))
    expect(readme).not.toContain(SETTING_OUT_PLAN_FILE)
  })

  it('says so honestly when the design has no fit test', () => {
    expect(readmeOf([])).toContain('no fit test')
  })
})
