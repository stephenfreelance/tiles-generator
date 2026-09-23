// Turning the single tile over to show its back: a half turn about the tile's own upright axis (the
// way a tile is turned over on the bench), lifted as it goes so no corner ever dips through the floor.
// Pure maths, so the pose is tested without a renderer.
import { LOOK } from './look'

/** Which face of the single tile is up. */
export type TileFace = 'front' | 'back'

/** Ease in and out: the turn starts and lands gently rather than snapping at either end. */
export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)

export interface FlipPose {
  /** Rotation about the tile's upright (surface y) axis, radians: 0 face up, PI back up. */
  angle: number
  /** Height of the turning axis above the floor, mm: the lowest corner rests exactly on the floor. */
  axisZ: number
}

/**
 * What else turns with the tile, as a box in the tile's own frame (x across its width from 0, z up from its
 * back at 0), mm: the printed parts seated in its back, a key standing out past a side.
 */
export interface FlipExtent {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/**
 * The tile's pose at `progress` (0 face up, 1 back up). It turns about an axis through the middle of its
 * width and thickness, and that axis rides at the tile's half extent above the floor for the current
 * angle, so the tile rises onto its edge at a quarter turn and settles back flat, resting on its relief
 * once the back is up. With an `extent`, the axis rides high enough for that box too (the axis itself
 * does not move within the tile), so a part standing out past a side never dips through the floor.
 */
export function flipPose(progress: number, width: number, thickness: number, extent?: FlipExtent): FlipPose {
  const t = Math.min(1, Math.max(0, progress))
  const angle = Math.PI * easeInOutCubic(t)
  const w = Math.max(0, width)
  const h = Math.max(0, thickness)
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  if (!extent) return { angle, axisZ: Math.abs(sin) * (w / 2) + Math.abs(cos) * (h / 2) }
  // A point (x, z) of the tile frame lands at axisZ - (x - w/2) sin + (z - h/2) cos: sin stays >= 0 over
  // the half turn, so the far side (largest x) goes down, and the back (smallest z) while face up.
  const reachX = Math.max(w, extent.maxX) - w / 2
  const reachZ = cos >= 0 ? h / 2 - Math.min(0, extent.minZ) : Math.max(h, extent.maxZ) - h / 2
  return { angle, axisZ: Math.max(0, sin) * reachX + Math.abs(cos) * reachZ }
}

/**
 * One frame's step of the turn toward `face`. Linear in time over LOOK.flip.durationMs (the easing is in
 * flipPose), and instant under reduced motion. `deltaMs` is clamped by the caller's frame budget.
 */
export function stepFlip(progress: number, face: TileFace, deltaMs: number, reduced: boolean): number {
  const target = face === 'back' ? 1 : 0
  if (reduced) return target
  const step = Math.max(0, deltaMs) / LOOK.flip.durationMs
  return target > progress ? Math.min(target, progress + step) : Math.max(target, progress - step)
}
