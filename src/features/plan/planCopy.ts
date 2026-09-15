// The studio's words for the tiling plan, derived from the plan's geometry and never from the
// zip's setting-out notes, so the rail cannot drift from what the drawing shows.
import { wallCutSides, type PlanModel } from '@/core/plan/planModel'
import { formatLength, formatNumber } from '@/core/units'

const EPS = 0.01

export interface PieceRow {
  pieceId: string
  mark: string
  cut: boolean
  label: string
  size: string
  count: number
}

/** "Right edge · 83.3 × 100 mm" reads as "Right edge": the size already has its own column. */
export function plainLabel(label: string): string {
  return label.split(' · ')[0]
}

const joinAnd = (words: string[]) =>
  words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`

/** The edges that take cuts, as the head of the plan says it. */
export function cutEdgesText(model: PlanModel): string {
  if (model.exact) return 'No cuts'
  const sides = wallCutSides(model)
  if (sides.length === 0) return 'Cuts at the edges'
  if (sides.length === 4) return 'Cuts on every edge'
  if (sides.length === 1) {
    const [side] = sides
    return side === 'top' || side === 'bottom' ? `Cuts along the ${side}` : `Cuts on the ${side}`
  }
  return `Cuts on the ${joinAnd(sides)}`
}

/** One row per printed file, in the core's legend order (the order of the file names). */
export function pieceRows(model: PlanModel): PieceRow[] {
  return model.legend.map((row) => ({
    pieceId: row.pieceId,
    mark: row.mark,
    cut: row.kind !== 'full',
    label: plainLabel(row.label),
    size: `${formatNumber(row.width)} × ${formatNumber(row.height)}`,
    count: row.count,
  }))
}

export function planTotals(model: PlanModel): { total: number; files: number } {
  return { total: model.legend.reduce((sum, row) => sum + row.count, 0), files: model.legend.length }
}

/** A running bond can move the upright line off the middle, to a tile centre or joint of its row. */
function offMiddle(model: PlanModel): boolean {
  const { x } = model.settingOut.centreLines
  return x !== null && Math.abs(x - model.width / 2) > 0.05
}

/** The drawing, said in words for a screen reader. */
export function mapDescription(model: PlanModel): string {
  const so = model.settingOut
  const parts = [`Drawing of your ${formatNumber(model.width)} × ${formatNumber(model.height)} mm wall.`]
  const full = model.legend.find((row) => row.kind === 'full')
  if (model.fullCount > 0) {
    parts.push(`${model.fullCount} whole ${model.fullCount === 1 ? 'tile' : 'tiles'}${full ? `, marked ${full.mark}` : ''}.`)
  }
  if (!model.exact) {
    const phrase = cutEdgesText(model).replace(/^Cuts /, '')
    parts.push(`${model.cutCount} cut ${model.cutCount === 1 ? 'piece' : 'pieces'} ${phrase}.`)
  }
  if (so.modeX === 'edge') {
    parts.push(so.point.y > EPS ? `Start ${formatLength(so.point.y)} up from the bottom edge, at the left.` : 'Start in the bottom-left corner.')
  } else {
    parts.push(
      `Start ${offMiddle(model) ? 'near' : 'in'} the middle of the wall, ${formatLength(so.centreLines.x ?? so.point.x)} from the left and ${formatLength(so.centreLines.y ?? so.point.y)} up.`,
    )
  }
  return parts.join(' ')
}
