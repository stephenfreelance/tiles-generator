// Step 7, "Putting it up", in words: the cards of its two questions and the "What changes" well under
// them. Everything the well says is read off the plans (mountPlan, joinPlan, the printed parts), never off
// the switches, so a system is named only once the wall really places it. The steps themselves are
// guide.ts's (mountingSummary), never worded here. Pure, so every line is tested without a DOM.

import {
  fitChosenText,
  fixingSystem,
  listText,
  marksText,
  mountingSummary,
  usesClips,
  usesKeys,
  usesTabs,
  type FixingSystem,
} from '@/core/fixing/guide'
import { pieceFeatures } from '@/core/fixing/features'
import { joinPlan } from '@/core/fixing/joins'
import { clipSites, mountPlan } from '@/core/fixing/mount'
import { tabPlan } from '@/core/fixing/tabs'
import type { AccessorySpec, BackFeature, JoinPlan, MountPlan } from '@/core/fixing/types'
import type { DesignConfig, LayoutPlan, PieceSpec } from '@/core/types'
import { formatLength, formatNumber, formatSize } from '@/core/units'
import { heroPiece } from '@/hooks/previewLod'
import { fitLabel, fittedParts, plateRaisedNote, type FittedParts, type TileModels } from './edges'

/** One card of a step-7 question. Its name alone names it; the figure and the note describe it. */
export interface MountingCard {
  value: string
  name: string
  /** What sits behind the tiles, on the wall question only. */
  figure?: string
  note: string
}

/** "On the wall": how each tile is held to the wall. The figure states what is behind the tiles. */
export const WALL_CARDS: readonly MountingCard[] = [
  { value: 'glue', name: 'Glue or tape', figure: 'Adhesive behind', note: 'Tile adhesive or mounting tape on the flat backs.' },
  {
    value: 'clips',
    name: 'Wall clips',
    figure: 'Only tape behind',
    note: 'Printed clips on the wall: each tile clicks on and pulls off.',
  },
]

/** The value of the "Tile to tile" card for a design with no lock at all. */
export const SIDE_BY_SIDE = 'side'

/** "Tile to tile": how neighbours hold each other. Every lock holds in the plane of the wall only. */
export const JOIN_CARDS: readonly MountingCard[] = [
  { value: SIDE_BY_SIDE, name: 'Side by side', note: 'Each tile goes up on its own.' },
  { value: 'keys', name: 'Keys', note: 'Printed keys across the joints: even joints, straight rows.' },
  {
    value: 'tabs',
    name: 'Tabs',
    note: 'A tab on each tile in the socket of the next. Nothing extra to print.',
  },
]

/** "On your tiles": the piece the well draws from the back, and what is cut into it. */
export interface MountingBack {
  /** The piece drawn: tile A, the one the 3D view turns over. */
  piece: PieceSpec
  /** "tile A", or "piece C" when the wall has no whole tile. */
  name: string
  keySlots: number
  clipPockets: number
  /** The tabs standing out past this piece's side, and the sockets cut into it, when the design locks with them. */
  tabs: number
  sockets: number
  /** What the drawing shows, in words, so nothing lives only in the picture. */
  caption: string
  /** The button that turns the 3D view to this back; null while the back is flat and has nothing to show. */
  peek: string | null
}

/** Everything under step 7's cards, for one design. */
export interface MountingExplained {
  system: FixingSystem
  /** Step 7's heading value: "Glued", "On clips · with keys". A system is named only once placed. */
  now: string
  back: MountingBack | null
  /** "You'll print": counted from the plans and the printed parts. */
  print: string[]
  /** "You'll need": what to buy, named generically. */
  need: string[]
  /** "You'll do": guide.ts's summary, word for word. */
  steps: string[]
  /** "Good to know": two or three trade-offs, in the design's own numbers. */
  know: string[]
  /** The one line that contradicts the card just clicked: a system chosen but placed nowhere. Null otherwise. */
  warning: string | null
  /** The Fit control, only while fitted parts really print; its note is guide.ts's own fitChosenText. */
  fit: { parts: FittedParts; label: string; note: string } | null
  /** "Also changed": the plate raised for the pockets in the same step, or null. */
  alsoChanged: string | null
  /** One sentence for a screen reader once a card is chosen. */
  spoken: string
}

const count = (value: number): string => formatNumber(value, 0)

const plural = (value: number, one: string, many = `${one}s`): string => `${count(value)} ${value === 1 ? one : many}`

/** The heading value, from what the plans place. */
export function mountingNow(system: FixingSystem): string {
  const wall = usesClips(system) ? 'On clips' : 'Glued'
  const lock = usesKeys(system) ? 'keys' : usesTabs(system) ? 'tabs' : null
  return lock ? `${wall} · with ${lock}` : wall
}

/** The deepest a feature reaches into the back, mm. */
const depthOf = (features: readonly BackFeature[]): number =>
  features.reduce((deepest, f) => Math.max(deepest, ...f.levels.map((level) => level.z1)), 0)

/** "tile A" for a whole tile, "piece C" for a cut: the words the 3D view's pill uses. */
export const pieceName = (piece: Pick<PieceSpec, 'kind' | 'mark'>): string => `${piece.kind === 'full' ? 'tile' : 'piece'} ${piece.mark}`

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** "a, and b", "a, b, and c": the back caption's own list, whose items carry commas of their own. */
const andList = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`

function backOf(config: DesignConfig, plan: LayoutPlan): MountingBack | null {
  const piece = heroPiece(plan)
  if (!piece) return null
  const features = pieceFeatures(config, piece)
  const keys = features.filter((f) => f.role === 'key-pocket')
  const clips = features.filter((f) => f.role === 'clip-pocket')
  // A tab is the one back feature that adds material rather than cutting it, so it is said as a thickness.
  const sockets = features.filter((f) => f.role === 'join-socket')
  const tabs = features.filter((f) => f.role === 'join-tab')
  const name = pieceName(piece)
  const seen = `${capital(name)}, seen from the back`
  const what = [
    keys.length > 0 ? `${plural(keys.length, 'key slot')} along its sides, ${formatLength(depthOf(keys))} deep` : '',
    sockets.length > 0 ? `${plural(sockets.length, 'socket')} in its left side, ${formatLength(depthOf(sockets))} deep` : '',
    tabs.length > 0 ? `${plural(tabs.length, 'tab')} standing out past its right side, ${formatLength(depthOf(tabs))} thick` : '',
    clips.length > 0 ? `${plural(clips.length, 'clip pocket')}, ${formatLength(depthOf(clips))} deep` : '',
  ].filter(Boolean)
  let caption: string
  if (what.length === 0) {
    // Nothing is drawn for a flat back, so the caption cannot lean on a drawing to name what is seen.
    caption = `Nothing is cut into ${name}: its back stays flat.`
  } else {
    // The drawing's circle magnifies a clip pocket when there is one (TileBackFigure), else the lock's own recess.
    const circle =
      clips.length > 0
        ? "The circle shows a clip clicked into its pocket, its back level with the tile's back."
        : sockets.length > 0
          ? 'The circle shows the tab of the tile beside it, standing in one socket.'
          : 'The circle shows a key in its slot, reaching across the joint into the next tile.'
    caption = `${seen}: ${andList(what)}. ${circle} The front does not change.`
  }
  return {
    piece,
    name,
    keySlots: keys.length,
    clipPockets: clips.length,
    tabs: tabs.length,
    sockets: sockets.length,
    caption,
    peek: features.length > 0 ? `See the back of ${name}` : null,
  }
}

/** "32 tiles", "24 tiles and 8 cut pieces", "6 cut pieces". */
function tilesText(plan: LayoutPlan): string {
  const whole = plan.fullCount
  const cut = plan.partialCount
  if (cut === 0) return plural(whole, 'tile')
  if (whole === 0) return plural(cut, 'cut piece')
  return `${plural(whole, 'tile')} and ${plural(cut, 'cut piece')}`
}

/** The wall's own file of a part kind (the clips in the mount group, the keys in the join group). */
const wallPart = (accessories: readonly AccessorySpec[], kind: 'clip' | 'key'): AccessorySpec | undefined =>
  accessories.find((part) => part.kind === kind && part.group === (kind === 'clip' ? 'mount' : 'join'))

/** "68 wall clips (C1), from one file: 64 to fit and 4 spares." */
function partLine(part: AccessorySpec, fitted: number, one: string, many: string): string {
  const spares = Math.max(0, part.count - fitted)
  const fit = spares > 0 ? `${count(fitted)} to fit and ${plural(spares, 'spare')}` : `${count(fitted)} to fit`
  return `${count(part.count)} ${part.count === 1 ? one : many} (${part.mark}), from one file: ${fit}.`
}

function printLines(
  plan: LayoutPlan,
  system: FixingSystem,
  mount: MountPlan,
  join: JoinPlan,
  accessories: readonly AccessorySpec[],
  models: TileModels,
): string[] {
  const tiles = tilesText(plan)
  const files = plural(models.now, 'file')
  if (system === 'glue') return [`Only your ${tiles}, from ${files}.`]
  // A lock makes each tile on the boundary a file of its own: it has nothing to lock to on its outer side.
  const why = usesTabs(system)
    ? 'a tile with no tile beside it has no tab or socket on that side'
    : 'a tile on the edge of the wall has no slot on its outer side'
  const lines = [
    models.now > models.noLock
      ? `Your ${tiles}, from ${files}, not ${count(models.noLock)}: ${why}, so the edge tiles are files of their own.`
      : `Your ${tiles}, from ${files}.`,
  ]
  // The whole point of the tabs, said where the maker is counting files: they add none.
  if (usesTabs(system)) lines.push('Nothing for the tabs: each one is part of its own tile.')
  const clip = wallPart(accessories, 'clip')
  if (usesClips(system) && clip) lines.push(partLine(clip, mount.clips, 'wall clip', 'wall clips'))
  const key = wallPart(accessories, 'key')
  if (usesKeys(system) && key) lines.push(partLine(key, join.keys, 'key', 'keys'))
  const test = accessories.filter((part) => part.group === 'fit-test')
  if (test.length > 0) {
    const pieces = test.reduce((sum, part) => sum + part.count, 0)
    lines.push(`A fit test of ${plural(pieces, 'small piece')} (${marksText(test.map((part) => part.mark))}), to print first.`)
  }
  return lines
}

/** The marks of some pieces, by id, in plan order: as the tiling plan letters them. */
const marksOf = (plan: LayoutPlan, ids: readonly string[]): string[] =>
  plan.pieces.filter((piece) => ids.includes(piece.id)).map((piece) => piece.mark)

/** "Piece C has" / "Pieces C and D have": the guide's own opening for a sentence about some pieces. */
const piecesHave = (marks: readonly string[]): string =>
  marks.length === 1 ? `Piece ${marks[0]} has` : `Pieces ${listText(marks)} have`

/** "the piece marked D, which has" / "the 7 pieces marked C and D, which have": counted on the wall, not as files. */
function unclippedText(plan: LayoutPlan, mount: MountPlan): string | null {
  const off = new Set(mount.unmountedPieceIds)
  // One piece id is one printed file and any number of tiles on the wall: the maker glues the tiles.
  const pieces = plan.placements.filter((placement) => off.has(placement.pieceId)).length
  if (pieces === 0) return null
  const marks = listText(marksOf(plan, mount.unmountedPieceIds))
  return pieces === 1 ? `the piece marked ${marks}, which has` : `the ${count(pieces)} pieces marked ${marks}, which have`
}

function needLines(plan: LayoutPlan, system: FixingSystem, mount: MountPlan): string[] {
  if (system === 'glue') return ['Tile adhesive or double-sided mounting tape.']
  if (system === 'keys') return ['Tile adhesive or double-sided mounting tape.', 'A flat table as big as the panel you key.']
  // A tabbed wall is glued or taped like any other; what it adds is the line the bottom row stands on.
  if (system === 'tabs') {
    return ['Tile adhesive or double-sided mounting tape.', 'A spirit or laser level, and a straight batten for the bottom row to stand on.']
  }
  const unclipped = unclippedText(plan, mount)
  return [
    'Thin double-sided tape (film or carpet tape, not foam): a piece on each clip.',
    'A spirit or laser level, and a straight batten for the bottom row to stand on.',
    // The guide glues them thin, so they sit level with their neighbours' backs on the wall.
    ...(unclipped ? [`A thin glue for ${unclipped} no clip.`] : []),
    `Optional, to screw the clips on for good: ${plural(mount.clips, 'wall plug')} (5 mm) and ${plural(mount.clips, 'countersunk screw')} (3.5 mm).`,
  ]
}

/**
 * The pieces with no clip pocket, split the way guide.ts's noClipStep splits them, so the well and the
 * download guide send the same piece to the same fix: a keyed piece takes a drop of glue in its key slots,
 * an unkeyed one is glued to the wall. One line, because "Good to know" keeps at most three.
 */
function noClipLine(plan: LayoutPlan, system: FixingSystem, mount: MountPlan, join: JoinPlan): string | null {
  const off = mount.unmountedPieceIds
  if (off.length === 0) return null
  const unkeyed = new Set(join.unkeyedPieceIds)
  const both = system === 'both'
  const keyed = both ? marksOf(plan, off.filter((id) => !unkeyed.has(id))) : []
  const glued = marksOf(plan, both ? off.filter((id) => unkeyed.has(id)) : off)
  const all = marksOf(plan, off)
  // Keys hold in the plane of the wall only: a drop of glue in the slots is what keeps such a piece on it.
  const keySlots = (marks: readonly string[]) =>
    `put a drop of glue in the key slots of ${listText(marks)}, whose keys hold ${marks.length === 1 ? 'it' : 'them'} in line with the tiles around`
  if (keyed.length === 0) {
    return `${piecesHave(glued)} no room for a clip: glue ${glued.length === 1 ? 'it' : 'them'} to the wall.`
  }
  if (glued.length === 0) {
    const one = keyed.length === 1
    return `${piecesHave(keyed)} no room for a clip: ${one ? 'its' : 'their'} keys hold ${one ? 'it' : 'them'} in line with the tiles around, and a drop of glue in ${one ? 'its' : 'their'} key slots keeps ${one ? 'it' : 'them'} on the wall.`
  }
  return `${piecesHave(all)} no room for a clip: ${keySlots(keyed)}, and glue ${listText(glued)} to the wall.`
}

/** How many clips the pieces carry: what the well may promise about a tile of this wall. */
interface ClipCounts {
  /** The count every whole tile shares, or null when they differ; 0 when no whole tile takes one. */
  perWholeTile: number | null
  /** The most any whole tile carries, 0 when none does. */
  mostInWholeTile: number
  /** The count every piece that takes clips shares, or null when they differ. */
  perClippedPiece: number | null
}

function clipCounts(config: DesignConfig, plan: LayoutPlan): ClipCounts {
  const counts = plan.pieces.map((piece) => ({ full: piece.kind === 'full', clips: clipSites(config, piece).length }))
  const shared = (values: number[]): number | null => (values.length > 0 && values.every((v) => v === values[0]) ? values[0] : null)
  const whole = counts.filter((c) => c.full).map((c) => c.clips)
  return {
    perWholeTile: shared(whole),
    mostInWholeTile: whole.length > 0 ? Math.max(...whole) : 0,
    perClippedPiece: shared(counts.filter((c) => c.clips > 0).map((c) => c.clips)),
  }
}

/**
 * The one line that contradicts what the maker just clicked: a system chosen that the plans place
 * nowhere. It is said above the well rather than among the trade-offs, which is where it was buried,
 * and it reads off what is placed (fixingSystem), never off the switches.
 */
export function unplacedNote(config: DesignConfig, system: FixingSystem): string | null {
  const lines: string[] = []
  if (config.mount === 'clips' && !usesClips(system)) {
    lines.push('No tile of this wall takes a wall clip, so it goes up with glue or tape. The notes under the tiling plan say why.')
  }
  if (config.lock === 'keys' && !usesKeys(system)) {
    lines.push('No joint of this wall takes a key, so none is printed. The notes under the tiling plan say why.')
  }
  if (config.lock === 'tabs' && !usesTabs(system)) {
    lines.push('No joint of this wall takes a tab, so none is cut. The notes under the tiling plan say why.')
  }
  return lines.length > 0 ? lines.join(' ') : null
}

function knowLines(config: DesignConfig, plan: LayoutPlan, system: FixingSystem, mount: MountPlan, join: JoinPlan, clips: ClipCounts): string[] {
  const lines: string[] = []
  const holder = usesClips(system) ? 'The clips hold them to the wall.' : 'The adhesive holds them to the wall.'
  if (usesKeys(system)) {
    lines.push(`Keys lock each tile to its neighbours edge to edge, in the plane of the wall: joints stay even and rows stay straight. ${holder}`)
  }
  // The keys' own promise, in the keys' own words, because the tabs make exactly the same one.
  if (usesTabs(system)) {
    lines.push(`Tabs lock each tile to the one beside it edge to edge, in the plane of the wall: joints stay even and rows stay straight. ${holder}`)
  }
  if (system === 'tabs') {
    lines.push(
      'Nothing locks one row to the next, so each row is its own strip, and the tiles go up one at a time along each ' +
        'row: a tab wall is never laid out face down on a table and lifted on.',
    )
    lines.push('A tile brought to the wrong joint stands proud instead of lying down, so it cannot go on in the wrong place.')
  }
  if (system === 'keys') {
    lines.push(
      `You press the keys in with the tiles face down on a flat table as big as the panel: this wall is ${formatSize(config.surface.width, config.surface.height)}. A big wall goes up in panels you can lift.`,
    )
  }
  if (usesClips(system)) {
    // A number only when every clipped piece really carries it, and "with clips" while some carry none.
    const per = clips.perClippedPiece
    const each = per === 1 ? 'its clip stays' : per !== null && per > 1 ? `its ${count(per)} clips stay` : 'its clips stay'
    const any = mount.unmountedPieceIds.length > 0 ? 'Any tile with clips' : 'Any tile'
    const keys = usesKeys(system) ? ' Its keys stay in it or in the tile next to it.' : ''
    // A tab cannot rise past the ceiling of the socket it stands in, so a tabbed row comes apart from its
    // right-hand end rather than a tile at a time: "Putting it up" carries the reason, this carries the order.
    if (usesTabs(system)) {
      lines.push(
        `A tile comes off once the tile to its right is off, so take a row off from that end: ${each} on the wall for when it goes back.`,
      )
    } else {
      lines.push(`${any} comes off on its own: pull it straight off, and ${each} on the wall for when it goes back.${keys}`)
    }
    const noClip = noClipLine(plan, system, mount, join)
    if (noClip) lines.push(noClip)
    lines.push('The tiles sit on the wall with only the tape behind them, so the wall must be flat: fill any hollow first.')
  }
  if (system === 'glue') {
    lines.push('Mounting tape can come off the wall again; tile adhesive is for good.')
    lines.push('The tiles follow your wall: fill any hollow before you start.')
  }
  return lines.slice(0, 3)
}

/** What a choice the plans place nothing for leaves out, said after the summary. */
function unplacedText(config: DesignConfig, system: FixingSystem): string {
  const clips = config.mount === 'clips' && !usesClips(system) ? ' No tile of this wall takes a wall clip.' : ''
  const keys = config.lock === 'keys' && !usesKeys(system) ? ' No joint of this wall takes a key.' : ''
  const tabs = config.lock === 'tabs' && !usesTabs(system) ? ' No joint of this wall takes a tab.' : ''
  return `${clips}${keys}${tabs}`
}

function spokenText(system: FixingSystem, clips: ClipCounts, mount: MountPlan, join: JoinPlan, models: TileModels): string {
  const now = mountingNow(system).replace(' · ', ', ')
  if (system === 'glue') return `${now}: nothing to print but your tiles.`
  const files = models.now > models.noLock ? `, and your tiles come from ${plural(models.now, 'file')}` : ''
  if (system === 'keys') return `${now}: ${plural(join.keys, 'key')} to fit${files}.`
  // Nothing is printed for a tab, so what there is to say is the file count the edge tiles cost.
  if (system === 'tabs') return `${now}: nothing extra to print${files}.`
  // "in each whole tile" only while every whole tile really carries that many: a border profile or a key
  // slot can leave its neighbours with fewer, and then the most one carries is all that can be promised.
  const each =
    clips.perWholeTile !== null && clips.perWholeTile > 0
      ? `, ${count(clips.perWholeTile)} in each whole tile`
      : clips.mostInWholeTile > 0
        ? `, up to ${count(clips.mostInWholeTile)} in a whole tile`
        : ''
  if (system === 'clips') return `${now}: ${plural(mount.clips, 'wall clip')} to fit${each}.`
  if (system === 'clips-tabs') return `${now}: ${plural(mount.clips, 'wall clip')} to fit${each}${files}.`
  return `${now}: ${plural(mount.clips, 'wall clip')} and ${plural(join.keys, 'key')} to fit${files}.`
}

/**
 * The "What changes" well for a design: what is cut into its tiles, what it prints and needs, the short
 * way up, the trade-offs, the fit, and the plate step 7 raised (`raisedFrom`, off the undo history).
 * `accessories` are the printed parts as the download holds them (accessoryParts); `models` the tile
 * files with and without the keys (tileModels).
 */
export function explainMounting(
  config: DesignConfig,
  plan: LayoutPlan,
  accessories: readonly AccessorySpec[],
  models: TileModels,
  raisedFrom: number | null = null,
): MountingExplained {
  const mount = mountPlan(config, plan)
  const join = joinPlan(config, plan)
  const tab = tabPlan(config, plan)
  const system = fixingSystem(config, mount, join, tab)
  const back = backOf(config, plan)
  // Nothing is printed for a tab, so the accessory list cannot say the tabs carry the fit: the plan does.
  const parts = fittedParts(accessories, usesTabs(system))
  const fits = parts.keys || parts.clips || parts.tabs
  const alsoChanged = raisedFrom === null ? null : plateRaisedNote(raisedFrom, config)
  const clips = clipCounts(config, plan)
  const spoken = `${spokenText(system, clips, mount, join, models)}${unplacedText(config, system)}`
  return {
    system,
    now: mountingNow(system),
    back,
    print: printLines(plan, system, mount, join, accessories, models),
    need: needLines(plan, system, mount),
    steps: mountingSummary({ config, plan, mount, join, tab, accessories }),
    know: knowLines(config, plan, system, mount, join, clips),
    warning: unplacedNote(config, system),
    // The fit, in millimetres, is said in one place for the studio, the download's step 1 and the fit-test page.
    fit: fits ? { parts, label: fitLabel(parts), note: fitChosenText(config, system) } : null,
    alsoChanged,
    spoken: alsoChanged ? `${spoken} ${alsoChanged}` : spoken,
  }
}
