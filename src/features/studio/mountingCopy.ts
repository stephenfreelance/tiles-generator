// Step 7, "Putting it up", in words: the cards of its two questions and the "What changes" well under
// them. Everything the well says is read off the plans (mountPlan, joinPlan, the printed parts), never off
// the switches, so a system is named only once the wall really places it. The way up is the download
// page's (guide.ts's mountingGuide), never worded here. Pure, so every line is tested without a DOM.

import { fitChosenText, fixingSystem, usesClips, usesKeys, usesTabs, type FixingSystem } from '@/core/fixing/guide'
import { pieceFeatures } from '@/core/fixing/features'
import { joinPlan } from '@/core/fixing/joins'
import { clipSites, mountPlan } from '@/core/fixing/mount'
import { tabPlan } from '@/core/fixing/tabs'
import type { AccessorySpec, BackFeature, JoinPlan, MountPlan } from '@/core/fixing/types'
import type { DesignConfig, LayoutPlan, PieceSpec } from '@/core/types'
import { formatLength, formatNumber } from '@/core/units'
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

/** How many clips the whole tiles carry: what the spoken summary may promise about a tile of this wall. */
interface ClipCounts {
  /** The count every whole tile shares, or null when they differ; 0 when no whole tile takes one. */
  perWholeTile: number | null
  /** The most any whole tile carries, 0 when none does. */
  mostInWholeTile: number
}

function clipCounts(config: DesignConfig, plan: LayoutPlan): ClipCounts {
  const whole = plan.pieces.filter((piece) => piece.kind === 'full').map((piece) => clipSites(config, piece).length)
  return {
    perWholeTile: whole.length > 0 && whole.every((clips) => clips === whole[0]) ? whole[0] : null,
    mostInWholeTile: whole.length > 0 ? Math.max(...whole) : 0,
  }
}

/**
 * The one line that contradicts what the maker just clicked: a system chosen that the plans place
 * nowhere. It is said at the top of the well, and it reads off what is placed (fixingSystem), never off
 * the switches.
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
 * The "What changes" well for a design: what is cut into its tiles, the fit, and the plate step 7 raised
 * (`raisedFrom`, off the undo history). What it prints, what to buy and the way up are the download page's.
 * `accessories` are the printed parts as the download holds them (accessoryParts); `models` the tile
 * files with and without the keys (tileModels), which the spoken summary counts.
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
  const system = fixingSystem(config, mount, join, tabPlan(config, plan))
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
    warning: unplacedNote(config, system),
    // The fit, in millimetres, is said in one place for the studio, the download's step 1 and the fit-test page.
    fit: fits ? { parts, label: fitLabel(parts), note: fitChosenText(config, system) } : null,
    alsoChanged,
    spoken: alsoChanged ? `${spoken} ${alsoChanged}` : spoken,
  }
}
