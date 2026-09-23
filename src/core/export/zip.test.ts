import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { zipFiles } from './zip'

const text = (s: string) => new TextEncoder().encode(s)

describe('zipFiles', () => {
  it('round-trips every file', () => {
    const files = [
      { name: 'A_full-tile_150x150_x40.stl', data: new Uint8Array(5000).fill(7) },
      { name: 'setting-out-plan.svg', data: text('<svg></svg>') },
      { name: 'README.txt', data: text('TESSERA') },
    ]
    const unzipped = unzipSync(zipFiles(files))
    expect(Object.keys(unzipped).sort()).toEqual(files.map((f) => f.name).sort())
    expect(new TextDecoder().decode(unzipped['README.txt'])).toBe('TESSERA')
    expect(unzipped['A_full-tile_150x150_x40.stl']).toHaveLength(5000)
  })

  it('compresses repetitive geometry well', () => {
    const data = new Uint8Array(200_000).fill(3)
    const zipped = zipFiles([{ name: 'tile.step', data }])
    expect(zipped.length).toBeLessThan(data.length / 10)
  })

  it('keeps printed parts in their folders beside the tiles at the root', () => {
    const unzipped = unzipSync(
      zipFiles([
        { name: 'A_full-tile_150x150_x40.stl', data: text('tile') },
        { name: 'mount/C1_wall-clip_standard-fit_x29.stl', data: text('clip') },
        { name: 'fit-test/F1_coupon_x1.stl', data: text('coupon') },
        { name: 'mount/C1_wall-clip_standard-fit_x29.stl', data: text('again') },
      ]),
    )
    expect(Object.keys(unzipped).sort()).toEqual([
      'A_full-tile_150x150_x40.stl',
      'fit-test/F1_coupon_x1.stl',
      'mount/C1_wall-clip_standard-fit_x29-2.stl',
      'mount/C1_wall-clip_standard-fit_x29.stl',
    ])
    expect(new TextDecoder().decode(unzipped['mount/C1_wall-clip_standard-fit_x29.stl'])).toBe('clip')
  })

  it('keeps duplicate names apart', () => {
    const unzipped = unzipSync(
      zipFiles([
        { name: 'tile.stl', data: text('one') },
        { name: 'tile.stl', data: text('two') },
      ]),
    )
    expect(Object.keys(unzipped).sort()).toEqual(['tile-2.stl', 'tile.stl'])
  })
})
