// One-click answers to the layout's own warnings: every fix is a small edit the maker can undo.

import { MIN_FIXING_THICKNESS, PERIMETER_PROFILES, THICKNESS_PRESETS } from '@/core/config'
import { clipsPossible, keysPossible, TAB_JOINT_MAX, tabDepth, tabsPossible } from '@/core/fixing/capability'
import { joinPlan, keyGeometry } from '@/core/fixing/joins'
import { mountPlan } from '@/core/fixing/mount'
import { tabPlan } from '@/core/fixing/tabs'
import { resolvePerimeter } from '@/core/geometry/profiles'
import { computeLayout, hasEdges, layoutInputOf, perfectFitSizes } from '@/core/layout'
import { PRINTERS, printerById } from '@/core/printers'
import { SIDE_NAMES } from '@/core/sides'
import { formatLength } from '@/core/units'
import type { DesignConfig, FitWarning, LayoutPlan, SideName } from '@/core/types'
import { floorTenth } from './edges'

export interface PlanFix {
  label: string
  /** Spoken once the fix lands, so the change is not only visible. */
  done: string
  apply: (design: DesignConfig) => DesignConfig
}

/** Tiles across a length when they divide it exactly. */
const countAcross = (length: number, size: number, joint: number) => Math.round((length + joint) / (size + joint))

const plural = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many)

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

/** What the surface really takes once a fix lands, in the plan's own numbers. */
function fitAfter(design: DesignConfig): string {
  const plan = computeLayout(layoutInputOf(design))
  const total = plan.placements.length
  if (plan.exact) return total === 1 ? 'one whole tile covers it.' : `${total} whole tiles cover it.`
  if (plan.fullCount === 0) return `it takes ${total} cut ${plural(total, 'piece')}.`
  return `it takes ${plan.fullCount} whole ${plural(plan.fullCount, 'tile')} and ${plan.partialCount} cut ${plural(plan.partialCount, 'piece')}.`
}

function perfectFit(config: DesignConfig): PlanFix | null {
  const [size] = perfectFitSizes(config.surface.width, config.joint, config.tile.width, 1)
  if (!size || Math.abs(size - config.tile.width) < 0.05) return null
  const across = countAcross(config.surface.width, size, config.joint)
  const square = config.tile.width === config.tile.height
  return {
    label: `Use ${formatLength(size)} tiles`,
    done: `Tile width ${formatLength(size)}: ${across} across, no cuts.`,
    apply: (design) => ({
      ...design,
      tile: { ...design.tile, width: size, height: square ? size : design.tile.height },
    }),
  }
}

function biggerPrinter(config: DesignConfig): PlanFix | null {
  const { width, height } = config.tile
  const current = printerById(config.printerId)
  const fits = PRINTERS.filter(
    (printer) =>
      (width <= printer.width && height <= printer.depth) || (height <= printer.width && width <= printer.depth),
  ).sort((a, b) => a.width * a.depth - b.width * b.depth)
  const smallestThatFits = fits[0]
  if (!smallestThatFits || smallestThatFits.id === current.id) return null
  return {
    label: `Switch to the ${smallestThatFits.name}`,
    done: `Printer set to the ${smallestThatFits.name}: the tile fits its bed.`,
    apply: (design) => ({ ...design, printerId: smallestThatFits.id }),
  }
}

/** The largest square tile the current bed prints, rounded down to a whole millimetre. */
function tileToBed(config: DesignConfig): PlanFix | null {
  const bed = printerById(config.printerId)
  const size = Math.floor(Math.min(bed.width, bed.depth))
  if (size < 20 || size >= Math.min(config.tile.width, config.tile.height)) return null
  return {
    label: `Use ${formatLength(size)} tiles`,
    done: `Tile set to ${formatLength(size)}: it fits the ${bed.name} bed.`,
    apply: (design) => ({ ...design, tile: { ...design.tile, width: size, height: size } }),
  }
}

function fitToSurface(config: DesignConfig): PlanFix {
  const width = Math.min(config.tile.width, config.surface.width)
  const height = Math.min(config.tile.height, config.surface.height)
  const apply = (design: DesignConfig): DesignConfig => ({ ...design, tile: { ...design.tile, width, height } })
  return {
    label: 'Make the tile fit',
    // Clamping the oversized axis usually leaves a cut on the other one, so the promise is read off
    // the layout this very fix produces rather than assumed.
    done: `Tile set to ${formatLength(width)} by ${formatLength(height)}: ${fitAfter(apply(config))}`,
    apply,
  }
}

function fewerModels(config: DesignConfig): PlanFix | null {
  if (config.layout.rowOffset !== 0) {
    return {
      label: 'Use straight rows',
      done: 'Rows lined up: a straight grid needs fewer different tiles.',
      apply: (design) => ({ ...design, layout: { ...design.layout, rowOffset: 0 } }),
    }
  }
  if (config.layout.origin !== 'corner') {
    return {
      label: 'Start from the corner',
      done: 'Started from the corner: every cut piece lands on two edges only.',
      apply: (design) => ({ ...design, layout: { ...design.layout, origin: 'corner' } }),
    }
  }
  return null
}

const withThickness = (design: DesignConfig, thickness: number): DesignConfig => ({
  ...design,
  tile: { ...design.tile, thickness },
})

/** "Use the Standard base" and "4 mm (Standard)", or plain millimetres for a value no preset has. */
function baseName(thickness: number): { label: string; phrase: string } {
  const preset = THICKNESS_PRESETS.find((p) => Math.abs(p.value - thickness) < 0.05)
  return preset
    ? { label: `Use the ${preset.label} base`, phrase: `${formatLength(thickness)} (${preset.label})` }
    : { label: `Use a ${formatLength(thickness)} base`, phrase: formatLength(thickness) }
}

/**
 * A base too thin for the pockets: the thinnest plate that holds them, 4 mm (the Standard base), or the
 * Sturdy one when a deep joint edge leaves no room over the lock's recess at 4 mm. At 6 mm every edge
 * leaves room. A socket holds the tab clear of its own ceiling too, so it is asked its own depth rule.
 */
function thickerBase(config: DesignConfig): PlanFix | null {
  const roomForLock = (design: DesignConfig) =>
    design.lock === 'keys' ? keyGeometry(design) !== null : design.lock === 'tabs' ? tabDepth(design) !== null : true
  const holds = (design: DesignConfig) => design.tile.thickness >= MIN_FIXING_THICKNESS - 0.001 && roomForLock(design)
  if (holds(config)) return null
  const candidates = [MIN_FIXING_THICKNESS, ...THICKNESS_PRESETS.map((p) => p.value)]
    .filter((t) => t > config.tile.thickness + 0.001)
    .sort((a, b) => a - b)
  const target = candidates.find((t) => holds(withThickness(config, t)))
  if (target === undefined) return null
  const name = baseName(target)
  return {
    label: name.label,
    done: `Base set to ${name.phrase}: ${config.lock === 'tabs' ? 'the sockets' : 'the pockets'} fit now.`,
    apply: (design) => withThickness(design, target),
  }
}

/**
 * A border profile the plate held back: the Sturdy base when that gives it the whole drop, else the
 * deepest drop this base allows. One narrowed to fit a small wall: the widest width that fits whole.
 */
function profileFits(config: DesignConfig): PlanFix | null {
  const resolved = resolvePerimeter(config)
  const profile = config.perimeter.profile
  if (!resolved?.clamped || profile === 'none') return null
  const ranges = PERIMETER_PROFILES[profile]
  if (resolved.reason === 'plate') {
    const sturdy = THICKNESS_PRESETS.reduce((a, b) => (b.value > a.value ? b : a)).value
    if (config.tile.thickness < sturdy - 0.001 && resolvePerimeter(withThickness(config, sturdy))?.reason !== 'plate') {
      const name = baseName(sturdy)
      return {
        label: name.label,
        done: `Base set to ${name.phrase}: the edge drops the full ${formatLength(config.perimeter.drop)}.`,
        apply: (design) => withThickness(design, sturdy),
      }
    }
    const drop = floorTenth(resolved.h)
    if (drop < ranges.dropRange[0] || drop >= config.perimeter.drop) return null
    return {
      label: `Drop the edge ${formatLength(drop)}`,
      done: `Edge drop set to ${formatLength(drop)}, the most this base allows.`,
      apply: (design) => ({ ...design, perimeter: { ...design.perimeter, drop } }),
    }
  }
  // The widest width, in half millimetres, at which the whole profile fits the wall: the fade gives way
  // first, so the width the clamp left is not always enough on its own.
  for (let width = Math.ceil(config.perimeter.width * 2 - 1) / 2; width >= ranges.widthRange[0]; width -= 0.5) {
    const next = { ...config, perimeter: { ...config.perimeter, width } }
    if (resolvePerimeter(next)?.clamped) continue
    return {
      label: `Narrow the edge to ${formatLength(width)}`,
      done: `Edge width set to ${formatLength(width)}: the whole profile fits this wall.`,
      apply: (design) => ({ ...design, perimeter: { ...design.perimeter, width } }),
    }
  }
  return null
}

/** A fix offered only when the design it produces clears the note. */
function checked(
  config: DesignConfig,
  fix: PlanFix | null,
  clears: (design: DesignConfig, plan: LayoutPlan) => boolean,
): PlanFix | null {
  if (!fix) return null
  const next = fix.apply(config)
  return clears(next, computeLayout(layoutInputOf(next))) ? fix : null
}

/** The balanced origin, offered only when the numbers say it clears the note. */
function balanceIf(config: DesignConfig, clears: (design: DesignConfig, plan: LayoutPlan) => boolean, done: string): PlanFix | null {
  if (config.layout.origin === 'balanced') return null
  const fix: PlanFix = {
    label: 'Even out the edges',
    done,
    apply: (design) => ({ ...design, layout: { ...design.layout, origin: 'balanced' } }),
  }
  return checked(config, fix, clears)
}

/** Every piece of the plan takes a wall clip. */
const everyPieceClipped = (design: DesignConfig, plan: LayoutPlan): boolean => mountPlan(design, plan).unmountedPieceIds.length === 0

/** "keys" or "tabs": the tile-to-tile lock a fix drops, in the word step 7's own card gives it. */
const lockWord = (config: DesignConfig): string => (config.lock === 'tabs' ? 'tabs' : 'keys')

/**
 * The tile-to-tile lock off, worded from the wall it leaves: its recesses take the room a pocket needs, so
 * on small tiles they can be what leaves a piece with no clip. Null while the design cuts no recess, or
 * while dropping it places no clip either. The name is the one the models fix uses for the same move.
 */
function lockOff(config: DesignConfig): PlanFix | null {
  if (!keysPossible(config) && !tabsPossible(config)) return null
  const apply = (design: DesignConfig): DesignConfig => ({ ...design, lock: 'none' })
  const next = apply(config)
  const clips = mountPlan(next, computeLayout(layoutInputOf(next))).clips
  if (clips === 0) return null
  const word = lockWord(config)
  return { label: `Leave the ${word} out`, done: `${capital(word)} left out: ${clips} ${plural(clips, 'wall clip')} to fit.`, apply }
}

/**
 * Every piece the plan places locks to a tile beside it, and something really locks: a wall one tile wide
 * leaves no piece unlocked only because it has no joint at all, which is no fix.
 */
function everyPieceLocked(design: DesignConfig, plan: LayoutPlan): boolean {
  const tabs = tabPlan(design, plan)
  return tabs.tabs > 0 && tabs.unlockedPieceIds.length === 0
}

/**
 * The tabs locking nothing, or not everything. The move that really places them comes first: closing a joint
 * too wide to hide a tab, then a layout that gives every piece a neighbour wide enough for a socket (the
 * balanced origin, else tiles that divide the wall). Only when no joint of the wall takes a tab at all is
 * there no layout to reach for, and the one move left is to say so in the design: side by side.
 */
function lockFix(config: DesignConfig, plan: LayoutPlan): PlanFix | null {
  if (config.lock === 'tabs' && tabDepth(config) !== null && config.joint > TAB_JOINT_MAX + 0.001) {
    const close: PlanFix = {
      label: `Close the joint to ${formatLength(TAB_JOINT_MAX)}`,
      done: `Joint set to ${formatLength(TAB_JOINT_MAX)}: the tabs stay hidden in it.`,
      apply: (design) => ({ ...design, joint: TAB_JOINT_MAX }),
    }
    return checked(config, close, (design, nextPlan) => tabPlan(design, nextPlan).tabs > 0)
  }
  if (!tabsPossible(config)) return null
  // Nothing to answer once every piece of the wall locks to the one beside it.
  if (everyPieceLocked(config, plan)) return null
  return (
    balanceIf(config, everyPieceLocked, 'Edges evened out: every tile locks to the one beside it.') ??
    checked(config, perfectFit(config), everyPieceLocked) ??
    (tabPlan(config, plan).tabs === 0
      ? { label: 'Leave the tabs out', done: 'Tabs left out: the tiles go up side by side.', apply: (design) => ({ ...design, lock: 'none' }) }
      : null)
  )
}

/**
 * Pieces with no room for a clip. On a wall with keys, their slots can be what takes the room, and then
 * leaving the keys out is the move that keeps the clips; otherwise the fix is a layout that gives every
 * piece a clip: the balanced origin, else tiles that divide the wall. When no piece of the wall takes one
 * and the keys are not the cause, the tiles are simply too small, and the one move is to say so in the
 * design: glue or tape, which is what the plans already do.
 */
function mountFix(config: DesignConfig, plan: LayoutPlan): PlanFix | null {
  if (!clipsPossible(config)) return null
  const unclipped = mountPlan(config, plan).unmountedPieceIds
  if (unclipped.length === 0) return null
  const someClipped = (design: DesignConfig, nextPlan: LayoutPlan) => mountPlan(design, nextPlan).clips > 0
  if (unclipped.length === plan.pieces.length) {
    return (
      checked(config, lockOff(config), someClipped) ?? {
        label: 'Use glue or tape',
        done: 'Glue or tape: the tiles go up on their flat backs.',
        apply: (design) => ({ ...design, mount: 'glue' }),
      }
    )
  }
  return (
    balanceIf(config, everyPieceClipped, 'Edges evened out: every piece now takes a wall clip.') ??
    checked(config, perfectFit(config), everyPieceClipped) ??
    checked(config, lockOff(config), everyPieceClipped)
  )
}

/** One way to cut the number of models, and how many it leaves. */
interface ModelsChoice {
  fix: PlanFix
  models: number
}

const modelCount = (design: DesignConfig) => computeLayout(layoutInputOf(design)).pieces.length

const SIDE_WORDS: Record<SideName, string> = { bottom: 'bottom', right: 'right', top: 'top', left: 'left' }

/**
 * Border versions push the count up: the lock makes every piece on the boundary its own model, the edge
 * profile every piece it shapes. Each way out is counted (a straight grid, the corner origin, one side of
 * the profile left plain, the lock off) and the one that leaves the fewest models is offered; a tie keeps
 * the lock, which holds the wall together, over a side of trim.
 */
function fewerBorderVersions(config: DesignConfig, plan: LayoutPlan): PlanFix | null {
  if (!plan.pieces.some((p) => hasEdges(p.edges))) return null
  const choices: ModelsChoice[] = []
  const add = (fix: PlanFix | null) => {
    if (fix) choices.push({ fix, models: modelCount(fix.apply(config)) })
  }
  add(fewerModels(config))
  if (config.perimeter.profile !== 'none') {
    for (const name of SIDE_NAMES) {
      if (!config.perimeter.sides[name]) continue
      const word = SIDE_WORDS[name]
      const apply = (design: DesignConfig): DesignConfig => ({
        ...design,
        perimeter: { ...design.perimeter, sides: { ...design.perimeter.sides, [name]: false } },
      })
      const models = modelCount(apply(config))
      add({
        label: `Keep the ${word} edge plain`,
        done: `The ${word} edge is plain now: ${models} different tiles to print.`,
        apply,
      })
    }
  }
  if (config.lock !== 'none') {
    const apply = (design: DesignConfig): DesignConfig => ({ ...design, lock: 'none' })
    const models = modelCount(apply(config))
    const word = lockWord(config)
    add({ label: `Leave the ${word} out`, done: `${capital(word)} left out: ${models} different tiles to print.`, apply })
  }
  const best = choices.reduce<ModelsChoice | null>((a, b) => (a === null || b.models < a.models ? b : a), null)
  return best && best.models < plan.pieces.length ? best.fix : null
}

/** The fix offered next to a warning, or nothing when the maker has to choose. */
export function fixFor(warning: FitWarning, config: DesignConfig, plan: LayoutPlan): PlanFix | null {
  switch (warning.code) {
    case 'thin-cut':
    case 'sliver-dropped': {
      // Balancing moves the cut to both sides, which on some walls only makes two thin ones.
      const code = warning.code
      const cleared = (_next: DesignConfig, nextPlan: LayoutPlan) => !nextPlan.warnings.some((w) => w.code === code)
      return (
        balanceIf(config, cleared, 'Edges evened out: the cut pieces are shared between opposite sides.') ??
        checked(config, perfectFit(config), cleared)
      )
    }
    case 'exceeds-bed':
      return biggerPrinter(config) ?? tileToBed(config)
    case 'tile-larger-than-surface':
      return fitToSurface(config)
    case 'many-pieces':
      return fewerBorderVersions(config, plan) ?? fewerModels(config)
    case 'thin-base':
      return thickerBase(config)
    case 'profile-clamped':
      return profileFits(config)
    case 'no-mount':
      return mountFix(config, plan)
    case 'no-key':
      return balanceIf(config, (next, nextPlan) => joinPlan(next, nextPlan).unkeyedSeams === 0, 'Edges evened out: every joint takes a key.')
    case 'no-lock':
      return lockFix(config, plan)
    default:
      return null
  }
}
