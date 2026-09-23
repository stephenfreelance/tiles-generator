import type { Side, SideName, SurfaceSides } from './types'

/** Side names in Side order: bottom, right, top, left (the order the mesher walks the walls). */
export const SIDE_NAMES: readonly SideName[] = ['bottom', 'right', 'top', 'left']

export const SIDES: readonly Side[] = [0, 1, 2, 3]

export const sideBit = (side: Side): number => 1 << side

export const hasSide = (mask: number, side: Side): boolean => (mask & (1 << side)) !== 0

export const ALL_SIDES: SurfaceSides = { bottom: true, right: true, top: true, left: true }

/** Surface sides as a 4-bit mask in Side order. */
export function sidesMask(sides: SurfaceSides): number {
  return SIDE_NAMES.reduce((mask, name, side) => (sides[name] ? mask | (1 << side) : mask), 0)
}

export function sidesFromMask(mask: number): SurfaceSides {
  return { bottom: (mask & 1) !== 0, right: (mask & 2) !== 0, top: (mask & 4) !== 0, left: (mask & 8) !== 0 }
}
