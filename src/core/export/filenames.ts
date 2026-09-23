import type { AccessorySpec } from '../fixing/types'
import type { ExportFormat, PieceSpec } from '../types'

/** The documents in the zip, at its root beside the tiles. */
export const SETTING_OUT_PLAN_FILE = 'setting-out-plan.svg'
export const README_FILE = 'README.txt'

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

/**
 * Like `slug`, but a length stays readable the way pieceFileName writes sizes: "15.8 mm" -> "15.8mm",
 * "0.2 mm" -> "0.2mm" (the dot survives between digits).
 */
function detailSlug(text: string): string {
  const words = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d)\s*mm\b/g, '$1mm')
    .match(/\d+(?:\.\d+)?[a-z0-9]*|[a-z0-9]+/g)
  return (words ?? []).join('-')
}

/**
 * A printed part's file, named like a tile's: mark, what it is, its size or class, copies. The label's
 * part after the first comma is the detail: "Wall clip, standard fit" x29 -> "C1_wall-clip_standard-fit_x29.stl",
 * "Key, 15.8 mm" x20 -> "K1_key_15.8mm_x20.stl", "Test clip 1, snug" -> "F3_test-clip-1_snug_x1.stl". The folder
 * is the zip's business (accessoryZipPath).
 */
export function accessoryFileName(spec: Pick<AccessorySpec, 'mark' | 'label' | 'count'>, format: ExportFormat): string {
  const comma = spec.label.indexOf(',')
  const head = comma >= 0 ? spec.label.slice(0, comma) : spec.label
  const detail = comma >= 0 ? spec.label.slice(comma + 1) : ''
  const name = [spec.mark, slug(head), detailSlug(detail), `x${spec.count}`].filter(Boolean).join('_')
  return `${name}.${format}`
}

/**
 * Where a printed part sits in the zip: its group's folder ('fit-test', 'mount' for the clips, 'join' for the
 * keys), e.g. "mount/C1_wall-clip_standard-fit_x29.stl". The tiles sit at the root.
 */
export function accessoryZipPath(spec: Pick<AccessorySpec, 'mark' | 'label' | 'count' | 'group'>, format: ExportFormat): string {
  return `${spec.group}/${accessoryFileName(spec, format)}`
}
