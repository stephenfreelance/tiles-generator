import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import { README_FILE } from '@/core/export/filenames'
import type { DesignConfig } from '@/core/types'
import { samplePlates, sampleSet, type SamplePlates, type SampleScope } from './samplePlates'
import { plateFileName, plateHeader, samplePlatesFiles, samplePlatesReadme, samplePlatesZipName } from './samplePlatesZip'
import { zipAsync } from './zipAsync'

const config: DesignConfig = { ...structuredClone(DEFAULT_CONFIG), name: 'Bathroom wall' }

function plated(bed = { width: 180, depth: 180 }, scope: SampleScope = 'every'): SamplePlates {
  const plates = samplePlates(config, bed, sampleSet(config), scope)
  if (!plates) throw new Error('no plate')
  return plates
}

const PRINTER = 'Bambu Lab A1 mini'

describe('samplePlatesReadme', () => {
  const readme = samplePlatesReadme(config, plated(), PRINTER)

  it('names every sample under its number, plate by plate', () => {
    const plates = plated()
    for (const sample of plates.samples) expect(readme).toContain(`${String(sample.number).padStart(3)}  ${sample.title}`)
    expect(readme).toContain('PLATE 1 OF 3')
    expect(readme).toContain('PLATE 3 OF 3')
  })

  it('draws each plate as a map of its numbers, the back row on top', () => {
    const lines = readme.split('\n')
    const top = lines.indexOf('PLATE 1 OF 3 (seen from above, the front of the plate at the bottom)')
    expect(lines.slice(top + 2, top + 5)).toEqual(['    1   2   3', '    4   5   6', '    7   8   9'])
  })

  it('says the map is the only label, and how to print the plates', () => {
    expect(readme).toContain('its number is its place on the plate')
    expect(readme).toContain('0.2 mm layers, 3 walls, 15 % infill')
    expect(readme).toContain(PRINTER)
  })

  it('is plain ASCII within the width, with no em dash', () => {
    for (const line of readme.split('\n')) {
      expect(line.length, line).toBeLessThanOrEqual(88)
      expect(/^[\x20-\x7e]*$/.test(line), line).toBe(true)
    }
  })
})

describe('samplePlatesFiles', () => {
  it('puts one STL a plate at the root, then the README', () => {
    const plates = plated()
    const files = samplePlatesFiles(config, plates, [new Uint8Array(1), new Uint8Array(2), new Uint8Array(3)], PRINTER)
    expect(files.map((f) => f.name)).toEqual([plateFileName(0, 3), plateFileName(1, 3), plateFileName(2, 3), README_FILE])
    expect(plateFileName(1, 3)).toBe('sample-plate-2-of-3.stl')
    expect(() => samplePlatesFiles(config, plates, [new Uint8Array(1)], PRINTER)).toThrow(/3 plate files/)
  })

  it('names the zip after the design and the plate, and each plate in its header', () => {
    const plates = plated()
    expect(samplePlatesZipName(config, plates)).toBe('bathroom-wall-sample-plates-180x180.zip')
    expect(plateHeader(config, plates, 1)).toBe('Tessera Bathroom wall sample plate 2 of 3, 180x180 mm')
    expect(samplePlatesZipName(config, plated(undefined, 'yours'))).toBe('bathroom-wall-wavy-samples-180x180.zip')
  })

  it('says the samples of one relief are that relief as set, and nothing else', () => {
    const readme = samplePlatesReadme(config, plated(undefined, 'yours'), PRINTER)
    expect(readme.split('\n')[0]).toBe('TESSERA / Bathroom wall / Wavy samples')
    expect(readme).toContain('in your Wavy relief, exactly as you set it')
    expect(readme).not.toContain('every relief')
    expect(readme).toContain('PLATE 1 OF 1')
    expect(readme).toContain('    1   2')
  })
})

describe('zipAsync', () => {
  it('packs every entry byte for byte', async () => {
    const plates = plated({ width: 256, depth: 256 })
    const plate = new Uint8Array(5000).map((_, i) => i % 7)
    const zipped = await zipAsync(samplePlatesFiles(config, plates, [plate], PRINTER))
    const entries = unzipSync(zipped)
    expect(entries[plateFileName(0, 1)]).toEqual(plate)
    expect(strFromU8(entries[README_FILE])).toBe(samplePlatesReadme(config, plates, PRINTER))
  })

  it('stops when it is cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(zipAsync([{ name: 'a.stl', data: new Uint8Array(10) }], controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
