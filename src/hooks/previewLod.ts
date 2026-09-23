// Level of detail for the 3D preview: how fine the worker meshes each pass.
import { basePiece } from '@/core/layout'
import type { DesignConfig, LayoutPlan, PieceSpec } from '@/core/types'

/** Top-surface triangles across every placed instance in the surface view. */
export const SURFACE_TRIANGLE_BUDGET = 3_000_000
export const SURFACE_CELL_MM = { min: 0.35, max: 4 } as const
/** Triangles of the single hero piece in the tile view. */
export const TILE_TRIANGLE_BUDGET = 1_200_000
export const TILE_CELL_MIN_MM = 0.25
/** A 512 px normal map per tile carries the fine relief the coarse instanced mesh cannot. */
export const NORMAL_MAP_PX = 512
export const NORMAL_TEXEL_MM = { min: 0.1, max: 1 } as const

export type PreviewDetail = 'surface' | 'tile'

export interface PreviewPass {
  pieces: PieceSpec[]
  cellMm: number
  normalMapTexelMm: number
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
/** Two decimals keep request keys stable when the budget math jitters. */
const round2 = (v: number) => Math.round(v * 100) / 100

/** A grid of cell c over w × h mm has about 2·w·h / c² top triangles. */
export const cellForBudget = (areaMm2: number, triangles: number) => Math.sqrt((2 * areaMm2) / triangles)

export const topTriangles = (widthMm: number, heightMm: number, cellMm: number) =>
  2 * Math.ceil(widthMm / cellMm) * Math.ceil(heightMm / cellMm)

/**
 * The piece the tile view shows: the base whole tile; when every whole tile is a border version, the
 * one laid most often; the largest cut when there is no whole tile at all.
 */
export function heroPiece(plan: LayoutPlan): PieceSpec | undefined {
  const base = basePiece(plan.pieces)
  if (base) return base
  const whole = plan.pieces.filter((p) => p.kind === 'full')
  if (whole.length) return whole.reduce((best, p) => (p.count > best.count ? p : best))
  return [...plan.pieces].sort((a, b) => b.width * b.height - a.width * a.height)[0]
}

/** A quick coarse pass for feedback, then the final pass; one pass when the final is already coarse. */
function withCoarsePass(final: PreviewPass, coarseCellMm: number): PreviewPass[] {
  if (coarseCellMm < final.cellMm * 1.6) return [final]
  return [{ pieces: final.pieces, cellMm: round2(coarseCellMm), normalMapTexelMm: 0 }, final]
}

export function previewPasses(config: DesignConfig, plan: LayoutPlan, detail: PreviewDetail): PreviewPass[] {
  if (plan.pieces.length === 0) return []

  if (detail === 'tile') {
    const hero = heroPiece(plan)
    if (!hero) return []
    const cellMm = round2(Math.max(TILE_CELL_MIN_MM, cellForBudget(hero.width * hero.height, TILE_TRIANGLE_BUDGET)))
    return withCoarsePass({ pieces: [hero], cellMm, normalMapTexelMm: 0 }, Math.max(cellMm * 3, 1))
  }

  const byId = new Map(plan.pieces.map((p) => [p.id, p]))
  let placedArea = 0
  for (const placement of plan.placements) {
    const piece = byId.get(placement.pieceId)
    if (piece) placedArea += piece.width * piece.height
  }
  const cellMm = round2(clamp(cellForBudget(placedArea, SURFACE_TRIANGLE_BUDGET), SURFACE_CELL_MM.min, SURFACE_CELL_MM.max))
  const texelMm = round2(clamp(config.tile.width / NORMAL_MAP_PX, NORMAL_TEXEL_MM.min, NORMAL_TEXEL_MM.max))
  // A normal map only adds detail when its texels are finer than the mesh cells.
  const normalMapTexelMm = texelMm < cellMm * 0.8 ? texelMm : 0
  return withCoarsePass({ pieces: plan.pieces, cellMm, normalMapTexelMm }, Math.min(SURFACE_CELL_MM.max, Math.max(cellMm * 2.5, 1.2)))
}
