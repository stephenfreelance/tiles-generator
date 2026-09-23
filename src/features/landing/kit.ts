// The contents of the zip as section 03 lays them out, worked out without a DOM so a test can hold the
// plate to the exporter: the same file names, the same count, and one scale for the whole family.
import { pieceFileName } from '@/core/export/filenames'
import type { LayoutPlan, PieceSpec } from '@/core/types'

export interface ZipDocument {
  /** The file's name in the zip, as the exporter writes it. */
  name: string
  /** What the sheet shows, which decides how it is drawn. */
  kind: 'plan' | 'readme'
  what: string
  detail: string
}

/** The two files the exporter writes whatever the wall is, with their names from `handleRequest`. */
export const ZIP_DOCUMENTS: readonly ZipDocument[] = [
  { name: 'setting-out-plan.svg', kind: 'plan', what: 'Setting-out plan', detail: 'Where every piece goes, dimensioned' },
  { name: 'README.txt', kind: 'readme', what: 'README', detail: 'Sizes, settings and print advice' },
]

/** Every file in the zip of a wall with no keys and no clips, in the order the exporter writes them. */
export function zipFileNames(plan: Pick<LayoutPlan, 'pieces'>, format: 'stl' | 'step' = 'stl'): string[] {
  return [...plan.pieces.map((piece) => pieceFileName(piece, format)), ...ZIP_DOCUMENTS.map((doc) => doc.name)]
}

/**
 * Each piece's size as a fraction of the family's longest side, so the kit can stand every model at its
 * true size against the others: the longest side any piece has fills its box, and a 100 mm cut beside
 * a 150 mm tile stands two thirds as tall. An empty family is sized against 1 mm rather than dividing by 0.
 */
export function kitScale(pieces: readonly Pick<PieceSpec, 'width' | 'height'>[]) {
  const longest = pieces.reduce((long, piece) => Math.max(long, piece.width, piece.height), 0) || 1
  return (piece: Pick<PieceSpec, 'width' | 'height'>): { width: number; height: number } => ({
    width: piece.width / longest,
    height: piece.height / longest,
  })
}
