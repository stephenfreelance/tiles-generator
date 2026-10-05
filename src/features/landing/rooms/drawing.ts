// The geometry every plate of the uses grid is drawn with, kept apart from the components so it can be
// shared: the light, where the wall meets the floor, and the outlines of leaves and cushions. All in the
// room's own millimetres.
import { FLOOR } from '../uses'

/** Where the wall meets the floor, mm: a little behind the line things stand on, so the floor reads as a plane. */
export const WALL_FOOT = FLOOR - 40

/**
 * The light, per millimetre a thing stands off the wall: how far right and how far down its shadow falls.
 * Gentler than the draughtsman's 45 degrees, so a cabinet's shadow darkens the top of a splashback rather
 * than swallowing it.
 */
export const LIGHT = { x: 0.42, y: 0.5 } as const

/** Moves a shape to where the shadow of a thing `depth` mm off the wall falls. */
export function cast(depth: number): string {
  return `translate(${Math.round(depth * LIGHT.x)} ${Math.round(depth * LIGHT.y)})`
}

/** A leaf's outline: where its two edges swell, as shares of its length and of its width. */
export type LeafForm = 'fiddle' | 'sword' | 'oval'

const LEAF_SWELL: Record<LeafForm, { near: readonly [number, number]; far: readonly [number, number] }> = {
  // Swelling toward a blunt tip.
  fiddle: { near: [0.22, 0.42], far: [0.8, 0.62] },
  // Widest low down, drawn out to a point.
  sword: { near: [0.1, 0.62], far: [0.55, 0.5] },
  // Round through its middle.
  oval: { near: [0.12, 0.62], far: [0.78, 0.6] },
}

/** A leaf: where it springs from its stem, which way it points (degrees right of straight up), and its size, mm. */
export interface Leaf {
  x: number
  y: number
  angle: number
  length: number
  width: number
  shape?: LeafForm
}

function leafFrame({ x, y, angle, length }: Leaf) {
  const a = (angle * Math.PI) / 180
  const u = { x: Math.sin(a), y: -Math.cos(a) }
  // The normal on the leaf's left-hand edge, looking from its base to its tip.
  const left = { x: u.y, y: -u.x }
  const at = (along: number, side: number, half: 1 | -1) => ({
    x: Math.round(x + u.x * along * length + left.x * side * half),
    y: Math.round(y + u.y * along * length + left.y * side * half),
  })
  return { at, tip: at(1, 0, 1) }
}

function leafEdge(leaf: Leaf, half: 1 | -1) {
  const { at } = leafFrame(leaf)
  const { near, far } = LEAF_SWELL[leaf.shape ?? 'fiddle']
  return { c1: at(near[0], near[1] * leaf.width, half), c2: at(far[0], far[1] * leaf.width, half) }
}

/** The whole leaf. */
export function leafPath(leaf: Leaf): string {
  const { tip } = leafFrame(leaf)
  const l = leafEdge(leaf, 1)
  const r = leafEdge(leaf, -1)
  return `M${leaf.x} ${leaf.y}C${l.c1.x} ${l.c1.y} ${l.c2.x} ${l.c2.y} ${tip.x} ${tip.y}C${r.c2.x} ${r.c2.y} ${r.c1.x} ${r.c1.y} ${leaf.x} ${leaf.y}Z`
}

/** The half of a leaf that faces up, toward the light: its left half when it leans right, its right when it leans left. */
export function litHalf(leaf: Leaf): string {
  const { tip } = leafFrame(leaf)
  const { c1, c2 } = leafEdge(leaf, leaf.angle >= 0 ? 1 : -1)
  return `M${leaf.x} ${leaf.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${tip.x} ${tip.y}Z`
}

/** The leaf's midrib, most of the way to its tip. */
export function midrib(leaf: Leaf): string {
  const { at } = leafFrame(leaf)
  const end = at(0.86, 0, 1)
  return `M${leaf.x} ${leaf.y}L${end.x} ${end.y}`
}

/** A cushion's or a pillow's front, puffed: its sides swell past its corners as a filled one's do. */
export function puffed(x: number, y: number, width: number, height: number, swell: number): string {
  const r = x + width
  const b = y + height
  const my = y + height / 2
  const mx = x + width / 2
  return `M${x} ${y}Q${mx} ${y - swell} ${r} ${y}Q${r + swell} ${my} ${r} ${b}Q${mx} ${b + swell} ${x} ${b}Q${x - swell} ${my} ${x} ${y}Z`
}
