import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import { piecesPerPlate, PRINTERS } from '@/core/printers'
import { TEXTURES, textureById } from '@/core/textures/registry'
import type { DesignConfig } from '@/core/types'
import {
  compactGrid,
  PLATE_GAP_MM,
  PLATE_MARGIN_MM,
  plateGrid,
  plateLegend,
  SAMPLE_MM,
  sampleJob,
  samplePlates,
  samplePlatesGrams,
  sampleSet,
  STRIP_GAP_MM,
  type PlacedSample,
  type SamplePlates,
  type SampleScope,
} from './samplePlates'

const design = (over: Partial<DesignConfig> = {}): DesignConfig => ({ ...structuredClone(DEFAULT_CONFIG), ...over })
const P1S = { width: 256, depth: 256 }
const A1_MINI = { width: 180, depth: 180 }

function plated(config: DesignConfig, bed = P1S, scope: SampleScope = 'every'): SamplePlates {
  const plates = samplePlates(config, bed, sampleSet(config), scope)
  if (!plates) throw new Error('no plate')
  return plates
}

describe('sampleSet', () => {
  it('leads with the maker’s relief and joint, then every other relief in the studio’s order', () => {
    const { core } = sampleSet(design())
    expect(core.map((s) => s.key)).toEqual([
      'yours',
      'joint',
      ...TEXTURES.filter((t) => t.id !== DEFAULT_CONFIG.texture.id).map((t) => `relief-${t.id}`),
    ])
    expect(core).toHaveLength(TEXTURES.length + 1)
    expect(core[0].title).toBe('Your relief: Wavy')
    expect(core[1].title).toBe('Your joint: chamfer edge')
  })

  it('shows every other relief at its own depth and feature size, as its studio chip does', () => {
    const { core } = sampleSet(design({ texture: { ...DEFAULT_CONFIG.texture, depth: 4.1, scale: 30, invert: true } }))
    for (const sample of core.filter((s) => s.group === 'relief')) {
      const def = textureById(sample.config.texture.id)
      expect(sample.config.texture).toEqual({ ...DEFAULT_CONFIG.texture, id: def.id, params: {}, depth: def.defaults.depth, scale: def.defaults.scale })
    }
    // The maker's own keeps every setting they made.
    expect(core[0].config.texture).toEqual({ ...DEFAULT_CONFIG.texture, depth: 4.1, scale: 30, invert: true })
  })

  it('cuts every sample from the maker’s own tile, with nothing in its back and no border', () => {
    const config = design({ tile: { width: 120, height: 100, thickness: 6 }, lock: 'keys', mount: 'clips', jointEdge: 'round', bevel: 1.2, color: '#12AB34' })
    const { core, extras } = sampleSet({ ...config, perimeter: { ...config.perimeter, profile: 'ogee' } })
    for (const sample of [...core, ...extras]) {
      expect(sample.config.tile).toEqual(config.tile)
      expect(sample.config.color).toBe('#12AB34')
      expect(sample.config.lock).toBe('none')
      expect(sample.config.mount).toBe('glue')
      if (sample.kind !== 'border') expect(sample.config.perimeter.profile).toBe('none')
      if (sample.kind !== 'joint' || sample.group === 'yours') expect(sample.config.jointEdge).toBe('round')
      for (const { spec } of sample.pieces) {
        expect(spec.crop.x0).toBeGreaterThanOrEqual(0)
        expect(spec.crop.y0).toBeGreaterThanOrEqual(0)
        expect(spec.crop.x1).toBeLessThanOrEqual(config.tile.width)
        expect(spec.crop.y1).toBeLessThanOrEqual(config.tile.height)
        expect(spec.width).toBeCloseTo(spec.crop.x1 - spec.crop.x0, 6)
      }
    }
  })

  it('makes a 45 mm square of the tile, or the whole tile where it is smaller', () => {
    const big = sampleSet(design())
    expect(big.box).toEqual({ width: SAMPLE_MM, height: SAMPLE_MM })
    expect(big.core[0].pieces[0].spec.crop).toEqual({ x0: 52.5, y0: 52.5, x1: 97.5, y1: 97.5 })
    const small = sampleSet(design({ tile: { width: 30, height: 60, thickness: 4 } }))
    expect(small.box).toEqual({ width: 30, height: SAMPLE_MM })
    expect(small.core[0].pieces[0].spec.crop).toEqual({ x0: 0, y0: 7.5, x1: 30, y1: 52.5 })
  })

  it('cuts a large pattern where its lines are, not from inside one cell of it', () => {
    // Zellige repeats every 50 mm, so the 45 mm middle of a 150 mm tile holds no grout line at all.
    const zellige = sampleSet(design()).core.find((s) => s.key === 'relief-zellige')
    const crop = zellige?.pieces[0].spec.crop
    if (!crop) throw new Error('no zellige sample')
    const crosses = (from: number, to: number) => [50, 100].some((line) => from < line && line < to)
    expect(crosses(crop.x0, crop.x1) || crosses(crop.y0, crop.y1)).toBe(true)
  })

  it('keeps the middle of the tile for a relief that is the same everywhere', () => {
    const flat = sampleSet(design({ texture: { ...DEFAULT_CONFIG.texture, depth: 0 } }))
    expect(flat.core[0].pieces[0].spec.crop).toEqual({ x0: 52.5, y0: 52.5, x1: 97.5, y1: 97.5 })
  })

  it('cuts the joint from either side of a real joint, so the relief runs on across it', () => {
    const { core, box } = sampleSet(design())
    const [left, right] = core[1].pieces
    expect(left.spec.crop.x1).toBe(DEFAULT_CONFIG.tile.width)
    expect(right.spec.crop.x0).toBe(0)
    expect(left.spec.width).toBe((SAMPLE_MM - STRIP_GAP_MM) / 2)
    expect(right.spec.width).toBe(left.spec.width)
    // Both strips inside the box, the gap between them.
    expect(left.x).toBe(0)
    expect(right.x - (left.x + left.spec.width)).toBeCloseTo(STRIP_GAP_MM, 6)
    expect(right.x + right.spec.width).toBeCloseTo(box.width, 6)
  })

  it('leaves the joint out on a tile too narrow for two strips worth judging', () => {
    const { core, extras } = sampleSet(design({ tile: { width: 24, height: 60, thickness: 4 } }))
    expect(core.some((s) => s.kind === 'joint')).toBe(false)
    expect(extras.some((s) => s.kind === 'joint')).toBe(false)
  })

  it('gives every piece of a set its own id', () => {
    const { core, extras } = sampleSet(design({ perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'frame' } }))
    const ids = [...core, ...extras].flatMap((s) => s.pieces.map((p) => p.spec.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('varies the maker’s relief in the studio’s order: joint edges, borders, depth, invert, turn', () => {
    const { extras } = sampleSet(design())
    expect(extras.map((s) => s.key)).toEqual([
      'joint-square',
      'joint-round',
      'joint-pillow',
      'border-margin',
      'border-chamfer',
      'border-bullnose',
      'border-ogee',
      'border-frame',
      'deeper',
      'shallower',
      'invert',
      'turn',
    ])
    const deeper = extras.find((s) => s.key === 'deeper')
    expect(deeper?.config.texture.depth).toBe(3.9)
    expect(deeper?.title).toBe('Wavy, 3.9 mm deep')
  })

  it('puts the maker’s own border first, at its own settings, on the two outer sides of a corner', () => {
    const perimeter = { ...DEFAULT_CONFIG.perimeter, profile: 'ogee' as const, width: 14, drop: 2.5, land: 'peaks' as const }
    const { core, extras } = sampleSet(design({ perimeter }))
    const first = core.find((s) => s.kind === 'border')
    expect(first?.key).toBe('border-ogee')
    expect(first?.title).toBe('Your border: ogee edge')
    expect(first?.config.perimeter).toMatchObject({ profile: 'ogee', width: 14, drop: 2.5, land: 'peaks' })
    expect(first?.config.perimeter.sides).toEqual({ bottom: true, left: true, top: false, right: false })
    expect(first?.pieces[0].spec.edges.profiled).toEqual({ bottom: 0, left: 0 })
    expect(core.map((s) => s.key).slice(0, 3)).toEqual(['yours', 'joint', 'border-ogee'])
    expect(extras.filter((s) => s.kind === 'border').map((s) => s.key)).toEqual([
      'border-margin',
      'border-chamfer',
      'border-bullnose',
      'border-frame',
    ])
  })

  it('gives a joint edge a size when the maker’s is square, as the studio does', () => {
    const { core, extras } = sampleSet(design({ bevel: 0 }))
    expect(core[1].title).toBe('Your joint: square edge')
    const joints = extras.filter((s) => s.kind === 'joint')
    expect(joints.map((s) => s.config.jointEdge)).toEqual(['chamfer', 'round', 'pillow'])
    for (const sample of joints) expect(sample.config.bevel).toBe(DEFAULT_CONFIG.bevel)
  })

  it('offers no turn for a pattern with no direction, and no depth it would clamp back to the maker’s', () => {
    const coral = textureById('coral')
    const { extras } = sampleSet(design({ texture: { ...DEFAULT_CONFIG.texture, id: 'coral', depth: coral.depthRange[1] } }))
    expect(extras.some((s) => s.kind === 'turn')).toBe(false)
    expect(extras.filter((s) => s.kind === 'depth').map((s) => s.key)).toEqual(['shallower'])
  })
})

describe('plateGrid', () => {
  it('counts a plate exactly as piecesPerPlate counts a tile', () => {
    const beds = [...PRINTERS, { width: 400, depth: 300 }, { width: 120, depth: 500 }, { width: 55, depth: 55 }, { width: 50, depth: 50 }]
    for (const bed of beds) {
      expect(plateGrid(bed, { width: SAMPLE_MM, height: SAMPLE_MM }).perPlate, `${bed.width} x ${bed.depth}`).toBe(
        piecesPerPlate(SAMPLE_MM, SAMPLE_MM, { name: `${bed.width} x ${bed.depth}`, width: bed.width, depth: bed.depth }),
      )
    }
  })

  it('fits the whole set on one 256 mm plate', () => {
    expect(plateGrid(P1S, { width: SAMPLE_MM, height: SAMPLE_MM })).toMatchObject({ columns: 5, rows: 5, perPlate: 25 })
  })

  it('centres the grid on the plate', () => {
    const grid = plateGrid(A1_MINI, { width: SAMPLE_MM, height: SAMPLE_MM })
    const span = 3 * SAMPLE_MM + 2 * PLATE_GAP_MM
    expect(grid.x0).toBeCloseTo((A1_MINI.width - span) / 2, 6)
    expect(grid.y0).toBeCloseTo((A1_MINI.depth - span) / 2, 6)
  })
})

describe('samplePlates', () => {
  const inside = (plates: SamplePlates, sample: PlacedSample) => {
    for (const piece of sample.pieces) {
      const x = sample.x + piece.x
      const y = sample.y + piece.y
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(x + piece.spec.width).toBeLessThanOrEqual(plates.bed.width + 1e-9)
      expect(y + piece.spec.height).toBeLessThanOrEqual(plates.bed.depth + 1e-9)
    }
  }

  it('prints the default design on one 256 mm plate, its one spare place filled', () => {
    const plates = plated(design())
    expect(plates.plates).toHaveLength(1)
    expect(plates.samples).toHaveLength(25)
    expect(plates.extrasPlaced).toBe(1)
    expect(plates.samples.at(-1)?.key).toBe('joint-square')
  })

  it('needs three plates on a 180 mm bed, the last one filled with extras', () => {
    const plates = plated(design(), A1_MINI)
    expect(plates.plates.map((p) => p.length)).toEqual([9, 9, 9])
    expect(plates.extrasPlaced).toBe(3)
  })

  it('numbers the samples in reading order from the back-left, one place each, all on the plate', () => {
    const plates = plated(design(), A1_MINI)
    expect(plates.samples.map((s) => s.number)).toEqual(plates.samples.map((_, i) => i + 1))
    const first = plates.samples[0]
    expect(first).toMatchObject({ plate: 0, row: 0, column: 0 })
    // Row 0 is the back of the plate, the high y.
    expect(first.y).toBeGreaterThan(plates.samples[3].y)
    for (const plate of plates.plates) {
      const places = new Set(plate.map((s) => `${s.x},${s.y}`))
      expect(places.size).toBe(plate.length)
      for (const sample of plate) {
        inside(plates, sample)
        expect(sample.x).toBeGreaterThanOrEqual(PLATE_MARGIN_MM)
      }
    }
  })

  it('lays out a big plate the extras cannot fill on a smaller grid in its middle', () => {
    const plates = plated(design(), { width: 400, depth: 400 })
    expect(plates.plates).toHaveLength(1)
    expect(plates.capacity).toBe(64)
    expect(plates.samples).toHaveLength(36)
    expect(plates.grid).toMatchObject({ columns: 6, rows: 6 })
    const span = 6 * SAMPLE_MM + 5 * PLATE_GAP_MM
    expect(plates.grid.x0).toBeCloseTo((400 - span) / 2, 6)
  })

  it('prints one sample a plate on a bed that only takes one, and nothing on a bed too small for it', () => {
    expect(plated(design(), { width: 50, depth: 50 }).plates).toHaveLength(TEXTURES.length + 1)
    expect(samplePlates(design(), { width: 40, depth: 80 })).toBeNull()
  })
})

describe('only the maker\u2019s relief', () => {
  it('prints the design exactly as set: its relief and its joint, nothing varied, on one plate', () => {
    const plates = plated(design(), P1S, 'yours')
    expect(plates.scope).toBe('yours')
    expect(plates.samples.map((s) => s.key)).toEqual(['yours', 'joint'])
    expect(plates.extrasPlaced).toBe(0)
    for (const sample of plates.samples) expect(sample.config.texture).toEqual(DEFAULT_CONFIG.texture)
    // Side by side in the middle of the plate, not in the corner of an empty 5 by 5.
    expect(plates.grid).toMatchObject({ columns: 2, rows: 1 })
    expect(plates.samples[0].x).toBeCloseTo((256 - (2 * SAMPLE_MM + PLATE_GAP_MM)) / 2, 6)
    expect(plates.samples[0].y).toBeCloseTo((256 - SAMPLE_MM) / 2, 6)
  })

  it('adds the design\u2019s own border, at its own settings, and no other', () => {
    const perimeter = { ...DEFAULT_CONFIG.perimeter, profile: 'bullnose' as const, width: 6 }
    const plates = plated(design({ perimeter }), P1S, 'yours')
    expect(plates.samples.map((s) => s.key)).toEqual(['yours', 'joint', 'border-bullnose'])
    expect(plates.samples[2].config.perimeter.width).toBe(6)
    expect(plates.grid).toMatchObject({ columns: 3, rows: 1 })
  })

  it('still spreads over plates a bed too small for them together', () => {
    expect(plated(design(), { width: 55, depth: 55 }, 'yours').plates.map((p) => p.length)).toEqual([1, 1])
  })

  it('reads as the maker\u2019s own in the legend', () => {
    expect(plateLegend(plated(design(), P1S, 'yours'))).toEqual([
      { numbers: '1', text: 'Your relief: Wavy' },
      { numbers: '2', text: 'Your joint: chamfer edge' },
    ])
  })
})

describe('compactGrid', () => {
  const full = plateGrid({ width: 400, depth: 400 }, { width: SAMPLE_MM, height: SAMPLE_MM })
  const shape = (count: number) => {
    const grid = compactGrid({ width: 400, depth: 400 }, { width: SAMPLE_MM, height: SAMPLE_MM }, full, count)
    return [grid.columns, grid.rows]
  }

  it('leaves no place empty if it can, then keeps as square and as wide as it can', () => {
    expect(shape(1)).toEqual([1, 1])
    expect(shape(2)).toEqual([2, 1])
    expect(shape(3)).toEqual([3, 1])
    expect(shape(4)).toEqual([2, 2])
    expect(shape(36)).toEqual([6, 6])
  })
})

describe('sampleJob', () => {
  it('hands the worker the sample’s own design and a plan holding exactly its pieces', () => {
    const joint = sampleSet(design()).core[1]
    const job = sampleJob(joint)
    expect(job.config).toBe(joint.config)
    expect(job.pieceIds).toEqual(joint.pieces.map((p) => p.spec.id))
    expect(job.plan.pieces.map((p) => p.id)).toEqual(job.pieceIds)
    expect(job.plan.placements).toHaveLength(2)
  })
})

describe('plateLegend', () => {
  it('names the maker’s samples, then the other reliefs and the extras as runs', () => {
    expect(plateLegend(plated(design()))).toEqual([
      { numbers: '1', text: 'Your relief: Wavy' },
      { numbers: '2', text: 'Your joint: chamfer edge' },
      { numbers: '3 to 24', text: "The 22 other reliefs, in the studio's order" },
      { numbers: '25', text: 'In the spare place: Square joint' },
    ])
    // The design's own border is its own, so it prints beside its relief and joint, and fills the 256 mm plate.
    const ogee = design({ perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'ogee' } })
    expect(plateLegend(plated(ogee))).toEqual([
      { numbers: '1', text: 'Your relief: Wavy' },
      { numbers: '2', text: 'Your joint: chamfer edge' },
      { numbers: '3', text: 'Your border: ogee edge' },
      { numbers: '4 to 25', text: "The 22 other reliefs, in the studio's order" },
    ])
    expect(plateLegend(plated(design(), { width: 400, depth: 400 })).at(-1)).toEqual({
      numbers: '25 to 36',
      text: 'In the spare places, your relief varied: 3 joint edges, 5 borders, 2 depths, inverted and quarter turn',
    })
  })
})

describe('samplePlatesGrams', () => {
  it('weighs a plate like a few small tiles, more for a thicker base', () => {
    const light = samplePlatesGrams(plated(design({ tile: { ...DEFAULT_CONFIG.tile, thickness: 3 } })))
    const sturdy = samplePlatesGrams(plated(design({ tile: { ...DEFAULT_CONFIG.tile, thickness: 6 } })))
    expect(light).toBeGreaterThan(40)
    expect(light).toBeLessThan(250)
    expect(sturdy).toBeGreaterThan(light)
  })
})
