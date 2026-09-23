import { describe, expect, it } from 'vitest'
import { landingConfig, landingPlan, LANDING_DESIGN_START } from './landingDesign'
import { kitScale, zipFileNames, ZIP_DOCUMENTS } from './kit'

const plan = landingPlan(landingConfig(LANDING_DESIGN_START))

describe('the zip as the kit lays it out', () => {
  it('names every file as the exporter does, the models first and the two documents last', () => {
    expect(zipFileNames(plan)).toEqual([
      'A_full-tile_150x150_x24.stl',
      'B_bottom-edge_150x100_x6.stl',
      'C_right-edge_100x150_x4.stl',
      'D_bottom-right-corner_100x100_x1.stl',
      'setting-out-plan.svg',
      'README.txt',
    ])
    expect(zipFileNames(plan, 'step')[0]).toBe('A_full-tile_150x150_x24.step')
  })

  it('counts one model per unique piece plus the two documents, never one per tile', () => {
    expect(ZIP_DOCUMENTS.map((doc) => doc.name)).toEqual(['setting-out-plan.svg', 'README.txt'])
    expect(zipFileNames(plan)).toHaveLength(plan.pieces.length + 2)
    const exact = landingPlan(landingConfig({ ...LANDING_DESIGN_START, widthMm: 2400, heightMm: 1200 }))
    expect(exact.placements).toHaveLength(128)
    expect(zipFileNames(exact)).toHaveLength(3)
  })
})

describe('kitScale', () => {
  it('stands every piece at its true size against the longest side in the family', () => {
    const scale = kitScale(plan.pieces)
    expect(plan.pieces.map((piece) => scale(piece))).toEqual([
      { width: 1, height: 1 },
      { width: 1, height: 100 / 150 },
      { width: 100 / 150, height: 1 },
      { width: 100 / 150, height: 100 / 150 },
    ])
  })

  it('never lets a piece outgrow its box, and survives an empty family', () => {
    const scale = kitScale([
      { width: 300, height: 120 },
      { width: 40, height: 120 },
    ])
    expect(scale({ width: 300, height: 120 })).toEqual({ width: 1, height: 0.4 })
    expect(scale({ width: 40, height: 120 }).width).toBeCloseTo(40 / 300)
    expect(kitScale([])({ width: 1, height: 1 })).toEqual({ width: 1, height: 1 })
  })
})
