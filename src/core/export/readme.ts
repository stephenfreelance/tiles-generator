import { filamentById } from '../filaments'
import { effectiveBevel } from '../geometry/heightfield'
import { resolveParams, textureById } from '../textures/registry'
import type { DesignConfig, ExportFormat, LayoutPlan } from '../types'
import { formatNumber } from '../units'
import { pieceFileName, sizeText } from './filenames'

const ORIGIN_TEXT: Record<DesignConfig['layout']['origin'], string> = {
  // The grid is read from the top-left, so the leftover falls at the right edge and the bottom.
  corner: 'Started from the top-left corner, cuts on the right and bottom edges',
  center: 'Centred on the surface, equal cuts on opposite edges',
  balanced: 'Balanced, shifted to keep the edge cuts as wide as possible',
}

/** Step 2 of laying out: where the whole tiles are anchored decides where the installer starts. */
const SETOUT_TEXT: Record<DesignConfig['layout']['origin'], string[]> = {
  corner: [
    '  2. Mark the setting-out point, shown as SO on the plan. The whole tiles are read from the',
    '     top-left corner, so the cut pieces fall on the right edge and along the bottom.',
  ],
  center: [
    '  2. Snap the centre lines shown on the plan and work outwards from the setting-out point',
    '     marked SO. The cuts are shared equally between opposite edges.',
  ],
  balanced: [
    '  2. Snap the centre lines shown on the plan and work outwards from the setting-out point',
    '     marked SO. The grid is shifted to keep the edge cuts as wide as possible.',
  ],
}

const OFFSET_TEXT: Record<string, string> = {
  '0': 'Straight rows (stack bond)',
  '0.5': 'Running bond, every other row shifted by half a tile',
  '0.3333': 'Running bond, every row shifted by a third of a tile',
}

const pad = (label: string) => `  ${label.padEnd(16)}`

export function buildReadme(config: DesignConfig, plan: LayoutPlan, format: ExportFormat): string {
  const texture = textureById(config.texture.id)
  const params = resolveParams(texture, config.texture.params)
  const filament = filamentById(config.colorId)
  const area = (config.surface.width * config.surface.height) / 1e6
  const lines: string[] = []

  lines.push(`TESSERA / ${config.name}`)
  lines.push('Decorative relief tiles, generated as printable models.')
  lines.push('')

  lines.push('SURFACE')
  lines.push(`${pad('Size')}${sizeText(config.surface.width)} x ${sizeText(config.surface.height)} mm (${formatNumber(area, 2)} m2)`)
  lines.push(`${pad('Tile')}${sizeText(config.tile.width)} x ${sizeText(config.tile.height)} x ${sizeText(config.tile.thickness)} mm`)
  lines.push(`${pad('Joint')}${sizeText(config.joint)} mm between tiles`)
  // The chamfer the mesher actually cuts: never more than half the base plate.
  lines.push(`${pad('Bevel')}${sizeText(effectiveBevel(config))} mm chamfer on every tile edge`)
  lines.push(`${pad('Layout')}${ORIGIN_TEXT[config.layout.origin]}`)
  lines.push(`${pad('Rows')}${OFFSET_TEXT[String(config.layout.rowOffset)] ?? OFFSET_TEXT['0']}`)
  lines.push(`${pad('Tiles')}${plan.fullCount} full, ${plan.partialCount} cut, ${plan.columns} columns x ${plan.rows} rows`)
  lines.push('')

  lines.push('TEXTURE')
  lines.push(`${pad('Pattern')}${texture.name} (${texture.mark})`)
  lines.push(`${pad('Relief depth')}${sizeText(config.texture.depth)} mm above the base plate`)
  lines.push(`${pad('Feature size')}${sizeText(config.texture.scale)} mm`)
  for (const param of texture.params) {
    const value = params[param.key]
    if (value === undefined) continue
    lines.push(`${pad(param.label)}${formatNumber(value, 2)}${param.unit ? ` ${param.unit}` : ''}`)
  }
  if (texture.seeded) lines.push(`${pad('Seed')}${config.texture.seed}`)
  if (config.texture.invert) lines.push(`${pad('Inverted')}Peaks and valleys swapped`)
  if (texture.directional && config.texture.rotate) lines.push(`${pad('Rotated')}Quarter turn`)
  lines.push('')

  lines.push('FILAMENT')
  lines.push(`${pad('Colour')}${filament.name}`)
  lines.push(`${pad('Line')}${filament.line}`)
  lines.push(`${pad('Hex')}${filament.hex}`)
  lines.push('')

  lines.push(`MODELS (${format.toUpperCase()})`)
  lines.push('  Mark  Piece                     Size            Copies  File')
  for (const piece of plan.pieces) {
    const size = `${sizeText(piece.width)} x ${sizeText(piece.height)} mm`
    lines.push(
      `  ${piece.mark.padEnd(6)}${piece.label.padEnd(26)}${size.padEnd(16)}${String(piece.count).padEnd(8)}${pieceFileName(piece, format)}`,
    )
  }
  lines.push('')
  lines.push('  setting-out-plan.svg    Where every piece goes, with its mark and size.')
  lines.push('  README.txt              This file.')
  lines.push('')

  lines.push('LAYING OUT')
  lines.push('  1. Open setting-out-plan.svg. It shows the surface seen from the front, with each')
  lines.push('     tile position marked A, B, C and so on, and the cut pieces dimensioned.')
  lines.push(...SETOUT_TEXT[config.layout.origin])
  lines.push('  3. Lay the full tiles first, working from the bottom up, then fill the edges with')
  lines.push('     the cut pieces. Every cut piece carries the slice of pattern it replaces, so the')
  lines.push('     relief runs continuously across the joints when each piece sits on its mark.')
  if (config.joint > 0) {
    lines.push(`  4. Keep a ${sizeText(config.joint)} mm joint between tiles; spacers of that size help.`)
  }
  lines.push('')

  lines.push('PRINTING')
  lines.push('  Print face up, relief upwards, flat on the plate. No supports are needed:')
  lines.push('  the relief has no overhangs.')
  lines.push('  Layer height    0.12 to 0.2 mm. Thinner layers show more of the relief.')
  lines.push('  Walls           3 perimeters, so the chamfered edges stay crisp.')
  lines.push('  Infill          15%, gyroid or grid.')
  lines.push('  Brim            Add a brim for the small cut pieces; they have little bed contact.')
  lines.push('  Filament        Any PLA prints well. Matte filaments hide layer lines best.')
  lines.push('')

  lines.push('MOUNTING')
  lines.push('  Glue the tiles with tile adhesive, or with double-sided mounting tape for a')
  lines.push('  removable finish. Check each piece against the plan before the adhesive sets.')
  lines.push('')

  return `${lines.join('\n')}`
}
