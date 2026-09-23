// The layout checker writes in the drawing office's voice, and its findings are read by someone
// decorating a kitchen. This says the same things the maker's way: the consequence first, the
// measurement second, and never a trade term. The facts are rebuilt from the plan rather than
// parsed back out of the sentence, so nothing here can drift from what the checker actually found.

import { MIN_FIXING_THICKNESS } from '@/core/config'
import { keysPossible, TAB_JOINT_MAX, tabDepth, tabLimits, tabsPossible } from '@/core/fixing/capability'
import { joinPlan, keyCoverageNote, keyGeometry } from '@/core/fixing/joins'
import { clipSites, mountPlan } from '@/core/fixing/mount'
import { tabPlan } from '@/core/fixing/tabs'
import { resolvePerimeter } from '@/core/geometry/profiles'
import { printerById } from '@/core/printers'
import type { DesignConfig, FitWarning, LayoutPlan, PieceSpec } from '@/core/types'
import { formatLength, formatSize } from '@/core/units'
import { floorTenth } from './edges'

const joinAnd = (words: readonly string[]) =>
  words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`

/** "Keys and wall clips need", "Tabs need", "Wall clips need": whichever the design has on. */
function fixingsNeed(config: DesignConfig): string {
  const lock = config.lock === 'tabs' ? 'Tabs' : 'Keys'
  if (config.lock !== 'none' && config.mount === 'clips') return `${lock} and wall clips need`
  return config.lock !== 'none' ? `${lock} need` : 'Wall clips need'
}

/** Keys sit in slots, tabs in sockets, clips in pockets: each named by the recess it needs, as step 7 does. */
function recesses(config: DesignConfig): string {
  const recess = config.lock === 'tabs' ? 'their sockets' : 'their slots'
  if (config.lock !== 'none' && config.mount === 'clips') return `${recess} and pockets`
  return config.lock !== 'none' ? recess : 'their pockets'
}

/**
 * Joints too short for a key, counted from the plan's own joints. What matters is whether a piece is left
 * keyed to nothing: a short joint between two pieces each keyed elsewhere still leaves one block.
 */
function noKey(warning: FitWarning, config: DesignConfig, plan: LayoutPlan): string {
  const joins = joinPlan(config, plan)
  // The note that names no piece is about keys leaving the wall in strips, rebuilt from the plan too.
  const coverage = warning.pieceId ? null : keyCoverageNote(config, plan, joins)
  if (coverage) return coverage
  const loose = plan.pieces.filter((p) => joins.unkeyedPieceIds.includes(p.id))
  if (loose.length === 0) return warning.message
  const one = loose.length === 1
  // A whole tile can be left unkeyed too, when its only neighbour is a sliver: say what is true of both.
  const who = one ? `Piece ${loose[0].mark} has` : `Pieces ${joinAnd(loose.map((p) => p.mark))} have`
  return `${who} no joint long enough for a key, so glue ${one ? 'it' : 'them'} to the tiles beside ${one ? 'it' : 'them'}.`
}

/** A strip or a sliver, its short side under half its long one, is narrow for a clip; anything else is small. */
const isNarrow = (piece: { width: number; height: number }): boolean =>
  Math.min(piece.width, piece.height) < Math.max(piece.width, piece.height) / 2

/** Why pieces take no clip: every one too narrow, every one too small, or some of each. */
function tooWhat(pieces: readonly { width: number; height: number }[]): string {
  const narrow = pieces.filter(isNarrow).length
  return narrow === pieces.length ? 'too narrow' : narrow === 0 ? 'too small' : 'too small or too narrow'
}

/**
 * Whether the lock's own recesses, and not the size, are what leaves a piece with no clip: the same piece
 * takes one as soon as the lock is off. The rule the checker uses (warnings.ts), so both say the same cause.
 */
const recessesBlock = (config: DesignConfig, piece: PieceSpec): boolean =>
  config.lock !== 'none' && clipSites({ ...config, lock: 'none' }, piece).length > 0

/** What the lock cuts into the back, in the words step 7 uses: "key slots" or "sockets". */
const recessWord = (config: DesignConfig): string => (config.lock === 'tabs' ? 'sockets' : 'key slots')

/** "Piece C" / "Pieces C and D (7 on the wall)": the marks are files, so the tiles to handle are counted. */
function piecesNamed(pieces: readonly PieceSpec[], onWall: number): string {
  const named = pieces.length === 1 ? `Piece ${pieces[0].mark}` : `Pieces ${joinAnd(pieces.map((p) => p.mark))}`
  return onWall > pieces.length ? `${named} (${onWall} on the wall)` : named
}

/**
 * Pieces with no room for a wall clip, by their marks, and why: the tile is too small for one, or its key
 * slots take the room a pocket needs. With keys that hold a piece to clipped neighbours, a drop of glue in
 * its key slots is all it needs; otherwise it is glued, the split guide.ts's "Putting it up" makes too. A
 * note that names no piece means no piece of the wall takes a clip at all.
 */
function noMount(warning: FitWarning, config: DesignConfig, plan: LayoutPlan): string {
  const ids = new Set(mountPlan(config, plan).unmountedPieceIds)
  const pieces = plan.pieces.filter((p) => ids.has(p.id))
  if (pieces.length === 0) return warning.message
  const slots = pieces.filter((p) => recessesBlock(config, p))
  const sized = pieces.filter((p) => !slots.includes(p))
  if (!warning.pieceId || pieces.length === plan.pieces.length) {
    const size = formatSize(config.tile.width, config.tile.height)
    // The keys, not the tile, are then the thing to change, and the fix beside the note leaves them out.
    return slots.length > 0
      ? `Tiles of ${size} have no room for a wall clip beside their ${recessWord(config)}, so this wall goes up with glue or tape. Leave the ${config.lock === 'tabs' ? 'tabs' : 'keys'} out for clips, or use bigger tiles.`
      : `Tiles of ${size} are ${tooWhat([config.tile])} for a wall clip, so this wall goes up with glue or tape. Use bigger tiles for clips.`
  }
  const one = pieces.length === 1
  const its = one ? 'its' : 'their'
  const onWall = plan.placements.filter((placement) => ids.has(placement.pieceId)).length
  const who = piecesNamed(pieces, onWall)
  const cause =
    sized.length === 0
      ? `${who} ${one ? 'has' : 'have'} no room for a wall clip beside ${its} ${recessWord(config)}`
      : slots.length === 0
        ? `${who} ${one ? 'is' : 'are'} ${tooWhat(sized)} for a wall clip`
        : `${who} are ${tooWhat(sized)} for a wall clip, or have no room for one beside their ${recessWord(config)}`
  // The same split as the guide's own step: a piece the lock still reaches is glued into its own recesses.
  const loose = new Set(
    keysPossible(config) && joinPlan(config, plan).keys > 0
      ? joinPlan(config, plan).unkeyedPieceIds
      : tabsPossible(config) && tabPlan(config, plan).tabs > 0
        ? tabPlan(config, plan).unlockedPieceIds
        : pieces.map((p) => p.id),
  )
  const held = pieces.filter((p) => !loose.has(p.id))
  const glued = pieces.filter((p) => loose.has(p.id))
  const lock = config.lock === 'tabs' ? 'tabs' : 'keys'
  // A lock holds in the plane of the wall only, so a drop of glue in its recesses is what keeps a piece on it.
  const gluedIn = (marks: readonly string[]) =>
    `put a drop of glue in the ${recessWord(config)} of ${joinAnd(marks)}, whose ${lock} hold ${marks.length === 1 ? 'it' : 'them'} in line with the tiles around`
  const fix =
    held.length === 0
      ? `glue ${one ? 'it' : 'them'} to the wall`
      : glued.length === 0
        ? `${its} ${lock} hold ${one ? 'it' : 'them'} in line with the tiles around, and a drop of glue in ${its} ${recessWord(config)} keeps ${one ? 'it' : 'them'} on the wall`
        : `${gluedIn(held.map((p) => p.mark))}, and glue ${joinAnd(glued.map((p) => p.mark))} to the wall`
  return `${cause}: ${fix}.`
}

/** A base too thin for the pockets: under the minimum, or eaten by a deep joint edge above the lock's recess. */
function thinBase(config: DesignConfig): string {
  const t = config.tile.thickness
  if (t < MIN_FIXING_THICKNESS - 0.001) {
    return `${fixingsNeed(config)} a base at least ${formatLength(MIN_FIXING_THICKNESS)} thick to hold ${recesses(config)}; this one is ${formatLength(t)}.`
  }
  if (config.lock === 'keys' && keyGeometry(config) === null) {
    return 'The edge between tiles is so deep that no key slot fits under it: use a thicker base or a smaller edge.'
  }
  // A socket holds the tab clear of its own ceiling as well, so it needs deeper plate than a key slot.
  if (config.lock === 'tabs' && tabDepth(config) === null) {
    return 'The edge between tiles is so deep that no socket fits under it: use a thicker base or a smaller edge.'
  }
  return `${fixingsNeed(config)} a thicker base to hold ${recesses(config)}.`
}

/**
 * The tabs locking nothing, rebuilt from the plan: a joint too wide to hide a tab, a wall with no joint a
 * tab can cross, or the pieces too narrow for a socket. A row unlocked to the row above is never among them,
 * because nothing of the tabs crosses a row joint: that is the design, which step 7 states rather than reports.
 */
function noLock(warning: FitWarning, config: DesignConfig, plan: LayoutPlan): string {
  // A tab crosses the joint under the rim of the joint edge, so a wider joint would put it on show.
  if (config.joint > TAB_JOINT_MAX + 0.001) {
    return `A tab crosses the joint between tiles and a gap wider than ${formatLength(TAB_JOINT_MAX)} would show it, so this ${formatLength(config.joint)} joint leaves the tabs out. Close the joint.`
  }
  const tabs = tabPlan(config, plan)
  const minWidth = tabLimits(config)?.minWidth ?? 0
  if (tabs.tabs === 0) {
    return plan.placements.every((placement) => placement.col === 0)
      ? 'This wall is one tile wide, so it has no joint for a tab to cross: the tiles go up side by side.'
      : `No two tiles beside each other are both as wide as the ${formatLength(minWidth)} a socket needs, so no tab locks anything: the tiles go up side by side.`
  }
  const clips = mountPlan(config, plan)
  const onClips = config.mount === 'clips' && clips.clips > 0
  // A piece with no clip is already told to glue itself to the wall, so it is not sent two ways.
  const told = new Set(onClips ? clips.unmountedPieceIds : [])
  const ids = new Set(tabs.unlockedPieceIds.filter((id) => !told.has(id)))
  const pieces = plan.pieces.filter((p) => ids.has(p.id))
  if (pieces.length === 0) return warning.message
  const one = pieces.length === 1
  const it = one ? 'it' : 'them'
  const onWall = plan.placements.filter((placement) => ids.has(placement.pieceId)).length
  // Say the real cause in the piece's own terms: its own width where that is it, its neighbour's where not.
  const narrow = pieces.filter((p) => p.width < minWidth - 0.001).length
  const cause =
    narrow === pieces.length
      ? `${one ? 'is' : 'are'} too narrow for a socket`
      : narrow === 0
        ? `${one ? 'has no tile' : 'have no tiles'} beside ${it} wide enough for a socket`
        : 'are too narrow for a socket, or have no tile beside them wide enough for one'
  const fix = onClips
    ? `${one ? 'it goes' : 'they go'} up on ${one ? 'its' : 'their'} own clips, level with the tiles around ${it}`
    : `glue ${it} to the tiles beside ${it}`
  return `${piecesNamed(pieces, onWall)} ${cause}, so no tab locks ${it}: ${fix}.`
}

/** What the border profile gave up, in the numbers it really prints with. */
function profileClamped(warning: FitWarning, config: DesignConfig): string {
  const resolved = resolvePerimeter(config)
  if (!resolved?.clamped) return warning.message
  if (resolved.reason === 'plate') {
    return `The edge around the wall drops ${formatLength(floorTenth(resolved.h))}, not the ${formatLength(config.perimeter.drop)} you set: a ${formatLength(config.tile.thickness)} base has no room for more.`
  }
  // A cut never fades, so the surface can only have narrowed it, by however little.
  if (resolved.cut || resolved.w < config.perimeter.width - 0.05) {
    return `The edge around the wall is narrowed to ${formatLength(floorTenth(resolved.w))} to fit this wall.`
  }
  return 'The pattern fades into the edge around the wall over a shorter band, to fit this wall.'
}

export function plainWarning(warning: FitWarning, config: DesignConfig, plan: LayoutPlan): string {
  switch (warning.code) {
    case 'thin-cut': {
      const piece = plan.pieces.find((candidate) => candidate.id === warning.pieceId)
      if (!piece) return warning.message
      return `One edge piece is only ${formatLength(Math.min(piece.width, piece.height))} wide, too thin to glue.`
    }
    case 'sliver-dropped':
      return 'A sliver along one edge is too thin to print, so the gap between tiles takes it up.'
    case 'exceeds-bed':
      return `A ${formatSize(config.tile.width, config.tile.height)} tile is bigger than your ${printerById(config.printerId).name} can print.`
    case 'tile-larger-than-surface':
      return 'The tile is bigger than the space you are covering, so every piece would be a cut.'
    case 'many-pieces': {
      // Border versions come from the keys or the edge profile, which is worth knowing before cutting them.
      const versions = plan.pieces.length - new Set(plan.pieces.map((p) => `${p.crop.x0}:${p.crop.y0}:${p.crop.x1}:${p.crop.y1}`)).size
      if (versions > 0) {
        return `This layout needs ${plan.pieces.length} different tiles to print, ${versions} of them only because they sit on the border, which is a long download.`
      }
      return `This layout needs ${plan.pieces.length} different tiles to print, which is a long download.`
    }
    case 'no-key':
      return noKey(warning, config, plan)
    case 'no-lock':
      return noLock(warning, config, plan)
    case 'no-mount':
      return noMount(warning, config, plan)
    case 'thin-base':
      return thinBase(config)
    case 'profile-clamped':
      return profileClamped(warning, config)
    default:
      return warning.message
  }
}
