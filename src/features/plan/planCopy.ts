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

/** A printed part that is not a tile: the wall clips, the keys. */
export interface AccessoryRow {
  id: string
  mark: string
  label: string
  /** Footprint on the bed, "246 × 20". */
  size: string
  count: number
  /** How many files the row stands for: one, since a row is a file. */
  files: number
}

/**
 * One row per part file, after the tiles and in the download's order. The plan model carries the wall's
 * own parts (wallParts), so the fit test never reaches here: it prints from its own page.
 */
export function accessoryRows(model: PlanModel): AccessoryRow[] {
  return model.accessories.map((a) => ({
    id: a.id,
    mark: a.mark,
    label: a.label,
    size: `${formatNumber(a.size.x)} × ${formatNumber(a.size.y)}`,
    count: a.count,
    files: 1,
  }))
}

/** Everything to print: the tiles and the wall's parts, and the files they come in. */
export function planTotals(model: PlanModel): { total: number; files: number } {
  const parts = model.accessories
  const tiles = model.legend.reduce((sum, row) => sum + row.count, 0)
  const copies = parts.reduce((sum, a) => sum + a.count, 0)
  return { total: tiles + copies, files: model.legend.length + parts.length }
}

/** A running bond can move the upright line off the middle, to a tile centre or joint of its row. */
function offMiddle(model: PlanModel): boolean {
  const { x } = model.settingOut.centreLines
  return x !== null && Math.abs(x - model.width / 2) > 0.05
}

/**
 * ", marked A", or for border versions of the whole tile ", marked A and B" or ", marked A to I": whole
 * tiles sort first, so their marks run without a gap.
 */
function wholeMarks(model: PlanModel): string {
  const marks = model.legend.filter((row) => row.kind === 'full').map((row) => row.mark)
  if (marks.length === 0) return ''
  if (marks.length <= 2) return `, marked ${joinAnd(marks)}`
  return `, marked ${marks[0]} to ${marks.at(-1)}`
}

const count = (n: number) => formatNumber(n, 0)

/** "piece F", "pieces F and G": the marks of the pieces a line is about. */
const piecesText = (marks: string[]) => (marks.length === 1 ? `piece ${marks[0]}` : `pieces ${joinAnd(marks)}`)

/** The fixings on the drawing, in words: the clips, the pieces with none, the keys and tabs, and what they leave. */
export function fixingsDescription(model: PlanModel): string[] {
  const parts: string[] = []
  const clips = model.clips.length
  if (clips > 0) {
    // No clip is set out on the wall: each tile carries its own, so the drawing only shows where they end up.
    parts.push(
      `${clips === 1 ? 'One wall clip, in its pocket' : `${count(clips)} wall clips, each in its pocket`} on the back of a tile: each tile carries its own clips to the wall.`,
    )
    const off = model.legend.filter((row) => model.unclippedPieceIds.includes(row.pieceId)).map((row) => row.mark)
    if (off.length > 0) parts.push(`${off.length === 1 ? 'Piece' : 'Pieces'} ${joinAnd(off)} ${off.length === 1 ? 'has' : 'have'} no clip.`)
  }
  if (model.keys.length > 0) {
    parts.push(`${count(model.keys.length)} ${model.keys.length === 1 ? 'key locks' : 'keys lock'} neighbouring tiles edge to edge across their joints.`)
  }
  // Nothing is drawn or set out for a tab: every tile carries its own. What the plan can say is how many
  // joints they hold and which pieces they leave, which is what the legend's "no tab" rows are there for.
  if (model.locks > 0) {
    const joints = model.locks === 1 ? 'One joint is' : `${count(model.locks)} joints are`
    parts.push(`${joints} held shut by a tab in the back of one tile and the socket in the next; nothing is drawn for them.`)
    const loose = model.legend.filter((row) => model.unlockedPieceIds.includes(row.pieceId)).map((row) => row.mark)
    if (loose.length > 0) {
      const one = loose.length === 1
      parts.push(`${one ? 'Piece' : 'Pieces'} ${joinAnd(loose)} ${one ? 'has' : 'have'} no room for a socket, so no tab locks ${one ? 'it' : 'them'}.`)
    }
  }
  if (model.unkeyedSeams > 0) {
    const seams = model.unkeyedSeams === 1 ? 'One joint is' : `${count(model.unkeyedSeams)} joints are`
    const loose = model.legend.filter((row) => model.unkeyedPieceIds.includes(row.pieceId)).map((row) => row.mark)
    parts.push(
      loose.length > 0
        ? `${seams} too short for a key: glue ${piecesText(loose)} to the tiles beside ${loose.length === 1 ? 'it' : 'them'}.`
        : `${seams} too short for a key, but every piece is still keyed to a neighbour.`,
    )
  }
  return parts
}

/** The drawing, said in words for a screen reader. */
export function mapDescription(model: PlanModel): string {
  const so = model.settingOut
  // The drawing calls the point SO on clips, whose own start line is the bottom edge (WallMap's word).
  const clips = model.clips.length > 0
  const start = clips ? 'Setting-out point (SO)' : 'Start'
  const parts = [`Drawing of your ${formatNumber(model.width)} × ${formatNumber(model.height)} mm wall.`]
  if (model.fullCount > 0) {
    parts.push(`${model.fullCount} whole ${model.fullCount === 1 ? 'tile' : 'tiles'}${wholeMarks(model)}.`)
  }
  if (!model.exact) {
    const phrase = cutEdgesText(model).replace(/^Cuts /, '')
    parts.push(`${model.cutCount} cut ${model.cutCount === 1 ? 'piece' : 'pieces'} ${phrase}.`)
  }
  if (so.modeX === 'edge') {
    parts.push(so.point.y > EPS ? `${start} ${formatLength(so.point.y)} up from the bottom edge, at the left.` : `${start} in the bottom-left corner.`)
  } else {
    parts.push(
      `${start} ${offMiddle(model) ? 'near' : 'in'} the middle of the wall, ${formatLength(so.centreLines.x ?? so.point.x)} from the left and ${formatLength(so.centreLines.y ?? so.point.y)} up.`,
    )
  }
  if (clips) parts.push('The start line is the bottom edge of the tiles: the bottom row stands on a batten along it, and the rows go up from there.')
  parts.push(...fixingsDescription(model))
  return parts.join(' ')
}
