// The printed parts that are not tiles: the fit test, the wall clips and the keys. One spec is one file,
// printed `count` times; buildAccessoryMesh makes its solid.
//
// Three named views of one catalogue: `wallParts` is what the wall needs (the download's own files),
// `fitTestFor` is the fit test of that wall (its own page and its own zip), and `accessoryParts` is both,
// in print order, which is what the worker resolves an accessory id against.
import type { DesignConfig, FitClass, LayoutPlan, MeshData } from '../types'
import { buildCouponMesh, fitTestParts } from './fitTest'
import { buildKeyMesh, keyAccessories } from './joins'
import { CLIP_CLEARANCE } from './mechanism'
import { buildClipMesh, mountParts } from './mount'
import { tabPlan } from './tabs'
import type { AccessorySpec } from './types'

const KEY_CLEARANCE: Record<FitClass, number> = { snug: 0.05, standard: 0.1, loose: 0.15 }

/** Per-side clearance of a printed fastener for a fit class, mm. Pockets never depend on it. */
export function fitClearance(fit: FitClass, part: 'key' | 'clip'): number {
  return part === 'key' ? KEY_CLEARANCE[fit] : CLIP_CLEARANCE[fit]
}

/**
 * The parts the WALL needs, in print order: the wall clips (with spares), then the keys. This is the list
 * the download holds, the estimate weighs, the plan lists and the studio counts. Empty for a glued design
 * without keys.
 */
export function wallParts(config: DesignConfig, plan: LayoutPlan): AccessorySpec[] {
  return [...mountParts(config, plan), ...keyAccessories(config, plan)]
}

/**
 * The fit test for this wall, in print order (coupons, then clips, then keys): it tests only what the wall
 * really places, clips only when a piece takes one, keys only when a joint takes one and the tabs' socket
 * only when a joint really locks, the same rule the putting-up guide follows (fixingSystem). Empty for a
 * glued design, or a plate too thin for the slots, sockets and pockets. Pass `wall` to read it off a list
 * already in hand.
 */
export function fitTestFor(config: DesignConfig, plan: LayoutPlan, wall: readonly AccessorySpec[] = wallParts(config, plan)): AccessorySpec[] {
  return fitTestParts(config, {
    clips: wall.some((part) => part.kind === 'clip'),
    keys: wall.some((part) => part.kind === 'key'),
    // The tabs print nothing, so no part of the wall says they are there: the plan is the only witness.
    tabs: tabPlan(config, plan).tabs > 0,
  })
}

/**
 * Every printed part the design can print, with counts: the fit test first (group 'fit-test'), then the
 * wall clips, then the keys. The catalogue the worker resolves accessory ids against; each consumer that
 * means one of the two lists asks for it by name instead of filtering this one.
 */
export function accessoryParts(config: DesignConfig, plan: LayoutPlan): AccessorySpec[] {
  const wall = wallParts(config, plan)
  return [...fitTestFor(config, plan, wall), ...wall]
}

/** The closed, printable mesh of one accessory, bottom on the bed at z = 0, topIndexCount 0. */
export function buildAccessoryMesh(config: DesignConfig, spec: AccessorySpec): MeshData {
  switch (spec.kind) {
    case 'clip':
      return buildClipMesh(spec)
    case 'key':
      return buildKeyMesh(config, spec)
    case 'fit-test':
      return buildCouponMesh(config, spec)
  }
}
