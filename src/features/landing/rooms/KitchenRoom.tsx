// The kitchen, close on the splashback: an oak shelf of stoneware and a white wall cabinet over it, a
// dark worktop and a run of white drawers under it, and on the worktop the few things that stand against
// a splashback, each throwing its shadow across the tiles. No hob and no sink: a printed tile has no
// business near heat or water, and the drawing does not suggest either.
import { USES } from '../uses'
import { cast, LIGHT, type Leaf } from './drawing'
import { LeafShape, Room, Scene, Shade, Tiles } from './roomKit'
import { useFade } from './sceneShade'
import styles from './rooms.module.scss'

const USE = USES[0]
const [SPLASHBACK] = USE.places

const WORKTOP = { y: 1600, depth: 40 } as const
/** The run of base units under the worktop, 600 mm modules, and the gap between two fronts. */
const RUN = { x: 400, width: 2400, module: 600, reveal: 6 } as const
const FRONTS_TOP = WORKTOP.y + WORKTOP.depth + RUN.reveal
const WALL_UNIT = { x: 1600, y: 600, width: 1200, height: 400, depth: 330 } as const
const SHELF = { x: 400, width: 1080, top: 880, board: 40, depth: 250 } as const

/** A bar handle, centred on `x`. */
function Pull({ x, y, width = 160 }: { x: number; y: number; width?: number }) {
  return <rect x={x - width / 2} y={y} width={width} height={14} rx={7} className={styles.t84} />
}

function BaseUnits() {
  const fronts = [0, 1, 2, 3].map((i) => RUN.x + i * RUN.module)
  const half = RUN.module / 2
  return (
    <g>
      {/* The carcases show only in the gaps between the fronts. */}
      <rect x={RUN.x} y={WORKTOP.y + WORKTOP.depth} width={RUN.width} height={400} className={styles.t20} />
      {/* Drawers at either end, a door between, and the sink unit's pair of doors. */}
      {[fronts[0], fronts[3]].map((x) => (
        <g key={x}>
          <rect x={x + 3} y={FRONTS_TOP} width={RUN.module - RUN.reveal} height={180} className={styles.paper} />
          <rect x={x + 3} y={FRONTS_TOP + 186} width={RUN.module - RUN.reveal} height={300} className={styles.paper} />
          <Pull x={x + half} y={FRONTS_TOP + 44} />
          <Pull x={x + half} y={FRONTS_TOP + 230} />
        </g>
      ))}
      <rect x={fronts[1] + 3} y={FRONTS_TOP} width={RUN.module - RUN.reveal} height={400} className={styles.paper} />
      <Pull x={fronts[1] + half} y={FRONTS_TOP + 44} />
      {[0, 1].map((i) => (
        <g key={i}>
          <rect x={fronts[2] + 3 + i * half} y={FRONTS_TOP} width={half - RUN.reveal} height={400} className={styles.paper} />
          <Pull x={fronts[2] + half + (i ? 70 : -70)} y={FRONTS_TOP + 44} width={90} />
        </g>
      ))}
    </g>
  )
}

function WallUnit() {
  const { x, y, width, height } = WALL_UNIT
  const half = width / 2
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} className={styles.t20} />
      {[0, 1].map((i) => (
        <g key={i}>
          <rect x={x + 3 + i * half} y={y} width={half - RUN.reveal} height={height - 3} className={styles.paper} />
          {/* A wall cabinet opens from below, so its handle sits along the foot of the door. */}
          <Pull x={x + half / 2 + i * half} y={y + height - 48} />
        </g>
      ))}
    </g>
  )
}

/** Stoneware on the shelf: a stack of plates with a bowl on it, two lidded jars and a bottle vase with a sprig. */
const PLATES = { x: 690, width: 220, plate: 18 } as const
const JARS = [
  { x: 960, width: 120, height: 170 },
  { x: 1110, width: 100, height: 128 },
] as const
const VASE = { x: 1340, width: 86, height: 150 } as const

const SPRIG: readonly Leaf[] = [
  { x: 1376, y: 760, angle: -44, length: 64, width: 50, shape: 'oval' },
  { x: 1372, y: 728, angle: 40, length: 60, width: 48, shape: 'oval' },
  { x: 1366, y: 694, angle: -36, length: 56, width: 44, shape: 'oval' },
  { x: 1360, y: 662, angle: 30, length: 52, width: 40, shape: 'oval' },
  { x: 1352, y: 636, angle: -10, length: 46, width: 36, shape: 'oval' },
]

function ShelfThings() {
  const { top } = SHELF
  return (
    <g>
      {/* The shelf on two iron brackets. */}
      {[700, 1290].map((x) => (
        <rect key={x} x={x} y={top + SHELF.board} width={14} height={70} className={styles.t84} />
      ))}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={PLATES.x + i * 6} y={top - (i + 1) * PLATES.plate} width={PLATES.width - i * 12} height={PLATES.plate - 3} rx={8} className={styles.paper} />
      ))}
      <path d={`M${PLATES.x + 30} ${top - 54}H${PLATES.x + PLATES.width - 30}Q${PLATES.x + PLATES.width - 44} ${top - 134} ${PLATES.x + PLATES.width / 2} ${top - 134}Q${PLATES.x + 44} ${top - 134} ${PLATES.x + 30} ${top - 54}Z`} className={styles.t12} />
      {JARS.map((jar) => (
        <g key={jar.x}>
          <rect x={jar.x} y={top - jar.height} width={jar.width} height={jar.height} rx={14} className={styles.t12} />
          <rect x={jar.x - 8} y={top - jar.height - 24} width={jar.width + 16} height={26} rx={8} className={styles.t48} />
        </g>
      ))}
      {/* A sprig of eucalyptus out of the bottle vase. */}
      <path d={`M${VASE.x + VASE.width / 2} ${top - VASE.height + 20}C${VASE.x + 40} 720 ${VASE.x + 20} 680 ${VASE.x + 12} 636`} className={styles.rod} />
      {SPRIG.map((leaf) => (
        <LeafShape key={leaf.y} leaf={leaf} />
      ))}
      <path
        d={`M${VASE.x + 24} ${top - VASE.height}H${VASE.x + VASE.width - 24}V${top - VASE.height + 30}Q${VASE.x + VASE.width} ${top - 96} ${VASE.x + VASE.width} ${top - 40}V${top}H${VASE.x}V${top - 40}Q${VASE.x} ${top - 96} ${VASE.x + 24} ${top - VASE.height + 30}Z`}
        className={styles.t20}
      />
      <rect x={SHELF.x} y={top} width={SHELF.width} height={SHELF.board} className={styles.t32} />
      <rect x={SHELF.x} y={top} width={SHELF.width} height={6} className={styles.t20} />
    </g>
  )
}

/** A stoneware crock of wooden spoons, a whisk among them. */
const CROCK = { x: 760, width: 150, height: 190 } as const

function Crock() {
  const { x, width, height } = CROCK
  const top = WORKTOP.y - height
  return (
    <g>
      {/* A wooden spoon leaning left, a spatula upright, a whisk leaning right. */}
      <path d={`M${x + 60} ${top + 40}L${x + 10} 1290`} className={styles.rod} />
      <ellipse cx={x + 4} cy={1262} rx={26} ry={40} transform={`rotate(-14 ${x + 4} 1262)`} className={styles.t32} />
      <path d={`M${x + 78} ${top + 40}V1270`} className={styles.rod} />
      <rect x={x + 54} y={1196} width={48} height={84} rx={12} className={styles.t20} />
      <path d={`M${x + 98} ${top + 40}L${x + 140} 1330`} className={styles.rod} />
      <path d={`M${x + 140} 1330C${x + 96} 1296 ${x + 116} 1214 ${x + 168} 1224C${x + 216} 1236 ${x + 196} 1316 ${x + 140} 1330Z`} className={styles.t6} />
      <path d={`M${x + 140} 1330C${x + 124} 1290 ${x + 140} 1240 ${x + 168} 1226M${x + 140} 1330C${x + 166} 1300 ${x + 186} 1260 ${x + 168} 1226`} className={styles.hair} />
      <path d={`M${x} ${top + 14}Q${x} ${top} ${x + 16} ${top}H${x + width - 16}Q${x + width} ${top} ${x + width} ${top + 14}V${WORKTOP.y}H${x}Z`} className={styles.t12} />
      <rect x={x - 6} y={top} width={width + 12} height={22} rx={8} className={styles.t20} />
    </g>
  )
}

/** A chopping board stood on end against the tiles, its handle up. */
const BOARD = { x: 1010, width: 270, top: 1330 } as const

function Board() {
  const { x, width, top } = BOARD
  const mid = x + width / 2
  return (
    <g transform={`rotate(-3 ${mid} ${WORKTOP.y})`}>
      <path
        d={`M${x + 20} ${WORKTOP.y}Q${x} ${WORKTOP.y} ${x} ${WORKTOP.y - 20}V${top + 24}Q${x} ${top} ${x + 24} ${top}H${mid - 34}V${top - 44}Q${mid - 34} ${top - 62} ${mid - 16} ${top - 62}H${mid + 16}Q${mid + 34} ${top - 62} ${mid + 34} ${top - 44}V${top}H${x + width - 24}Q${x + width} ${top} ${x + width} ${top + 24}V${WORKTOP.y - 20}Q${x + width} ${WORKTOP.y} ${x + width - 20} ${WORKTOP.y}Z`}
        className={styles.t20}
      />
      <rect x={x + width - 14} y={top + 20} width={14} height={WORKTOP.y - top - 40} rx={6} className={styles.t32} />
      <circle cx={mid} cy={top - 30} r={13} className={styles.t66} />
    </g>
  )
}

/** A tall bottle of oil, dark glass with the light running down its left side. */
const BOTTLE = { x: 1360, width: 70 } as const

function Bottle() {
  const { x, width } = BOTTLE
  const neck = x + width / 2
  return (
    <g>
      <path
        d={`M${x} ${WORKTOP.y}V1440Q${x} 1406 ${neck - 12} 1392V1352H${neck + 12}V1392Q${x + width} 1406 ${x + width} 1440V${WORKTOP.y}Z`}
        className={styles.t66}
      />
      <rect x={neck - 15} y={1330} width={30} height={26} rx={5} className={styles.t84} />
      <rect x={x + 12} y={1450} width={10} height={130} rx={5} className={styles.t48} />
    </g>
  )
}

/** A tall pepper mill in dark wood, the light running down its left side. */
const MILL = { x: 1700, width: 62, height: 236 } as const

function Mill() {
  const { x, width, height } = MILL
  const top = WORKTOP.y - height
  const mid = x + width / 2
  return (
    <g>
      <path
        d={`M${x + 6} ${WORKTOP.y}C${x - 6} ${WORKTOP.y - 70} ${x + 14} ${top + 90} ${x + 8} ${top + 40}H${x + width - 8}C${x + width - 14} ${top + 90} ${x + width + 6} ${WORKTOP.y - 70} ${x + width - 6} ${WORKTOP.y}Z`}
        className={styles.t66}
      />
      <rect x={x + 4} y={top + 18} width={width - 8} height={26} rx={8} className={styles.t48} />
      <circle cx={mid} cy={top + 10} r={12} className={styles.t84} />
      <rect x={x + 12} y={top + 60} width={9} height={height - 80} rx={4} className={styles.t48} />
    </g>
  )
}

/** Two stoneware bowls, one in the other. */
const BOWLS = { x: 1830, width: 230 } as const

function Bowls() {
  const { x, width } = BOWLS
  const right = x + width
  return (
    <g>
      <path d={`M${x + 30} ${WORKTOP.y - 112}H${right - 30}Q${right - 40} ${WORKTOP.y - 64} ${x + width / 2} ${WORKTOP.y - 62}Q${x + 40} ${WORKTOP.y - 64} ${x + 30} ${WORKTOP.y - 112}Z`} className={styles.t20} />
      <path d={`M${x} ${WORKTOP.y - 74}H${right}Q${right - 14} ${WORKTOP.y} ${x + width / 2} ${WORKTOP.y}Q${x + 14} ${WORKTOP.y} ${x} ${WORKTOP.y - 74}Z`} className={styles.paper} />
      <rect x={x - 4} y={WORKTOP.y - 80} width={width + 8} height={12} rx={6} className={styles.t12} />
    </g>
  )
}

/** A pot of basil at the right of the run. */
const BASIL = { x: 2150, width: 150, height: 130 } as const

/** Small leaves in pairs up a few soft stems, as a supermarket basil grows. */
const BASIL_STEMS = [
  { x: 2196, y: 1350 },
  { x: 2226, y: 1316 },
  { x: 2262, y: 1356 },
] as const

const BASIL_LEAVES: readonly Leaf[] = BASIL_STEMS.flatMap(({ x, y }, stem) =>
  [0, 1, 2].flatMap((pair) => {
    const at = y + pair * 44
    const size = 1 - pair * 0.12
    return [
      { x, y: at, angle: -58 + stem * 8, length: 74 * size, width: 58 * size, shape: 'oval' as const },
      { x, y: at, angle: 54 + stem * 8, length: 72 * size, width: 56 * size, shape: 'oval' as const },
    ]
  }),
)

function Basil() {
  const { x, width, height } = BASIL
  const top = WORKTOP.y - height
  return (
    <g>
      {BASIL_STEMS.map((stem) => (
        <path key={stem.x} d={`M${x + width / 2} ${top}Q${(x + width / 2 + stem.x) / 2} ${top - 40} ${stem.x} ${stem.y - 20}`} className={styles.hairDark} />
      ))}
      {BASIL_LEAVES.map((leaf, i) => (
        <LeafShape key={i} leaf={leaf} />
      ))}
      <path d={`M${x} ${top}H${x + width}L${x + width - 16} ${WORKTOP.y}H${x + 16}Z`} className={styles.t32} />
      <rect x={x - 6} y={top - 4} width={width + 12} height={30} rx={6} className={styles.t48} />
    </g>
  )
}

/**
 * What a thing fixed to the wall throws under itself: the parallelogram between its underside and where
 * its front edge's shadow lands, densest against it and thinning down toward the light, so the tiles'
 * relief still reads through it.
 */
function Underside({ x, width, y, depth, opacity }: { x: number; width: number; y: number; depth: number; opacity: number }) {
  const fall = useFade('up')
  const dx = Math.round(depth * LIGHT.x)
  const dy = Math.round(depth * LIGHT.y)
  return <path d={`M${x} ${y}H${x + width}L${x + width + dx} ${y + dy}H${x + dx}Z`} fill={fall} opacity={opacity} />
}

/** The shade the things in front of the tiles throw on them, and the cabinet's and the shelf's over the top of them. */
function CastShade() {
  return (
    <>
      <Shade>
        <Underside x={WALL_UNIT.x} width={WALL_UNIT.width} y={WALL_UNIT.y + WALL_UNIT.height} depth={WALL_UNIT.depth} opacity={0.42} />
        <Underside x={SHELF.x} width={SHELF.width} y={SHELF.top + SHELF.board} depth={SHELF.depth} opacity={0.5} />
        <g transform={cast(130)} opacity={0.6}>
          <rect x={PLATES.x} y={SHELF.top - 134} width={PLATES.width} height={134} rx={20} />
          {JARS.map((jar) => (
            <rect key={jar.x} x={jar.x} y={SHELF.top - jar.height - 24} width={jar.width} height={jar.height + 24} rx={14} />
          ))}
          <rect x={VASE.x} y={SHELF.top - VASE.height} width={VASE.width} height={VASE.height} rx={20} />
        </g>
        <g transform={cast(140)} opacity={0.62}>
          <rect x={CROCK.x} y={WORKTOP.y - CROCK.height} width={CROCK.width} height={CROCK.height} rx={16} />
          <rect x={BOTTLE.x} y={1400} width={BOTTLE.width} height={WORKTOP.y - 1400} rx={20} />
          <rect x={MILL.x} y={WORKTOP.y - MILL.height} width={MILL.width} height={MILL.height} rx={20} />
          <rect x={BOWLS.x} y={WORKTOP.y - 112} width={BOWLS.width} height={112} rx={40} />
          <rect x={BASIL.x} y={WORKTOP.y - BASIL.height} width={BASIL.width} height={BASIL.height} rx={16} />
          <ellipse cx={BASIL.x + BASIL.width / 2} cy={1400} rx={110} ry={80} />
        </g>
        <g transform={cast(40)} opacity={0.7}>
          <rect x={BOARD.x} y={BOARD.top} width={BOARD.width} height={WORKTOP.y - BOARD.top} rx={20} />
        </g>
      </Shade>
    </>
  )
}

/** The round things darken toward their right, away from the light; the fronts darken under the worktop's lip. */
function FormShade() {
  const right = useFade('right')
  const up = useFade('up')
  return (
    <Shade form>
      <rect x={CROCK.x + 50} y={WORKTOP.y - CROCK.height + 20} width={CROCK.width - 50} height={CROCK.height - 20} fill={right} opacity={0.55} />
      {JARS.map((jar) => (
        <rect key={jar.x} x={jar.x + jar.width * 0.35} y={SHELF.top - jar.height} width={jar.width * 0.65} height={jar.height} fill={right} opacity={0.45} />
      ))}
      <rect x={VASE.x + 30} y={SHELF.top - 110} width={VASE.width - 30} height={110} fill={right} opacity={0.45} />
      <rect x={BOWLS.x + 90} y={WORKTOP.y - 74} width={BOWLS.width - 90} height={74} fill={right} opacity={0.45} />
      <rect x={BASIL.x + 50} y={WORKTOP.y - BASIL.height + 26} width={BASIL.width - 50} height={BASIL.height - 26} fill={right} opacity={0.45} />
      <rect x={RUN.x} y={WORKTOP.y + WORKTOP.depth} width={RUN.width} height={44} fill={up} opacity={0.4} />
    </Shade>
  )
}

export function KitchenRoom() {
  const { frame } = USE
  return (
    <Scene frame={frame}>
      <Room frame={frame} />
      <Tiles rect={SPLASHBACK} />
      <CastShade />
      <WallUnit />
      <ShelfThings />
      <BaseUnits />
      <rect x={RUN.x - 20} y={WORKTOP.y} width={RUN.width + 40} height={WORKTOP.depth} className={styles.t66} />
      <rect x={RUN.x - 20} y={WORKTOP.y} width={RUN.width + 40} height={7} className={styles.t48} />
      <Crock />
      <Board />
      <Bottle />
      <Mill />
      <Bowls />
      <Basil />
      <FormShade />
    </Scene>
  )
}
