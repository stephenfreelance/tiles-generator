// What every plate of the uses grid is drawn with: its sheet (the part of the room the plate frames, in
// millimetres), the room's wall and floor, the visitor's tiles laid on a surface, and the shade that gives
// the drawing its light. One set of tints for the six (rooms.module.scss), so six rooms drawn apart still
// print as one book.
//
// A plate is a tonal print: every thing is a flat shape in a tint of the book's ink, never an outline, and
// its light is laid as shade, a softer tint of the same ink. The light comes from the upper left, as it
// does on every rendered thing in the book, so a thing standing off the wall casts its shadow down and to
// the right across the wall, and across the tiles.
import { Component, useContext, useId, type ReactNode } from 'react'
import { cx, type StyleWithVars } from '@/ui/cx'
import { FLOOR, type RoomRect } from '../uses'
import { LIGHT, leafPath, litHalf, midrib, WALL_FOOT, type Leaf } from './drawing'
import styles from './rooms.module.scss'
import { FADES, SceneContext, useFade, type FadeTo, type SceneShade } from './sceneShade'
import { TileInkContext } from './tileInk'

/** How far the joint tone runs past a surface under its tiles, mm: the relief filter reads it at the edges. */
const BLEED = 60

/** The skirting board's height, mm. */
const SKIRTING = 70

/**
 * A layer of shade: its shapes blurred into their penumbra and printed as one smooth tint of the warm
 * black, so a core is a flat tint and its edge fades out. Never a stipple: dots fine enough to read as
 * tone printed every fringe as dust, and the tiled screen they needed showed its seams in WebKit.
 */
function ShadeLayer({ id, frame, blur, ink }: { id: string; frame: RoomRect; blur: number; ink: string }) {
  return (
    <filter
      id={id}
      filterUnits="userSpaceOnUse"
      x={frame.x}
      y={frame.y}
      width={frame.width}
      height={frame.height}
      colorInterpolationFilters="sRGB"
    >
      <feGaussianBlur in="SourceAlpha" stdDeviation={blur} result="shape" />
      <feFlood className={ink} />
      <feComposite in2="shape" operator="in" />
    </filter>
  )
}

/**
 * A plate's sheet: an SVG whose viewBox is the frame, in the room's own millimetres. The drawing is
 * decoration under a link that names it, so it is hidden from assistive tech.
 */
export function Scene({ frame, children }: { frame: RoomRect; children: ReactNode }) {
  const id = useId()
  const shade: SceneShade = {
    cast: `${id}cast`,
    form: `${id}form`,
    fades: { right: `${id}fr`, left: `${id}fl`, down: `${id}fd`, up: `${id}fu`, pool: `${id}fp` },
  }
  return (
    <svg
      viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
      className={styles.scene}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <ShadeLayer id={shade.cast} frame={frame} blur={frame.width / 170} ink={styles.castInk} />
        <ShadeLayer id={shade.form} frame={frame} blur={frame.width / 320} ink={styles.formInk} />
        {(Object.keys(FADES) as Exclude<FadeTo, 'pool'>[]).map((to) => (
          <linearGradient key={to} id={shade.fades[to]} {...FADES[to]}>
            <stop offset={0} stopOpacity={0} />
            <stop offset={0.55} stopOpacity={0.45} />
            <stop offset={1} stopOpacity={1} />
          </linearGradient>
        ))}
        <radialGradient id={shade.fades.pool}>
          <stop offset={0} stopOpacity={1} />
          <stop offset={0.6} stopOpacity={0.55} />
          <stop offset={1} stopOpacity={0} />
        </radialGradient>
      </defs>
      <SceneContext value={shade}>{children}</SceneContext>
    </svg>
  )
}

/**
 * Shade. Draw its shapes in any fill: only their coverage counts, so a shape's opacity is how dense its
 * shade prints. A plate prints all its cast shadows in one layer, behind the things that cast them; `form`
 * is the shade on the things themselves, drawn over them with a crisper edge.
 */
export function Shade({ children, form = false }: { children: ReactNode; form?: boolean }) {
  const shade = useContext(SceneContext)
  if (!shade) return null
  return <g filter={`url(#${form ? shade.form : shade.cast})`}>{children}</g>
}

/**
 * The room behind everything: its wall across the whole plate and, where the plate reaches the floor, a
 * skirting board and the floor running forward to the plate's foot, its boards drawn as a few seams that
 * open up toward the viewer.
 */
export function Room({ frame }: { frame: RoomRect }) {
  const right = frame.x + frame.width
  const bottom = frame.y + frame.height
  const floor = bottom > WALL_FOOT
  const seams = [0.18, 0.42, 0.74].map((share) => WALL_FOOT + share * (bottom - WALL_FOOT))
  return (
    <g>
      <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} className={styles.wall} />
      {floor && (
        <g>
          <rect x={frame.x} y={WALL_FOOT - SKIRTING} width={frame.width} height={SKIRTING} className={styles.paper} />
          <rect x={frame.x} y={WALL_FOOT - SKIRTING} width={frame.width} height={6} className={styles.t12} />
          <rect x={frame.x} y={WALL_FOOT} width={frame.width} height={bottom - WALL_FOOT} className={styles.floor} />
          {seams.map((y) => (
            <line key={y} x1={frame.x} y1={y} x2={right} y2={y} className={styles.seam} />
          ))}
        </g>
      )}
    </g>
  )
}

/**
 * A surface laid with the visitor's tiles: every tile the studio would place, the whole tile's chip drawn
 * where its piece lands and clipped to the surface, so a cut at the edge keeps exactly its slice of the
 * pattern. Until the chip arrives each tile is the flat tile colour, so the surface is never empty. The
 * joints are drawn after the relief filter as hairlines, so the filter sharpens the pattern and not the grid.
 */
export function Tiles({ rect }: { rect: RoomRect }) {
  const ink = useContext(TileInkContext)
  const clip = useId()
  if (!ink) return null
  const box = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  const bleed = { x: rect.x - BLEED, y: rect.y - BLEED, width: rect.width + 2 * BLEED, height: rect.height + 2 * BLEED }
  const vars: StyleWithVars = { '--tile-ink': ink.color }
  const cells = ink.cells(rect)
  // Each tile's top and left edge: every joint once, whatever the bond, and the surface clips the rest.
  const joints = cells.map((cell) => `M${cell.x} ${cell.y + cell.height}V${cell.y}H${cell.x + cell.width}`).join('')
  return (
    <g className={styles.surface} style={vars}>
      <clipPath id={clip}>
        <rect {...box} />
      </clipPath>
      {/* Clipped after the filter, so the filter never sees the surface's edge as an edge of the relief. */}
      <g clipPath={`url(#${clip})`}>
        <g filter={`url(#${ink.relief})`}>
          {/* The joint: the deep tone of the tile's own colour, showing in the hairline between two tiles. */}
          <rect {...bleed} className={styles.joint} />
          {cells.map((cell) => {
            const tile = { x: cell.x, y: cell.y, width: cell.width, height: cell.height }
            const lay: StyleWithVars = { '--lay': cell.lay.toFixed(3) }
            return ink.chip ? (
              <image key={cell.key} href={ink.chip} {...tile} preserveAspectRatio="none" className={styles.tile} style={lay} />
            ) : (
              <rect key={cell.key} {...tile} className={cx(styles.tile, styles.tileFlat)} style={lay} />
            )
          })}
        </g>
        <path d={joints} className={styles.jointLine} />
      </g>
      {/* Where the tiling stops: the tiles' own edge, in their deep tone, never an ink outline. */}
      <rect {...box} className={styles.edge} />
    </g>
  )
}

/** A dark leaf with its upper half catching the light and a pale midrib: how every plant in the book is drawn. */
export function LeafShape({ leaf }: { leaf: Leaf }) {
  return (
    <g>
      <path d={leafPath(leaf)} className={styles.t84} />
      <path d={litHalf(leaf)} className={styles.t66} />
      <path d={midrib(leaf)} className={styles.vein} />
    </g>
  )
}

/**
 * The shadow of a piece of furniture standing on the floor against the wall, laid the way the light falls
 * rather than as the piece moved down and right (which floods the floor in front of it, where the light
 * still reaches): a band down the wall beside its right-hand side, thinning away from it; the dark on the
 * wall under it, between its legs, thinning toward the floor; and its contact with the floor. Every part
 * stays inside the piece's own reach, because a wide thin field of shade reads as a stain, not a shadow.
 * Draw it inside a Shade.
 */
export function StandingShade({ x, width, top, bottom, depth }: { x: number; width: number; top: number; bottom: number; depth: number }) {
  const away = useFade('left')
  const fall = useFade('up')
  const right = x + width
  const dx = Math.round(depth * LIGHT.x)
  const dy = Math.round(depth * LIGHT.y)
  return (
    <g>
      <path d={`M${right} ${top}L${right + dx} ${top + dy}V${WALL_FOOT}H${right}Z`} fill={away} opacity={0.7} />
      {bottom < WALL_FOOT && <rect x={x + 30} y={bottom} width={width - 60} height={WALL_FOOT - bottom} fill={fall} opacity={0.5} />}
      <FloorShade x={x} width={width} />
    </g>
  )
}

/**
 * A thing's contact with the floor: a low pool of shade under it, densest at its middle and spent before
 * the ends of its footprint, nudged a little toward the right, away from the light.
 */
export function FloorShade({ x, width }: { x: number; width: number }) {
  const pool = useFade('pool')
  return <ellipse cx={x + width * 0.53} cy={FLOOR - 2} rx={width * 0.5} ry={18} fill={pool} opacity={0.8} />
}

/**
 * A plate drawn by hand can still throw. It renders nothing rather than taking the rest of the grid, and
 * the home page around it, down with it.
 */
export class RoomBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
