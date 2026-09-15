import { colorName } from '../colors'
import { effectiveBevel } from '../geometry/heightfield'
import { buildPlanModel, tileAtPoint, wallCutSides, type PlanModel } from '../plan/planModel'
import { resolveParams, textureById } from '../textures/registry'
import type { DesignConfig, ExportFormat, LayoutPlan } from '../types'
import { formatNumber } from '../units'
import { pieceFileName, sizeText } from './filenames'

const ORIGIN_TEXT: Record<DesignConfig['layout']['origin'], string> = {
  corner: 'Set out from the left edge',
  center: 'Centred on the surface',
  balanced: 'Balanced, shifted to keep the edge cuts as wide as possible',
}

/** The wall edges that really take cuts, as the studio's plan names them. */
function cutsText(model: PlanModel): string {
  if (model.exact) return 'no cuts'
  const sides = wallCutSides(model)
  if (sides.length === 0) return 'cuts at the edges'
  if (sides.length === 4) return 'cuts on every edge'
  const list = sides.length === 1 ? sides[0] : `${sides.slice(0, -1).join(', ')} and ${sides.at(-1)}`
  return `cuts on the ${list} ${sides.length === 1 ? 'edge' : 'edges'}`
}

/** One numbered step, wrapped under its number the way the rest of the file is set. */
function step(number: number, text: string, width = 88): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && `${line} ${word}`.length > width - 5) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines.map((text, i) => `${i === 0 ? `  ${number}. ` : '     '}${text}`)
}

/** Where to start, from the same setting-out point the plan and the studio draw. */
function setOutStep(config: DesignConfig, model: PlanModel): string {
  const { point } = model.settingOut
  const cuts = model.exact ? '' : ` The ${cutsText(model).replace(/^cuts/, 'cut pieces fall')}.`
  if (config.layout.origin === 'corner') {
    if (point.y > 0.01) {
      return `Mark the setting-out point, shown as SO on the plan: measure ${sizeText(point.y)} mm up from the bottom edge at the left and draw a level line. The first full-height row sits on it.${cuts}`
    }
    return `Start in the bottom-left corner, at the setting-out point marked SO on the plan.${cuts}`
  }
  const why = config.layout.origin === 'center' ? ' The cuts are shared between opposite edges.' : ' The grid is shifted to keep the edge cuts as wide as possible.'
  return `Snap the setting-out lines shown on the plan and work outwards from the point marked SO.${why}`
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
  const area = (config.surface.width * config.surface.height) / 1e6
  const model = buildPlanModel(config, plan)
  const firstPiece = tileAtPoint(model.tiles, model.settingOut.point)
  const lines: string[] = []

  lines.push(`TESSERA / ${config.name}`)
  lines.push('Decorative relief tiles, generated as printable models.')
  lines.push('')

  lines.push('SURFACE')
  lines.push(`${pad('Size')}${sizeText(config.surface.width)} x ${sizeText(config.surface.height)} mm (${formatNumber(area, 2)} m2)`)
  lines.push(`${pad('Tile')}${sizeText(config.tile.width)} x ${sizeText(config.tile.height)} x ${sizeText(config.tile.thickness)} mm`)
  lines.push(`${pad('Color')}${colorName(config.color)} (${config.color})`)
  lines.push(`${pad('Joint')}${sizeText(config.joint)} mm between tiles`)
  // The chamfer the mesher actually cuts: never more than half the base plate.
  lines.push(`${pad('Bevel')}${sizeText(effectiveBevel(config))} mm chamfer on every tile edge`)
  lines.push(`${pad('Layout')}${ORIGIN_TEXT[config.layout.origin]}, ${cutsText(model)}`)
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
  lines.push(...step(2, setOutStep(config, model)))
  // A row that starts on a cut (a running bond) cannot leave its cuts for last.
  const order =
    firstPiece?.cut || plan.fullCount === 0
      ? 'Lay each row from its first piece, working from the bottom up and fitting the cut pieces as you reach them.'
      : 'Lay the full tiles first, working from the bottom up, then fill the edges with the cut pieces.'
  lines.push(
    ...step(
      3,
      `${order} Every cut piece carries the slice of pattern it replaces, so the relief runs continuously across the joints when each piece sits on its mark.`,
    ),
  )
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
  lines.push('  Filament        Any PLA in the color listed under SURFACE.')
  lines.push('')

  lines.push('MOUNTING')
  lines.push('  Glue the tiles with tile adhesive, or with double-sided mounting tape for a')
  lines.push('  removable finish. Check each piece against the plan before the adhesive sets.')
  lines.push('')

  return `${lines.join('\n')}`
}
