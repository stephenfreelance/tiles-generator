// The dining room, close on the sideboard: three tiled doors in an oak carcase on splayed legs, a round
// mirror hung over it, and on its top a vase of olive branches, two books and a mushroom lamp, each
// throwing its shadow down and right across the wall.
import { useId } from 'react'
import { FLOOR, USES } from '../uses'
import { cast, leafPath, type Leaf } from './drawing'
import { LeafShape, Room, Scene, Shade, StandingShade, Tiles } from './roomKit'
import { useFade } from './sceneShade'
import styles from './rooms.module.scss'

const USE = USES[1]

/** The carcase: its top board, its body behind the doors and the rail under them, mm. */
const BOARD = { x: 650, width: 1880, top: 1690, thickness: 30 } as const
const BODY = { x: 660, width: 1860, top: BOARD.top + BOARD.thickness, rail: 2360, foot: 2390, depth: 450 } as const

/** Round mirror on a leather strap, centred over the sideboard. */
const MIRROR = { cx: 1590, cy: 1270, r: 300, rim: 22, depth: 40 } as const

/** A round-bellied stoneware vase at the left of the top, and the olive branches in it. */
const VASE = { x: 830, width: 250, height: 290, depth: 200 } as const
const NECK = { x: VASE.x + VASE.width / 2, y: BOARD.top - VASE.height + 14 } as const

/** Each branch: where it ends, and the control point its curve leans through. */
const BRANCHES = [
  { end: { x: 760, y: 1040 }, bend: { x: 880, y: 1200 } },
  { end: { x: 1000, y: 990 }, bend: { x: 940, y: 1180 } },
  { end: { x: 1160, y: 1130 }, bend: { x: 1010, y: 1260 } },
] as const

/** Olive leaves: narrow and pointed, in pairs along each branch, read off the branch's own curve. */
const OLIVE: readonly Leaf[] = BRANCHES.flatMap(({ end, bend }) =>
  [0.3, 0.5, 0.7, 0.9].flatMap((t, i) => {
    const x = (1 - t) ** 2 * NECK.x + 2 * (1 - t) * t * bend.x + t ** 2 * end.x
    const y = (1 - t) ** 2 * NECK.y + 2 * (1 - t) * t * bend.y + t ** 2 * end.y
    const size = 0.8 + i * 0.06
    return [
      { x: Math.round(x), y: Math.round(y), angle: -50 + i * 6, length: 92 * size, width: 30 * size, shape: 'sword' as const },
      { x: Math.round(x), y: Math.round(y), angle: 46 - i * 4, length: 88 * size, width: 28 * size, shape: 'sword' as const },
    ]
  }),
)

const branchPath = ({ end, bend }: (typeof BRANCHES)[number]) => `M${NECK.x} ${NECK.y}Q${bend.x} ${bend.y} ${end.x} ${end.y}`

/** The vase's outline: a narrow neck over a round belly on a small foot. */
const VASE_PATH = (() => {
  const { x, width, height } = VASE
  const top = BOARD.top - height
  const mid = x + width / 2
  return `M${mid - 34} ${top}H${mid + 34}V${top + 50}C${x + width + 30} ${top + 110} ${x + width + 10} ${BOARD.top - 30} ${mid + 60} ${BOARD.top}H${mid - 60}C${x - 10} ${BOARD.top - 30} ${x - 30} ${top + 110} ${mid - 34} ${top + 50}Z`
})()

/** A mushroom lamp at the right of the top: a domed shade on a short stem. */
const LAMP = { x: 2300, dome: 330, crown: 1380, rim: 1540, depth: 230 } as const
const DOME_PATH = `M${LAMP.x - LAMP.dome / 2} ${LAMP.rim}C${LAMP.x - LAMP.dome / 2} ${LAMP.crown + 30} ${LAMP.x - 90} ${LAMP.crown} ${LAMP.x} ${LAMP.crown}C${LAMP.x + 90} ${LAMP.crown} ${LAMP.x + LAMP.dome / 2} ${LAMP.crown + 30} ${LAMP.x + LAMP.dome / 2} ${LAMP.rim}Z`

/** Two books lying flat, and a stone sphere on them. */
const BOOKS = { x: 1740, lower: { width: 300, height: 44 }, upper: { width: 250, height: 36 } } as const
const SPHERE = { cx: BOOKS.x + 150, r: 40 } as const
const SPHERE_CY = BOARD.top - BOOKS.lower.height - BOOKS.upper.height - SPHERE.r

function Mirror() {
  const { cx, cy, r, rim } = MIRROR
  const glass = useId()
  return (
    <g>
      {/* The strap it hangs from, up out of the plate. */}
      <rect x={cx - 15} y={900} width={30} height={cy - r - 880} rx={6} className={styles.t66} />
      <circle cx={cx} cy={cy} r={r} className={styles.t48} />
      <circle cx={cx} cy={cy} r={r - rim} className={styles.t12} />
      {/* What glass shows of the light: two pale bands across it from the upper left. */}
      <clipPath id={glass}>
        <circle cx={cx} cy={cy} r={r - rim} />
      </clipPath>
      <g clipPath={`url(#${glass})`}>
        <path d={`M${cx - r} ${cy - 40}L${cx - 40} ${cy - r}L${cx + 30} ${cy - r}L${cx - r} ${cy + 30}Z`} className={styles.t6} />
        <path d={`M${cx - r} ${cy + 90}L${cx + 90} ${cy - r}L${cx + 118} ${cy - r}L${cx - r} ${cy + 118}Z`} className={styles.t6} />
      </g>
    </g>
  )
}

function Sideboard() {
  const legs = [
    { top: BODY.x + 110, foot: BODY.x + 70 },
    { top: BODY.x + BODY.width - 110, foot: BODY.x + BODY.width - 70 },
  ]
  return (
    <g>
      {legs.map(({ top, foot }) => (
        <path key={top} d={`M${top - 24} ${BODY.foot}H${top + 24}L${foot + 13} ${FLOOR}H${foot - 13}Z`} className={styles.t48} />
      ))}
      <rect x={BODY.x} y={BODY.top} width={BODY.width} height={BODY.foot - BODY.top} className={styles.t48} />
      {USE.places.map((door) => (
        <Tiles key={door.x} rect={door} />
      ))}
      <rect x={BODY.x} y={BODY.rail} width={BODY.width} height={BODY.foot - BODY.rail} className={styles.t32} />
      <rect x={BOARD.x} y={BOARD.top} width={BOARD.width} height={BOARD.thickness} rx={4} className={styles.t32} />
      <rect x={BOARD.x} y={BOARD.top} width={BOARD.width} height={7} rx={3} className={styles.t20} />
      {/* A leather pull on each door, hung from its top edge. */}
      {USE.places.map((door) => (
        <rect key={door.x} x={door.x + door.width / 2 - 21} y={door.y - 4} width={42} height={74} rx={12} className={styles.t66} />
      ))}
    </g>
  )
}

function OnTop() {
  return (
    <g>
      {BRANCHES.map((branch) => (
        <path key={branch.end.x} d={branchPath(branch)} className={styles.rod} />
      ))}
      {OLIVE.map((leaf, i) => (
        <LeafShape key={i} leaf={leaf} />
      ))}
      <path d={VASE_PATH} className={styles.paper} />
      <rect x={BOOKS.x} y={BOARD.top - BOOKS.lower.height} width={BOOKS.lower.width} height={BOOKS.lower.height} rx={5} className={styles.t48} />
      <rect
        x={BOOKS.x + 22}
        y={BOARD.top - BOOKS.lower.height - BOOKS.upper.height}
        width={BOOKS.upper.width}
        height={BOOKS.upper.height}
        rx={5}
        className={styles.t12}
      />
      <circle cx={SPHERE.cx} cy={SPHERE_CY} r={SPHERE.r} className={styles.t66} />
      <rect x={LAMP.x - 22} y={LAMP.rim - 10} width={44} height={BOARD.top - LAMP.rim} className={styles.t32} />
      <rect x={LAMP.x - 80} y={BOARD.top - 18} width={160} height={18} rx={8} className={styles.t32} />
      <path d={DOME_PATH} className={styles.paper} />
    </g>
  )
}

/** What the sideboard and the things on it throw on the wall behind them. */
function CastShade() {
  return (
    <>
      <Shade>
        <g transform={cast(VASE.depth)} opacity={0.75}>
          <path d={VASE_PATH} />
        </g>
        <g transform={cast(LAMP.depth)} opacity={0.75}>
          <path d={DOME_PATH} />
          <rect x={LAMP.x - 22} y={LAMP.rim} width={44} height={BOARD.top - LAMP.rim} />
        </g>
        <g transform={cast(180)} opacity={0.7}>
          <rect x={BOOKS.x} y={BOARD.top - 80} width={BOOKS.lower.width} height={80} rx={8} />
          <circle cx={SPHERE.cx} cy={SPHERE_CY} r={SPHERE.r} />
        </g>
        <StandingShade x={BODY.x} width={BODY.width} top={BOARD.top} bottom={BODY.foot} depth={BODY.depth} />
        <g transform={cast(VASE.depth)} opacity={0.85}>
          {BRANCHES.map((branch) => (
            <path key={branch.end.x} d={branchPath(branch)} fill="none" stroke="black" strokeWidth={10} />
          ))}
          {OLIVE.map((leaf, i) => (
            <path key={i} d={leafPath(leaf)} />
          ))}
        </g>
        <circle cx={MIRROR.cx} cy={MIRROR.cy} r={MIRROR.r} transform={cast(MIRROR.depth)} opacity={0.8} />
      </Shade>
    </>
  )
}

function FormShade() {
  const right = useFade('right')
  const down = useFade('down')
  return (
    <Shade form>
      <rect x={VASE.x + VASE.width * 0.4} y={BOARD.top - VASE.height + 60} width={VASE.width * 0.7} height={VASE.height - 60} fill={right} opacity={0.55} />
      <rect x={LAMP.x - LAMP.dome / 2} y={LAMP.crown + 60} width={LAMP.dome} height={LAMP.rim - LAMP.crown - 60} fill={down} opacity={0.42} />
      <rect x={LAMP.x} y={LAMP.crown} width={LAMP.dome / 2} height={LAMP.rim - LAMP.crown} fill={right} opacity={0.38} />
      <rect x={SPHERE.cx - SPHERE.r} y={SPHERE_CY - SPHERE.r} width={SPHERE.r * 2} height={SPHERE.r * 2} fill={right} opacity={0.5} />
    </Shade>
  )
}

export function DiningRoom() {
  const { frame } = USE
  return (
    <Scene frame={frame}>
      <Room frame={frame} />
      <CastShade />
      <Mirror />
      <Sideboard />
      <OnTop />
      <FormShade />
    </Scene>
  )
}
