// Notes about the fixings and the perimeter, merged into the layout's warnings by useLayout. Each message
// is the plain fallback text; the studio words the one-click fix by code.
import { MIN_FIXING_THICKNESS, THICKNESS_PRESETS } from '../config'
import { resolvePerimeter } from '../geometry/profiles'
import type { DesignConfig, FitWarning, LayoutPlan, PieceSpec } from '../types'
import { formatLength, formatNumber, formatSize } from '../units'
import { keysPossible, TAB_JOINT_MAX, tabDepth, tabLimits, tabsPossible } from './capability'
import { joinPlan, keyCoverageNote, keyGeometry } from './joins'
import { clipSites, mountPlan } from './mount'
import { tabPlan } from './tabs'

/** "C", "C and D", "C, D and F". */
function marksText(pieces: readonly PieceSpec[]): string {
  const marks = pieces.map((p) => p.mark)
  return marks.length <= 1 ? (marks[0] ?? '') : `${marks.slice(0, -1).join(', ')} and ${marks[marks.length - 1]}`
}

/**
 * The fix a deep joint edge's note names: the thickest preset base when it makes room for the lock's recess,
 * else a smaller edge. `fits` is the lock's own depth rule, since a socket needs more plate than a key slot.
 */
function roomForLock(config: DesignConfig, fits: (design: DesignConfig) => boolean): string {
  const sturdy = THICKNESS_PRESETS.reduce((a, b) => (b.value > a.value ? b : a))
  const room = fits({ ...config, tile: { ...config.tile, thickness: sturdy.value } })
  return room ? `Use the ${sturdy.label} base, or a smaller edge between tiles.` : 'Use a smaller edge between tiles.'
}

/** A strip or a sliver (its short side under half its long one) is narrow for a clip; anything else is small. */
const isNarrow = (size: { width: number; height: number }): boolean =>
  Math.min(size.width, size.height) < Math.max(size.width, size.height) / 2

/** Why some pieces take no clip, in words: every one too narrow, every one too small, or some of each. */
function noClipReason(sizes: readonly { width: number; height: number }[]): string {
  const narrow = sizes.filter(isNarrow).length
  return narrow === sizes.length ? 'too narrow' : narrow === 0 ? 'too small' : 'too small or too narrow'
}

/**
 * Whether the lock's own recesses, rather than the size, are what leaves a piece with no clip: the same piece
 * takes one as soon as the lock is off, so the note says so and the fix is worth offering.
 */
const recessesBlock = (config: DesignConfig, piece: PieceSpec): boolean =>
  config.lock !== 'none' && clipSites({ ...config, lock: 'none' }, piece).length > 0

/** What the lock cuts into the back, in the words step 7 uses: "key slots" or "sockets". */
const recessWord = (config: DesignConfig): string => (config.lock === 'tabs' ? 'sockets' : 'key slots')

/** The pieces a note names, with how many go on the wall when the marks (one per file) say less: "C and D (7 on the wall)". */
function piecesNamed(pieces: readonly PieceSpec[], onWall: number): string {
  const named = pieces.length === 1 ? `Piece ${pieces[0].mark}` : `Pieces ${marksText(pieces)}`
  return onWall > pieces.length ? `${named} (${formatNumber(onWall, 0)} on the wall)` : named
}

/** "it" and "its", or "them" and "their". */
const words = (count: number) => (count === 1 ? { it: 'it', its: 'its' } : { it: 'them', its: 'their' })

/** What the wall's clips cover: whether any are placed at all, and the pieces that got none. */
interface ClipCover {
  onClips: boolean
  unclipped: ReadonlySet<string>
}

/** The fix for a piece with no clip that the lock still reaches: a drop of glue in the recesses it cuts. */
function gluedIntoRecesses(config: DesignConfig, where: string, w: { it: string; its: string }): string {
  return config.lock === 'tabs'
    ? `put a drop of glue in ${where} so the tab${w.it === 'it' ? '' : 's'} in ${w.it} hold${w.it === 'it' ? 's' : ''} ${w.it}`
    : `put a drop of glue in ${where} so ${w.its} keyed neighbours hold ${w.it}`
}

/**
 * The 'no-lock' notes of a tabbed wall: a joint too wide to hide a tab, a wall with no joint a tab can cross,
 * or the pieces too narrow for a socket. The one strip per row is never one of them: nothing of the tabs
 * crosses a row joint by design, so the guide and the card state it up front instead of reporting it.
 */
function tabNotes(config: DesignConfig, plan: LayoutPlan, locks: () => ReturnType<typeof tabPlan>, clips: () => ClipCover): FitWarning[] {
  // A tab crosses the joint under the rim of the joint edge, so a wider joint would show it: nothing is cut.
  if (tabDepth(config) !== null && config.joint > TAB_JOINT_MAX + 1e-9) {
    return [
      {
        code: 'no-lock',
        message:
          `A tab crosses the joint between tiles and sits under the rim of the edge, so it needs a joint of ` +
          `${formatLength(TAB_JOINT_MAX)} or less: this ${formatLength(config.joint)} joint would show it, so the tabs ` +
          `are left out. Close the joint.`,
      },
    ]
  }
  if (!tabsPossible(config)) return []
  const now = locks()
  const minWidth = tabLimits(config)?.minWidth ?? 0
  if (now.tabs === 0) {
    // Nothing to lock at all: either no tile has one beside it, or none of them can hold a socket.
    const oneWide = plan.placements.every((p) => p.col === 0)
    return [
      {
        code: 'no-lock',
        message: oneWide
          ? 'No joint of this wall takes a tab: the wall is one tile wide, so the tiles go up side by side.'
          : `No joint of this wall takes a tab: no two tiles beside each other are both as wide as the ${formatLength(minWidth)} a socket needs, so the tiles go up side by side.`,
      },
    ]
  }
  // A piece with no clip is already told to glue itself to the wall by 'no-mount', so it is not sent two ways.
  const cover = clips()
  const ids = new Set([...now.unlockedPieceIds].filter((id) => !cover.unclipped.has(id)))
  const pieces = plan.pieces.filter((p) => ids.has(p.id))
  if (pieces.length === 0) return []
  const one = pieces.length === 1
  const all = words(pieces.length)
  const who = piecesNamed(pieces, plan.placements.filter((pl) => ids.has(pl.pieceId)).length)
  // Say the real cause in the piece's own terms: its own width where that is it, its neighbour's where not.
  const narrow = pieces.filter((p) => p.width < minWidth - 1e-9).length
  const cause =
    narrow === pieces.length
      ? `${one ? 'is' : 'are'} too narrow for a socket`
      : narrow === 0
        ? `${one ? 'has no tile' : 'have no tiles'} beside ${all.it} wide enough for a socket`
        : 'are too narrow for a socket, or have no tile beside them that is wide enough for one'
  const fix = cover.onClips
    ? `${one ? 'it goes' : 'they go'} up on ${all.its} own clips, level with the tiles around ${all.it}`
    : `glue ${all.it} to the tiles beside ${all.it} as the wall goes up`
  return [
    {
      code: 'no-lock',
      pieceId: pieces[0].id,
      message: `${who} ${cause}, so no tab locks ${all.it} to the ${one ? 'tile' : 'tiles'} beside ${all.it}: ${fix}.`,
    },
  ]
}

/** 'no-key', 'no-lock', 'no-mount', 'thin-base' and 'profile-clamped' notes, in the layout's own warning shape. */
export function fixingWarnings(config: DesignConfig, plan: LayoutPlan): FitWarning[] {
  const out: FitWarning[] = []
  const keys = config.lock === 'keys'
  const tabs = config.lock === 'tabs'
  const locked = config.lock !== 'none'
  const clips = config.mount === 'clips'
  const thin = (locked || clips) && config.tile.thickness < MIN_FIXING_THICKNESS - 1e-9
  // Each plan is walked at most once, and only when a note needs it.
  let joins: ReturnType<typeof joinPlan> | null = null
  const keyPlan = (): ReturnType<typeof joinPlan> => (joins ??= joinPlan(config, plan))
  let locks: ReturnType<typeof tabPlan> | null = null
  const lockPlan = (): ReturnType<typeof tabPlan> => (locks ??= tabPlan(config, plan))
  let mounted: ReturnType<typeof mountPlan> | null = null
  const clipPlan = (): ReturnType<typeof mountPlan> => (mounted ??= mountPlan(config, plan))

  if (thin) {
    // Keys sit in slots, tabs in sockets, clips in pockets: each system named by the recess it needs.
    const lock = keys ? 'Keys' : 'Tabs'
    const recess = keys ? 'slots' : 'sockets'
    const what = locked && clips ? `${lock} and wall clips need` : locked ? `${lock} need` : 'Wall clips need'
    const recesses = locked && clips ? `their ${recess} and pockets` : locked ? `their ${recess}` : 'their pockets'
    out.push({
      code: 'thin-base',
      message: `${what} a base at least ${formatLength(MIN_FIXING_THICKNESS)} thick to hold ${recesses}, so this ${formatLength(config.tile.thickness)} base leaves them out. Use the Standard base.`,
    })
  } else if (keys && keyGeometry(config) === null) {
    // The plate is thick enough, but a deep edge between tiles eats the cover a key slot needs under it.
    out.push({
      code: 'thin-base',
      message: `The edge between tiles is too deep for a key slot under it on this ${formatLength(config.tile.thickness)} base, so the keys are left out. ${roomForLock(config, (d) => keyGeometry(d) !== null)}`,
    })
  } else if (tabs && tabDepth(config) === null) {
    // A socket needs deeper plate than a key slot: it holds the tab clear of its own ceiling as well.
    out.push({
      code: 'thin-base',
      message: `The edge between tiles is too deep for a socket under it on this ${formatLength(config.tile.thickness)} base, so the tabs are left out. ${roomForLock(config, (d) => tabDepth(d) !== null)}`,
    })
  }

  if (clips && !thin) {
    const lost = new Set(clipPlan().unmountedPieceIds)
    const pieces = plan.pieces.filter((p) => lost.has(p.id))
    if (pieces.length > 0 && pieces.length === plan.pieces.length) {
      // No piece of the wall takes a clip: the tile itself is the thing to change, so no piece is named.
      const size = formatSize(config.tile.width, config.tile.height)
      out.push({
        code: 'no-mount',
        message: pieces.some((p) => recessesBlock(config, p))
          ? `Tiles of ${size} have no room for a wall clip beside their ${recessWord(config)}: turn the ${keys ? 'keys' : 'tabs'} off for clips, glue them, or use bigger tiles.`
          : `Tiles of ${size} are ${noClipReason([config.tile])} for a wall clip: glue them, or use bigger tiles.`,
      })
    } else if (pieces.length > 0) {
      // The biggest piece with no clip is the one most worth pointing at.
      const worst = pieces.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a))
      const all = words(pieces.length)
      // The marks are files: the count is of tiles on the wall, which is what the maker has to fix.
      const who = piecesNamed(pieces, plan.placements.filter((pl) => lost.has(pl.pieceId)).length)
      // Recesses that leave no room read as a cause of their own: the pieces are big enough for a clip.
      const slots = pieces.filter((p) => recessesBlock(config, p))
      const sized = pieces.filter((p) => !slots.includes(p))
      const cause =
        sized.length === 0
          ? `${who} ${pieces.length === 1 ? 'has' : 'have'} no room for a wall clip beside ${all.its} ${recessWord(config)}`
          : slots.length === 0
            ? `${who} ${pieces.length === 1 ? 'is' : 'are'} ${noClipReason(sized)} for a wall clip`
            : `${who} are ${noClipReason(sized)} for a wall clip, or have no room for one beside their ${recessWord(config)}`
      // The same split as the guide's own step, so the note and the download page cannot say different
      // things: a piece the lock still reaches is glued into its own recesses, the rest to the wall.
      const loose = new Set(
        keysPossible(config) && keyPlan().keys > 0
          ? keyPlan().unkeyedPieceIds
          : tabsPossible(config) && lockPlan().tabs > 0
            ? lockPlan().unlockedPieceIds
            : pieces.map((p) => p.id),
      )
      const held = pieces.filter((p) => !loose.has(p.id))
      const glued = pieces.filter((p) => loose.has(p.id))
      const byLock = words(held.length)
      const fix =
        held.length === 0
          ? `glue ${all.it} to the wall`
          : glued.length === 0
            ? gluedIntoRecesses(config, `${all.its} ${recessWord(config)}`, all)
            : `${gluedIntoRecesses(config, `the ${recessWord(config)} of ${marksText(held)}`, byLock)}, and glue ${marksText(glued)} to the wall`
      out.push({ code: 'no-mount', pieceId: worst.id, message: `${cause}: ${fix}.` })
    }
  }

  if (keys && !thin) {
    // Only pieces keyed to nothing are worth a note: a short joint whose pieces are keyed elsewhere still
    // leaves one block (a thin edge row keyed to the row above, say).
    const joinsNow = keyPlan()
    const ids = new Set(joinsNow.unkeyedPieceIds)
    const pieces = plan.pieces.filter((p) => ids.has(p.id))
    // Keys that never cross a row joint leave the wall in strips: every piece is keyed, yet no panel forms.
    // This note names no piece, which is how the studio tells it from the unkeyed-piece note below. It asks
    // keysPossible, so it never fires for the tabs, whose one strip per row is the design and not a fault.
    const coverage = keyCoverageNote(config, plan, joinsNow)
    if (coverage) out.push({ code: 'no-key', message: coverage })
    if (pieces.length > 0) {
      const one = pieces.length === 1
      const subject = one ? `Piece ${pieces[0].mark} has` : `${pieces.length} pieces (${marksText(pieces)}) have`
      out.push({
        code: 'no-key',
        pieceId: pieces[0].id,
        message: `${subject} no joint long enough for a key: glue ${one ? 'it' : 'them'} to the tiles beside ${one ? 'it' : 'them'}.`,
      })
    }
  }

  if (tabs && !thin) {
    out.push(
      ...tabNotes(config, plan, lockPlan, () => {
        const onClips = clips && clipPlan().clips > 0
        return { onClips, unclipped: new Set(onClips ? clipPlan().unmountedPieceIds : []) }
      }),
    )
  }

  const perimeter = resolvePerimeter(config)
  if (perimeter?.clamped) {
    out.push({
      code: 'profile-clamped',
      message:
        perimeter.reason === 'plate'
          ? `The edge profile is shallower than asked: the base is too thin for a ${formatLength(config.perimeter.drop)} drop, so it drops ${formatLength(Math.round(perimeter.h * 10) / 10)}. Use the Sturdy base.`
          : 'The edge profile was narrowed to fit the wall: the wall is too small for the width you asked.',
    })
  }
  return out
}
