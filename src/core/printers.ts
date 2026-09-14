import type { PrinterBed } from './layout'

export interface PrinterPreset extends PrinterBed {
  id: string
  brand: string
}

// Usable single-nozzle build areas (mm) from the manufacturers' published specs.
export const PRINTERS: PrinterPreset[] = [
  { id: 'bambu-a1-mini', brand: 'Bambu Lab', name: 'Bambu Lab A1 mini', width: 180, depth: 180 },
  { id: 'bambu-a1', brand: 'Bambu Lab', name: 'Bambu Lab A1', width: 256, depth: 256 },
  { id: 'bambu-p1s', brand: 'Bambu Lab', name: 'Bambu Lab P1S / P1P', width: 256, depth: 256 },
  { id: 'bambu-p2s', brand: 'Bambu Lab', name: 'Bambu Lab P2S', width: 256, depth: 256 },
  { id: 'bambu-x1c', brand: 'Bambu Lab', name: 'Bambu Lab X1 Carbon', width: 256, depth: 256 },
  { id: 'bambu-h2d', brand: 'Bambu Lab', name: 'Bambu Lab H2D', width: 325, depth: 320 },
  { id: 'bambu-h2s', brand: 'Bambu Lab', name: 'Bambu Lab H2S', width: 340, depth: 320 },
  { id: 'prusa-mini', brand: 'Prusa', name: 'Prusa MINI+', width: 180, depth: 180 },
  { id: 'prusa-mk4', brand: 'Prusa', name: 'Prusa MK4S', width: 250, depth: 210 },
  { id: 'prusa-core-one', brand: 'Prusa', name: 'Prusa CORE One', width: 250, depth: 220 },
  { id: 'creality-k1', brand: 'Creality', name: 'Creality K1 / K1C', width: 220, depth: 220 },
  { id: 'creality-ender3-v3', brand: 'Creality', name: 'Creality Ender-3 V3', width: 220, depth: 220 },
]

export const DEFAULT_PRINTER_ID = 'bambu-p1s'

export function printerById(id: string): PrinterPreset {
  return PRINTERS.find((p) => p.id === id) ?? PRINTERS.find((p) => p.id === DEFAULT_PRINTER_ID)!
}

/** Margin kept free around each tile on the plate (brim, purge line, handling), mm. */
const PLATE_MARGIN = 5
const PLATE_GAP = 4

/** How many pieces of a given size fit on one plate, trying both orientations. */
export function piecesPerPlate(width: number, height: number, bed: PrinterBed): number {
  const usableW = bed.width - 2 * PLATE_MARGIN
  const usableD = bed.depth - 2 * PLATE_MARGIN
  const fit = (w: number, h: number) =>
    Math.max(0, Math.floor((usableW + PLATE_GAP) / (w + PLATE_GAP))) *
    Math.max(0, Math.floor((usableD + PLATE_GAP) / (h + PLATE_GAP)))
  const best = Math.max(fit(width, height), fit(height, width))
  // A tile that only fits without margins still prints alone on the plate.
  if (best === 0 && ((width <= bed.width && height <= bed.depth) || (height <= bed.width && width <= bed.depth))) return 1
  return best
}
