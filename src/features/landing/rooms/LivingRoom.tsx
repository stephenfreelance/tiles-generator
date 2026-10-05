// The living room: the feature wall tiled behind a linen sofa, a fiddle-leaf fig at its left whose leaves
// throw their shadows across the tiles, and a floor lamp at its right. The panel's top edge is in the
// plate and its sides run out of it: a panel as wide as the room.
import { USES } from '../uses'
import { cast, leafPath, puffed, type Leaf } from './drawing'
import { FloorShade, LeafShape, Room, Scene, Shade, StandingShade, Tiles } from './roomKit'
import { useFade } from './sceneShade'
import styles from './rooms.module.scss'

const USE = USES[2]
const [PANEL] = USE.places

/** The sofa: its outer box, the arms' width and the heights of its parts, mm from the ceiling. */
const SOFA = { x: 900, width: 1540, arm: 170, armTop: 1950, back: 1800, seat: 2110, rail: 2215, base: 2400 } as const
const INNER = { x: SOFA.x + SOFA.arm, width: SOFA.width - 2 * SOFA.arm } as const
const HALF = INNER.width / 2

const FIG = { x: 690, potTop: 2130, potWidth: 300, stemTop: 1130 } as const

const LEAVES: readonly Leaf[] = [
  { x: 700, y: 1980, angle: 64, length: 270, width: 170 },
  { x: 690, y: 1890, angle: -58, length: 290, width: 180 },
  { x: 702, y: 1770, angle: 48, length: 300, width: 190 },
  { x: 688, y: 1660, angle: -42, length: 310, width: 195 },
  { x: 704, y: 1540, angle: 36, length: 320, width: 200 },
  { x: 690, y: 1430, angle: -30, length: 300, width: 190 },
  { x: 702, y: 1320, angle: 22, length: 290, width: 185 },
  { x: 694, y: 1220, angle: -16, length: 270, width: 170 },
  { x: 700, y: 1140, angle: 6, length: 250, width: 160 },
]

/** How far the fig's leaves stand off the wall, mm: their shadows fall this far across the tiles. */
const FIG_DEPTH = 300

/** The fig's trunk, leaning a little as it climbs. */
const STEM = `M${FIG.x} ${FIG.potTop}C${FIG.x - 14} 1800 ${FIG.x + 22} 1480 ${FIG.x + 6} ${FIG.stemTop}`

function Fig() {
  const pot = { x: FIG.x - FIG.potWidth / 2, top: FIG.potTop, foot: FIG.x - FIG.potWidth / 2 + 24 }
  return (
    <g>
      <path d={STEM} className={styles.rod} />
      {LEAVES.map((leaf) => (
        <LeafShape key={leaf.y} leaf={leaf} />
      ))}
      {/* A stoneware pot, tapering a little to its foot, its rim a band of the same clay. */}
      <path
        d={`M${pot.x} ${pot.top}H${pot.x + FIG.potWidth}L${pot.x + FIG.potWidth - 24} 2500H${pot.foot}Z`}
        className={styles.t6}
      />
      <rect x={pot.x - 8} y={pot.top - 10} width={FIG.potWidth + 16} height={44} rx={10} className={styles.t12} />
    </g>
  )
}

/** The sofa's legs: short, tapered, dark oak. */
function Legs() {
  return (
    <g>
      {[SOFA.x + 60, SOFA.x + SOFA.width - 60].map((x) => (
        <path key={x} d={`M${x - 22} ${SOFA.base}H${x + 22}L${x + 13} 2500H${x - 13}Z`} className={styles.t84} />
      ))}
    </g>
  )
}

function Arm({ x }: { x: number }) {
  return <rect x={x} y={SOFA.armTop} width={SOFA.arm} height={SOFA.base - SOFA.armTop} rx={70} className={styles.t20} />
}

/** A wool throw folded over the right arm, falling down its front to a fringed hem. */
const THROW = { x: SOFA.x + SOFA.width - SOFA.arm - 70, width: SOFA.arm + 110, hem: 2330 } as const

function Throw() {
  const { x, width, hem } = THROW
  const right = x + width
  const top = SOFA.armTop - 14
  return (
    <g>
      <path
        d={`M${x + 30} ${top + 40}Q${x + 40} ${top} ${x + 110} ${top}H${right - 50}Q${right} ${top} ${right} ${top + 60}L${right + 8} ${hem}Q${x + width / 2} ${hem + 16} ${x + 10} ${hem - 4}Z`}
        className={styles.t48}
      />
      {/* Two woven bands across it, and the fringe at its hem. */}
      <path d={`M${x + 18} ${hem - 150}L${right + 6} ${hem - 144}M${x + 16} ${hem - 110}L${right + 7} ${hem - 104}`} className={styles.vein} />
      <path
        d={Array.from({ length: 9 }, (_, i) => {
          const fx = x + 22 + (i * (width - 20)) / 8
          return `M${fx} ${hem + 4}V${hem + 40}`
        }).join('')}
        className={styles.hairDark}
      />
    </g>
  )
}

function Sofa() {
  const seats = [INNER.x, INNER.x + HALF]
  return (
    <g>
      <Legs />
      {/* The frame behind the cushions and the rail under them: one upholstered shell. */}
      <rect x={SOFA.x + 60} y={SOFA.back - 20} width={SOFA.width - 120} height={SOFA.base - SOFA.back} rx={60} className={styles.t20} />
      {seats.map((x) => (
        <rect key={`back-${x}`} x={x + 6} y={SOFA.back} width={HALF - 12} height={SOFA.seat + 30 - SOFA.back} rx={64} className={styles.t12} />
      ))}
      {/* A darker cushion tipped into the left-hand corner, and a long one lying along the right. */}
      <path d={puffed(1105, 1835, 330, 300, 30)} transform="rotate(-7 1270 2135)" className={styles.t32} />
      {seats.map((x) => (
        <rect key={`seat-${x}`} x={x + 6} y={SOFA.seat} width={HALF - 12} height={SOFA.rail - SOFA.seat} rx={30} className={styles.t12} />
      ))}
      <rect x={SOFA.x + 40} y={SOFA.rail} width={SOFA.width - 80} height={SOFA.base - SOFA.rail} rx={26} className={styles.t20} />
      <Arm x={SOFA.x} />
      <Arm x={SOFA.x + SOFA.width - SOFA.arm} />
      <Throw />
    </g>
  )
}

/** The sofa's own shade: down each cushion toward the seat, down the right of each arm, under the rail. */
function SofaShade() {
  const seats = [INNER.x, INNER.x + HALF]
  const down = useFade('down')
  const right = useFade('right')
  return (
    <Shade form>
      {seats.map((x) => (
        <g key={x}>
          {/* A back cushion turns under toward the seat, and the seat's front rounds down to the rail. */}
          <rect x={x + 6} y={SOFA.back + 150} width={HALF - 12} height={SOFA.seat - SOFA.back - 120} rx={40} fill={down} opacity={0.34} />
          <rect x={x + 6} y={SOFA.seat + 40} width={HALF - 12} height={SOFA.rail - SOFA.seat - 40} rx={20} fill={down} opacity={0.38} />
        </g>
      ))}
      {[SOFA.x, SOFA.x + SOFA.width - SOFA.arm].map((x) => (
        <rect key={x} x={x + SOFA.arm * 0.4} y={SOFA.armTop + 20} width={SOFA.arm * 0.6} height={SOFA.base - SOFA.armTop - 20} rx={60} fill={right} opacity={0.38} />
      ))}
      <rect x={SOFA.x + 40} y={SOFA.rail + 60} width={SOFA.width - 80} height={SOFA.base - SOFA.rail - 60} rx={20} fill={down} opacity={0.4} />
      {/* The corner cushion's lower half, turned away from the light. */}
      <path d={puffed(1105, 1990, 330, 145, 20)} transform="rotate(-7 1270 2135)" fill={down} opacity={0.5} />
    </Shade>
  )
}

/** A floor lamp at the right: a linen drum on a slim brass pole, on a heavy round foot. */
const LAMP = { x: 2600, shadeTop: 1330, shadeBottom: 1610, top: 300, bottom: 340 } as const

function Lamp() {
  const { x, shadeTop, shadeBottom, top, bottom } = LAMP
  return (
    <g>
      <path d={`M${x} ${shadeBottom - 20}V2486`} className={styles.rod} />
      <rect x={x - 120} y={2478} width={240} height={22} rx={11} className={styles.t84} />
      <path
        d={`M${x - top / 2} ${shadeTop}H${x + top / 2}L${x + bottom / 2} ${shadeBottom}H${x - bottom / 2}Z`}
        className={styles.paper}
      />
    </g>
  )
}

export function LivingRoom() {
  const { frame } = USE
  return (
    <Scene frame={frame}>
      <Room frame={frame} />
      <Tiles rect={PANEL} />
      {/* Everything standing off the wall throws its shadow down and right, onto the wall and the tiles. The
          fig's leaves are near enough to the tiles to print as leaves. */}
      <Shade>
        <StandingShade x={SOFA.x} width={SOFA.width} top={SOFA.armTop + 40} bottom={SOFA.base} depth={300} />
        <FloorShade x={FIG.x - FIG.potWidth / 2} width={FIG.potWidth} />
        <FloorShade x={LAMP.x - 120} width={240} />
        <g transform={cast(FIG_DEPTH)}>
          {LEAVES.map((leaf) => (
            <path key={leaf.y} d={leafPath(leaf)} />
          ))}
        </g>
        <g transform={cast(260)}>
          <path
            d={`M${LAMP.x - LAMP.top / 2} ${LAMP.shadeTop}H${LAMP.x + LAMP.top / 2}L${LAMP.x + LAMP.bottom / 2} ${LAMP.shadeBottom}H${LAMP.x - LAMP.bottom / 2}Z`}
            opacity={0.7}
          />
        </g>
      </Shade>
      <Fig />
      <Sofa />
      <SofaShade />
      <Lamp />
      <RoundShade />
    </Scene>
  )
}

/** The pot and the drum are round: each darkens toward its right, away from the light. */
function RoundShade() {
  const right = useFade('right')
  return (
    <Shade form>
      <path d={`M${FIG.x - 40} ${FIG.potTop + 34}H${FIG.x + 150}L${FIG.x + 126} 2500H${FIG.x - 40}Z`} fill={right} opacity={0.55} />
      <path
        d={`M${LAMP.x - 30} ${LAMP.shadeTop}H${LAMP.x + LAMP.top / 2}L${LAMP.x + LAMP.bottom / 2} ${LAMP.shadeBottom}H${LAMP.x - 30}Z`}
        fill={right}
        opacity={0.5}
      />
    </Shade>
  )
}
