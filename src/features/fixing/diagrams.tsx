// The fixing systems drawn once, for every page that explains them: the home page's section 04, the
// studio's "Putting it up" cards and the download page's "Putting it up" guide all draw from here, so no
// two of them can show a different key or a different clip.
//
// Every drawing is a static inline SVG and aria-hidden: the words beside it carry the meaning, so none
// holds a figure or a word. Lines and fills are currentColor, so a drawing inks itself in its
// container's text color (white on a selected card included), and the printed part each one is about
// (the adhesive, the key, the clip) takes --diagram-part, which falls back to the accent. None has a
// width or a height of its own: the viewBox gives the proportions and the container gives the size
// (see diagrams.module.scss).
import { useId } from 'react'
import type { AccessoryKind } from '@/core/fixing/types'
import type { JointEdgeProfile, PerimeterProfile } from '@/core/types'
import { cx } from '@/ui/cx'
import {
  arrowHeadPath,
  battenScrews,
  blockTiles,
  CARD,
  cardTiles,
  CLIP_PLAN,
  CLIP_SCALE,
  CLIP_SECTION,
  clipPlan,
  clipPlanAt,
  clipPocketPlan,
  clipPocketSectionPath,
  clipSectionPath,
  clipStopsSectionPath,
  clipWallTiles,
  JOINT_GAP,
  JOINT_Y,
  keyPath,
  keySpots,
  SCREW_SECTION,
  screwSectionPath,
  START_LINE,
  startLineTiles,
  TAB,
  tabPath,
  tabSpots,
  tileSectionPath,
  WALL_FACE,
  type ClipPlan,
  type ClipWallTile,
  type TileBlock,
} from './diagramGeometry'
import styles from './diagrams.module.scss'

/** What every drawing accepts: a class for the container to size or recolor it with. */
export interface DiagramProps {
  className?: string
}

const svgProps = { 'aria-hidden': true, focusable: false } as const

/** The thin double-sided tape: a mid tone of the ink, so it reads as a layer and not as a printed part. */
const tapeProps = { fill: 'currentColor', fillOpacity: 0.5, stroke: 'none' } as const
/** A wall plug, and the batten under the start line: solid things that are not printed, in a lighter tone. */
const hardwareProps = { fill: 'currentColor', fillOpacity: 0.22, stroke: 'currentColor', strokeWidth: 1 } as const

/**
 * The wall in section: a hatched band ending at its face, the draughtsman's sign for "cut through".
 * `face` is where the wall stops; `height` how far down the drawing it runs.
 */
function WallSection({ face = WALL_FACE, height = 100 }: { face?: number; height?: number }) {
  // One pattern per drawing: several drawings share a page, and an id must not repeat on it.
  const id = useId()
  return (
    <g>
      <defs>
        <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" className={styles.hatch} />
        </pattern>
      </defs>
      <rect x="0" y="0" width={face} height={height} fill={`url(#${id})`} />
      <line x1={face} y1="0" x2={face} y2={height} className={styles.face} />
    </g>
  )
}

/** A straight arrow from (x1, y1) to (x2, y2), with a head at the end, or at both ends when `both`. */
function Arrow({ x1, y1, x2, y2, both = false }: { x1: number; y1: number; x2: number; y2: number; both?: boolean }) {
  return (
    <g className={styles.arrow}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <path d={arrowHeadPath(x1, y1, x2, y2)} />
      {both && <path d={arrowHeadPath(x2, y2, x1, y1)} />}
    </g>
  )
}

/** A clip in plan: the comb as the part, its through hole left open, and the countersink's rim around the hole. */
function ClipPlanShape({ plan, className = styles.part }: { plan: ClipPlan; className?: string }) {
  return (
    <g>
      <path d={plan.path} fillRule="evenodd" className={className} />
      <circle
        cx={plan.sink.cx}
        cy={plan.sink.cy}
        r={plan.sink.r}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  )
}

/** A rounded rectangle from a [x0, y0, x1, y1] box. */
function Box({ box, rx = 0, className }: { box: readonly [number, number, number, number]; rx?: number; className: string }) {
  const [x0, y0, x1, y1] = box
  return <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={rx} className={className} />
}

// ---------------------------------------------------------------------------------------------------
// The studio's choice cards, 80 x 56

/**
 * "Glue or tape", as a card: the wall in section, two tiles standing on dabs of adhesive between their
 * flat backs and the wall, and one arrow pressing them on.
 */
export function GlueCard({ className }: DiagramProps) {
  const back = CARD.wallFace + 2.5
  const dabs = [7, 21, 35, 49]
  return (
    <svg viewBox={`0 0 ${CARD.width} ${CARD.height}`} className={cx(styles.diagram, className)} {...svgProps}>
      <WallSection face={CARD.wallFace} height={CARD.height} />
      {dabs.map((y) => (
        <rect key={y} x={CARD.wallFace} y={y - 5} width={back - CARD.wallFace + 0.4} height="10" rx="1.25" className={styles.part} />
      ))}
      <path d={tileSectionPath(back, 0, CARD.jointY - JOINT_GAP / 2)} className={styles.tile} />
      <path d={tileSectionPath(back, CARD.jointY + JOINT_GAP / 2, CARD.height)} className={styles.tile} />
      <Arrow x1={62} y1={CARD.jointY} x2={40} y2={CARD.jointY} />
    </svg>
  )
}

/**
 * "Wall clips", as a card: the wall in section, two tiles standing a tape's thickness off its face, a
 * pocket in each (drawn hidden) with its clip inside, level with the tile's back, and only the tape
 * between the clip and the wall; a two-headed arrow: the tile pushes on and pulls off again.
 */
export function ClipsCard({ className }: DiagramProps) {
  const [k, kv] = CLIP_SCALE.card
  const { lower: on } = clipWallTiles('on', CARD.wallFace, CLIP_SECTION.tape * k)
  const clips = [CARD.jointY / 2, (CARD.jointY + CARD.height) / 2]
  return (
    <svg viewBox={`0 0 ${CARD.width} ${CARD.height}`} className={cx(styles.diagram, className)} {...svgProps}>
      <WallSection face={CARD.wallFace} height={CARD.height} />
      <path d={tileSectionPath(on.back, 0, CARD.jointY - JOINT_GAP / 2)} className={styles.tile} />
      <path d={tileSectionPath(on.back, CARD.jointY + JOINT_GAP / 2, CARD.height)} className={styles.tile} />
      {clips.map((y) => (
        <SectionClip key={y} at={on} y={y} k={k} kv={kv} />
      ))}
      <Arrow x1={42} y1={CARD.jointY} x2={64} y2={CARD.jointY} both />
    </svg>
  )
}

/** "Side by side", as a card: two tiles seen from the back, the joint between them drawn wider than it prints. */
export function SideBySideCard({ className }: DiagramProps) {
  return (
    <svg viewBox={`0 0 ${CARD.width} ${CARD.height}`} className={cx(styles.diagram, className)} {...svgProps}>
      {cardTiles().map((tile) => (
        <rect key={tile.x} x={tile.x} y={tile.y} width={tile.w} height={tile.h} rx="1.5" className={styles.tile} />
      ))}
    </svg>
  )
}

/** The key on the Keys card, and the clearance its notch is drawn with. */
const CARD_KEY = { scale: 1.2, grow: 0.9 } as const

/**
 * "Keys", as a card: two tiles seen from the back, the joint between them drawn wider than it prints,
 * and a key lying over its notch across the joint, half in each tile.
 */
export function KeysCard({ className }: DiagramProps) {
  const clip = useId()
  const tiles = cardTiles()
  const seam = { x: CARD.width / 2, y: CARD.top + CARD.tileH / 2 }
  return (
    <svg viewBox={`0 0 ${CARD.width} ${CARD.height}`} className={cx(styles.diagram, className)} {...svgProps}>
      <defs>
        <clipPath id={clip}>
          {tiles.map((tile) => (
            <rect key={tile.x} x={tile.x} y={tile.y} width={tile.w} height={tile.h} />
          ))}
        </clipPath>
      </defs>
      {tiles.map((tile) => (
        <rect key={tile.x} x={tile.x} y={tile.y} width={tile.w} height={tile.h} rx="1.5" className={styles.tile} />
      ))}
      {/* Each tile's half of the notch: clipped to the tiles, since the joint between them is open air. */}
      <path d={keyPath(seam.x, seam.y, true, CARD_KEY.grow, CARD_KEY.scale)} clipPath={`url(#${clip})`} className={styles.pocket} />
      <path d={keyPath(seam.x, seam.y, true, 0, CARD_KEY.scale)} className={styles.part} />
    </svg>
  )
}

/** The tab on the Tabs card, and the clearance its socket is drawn with. */
const CARD_TAB = { scale: 1.15, grow: 0.9 } as const

/**
 * "Tabs", as a card: two tiles seen from the back, the joint between them drawn wider than it prints, and
 * the left tile's tab standing across that joint in the socket cut into the right tile. The socket is the
 * tab's own outline grown by the clearance, clipped to the tile it is cut into, so the card shows the one
 * thing the printed pair is: a head too wide to come back out through the throat it sits behind.
 */
export function TabsCard({ className }: DiagramProps) {
  const clip = useId()
  const [left, right] = cardTiles()
  const root = { x: left.x + left.w, y: CARD.top + CARD.tileH / 2 }
  return (
    <svg viewBox={`0 0 ${CARD.width} ${CARD.height}`} className={cx(styles.diagram, className)} {...svgProps}>
      <defs>
        <clipPath id={clip}>
          <rect x={right.x} y={right.y} width={right.w} height={right.h} />
        </clipPath>
      </defs>
      {[left, right].map((tile) => (
        <rect key={tile.x} x={tile.x} y={tile.y} width={tile.w} height={tile.h} rx="1.5" className={styles.tile} />
      ))}
      <path
        d={tabPath(root.x, root.y, CARD_TAB.grow, CARD_TAB.scale)}
        clipPath={`url(#${clip})`}
        className={styles.pocket}
      />
      <path d={tabPath(root.x, root.y, 0, CARD_TAB.scale)} className={styles.part} />
    </svg>
  )
}

// ---------------------------------------------------------------------------------------------------
// The guide's and the home page's drawings

/**
 * Glue or tape, in side section: the wall, two tiles one above the other, dabs of adhesive between
 * their flat backs and the wall, and one arrow pressing them on. The arrow points one way only, which
 * is the whole difference from the clips.
 */
export function GlueDiagram({ className }: DiagramProps) {
  const back = WALL_FACE + 6
  const dabs = [13, 37, 63, 87]
  return (
    <svg viewBox="0 0 76 100" className={cx(styles.diagram, className)} {...svgProps}>
      <WallSection />
      {dabs.map((y) => (
        <rect key={y} x={WALL_FACE} y={y - 5} width={back - WALL_FACE + 0.6} height="10" rx="2.5" className={styles.part} />
      ))}
      <path d={tileSectionPath(back, 0, JOINT_Y - JOINT_GAP / 2)} className={styles.tile} />
      <path d={tileSectionPath(back, JOINT_Y + JOINT_GAP / 2, 100)} className={styles.tile} />
      <Arrow x1={back + 40} y1={JOINT_Y} x2={back + 19} y2={JOINT_Y} />
    </svg>
  )
}

export interface KeysDiagramProps extends DiagramProps {
  /** Draw one key lifted off its slot, on its way in. Default true: the drawing says "pressed in". */
  lifted?: boolean
}

const KEYS_BLOCK: TileBlock = { columns: 2, rows: 2, w: 62, h: 39, gap: 1.5, x0: 9.25, y0: 19 }
const KEY_SCALE = 0.72
/** How far the lifted key hangs above its slot, up and to the right. */
const LIFT = { x: 10, y: -16 }

/**
 * Four tiles seen from the back, with bow-tie keys across every seam between them and none on the
 * block's outside edges. One key is drawn lifted above its empty slot, with an arrow pressing it in.
 */
export function KeysDiagram({ className, lifted = true }: KeysDiagramProps) {
  const { w, h } = KEYS_BLOCK
  const spots = keySpots(KEYS_BLOCK)
  // The top key on the vertical seam: it has open air above the block to be lifted into.
  const liftIndex = lifted ? spots.findIndex((spot) => spot.horizontal) : -1
  const liftedSpot = liftIndex >= 0 ? spots[liftIndex] : null
  return (
    <svg viewBox="0 0 144 100" className={cx(styles.diagram, className)} {...svgProps}>
      {blockTiles(KEYS_BLOCK).map((tile) => (
        <rect key={`${tile.x}-${tile.y}`} x={tile.x} y={tile.y} width={w} height={h} rx="1.5" className={styles.tile} />
      ))}
      {spots.map((spot) => (
        <path
          key={`pocket-${spot.x}-${spot.y}`}
          d={keyPath(spot.x, spot.y, spot.horizontal, 0.8, KEY_SCALE)}
          className={styles.pocket}
        />
      ))}
      {spots.map((spot, index) =>
        index === liftIndex ? null : (
          <path key={`key-${spot.x}-${spot.y}`} d={keyPath(spot.x, spot.y, spot.horizontal, 0, KEY_SCALE)} className={styles.part} />
        ),
      )}
      {liftedSpot && (
        <g>
          <Arrow x1={liftedSpot.x + LIFT.x + 9} y1={liftedSpot.y + LIFT.y + 2} x2={liftedSpot.x + 7.5} y2={liftedSpot.y - 1} />
          <path
            d={keyPath(liftedSpot.x + LIFT.x, liftedSpot.y + LIFT.y, liftedSpot.horizontal, 0, KEY_SCALE)}
            className={cx(styles.part, styles.lifted)}
          />
        </g>
      )}
    </svg>
  )
}

/** A row of a tabbed wall, and the fit test's coupon pair: the same block, three tiles wide or two. */
const TABS_BLOCK: TileBlock = { columns: 3, rows: 1, w: 38, h: 56, gap: 3, x0: 6, y0: 34 }
const TAB_SCALE = 0.82
/** The clearance the socket round a tab is drawn with, as a key notch is drawn round its key. */
const TAB_GROW = 1
/** How far the tile not yet on the wall hangs off its place, up and to the right, as a lifted key hangs off its slot. */
const TAB_LIFT = { x: 14, y: -24 }

export interface TabsDiagramProps extends DiagramProps {
  /**
   * The fit test's coupon pair rather than a row of the wall: coupon A with its tab, and a socket coupon
   * over it carrying its fit marks. Default false.
   */
  coupons?: boolean
}

/**
 * A row of a tabbed wall seen from the back, going up left to right: the tiles already on the wall hold each
 * other by a tab in a socket, the next tab stands in the open joint, and the tile still to go on hangs off
 * the wall with its socket over that tab. It hangs off its place the way a lifted key hangs off its slot,
 * because the motion is the same one: the socket is open at the tile's back, so it comes down over the tab as
 * the tile lies down on the wall, and nothing ever travels along the joint.
 */
export function TabsDiagram({ className, coupons = false }: TabsDiagramProps) {
  const block: TileBlock = coupons ? { ...TABS_BLOCK, columns: 2, w: 54, x0: 10 } : TABS_BLOCK
  const { w, h } = block
  const tiles = blockTiles(block)
  const last = tiles.length - 1
  // Every joint but the last is made up; at the last the tab stands in the open, waiting for its socket.
  const made = Array.from({ length: Math.max(0, last - 1) }, (_, column) => column)
  // The fit test prints one pair at mid-height, so its drawing shows the one pair the coupons carry.
  const spots = coupons ? [0.5] : undefined
  const pairs = (column: number) => tabSpots(block, column, spots)
  const open = pairs(last - 1)
  const lifted = { x: tiles[last].x + TAB_LIFT.x, y: tiles[last].y + TAB_LIFT.y }
  const clip = useId()
  const reach = TAB.reach * TAB_SCALE
  // From the socket coming over it to the head of the tab it comes over, along the way the tile travels.
  const pull = open[open.length - 1]
  const to = { x: pull.x + reach + 2, y: pull.y - 6 }
  return (
    <svg viewBox="0 0 144 100" className={cx(styles.diagram, className)} {...svgProps}>
      <defs>
        <clipPath id={clip}>
          {/* A socket is cut into its own tile and stops at its side line, so each is clipped to that tile. */}
          {[...tiles.slice(1, last), lifted].map((tile) => (
            <rect key={`${tile.x}-${tile.y}`} x={tile.x} y={tile.y} width={w} height={h} />
          ))}
        </clipPath>
      </defs>
      {tiles.slice(0, last).map((tile) => (
        <rect key={tile.x} x={tile.x} y={tile.y} width={w} height={h} rx="1.5" className={styles.tile} />
      ))}
      {made.flatMap((column) =>
        pairs(column).map((spot) => (
          <path key={`socket-${column}-${spot.y}`} d={tabPath(spot.x, spot.y, TAB_GROW, TAB_SCALE)} clipPath={`url(#${clip})`} className={styles.pocket} />
        )),
      )}
      {[...made, last - 1].flatMap((column) =>
        pairs(column).map((spot) => (
          <path key={`tab-${column}-${spot.y}`} d={tabPath(spot.x, spot.y, 0, TAB_SCALE)} className={styles.part} />
        )),
      )}
      <g>
        <rect x={lifted.x} y={lifted.y} width={w} height={h} rx="1.5" className={cx(styles.tile, styles.lifted)} />
        {open.map((spot) => (
          <path
            key={spot.y}
            d={tabPath(lifted.x, spot.y + TAB_LIFT.y, TAB_GROW, TAB_SCALE)}
            clipPath={`url(#${clip})`}
            className={styles.pocket}
          />
        ))}
        {coupons && <FitMarks x={lifted.x + w - 5} y={lifted.y + h / 2} marks={2} />}
      </g>
      <Arrow x1={to.x + TAB_LIFT.x * 1.25} y1={to.y + TAB_LIFT.y * 1.25} x2={to.x} y2={to.y} />
    </svg>
  )
}

/** The one to three notches that tell a fit-test part apart, as ticks, so they can be counted at any size. */
/** The notches that tell one fit from another. The defaults suit the 144-wide plans; the 48-wide icons
    pass their own, or three notches would run off a coupon. */
function FitMarks({ x, y, marks, len = 5, pitch = 3.2 }: { x: number; y: number; marks: number; len?: number; pitch?: number }) {
  return (
    <g>
      {Array.from({ length: marks }, (_, notch) => (
        <line
          key={notch}
          x1={x - len}
          y1={y - (pitch * (marks - 1)) / 2 + notch * pitch}
          x2={x}
          y2={y - (pitch * (marks - 1)) / 2 + notch * pitch}
          className={styles.tick}
        />
      ))}
    </g>
  )
}

/** The scale of the big clip plan: the clip fills most of a 144 x 100 box. */
const PLAN_SCALE = 2.6

/**
 * One wall clip on its own, in plan, as it prints (seen from above): the centre block with the countersunk
 * hole for the optional screw and the two stops beside it (they stay on: clicked in, they rest on the
 * pocket's ceiling), the stiff spine out to both ends, and the four springy tines cut free of it by their
 * slots, each with a barb at its tip.
 */
export function ClipDiagram({ className }: DiagramProps) {
  const plan = clipPlanAt(72, 50, PLAN_SCALE)
  return (
    <svg viewBox="0 0 144 100" className={cx(styles.diagram, className)} {...svgProps}>
      <ClipPlanShape plan={plan} />
      <ClipStops plan={plan} />
    </svg>
  )
}

/** A clip's two stops seen from above, on its centre block. */
function ClipStops({ plan }: { plan: ClipPlan }) {
  return (
    <g>
      {plan.stops.map((stop) => (
        <Box key={stop[1]} box={stop} rx={0.4} className={styles.part} />
      ))}
    </g>
  )
}

/** The scale of the clip in the tape close-up, and the tape's inset from the centre block's edges. */
const TAPE_SCALE = 2.3
const TAPE_INSET = 0.9

/**
 * A piece of thin double-sided tape on a clip already clicked into the tile: on the centre block only,
 * clear of the tines (they must flex and slide on the wall), with the liner still on and a corner of it
 * turned up to peel later. A close-up of one pocket in the back of the tile.
 */
export function TapeDiagram({ className }: DiagramProps) {
  const centre = { x: 72, y: 50 }
  const plan = clipPlanAt(centre.x, centre.y, TAPE_SCALE)
  const pocket = clipPocketPlan(centre.x, centre.y, TAPE_SCALE)
  const inset = TAPE_INSET * TAPE_SCALE
  const [bx0, by0, bx1, by1] = plan.block
  const tape = { x0: bx0 + inset, y0: by0 + inset, x1: bx1 - inset, y1: by1 - inset }
  const fold = (tape.x1 - tape.x0) * 0.42
  return (
    <svg viewBox="0 0 144 100" className={cx(styles.diagram, className)} {...svgProps}>
      <rect x="4" y="12" width="136" height="76" rx="1.5" className={styles.tile} />
      <Box box={pocket.ceiling} className={styles.hidden} />
      <Box box={pocket.mouth} rx={1.2} className={styles.pocket} />
      <ClipPlanShape plan={plan} />
      {/* The tape with its liner, one corner folded back where the liner will be peeled. */}
      <path
        d={`M${tape.x0} ${tape.y0} L${tape.x1 - fold} ${tape.y0} L${tape.x1} ${tape.y0 + fold} L${tape.x1} ${tape.y1} L${tape.x0} ${tape.y1} Z`}
        {...tapeProps}
        fillOpacity={0.3}
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        d={`M${tape.x1 - fold} ${tape.y0} L${tape.x1} ${tape.y0 + fold} L${tape.x1 + fold * 0.15} ${tape.y0 - fold * 0.75} Z`}
        fill="currentColor"
        fillOpacity={0.12}
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  )
}

export interface ClipWallDiagramProps extends DiagramProps {
  /**
   * 'off' (default): the lower tile on its clip, the upper one pulled straight off, its clip left taped to
   * the wall, under a two-way arrow (pulls off, pushes back on). 'press': the upper tile on its way to the
   * wall with its clip in it, the stops on the pocket's ceiling and the tape on the clip, under an arrow
   * pressing it on. 'on': both tiles on.
   */
  show?: 'on' | 'press' | 'off'
}

/**
 * Wall clips in side section: two tiles, each clicked onto a clip that sits in a pocket in its back, level
 * with the tile's back, taped to the wall, so the tile stands only the tape's thickness off it. The tile
 * places its own clip: it goes up with the clip in it and the tape on the clip, and when it is pulled off
 * the clip stays on the wall. The clip's stops stay on for good, so every state draws them.
 */
export function ClipWallDiagram({ className, show = 'off' }: ClipWallDiagramProps) {
  const [k, kv] = CLIP_SCALE.section
  const { upper, lower } = clipWallTiles(show, WALL_FACE, CLIP_SECTION.tape * k)
  // The arrow runs in the open gap between the wall and the upper tile, below its clip.
  const arrowY = JOINT_Y - 10
  return (
    <svg viewBox="0 0 76 100" className={cx(styles.diagram, className)} {...svgProps}>
      <WallSection />
      <path d={tileSectionPath(lower.back, JOINT_Y + JOINT_GAP / 2, 100)} className={styles.tile} />
      <SectionClip at={lower} y={(JOINT_Y + 100) / 2} k={k} kv={kv} />
      <path d={tileSectionPath(upper.back, 0, JOINT_Y - JOINT_GAP / 2)} className={styles.tile} />
      <SectionClip at={upper} y={JOINT_Y / 2} k={k} kv={kv} />
      {show === 'press' && <Arrow x1={upper.back - 3} y1={arrowY} x2={WALL_FACE + 3} y2={arrowY} />}
      {show === 'off' && <Arrow x1={WALL_FACE + 3} y1={arrowY} x2={upper.back - 3} y2={arrowY} both />}
    </svg>
  )
}

/**
 * One tile's clip in a side section (clipWallTiles): the pocket in the tile's back, drawn hidden, the
 * tape, and the clip with its stops, which reach the pocket's ceiling whenever the clip is in its tile.
 */
function SectionClip({ at, y, k, kv }: { at: ClipWallTile; y: number; k: number; kv: number }) {
  return (
    <g>
      <path d={clipPocketSectionPath(at.back, y, k, kv)} className={styles.hidden} />
      <TapeSection x={at.tape} y={y} k={k} kv={kv} />
      <path d={clipSectionPath(at.clip, y, k, kv)} className={styles.part} />
      <path d={clipStopsSectionPath(at.clip, y, k, kv)} className={styles.part} />
    </g>
  )
}

/** The tape on a clip's back in section, from x to the clip, over the centre block's height (k in depth, kv in height). */
function TapeSection({ x, y, k = 1, kv = k }: { x: number; y: number; k?: number; kv?: number }) {
  const half = (CLIP_SECTION.body - 0.4) * kv
  return <rect x={x} y={y - half} width={CLIP_SECTION.tape * k} height={2 * half} {...tapeProps} />
}

/** The screw close-up's scale, and how far the tile stands off while the clips are screwed. */
const SCREW_SCALE = 1.6
const SCREW_TILE_OFF = 30

/**
 * The optional screw, in side section: the tile pulled off (drawn hidden, standing off the wall), its
 * clip left taped to the wall with its stops still on, a plug in the wall behind the clip's hole and a
 * countersunk screw driven through the clip into it, its head sunk in the clip's centre block.
 */
export function ScrewDiagram({ className }: DiagramProps) {
  const y = JOINT_Y
  const k = SCREW_SCALE
  const clipBack = WALL_FACE + CLIP_SECTION.tape * k
  const plugDepth = 16
  const tileBack = WALL_FACE + SCREW_TILE_OFF
  return (
    <svg viewBox="0 0 76 100" className={cx(styles.diagram, className)} {...svgProps}>
      <WallSection />
      <rect
        x={WALL_FACE - plugDepth}
        y={y - SCREW_SECTION.plug * k}
        width={plugDepth}
        height={2 * SCREW_SECTION.plug * k}
        rx="0.8"
        {...hardwareProps}
      />
      <TapeSection x={WALL_FACE} y={y} k={k} />
      <path d={clipSectionPath(clipBack, y, k)} className={styles.part} />
      <path d={clipStopsSectionPath(clipBack, y, k)} className={styles.part} />
      <path d={screwSectionPath(clipBack, y, k, (CLIP_SECTION.tape * k + plugDepth - 2) / k)} className={styles.screw} />
      <path d={tileSectionPath(tileBack, 4, 96)} className={styles.hidden} />
      <Arrow x1={tileBack - 4} y1={y} x2={clipBack + CLIP_SECTION.thick * k + 4} y2={y} />
    </svg>
  )
}

/**
 * The start line, the wall from the front: a level line for the bottom edge of the tiles, drawn in the
 * part's colour, a straight batten screwed on under it to carry the bottom row, and the tiles still to
 * come standing on it, drawn hidden.
 */
export function StartLineDiagram({ className }: DiagramProps) {
  const { x0, x1, line, batten, tileW, tileH } = START_LINE
  return (
    <svg viewBox="0 0 144 100" className={cx(styles.diagram, className)} {...svgProps}>
      {startLineTiles().map((tile) => (
        <rect key={`${tile.x}-${tile.y}`} x={tile.x} y={tile.y} width={tileW} height={tileH} rx="1.2" className={styles.hidden} />
      ))}
      <rect x={x0} y={line} width={x1 - x0} height={batten} rx="1" {...hardwareProps} />
      {battenScrews().map((x) => (
        <circle key={x} cx={x} cy={line + batten / 2} r="1.2" className={styles.screw} />
      ))}
      <line x1={x0 - 8} y1={line} x2={x1 + 8} y2={line} className={styles.mark} />
    </svg>
  )
}

export interface TileBackDiagramProps extends DiagramProps {
  /** Key notches along every side, at a quarter and three quarters of it. Default true. */
  keys?: boolean
  /** Two clip pockets, one near the bottom edge and one near the top, clear of the key notches. Default true. */
  clips?: boolean
  /**
   * Draw the printed parts in their pockets rather than the empty pockets: true for both, or only the
   * 'clips' or the 'keys' (the clips click in at the table, the keys only as the tiles meet). Default false.
   */
  fitted?: boolean | 'keys' | 'clips'
  /** With the clips fitted: the top pocket's clip drawn lifted above it, with an arrow clicking it in. Default false. */
  lifted?: boolean
}

const BACK = { x: 12, y: 12, size: 76 } as const
/** The clips' scale on the tile back, and how far in from the bottom and top edges their pockets sit (with keys, clear of the notches). */
const BACK_CLIP = { scale: 0.6, offset: 13, keyedOffset: 19.5 } as const
/** Where the lifted clip hangs: to the right of its pocket, and just clear of the tile's top edge. */
const CLIP_LIFT = { x: 14, above: 5.6 }

/**
 * One tile seen from the back: key notches open at its sides (half a key's pocket each, so a key
 * straddles the joint), and a clip pocket near its bottom and top edges, set in far enough that the two
 * never meet. A pocket shows its mouth, and the wider ceiling behind the lips drawn hidden.
 */
export function TileBackDiagram({ className, keys = true, clips = true, fitted = false, lifted = false }: TileBackDiagramProps) {
  const { x, y, size } = BACK
  const clip = useId()
  const keysIn = fitted === true || fitted === 'keys'
  const clipsIn = fitted === true || fitted === 'clips'
  const notches = [0.25, 0.75].flatMap((at) => [
    { cx: x, cy: y + at * size, horizontal: true },
    { cx: x + size, cy: y + at * size, horizontal: true },
    { cx: x + at * size, cy: y, horizontal: false },
    { cx: x + at * size, cy: y + size, horizontal: false },
  ])
  const offset = keys ? BACK_CLIP.keyedOffset : BACK_CLIP.offset
  // Top first: that is the pocket whose clip is lifted, into the open air above the tile.
  const bands = [y + offset, y + size - offset]
  const middle = x + size / 2
  return (
    <svg viewBox="0 0 100 100" className={cx(styles.diagram, className)} {...svgProps}>
      <defs>
        <clipPath id={clip}>
          <rect x={x} y={y} width={size} height={size} />
        </clipPath>
      </defs>
      <rect x={x} y={y} width={size} height={size} rx="1.5" className={styles.tile} />
      {keys && (
        // Clipped to the tile: each notch is the half of a key's pocket that lies in this tile.
        <g clipPath={`url(#${clip})`}>
          {notches.map((notch) => (
            <path
              key={`${notch.cx}-${notch.cy}`}
              d={keyPath(notch.cx, notch.cy, notch.horizontal, keysIn ? 0 : 0.9, 1.15)}
              className={keysIn ? styles.part : styles.pocket}
            />
          ))}
        </g>
      )}
      {clips &&
        bands.map((band, index) => {
          const pocket = clipPocketPlan(middle, band, BACK_CLIP.scale)
          const up = clipsIn && lifted && index === 0
          return (
            <g key={band}>
              <Box box={pocket.ceiling} className={styles.hidden} />
              <Box box={pocket.mouth} rx={0.8} className={styles.pocket} />
              {clipsIn && !up && <ClipPlanShape plan={clipPlanAt(middle, band, BACK_CLIP.scale)} />}
              {up && (
                <g>
                  <Arrow x1={middle + CLIP_LIFT.x + 16} y1={y - CLIP_LIFT.above + 3} x2={middle + 12} y2={band - 2} />
                  <ClipPlanShape
                    plan={clipPlanAt(middle + CLIP_LIFT.x, y - CLIP_LIFT.above, BACK_CLIP.scale)}
                    className={cx(styles.part, styles.lifted)}
                  />
                </g>
              )}
            </g>
          )
        })}
    </svg>
  )
}

/**
 * The edge of the whole surface in cross-section, relief on the left and the surface's edge on the
 * right: one filled path per profile in a 32 x 20 box.
 */
const PERIMETER_PATHS: Record<PerimeterProfile, string> = {
  none: 'M2 18V9Q4 1 6 9Q8 5 10 9Q12 1 14 9Q16 5 18 9Q20 1 22 9Q24 5 26 9H28V18Z',
  margin: 'M2 18V9Q4 1 6 9Q8 5 10 9H28V18Z',
  chamfer: 'M2 18V9Q4 1 6 9Q8 5 11 5H22L28 11V18Z',
  bullnose: 'M2 18V9Q4 1 6 9Q8 5 11 5H22A6 6 0 0 1 28 11V18Z',
  ogee: 'M2 18V9Q4 1 6 9Q8 5 11 5H20A4 3 0 0 1 24 8A4 3 0 0 0 28 11V18Z',
  frame: 'M2 18V9Q4 1 6 9Q8 7 10 9H16L22 3H27L28 4V18Z',
}

export interface PerimeterProfileDiagramProps extends DiagramProps {
  profile: PerimeterProfile
}

/** "Around the wall": the profile the border tiles take along the surface's edge, seen in section. */
export function PerimeterProfileDiagram({ profile, className }: PerimeterProfileDiagramProps) {
  return (
    <svg viewBox="0 0 32 20" className={cx(styles.diagram, className)} {...svgProps}>
      <path d={PERIMETER_PATHS[profile]} className={styles.profile} />
    </svg>
  )
}

/** Two tiles meeting, in section, with the joint drawn open so the edge shape reads. */
const JOINT_EDGE_PATHS: Record<JointEdgeProfile, string> = {
  square: 'M0 18V6H15V18Z M17 18V6H32V18Z',
  chamfer: 'M0 18V6H13L15 8V18Z M17 18V8L19 6H32V18Z',
  round: 'M0 18V6H12A3 3 0 0 1 15 9V18Z M17 18V9A3 3 0 0 1 20 6H32V18Z',
  pillow: 'M0 18V6H9Q15 6 15 10V18Z M17 18V10Q17 6 23 6H32V18Z',
}

export interface JointEdgeDiagramProps extends DiagramProps {
  profile: JointEdgeProfile
}

/** "Between tiles": the edge every tile takes where it meets its neighbour, seen in section. */
export function JointEdgeDiagram({ profile, className }: JointEdgeDiagramProps) {
  return (
    <svg viewBox="0 0 32 20" className={cx(styles.diagram, className)} {...svgProps}>
      <path d={JOINT_EDGE_PATHS[profile]} className={styles.profile} />
    </svg>
  )
}

export interface FitTestDiagramProps extends DiagramProps {
  /** The wall has keys: coupons A and B butted with their key slots together, and the test keys. Default true. */
  keys?: boolean
  /** The wall is on clips: coupon A's clip pocket, and the test clips. Default true. */
  clips?: boolean
}

type Rect = { x: number; y: number; w: number; h: number }

/**
 * Where the fit test's parts are drawn in its 144 x 100 box: the coupons on the left, the three fits in
 * rows on the right. Keys alone: A and B side by side across the joint, as they butt. Clips alone: A
 * with its clip pocket. Both: A over B, so the key slot on their joint and the clip pocket in A stay
 * apart and each arrow finds its own way in from the right.
 */
function fitTestLayout(keys: boolean, clips: boolean) {
  if (keys && clips) {
    const a: Rect = { x: 10, y: 8, w: 62, h: 44 }
    const b: Rect = { x: 10, y: 52, w: 62, h: 28 }
    const fits = [22, 46, 70]
    const clipX = 127.5
    return {
      fits,
      a,
      b,
      slot: { x: a.x + a.w / 2, y: a.y + a.h, horizontal: false },
      pocket: { x: a.x + a.w / 2, y: a.y + 17, scale: 0.72 },
      keyX: 104,
      clipX,
      clipScale: 0.52,
      tickX: 86,
      // From above the middle clip, over the key beside it and under the top row's key.
      clipArrowFrom: [clipX - 6, fits[1] - 7] as const,
      clipArrowTo: 0,
    }
  }
  const fits = [26, 50, 74]
  if (keys) {
    const a: Rect = { x: 8, y: 18, w: 34, h: 48 }
    const b: Rect = { x: a.x + a.w, y: 18, w: 34, h: 48 }
    return {
      fits,
      a,
      b,
      slot: { x: b.x, y: a.y + a.h / 2, horizontal: true },
      pocket: null,
      keyX: 118,
      clipX: 0,
      clipScale: 0,
      tickX: 88,
      clipArrowFrom: [0, 0] as const,
      clipArrowTo: 0,
    }
  }
  const a: Rect = { x: 8, y: 32, w: 64, h: 36 }
  const clipX = 116
  const clipScale = 0.87
  return {
    fits,
    a,
    b: null,
    slot: null,
    pocket: clips ? { x: a.x + a.w / 2, y: a.y + a.h / 2, scale: 1 } : null,
    keyX: 0,
    clipX,
    clipScale,
    tickX: 84,
    // From just above the middle clip, over the fit marks, into the pocket.
    clipArrowFrom: [clipX - CLIP_PLAN.half * clipScale + 12, fits[1] - 8] as const,
    clipArrowTo: -4,
  }
}

/**
 * The fit test, drawn from the parts it prints. With keys, test coupons A and B butted with the joint
 * closed and their key slots together, so a key is tried across a real joint; with clips, coupon A's
 * clip pocket. Beside them, the parts in three fits told apart by one, two or three notches: the middle
 * one drawn as the part, the others as the fits to try against it.
 */
export function FitTestDiagram({ className, keys = true, clips = true }: FitTestDiagramProps) {
  const { fits, a, b, slot, pocket, keyX, clipX, clipScale, tickX, clipArrowFrom, clipArrowTo } = fitTestLayout(keys, clips)
  const pocketPlan = pocket ? clipPocketPlan(pocket.x, pocket.y, pocket.scale) : null
  return (
    <svg viewBox="0 0 144 100" className={cx(styles.diagram, className)} {...svgProps}>
      <rect x={a.x} y={a.y} width={a.w} height={a.h} rx="1.5" className={styles.tile} />
      {b && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="1.5" className={styles.tile} />}
      {/* The two half slots meet across the closed joint as one bow-tie slot. */}
      {slot && <path d={keyPath(slot.x, slot.y, slot.horizontal, 0.9, 1.15)} className={styles.pocket} />}
      {pocketPlan && (
        <g>
          <Box box={pocketPlan.ceiling} className={styles.hidden} />
          <Box box={pocketPlan.mouth} rx={0.8} className={styles.pocket} />
        </g>
      )}
      {fits.map((cy, index) => {
        const drawn = index === 1 ? styles.part : styles.pocket
        return (
          <g key={cy}>
            {Array.from({ length: index + 1 }, (_, notch) => (
              <line key={notch} x1={tickX + notch * 3.2} y1={cy - 4} x2={tickX + notch * 3.2} y2={cy + 4} className={styles.tick} />
            ))}
            {keys && <path d={keyPath(keyX, cy, true, 0, 1.15)} className={drawn} />}
            {clips && <ClipPlanShape plan={clipPlanAt(clipX, cy, clipScale)} className={drawn} />}
          </g>
        )
      })}
      {keys && slot && slot.horizontal && <Arrow x1={keyX - 9} y1={fits[1] - 6} x2={slot.x + 4} y2={slot.y + 1} />}
      {keys && slot && !slot.horizontal && <Arrow x1={keyX - 11} y1={fits[1] + 9} x2={slot.x + 7.5} y2={slot.y + 3} />}
      {clips && pocket && pocketPlan && (
        <Arrow x1={clipArrowFrom[0]} y1={clipArrowFrom[1]} x2={pocketPlan.mouth[2] + 3} y2={pocket.y + clipArrowTo} />
      )}
    </svg>
  )
}

/** The clip's width across its body in the parts-list icon: wide enough for three fit marks in its spine's end to count. */
const ICON_CLIP_WIDTH = 18

export interface AccessoryDiagramProps extends DiagramProps {
  kind: AccessoryKind
  /**
   * The part's own numbers (AccessorySpec.shape): a fit-test coupon is drawn with a key slot only when
   * `key` is 1, a clip pocket only when `clip` is 1, and its slot on the left when `mate` is 1 (coupon B).
   * Without it, the coupon is drawn with both, its slot on the right. A key or a clip with `marks` 1 to 3
   * is one of the fit test's, drawn with that many notches in its right-hand end.
   */
  shape?: Readonly<Record<string, number | number[]>>
}

/**
 * One printed part on its own, as a small icon for the rows of a parts list: a key and a clip from
 * above, as they print (the clip with its stops, a fit test's key or clip with its notches, so the three
 * fits are told apart), and a fit-test coupon with the slot and the pocket it really has.
 */
export function AccessoryDiagram({ kind, shape, className }: AccessoryDiagramProps) {
  const slot = shape ? shape.key === 1 : true
  const pocket = shape ? shape.clip === 1 : true
  const socket = shape?.socket === 1
  const tab = shape?.tab === 1
  const marks = typeof shape?.marks === 'number' ? shape.marks : 0
  // Coupon B's slot faces A's, so it opens on its left side.
  const slotX = shape?.mate === 1 ? 7 : 41
  const clip = kind === 'clip' ? clipPlan(24, 24, 42, ICON_CLIP_WIDTH, 'h', marks) : null
  return (
    <svg viewBox="0 0 48 48" className={cx(styles.diagram, className)} {...svgProps}>
      {kind === 'key' && <path d={keyPath(24, 24, true, 0, 2.3, marks)} className={styles.part} />}
      {clip && (
        <g>
          <ClipPlanShape plan={clip} />
          <ClipStops plan={clip} />
        </g>
      )}
      {kind === 'fit-test' && (
        <g>
          <rect x="7" y="7" width="34" height="34" rx="1.5" className={styles.tile} />
          {slot && <path d={keyPath(slotX, pocket ? 17 : 24, true, 0.6, 1)} className={styles.pocket} />}
          {pocket && <rect x={slot ? 13 : 12} y={slot ? 28 : 21} width={slot ? 20 : 24} height="6" rx="0.8" className={styles.pocket} />}
          {slot && <path d={keyPath(slotX, pocket ? 17 : 24, true, 0, 0.62)} className={styles.part} />}
          {/* The socket opens on the coupon's left edge, facing A's tab; A's own tab is rooted on its
              right side line, the way TabsDiagram draws the pair. Without these the three socket
              coupons drew as three identical empty squares, one per fit. */}
          {socket && <path d={tabPath(7, 24, 1.2, 1.1)} className={styles.pocket} />}
          {tab && <path d={tabPath(41, 24, 0, 1.1)} className={styles.part} />}
          {marks > 0 && <FitMarks x={38} y={24} marks={marks} len={4} pitch={3} />}
        </g>
      )}
    </svg>
  )
}
