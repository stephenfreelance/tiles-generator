// T-11 voronoi stone and T-12 terrazzo: two "material" textures, both built on wrapped-cell
// hashing so a stone or a chip can straddle a tile joint and still line up.

import { hashCell, makeWorleyResult, worley2, worleyBorder, wrap } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, cellMmY, clamp, clamp01, MIN_SOFT_MM, shoulder, SHOULDER_SLOPE, shoulderRunLimit } from './common'

/** Lowest a flagstone sits, as a share of the relief; its rolled edge is sized for the smallest rise. */
const LOWEST_STONE = 0.72
/** Depth of a spall: 0.4 mm at the default depth, two layers, the least a step needs to print as a step. */
const SPALL_DEPTH = 0.2
/** Width of the riser round a spall: steep, and still over MIN_SOFT_MM. */
const RISER_MM = 0.5
/** Spall cells per stone cell, each way. */
const SPALL_FREQ = 3

export const voronoiStone: TextureDef = {
  id: 'voronoi-stone',
  mark: 'T-11',
  name: 'Voronoi stone',
  category: 'organic',
  blurb: 'Dry-laid flagstones: irregular slabs with rolled edges and a deep joint between them.',
  defaults: { depth: 2, scale: 32 },
  scaleRange: [12, 90],
  depthRange: [1, 4],
  params: [
    {
      key: 'irregularity',
      label: 'Irregularity',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.85,
      hint: 'From a tidy grid of pavers to a wild rubble wall.',
    },
    {
      key: 'joint',
      label: 'Joint width',
      min: 0.6,
      max: 4,
      step: 0.1,
      default: 1.6,
      unit: 'mm',
      hint: 'Gap between stones, cut all the way to the base plate.',
    },
    {
      key: 'roll',
      label: 'Edge rounding',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.45,
      hint: 'Rounds the stone edges like a tumbled, worn surface.',
    },
    {
      key: 'texture',
      label: 'Surface texture',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.35,
      hint: 'Flakes split off the face of each stone with a crisp edge, two layers deep at the default depth.',
    },
  ],
  directional: false,
  seeded: true,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, repeatsY, seed } = ctx
    const jitter = ctx.params.irregularity
    const mmPerCell = Math.min(cellMmX(ctx), cellMmY(ctx))
    const jointHalfMm = ctx.params.joint / 2
    // A tumbled edge is a rounded shoulder, twice as steep at the joint as at the face, which stays flat. It
    // grows with the stone up to a width that keeps it steep: past that a bigger stone grows its face instead.
    const fillet = 0.6
    const rollCap = shoulderRunLimit(voronoiStone.defaults.depth * LOWEST_STONE, SHOULDER_SLOPE, fillet, 2)
    const rollMm = clamp(ctx.params.roll * 0.22 * mmPerCell, 0.4, rollCap)
    // Spalls instead of a quarry grain: a grain under a layer tall printed as stray islands on the face. A spall
    // is a flake split off the face, two layers deep with straight risers, so the print holds what the render shows.
    const spallShare = 0.45 * clamp01(ctx.params.texture)
    const spallMm = mmPerCell / SPALL_FREQ
    const sx = repeatsX * SPALL_FREQ
    const sy = repeatsY * SPALL_FREQ
    const cell = makeWorleyResult()
    // A 3x3 bisector pass is enough while sites stay inside their own cell (jitter <= 1).
    const borderRadius = jitter > 0.9 ? 2 : 1
    return (u, v) => {
      const s = u * repeatsX
      const t = v * repeatsY
      worley2(s, t, repeatsX, repeatsY, jitter, seed, cell)
      const borderMm = worleyBorder(s, t, repeatsX, repeatsY, jitter, seed, cell, borderRadius) * mmPerCell
      const face = shoulder(borderMm - jointHalfMm, rollMm, fillet, 2)
      if (face <= 0) return 0
      let h = LOWEST_STONE + (1 - LOWEST_STONE) * cell.id
      if (spallShare > 0) {
        // Signed millimetres to the nearest edge between a spalled and a whole cell: out on the whole side.
        const sd = spallEdge(s * SPALL_FREQ, t * SPALL_FREQ, sx, sy, spallShare, seed + 91) * spallMm
        h -= SPALL_DEPTH * (1 - shoulder(sd + RISER_MM / 2, RISER_MM, 0))
      }
      return clamp01(face * h)
    }
  },
}

export const terrazzo: TextureDef = {
  id: 'terrazzo',
  mark: 'T-12',
  name: 'Terrazzo',
  category: 'organic',
  blurb: 'Stone chips set in a flat ground, two sizes scattered like poured terrazzo.',
  defaults: { depth: 0.9, scale: 16 },
  scaleRange: [6, 45],
  // Below 0.6 mm even the tallest small chips stand under two layers, and the lowest under one.
  depthRange: [0.6, 2],
  params: [
    {
      key: 'density',
      label: 'Chip density',
      min: 0.2,
      max: 1,
      step: 0.05,
      default: 0.82,
      hint: 'Share of cells that actually carry a large chip.',
    },
    {
      key: 'margin',
      label: 'Chip gap',
      min: 0.05,
      max: 0.4,
      step: 0.01,
      default: 0.14,
      hint: 'Shrinks every chip away from its neighbours, which sharpens their angular shape.',
    },
    {
      key: 'pebble',
      label: 'Rounded pebbles',
      min: 0,
      max: 1,
      step: 1,
      default: 0,
      hint: 'On: round, flat-faced pebbles with rolled edges. Off: flat angular chips.',
    },
    {
      key: 'fines',
      label: 'Small chips',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.8,
      hint: 'How many small chips fill the ground between the large ones.',
    },
  ],
  directional: false,
  seeded: true,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, repeatsY, seed } = ctx
    const density = ctx.params.density
    const margin = ctx.params.margin
    const pebble = ctx.params.pebble >= 0.5
    const fines = ctx.params.fines
    const mmPerCell = Math.min(cellMmX(ctx), cellMmY(ctx))
    const softMm = 0.35
    // The fine layer is about 2.5x denser; both layers keep their own integer period.
    const fx = Math.max(1, Math.round(repeatsX * 2.5))
    const fy = Math.max(1, Math.round(repeatsY * 2.5))
    const fineMm = Math.min(cellMmX(ctx) * (repeatsX / fx), cellMmY(ctx) * (repeatsY / fy))
    const pair = makeWorleyPair()

    // A pebble's rim is sized from its own height at the default depth, so a low pebble keeps a steep rim and a
    // broad flat face rather than one ring of steps.
    const rimFor = (height: number, radiusMm: number): number =>
      Math.max(Math.min(0.3 * radiusMm, shoulderRunLimit(terrazzo.defaults.depth * height, 0.5, 0.3, 2)), MIN_SOFT_MM)

    const layer = (
      x: number,
      y: number,
      px: number,
      py: number,
      salt: number,
      mm: number,
      share: number,
      height: number,
    ): number => {
      worleyPair(x, y, px, py, 0.9, seed + salt, pair)
      if (pair.id > share) return 0
      const shade = 0.62 + 0.38 * (hashCell(pair.cx, pair.cy, seed + salt + 13) / 4294967296)
      // Unit vectors from the sample to its two nearest sites: their difference is the slope of f2 - f1.
      const ux = pair.e1x / pair.f1 - pair.e2x / pair.f2
      const uy = pair.e1y / pair.f1 - pair.e2y / pair.f2
      if (pebble) {
        const radius = 0.28 + 0.22 * (hashCell(pair.cx, pair.cy, seed + salt + 29) / 4294967296)
        const rimMm = (radius - pair.f1) * mm
        if (rimMm <= 0) return 0
        // A flat face with a rolled rim: a dome's top printed as a flat disc ringed by steps. Pebbles of different
        // heights would meet in a step on the cell boundary, so each also drops to the bisector between them.
        const dx = pair.e2x - pair.e1x
        const dy = pair.e2y - pair.e1y
        const bisectorMm = ((pair.f2 * pair.f2 - pair.f1 * pair.f1) / (2 * Math.hypot(dx, dy))) * mm
        const rim = shoulder(rimMm, rimFor(height * shade, radius * mm), 0.3, 2)
        return Math.min(rim, shoulder(bisectorMm, softMm, 0)) * shade * height
      }
      // Half the gap to the neighbouring site is the chip's own border distance. Its slope drops towards nothing
      // where both sites lie the same way, which spread a 0.35 mm edge into a wide shallow fan: dividing by it
      // measures the edge in millimetres instead.
      const border = (pair.f2 - pair.f1) * 0.5
      const edgeMm = ((border - margin) / Math.max(0.5 * Math.hypot(ux, uy), 0.05)) * mm
      return shoulder(edgeMm, softMm, 0) * shade * height
    }

    return (u, v) => {
      const big = layer(u * repeatsX, v * repeatsY, repeatsX, repeatsY, 0, mmPerCell, density, 1)
      if (fines <= 0) return clamp01(big)
      // Small chips keep one height and vary in number: scaled down by weight they sank under a layer.
      const small = layer(u * fx, v * fy, fx, fy, 500, fineMm, fines, FINE_HEIGHT)
      return clamp01(Math.max(big, small))
    }
  },
}

/** Height of the small chips against the large ones: the old default weight, 0.75 x 0.7. */
const FINE_HEIGHT = 0.53

interface WorleyPair {
  f1: number
  f2: number
  /** Vectors from the sample to the nearest and second-nearest sites, in cell units. */
  e1x: number
  e1y: number
  e2x: number
  e2y: number
  /** Wrapped cell of the nearest site, and its stable hash in [0, 1). */
  cx: number
  cy: number
  id: number
}

const makeWorleyPair = (): WorleyPair => ({ f1: 9, f2: 9, e1x: 0, e1y: 0, e2x: 0, e2y: 0, cx: 0, cy: 0, id: 0 })

/**
 * worley2 from noise.ts, hashed identically so every chip lands where it always did, but keeping where the
 * second-nearest site lies too: a chip edge measured in millimetres needs the direction to both.
 */
function worleyPair(x: number, y: number, px: number, py: number, jitter: number, seed: number, out: WorleyPair): void {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  let f1 = 1e9
  let f2 = 1e9
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = wrap(xi + dx, px)
      const cy = wrap(yi + dy, py)
      const h = hashCell(cx, cy, seed)
      const ex = xi + dx + 0.5 + ((h & 0xffff) / 65536 - 0.5) * jitter - x
      const ey = yi + dy + 0.5 + ((h >>> 16) / 65536 - 0.5) * jitter - y
      const d = Math.sqrt(ex * ex + ey * ey)
      if (d < f1) {
        f2 = f1
        out.e2x = out.e1x
        out.e2y = out.e1y
        f1 = d
        out.e1x = ex
        out.e1y = ey
        out.cx = cx
        out.cy = cy
      } else if (d < f2) {
        f2 = d
        out.e2x = ex
        out.e2y = ey
      }
    }
  }
  out.f1 = Math.max(f1, 1e-9)
  out.f2 = Math.max(f2, 1e-9)
  out.id = hashCell(out.cx, out.cy, seed ^ 0x1b873593) / 4294967296
}

/**
 * Signed distance, in cell units, from (x, y) to the nearest Voronoi edge between a spalled cell and a whole one
 * (cells hashed under `share` are spalled): positive in a whole cell, negative in a spalled one, and far from
 * zero where no such edge is near. A 5x5 pass finds every bisector that can bound the nearest cell.
 */
function spallEdge(x: number, y: number, px: number, py: number, share: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  let f1 = 1e9
  let nx = 0
  let ny = 0
  let spalled = false
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const h = hashCell(wrap(xi + dx, px), wrap(yi + dy, py), seed)
      const ex = xi + dx + 0.5 + ((h & 0xffff) / 65536 - 0.5) * 0.9 - x
      const ey = yi + dy + 0.5 + ((h >>> 16) / 65536 - 0.5) * 0.9 - y
      const d = ex * ex + ey * ey
      if (d < f1) {
        f1 = d
        nx = ex
        ny = ey
        spalled = hashCell(wrap(xi + dx, px), wrap(yi + dy, py), seed + 1) / 4294967296 < share
      }
    }
  }
  let edge = 1
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const cx = wrap(xi + dx, px)
      const cy = wrap(yi + dy, py)
      if (hashCell(cx, cy, seed + 1) / 4294967296 < share === spalled) continue
      const h = hashCell(cx, cy, seed)
      const ex = xi + dx + 0.5 + ((h & 0xffff) / 65536 - 0.5) * 0.9 - x
      const ey = yi + dy + 0.5 + ((h >>> 16) / 65536 - 0.5) * 0.9 - y
      const lx = ex - nx
      const ly = ey - ny
      const len = Math.sqrt(lx * lx + ly * ly)
      if (len < 1e-9) continue
      const d = (0.5 * (nx + ex) * lx + 0.5 * (ny + ey) * ly) / len
      if (d < edge) edge = d
    }
  }
  return spalled ? -edge : edge
}
