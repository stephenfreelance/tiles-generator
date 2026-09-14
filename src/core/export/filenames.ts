import type { ExportFormat, PieceSpec } from '../types'

/** ASCII, lowercase, hyphen separated: "Top-right corner - 42.5 mm" -> "top-right-corner-42-5-mm". */
export function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Millimetres without trailing zeros: 150 -> "150", 42.5 -> "42.5". */
export function sizeText(mm: number): string {
  return String(Number(mm.toFixed(2)))
}

/** e.g. "A_full-tile_150x150_x40.stl" */
export function pieceFileName(piece: PieceSpec, format: ExportFormat): string {
  const label = slug(piece.label)
  const name = [piece.mark, label, `${sizeText(piece.width)}x${sizeText(piece.height)}`, `x${piece.count}`]
    .filter(Boolean)
    .join('_')
  return `${name}.${format}`
}
