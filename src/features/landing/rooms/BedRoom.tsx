// The bedroom, close on the headboard: the tiled panel behind a made bed, a pleated wall lamp either side
// whose shades throw their shadows across the tiles, and a nightstand at each edge of the plate. The
// pillows stand against the foot of the panel only, so most of the tiling stays in view above them.
import { FLOOR, USES } from '../uses'
import { cast, puffed } from './drawing'
import { Room, Scene, Shade, StandingShade, Tiles } from './roomKit'
import { useFade } from './sceneShade'
import styles from './rooms.module.scss'

const USE = USES[3]
const [HEADBOARD] = USE.places

/** The bed: a low oak frame on short legs, the mattress top 550 mm off the floor. */
const BED = { x: 760, width: 1680, mattress: 1950, rail: 2230, foot: 2390 } as const
const PILLOWS = [
  { x: 830, width: 720 },
  { x: 1650, width: 720 },
] as const
const PILLOW = { top: 1700, bottom: 1965 } as const
/** The blanket folded across the foot of the bed, and its fringe. */
const BLANKET = { top: 2040, hem: 2270 } as const

/** A nightstand: its top, its drawer and the open niche under it, mm. */
const STAND = { width: 420, top: 1950, board: 28, drawer: 150, bottom: 2390, depth: 400 } as const
const STANDS = [BED.x - 40 - STAND.width, BED.x + BED.width + 40] as const

/** A wall lamp either side: where its plate is fixed, and where its pleated shade hangs. */
const LAMPS = [
  { plate: 560, shade: 640 },
  { plate: 2640, shade: 2560 },
] as const
const SHADE = { top: 1430, bottom: 1590, crown: 150, skirt: 230, depth: 260 } as const

const shadePath = (x: number) =>
  `M${x - SHADE.crown / 2} ${SHADE.top}H${x + SHADE.crown / 2}L${x + SHADE.skirt / 2} ${SHADE.bottom}H${x - SHADE.skirt / 2}Z`

function Lamp({ plate, shade }: (typeof LAMPS)[number]) {
  return (
    <g>
      <rect x={plate - 20} y={1350} width={40} height={96} rx={10} className={styles.t84} />
      <path d={`M${plate} 1390H${shade}V${SHADE.top}`} className={styles.rod} />
      <path d={shadePath(shade)} className={styles.paper} />
      {/* The pleats, fanning down the shade. */}
      <path
        d={[-0.66, -0.33, 0, 0.33, 0.66]
          .map((t) => `M${shade + (t * SHADE.crown) / 2} ${SHADE.top + 8}L${shade + (t * SHADE.skirt) / 2} ${SHADE.bottom - 6}`)
          .join('')}
        className={styles.hair}
      />
    </g>
  )
}

function Nightstand({ x }: { x: number }) {
  const { width, top, board, drawer, bottom } = STAND
  const box = top + board
  return (
    <g>
      {[x + 40, x + width - 40].map((leg) => (
        <path key={leg} d={`M${leg - 18} ${bottom}H${leg + 18}L${leg + 11} ${FLOOR}H${leg - 11}Z`} className={styles.t48} />
      ))}
      <rect x={x + 10} y={box} width={width - 20} height={bottom - box} className={styles.t32} />
      <rect x={x + 26} y={box + 12} width={width - 52} height={drawer} rx={4} className={styles.paper} />
      <circle cx={x + width / 2} cy={box + 12 + drawer / 2} r={14} className={styles.t84} />
      <rect x={x + 26} y={box + drawer + 30} width={width - 52} height={bottom - box - drawer - 46} className={styles.t48} />
      <rect x={x} y={top} width={width} height={board} rx={4} className={styles.t32} />
      <rect x={x} y={top} width={width} height={6} rx={3} className={styles.t20} />
    </g>
  )
}

/**
 * On the left nightstand, two books and a glass of water; on the right, a small clock and a bud vase. The
 * plate shows only the inner part of each stand, so they stand there.
 */
function StandThings() {
  const [left, right] = STANDS
  const t = STAND.top
  const glass = left + 340
  const vase = right + 214
  const clock = right + 90
  return (
    <g>
      <rect x={left + 160} y={t - 40} width={170} height={40} rx={4} className={styles.t48} />
      <rect x={left + 176} y={t - 70} width={140} height={30} rx={4} className={styles.t12} />
      <path d={`M${glass - 34} ${t}L${glass - 40} ${t - 130}H${glass + 40}L${glass + 34} ${t}Z`} className={styles.t12} />
      <rect x={glass - 30} y={t - 116} width={10} height={100} rx={5} className={styles.paper} />
      <rect x={clock - 60} y={t - 104} width={120} height={104} rx={18} className={styles.t66} />
      <circle cx={clock} cy={t - 56} r={32} className={styles.paper} />
      <path d={`M${clock} ${t - 56}V${t - 78}M${clock} ${t - 56}L${clock + 14} ${t - 48}`} className={styles.hairDark} />
      <path d={`M${vase} ${t - 130}C${vase - 10} ${t - 210} ${vase + 16} ${t - 280} ${vase + 8} ${t - 340}`} className={styles.rod} />
      <ellipse cx={vase + 8} cy={t - 348} rx={26} ry={34} className={styles.t84} />
      <path d={`M${vase - 32} ${t}C${vase - 48} ${t - 60} ${vase - 28} ${t - 120} ${vase - 14} ${t - 130}H${vase + 14}C${vase + 28} ${t - 120} ${vase + 48} ${t - 60} ${vase + 32} ${t}Z`} className={styles.t20} />
    </g>
  )
}

function Bed() {
  const legs = [BED.x + 40, BED.x + BED.width - 40]
  const right = BED.x + BED.width
  return (
    <g>
      {legs.map((x) => (
        <path key={x} d={`M${x - 24} ${BED.foot}H${x + 24}L${x + 15} ${FLOOR}H${x - 15}Z`} className={styles.t48} />
      ))}
      <rect x={BED.x} y={BED.rail} width={BED.width} height={BED.foot - BED.rail} rx={8} className={styles.t32} />
      {PILLOWS.map(({ x, width }) => (
        <path key={x} d={puffed(x, PILLOW.top, width, PILLOW.bottom - PILLOW.top, 34)} className={styles.paper} />
      ))}
      {/* Two cushions in front of the pillows, the left one dark, the right one pale. */}
      <path d={puffed(1010, 1790, 380, 200, 40)} transform="rotate(-4 1200 1990)" className={styles.t48} />
      <path d={puffed(1830, 1812, 360, 178, 36)} transform="rotate(3 2010 1990)" className={styles.t12} />
      {/* The duvet over the mattress and down over the foot, its corners falling lower than its hem. */}
      <path
        d={`M${BED.x - 18} 2300C${BED.x - 12} 2120 ${BED.x - 4} 2010 ${BED.x + 30} ${BED.mattress - 10}C${BED.x + 400} ${BED.mattress - 24} ${right - 400} ${BED.mattress - 4} ${right - 30} ${BED.mattress - 10}C${right + 4} 2010 ${right + 12} 2120 ${right + 18} 2300C${right - 300} 2316 ${BED.x + 300} 2290 ${BED.x - 18} 2300Z`}
        className={styles.t6}
      />
      <path
        d={`M${BED.x - 8} ${BLANKET.hem}C${BED.x - 4} 2160 ${BED.x + 2} ${BLANKET.top + 30} ${BED.x + 20} ${BLANKET.top}C${BED.x + 500} ${BLANKET.top + 14} ${right - 500} ${BLANKET.top - 6} ${right - 20} ${BLANKET.top}C${right - 2} ${BLANKET.top + 30} ${right + 4} 2160 ${right + 8} ${BLANKET.hem}C${right - 400} ${BLANKET.hem + 14} ${BED.x + 400} ${BLANKET.hem - 8} ${BED.x - 8} ${BLANKET.hem}Z`}
        className={styles.t48}
      />
      {/* The blanket's woven stripes and its fringe. */}
      <path d={`M${BED.x + 10} ${BLANKET.top + 46}C${BED.x + 600} ${BLANKET.top + 58} ${right - 600} ${BLANKET.top + 38} ${right - 10} ${BLANKET.top + 46}`} className={styles.vein} />
      <path d={`M${BED.x + 4} ${BLANKET.hem - 54}C${BED.x + 600} ${BLANKET.hem - 42} ${right - 600} ${BLANKET.hem - 62} ${right - 4} ${BLANKET.hem - 54}`} className={styles.vein} />
      <path
        d={Array.from({ length: 34 }, (_, i) => {
          const x = BED.x + 10 + (i * (BED.width - 20)) / 33
          return `M${x} ${BLANKET.hem + 4}V${BLANKET.hem + 40}`
        }).join('')}
        className={styles.hairDark}
      />
    </g>
  )
}

function CastShade() {
  return (
    <>
      <Shade>
        {LAMPS.map(({ shade }) => (
          <path key={shade} d={shadePath(shade)} transform={cast(SHADE.depth)} opacity={0.8} />
        ))}
        <StandingShade x={BED.x} width={BED.width} top={BED.mattress} bottom={BED.foot} depth={160} />
        {STANDS.map((x) => (
          <StandingShade key={x} x={x} width={STAND.width} top={STAND.top} bottom={STAND.bottom} depth={STAND.depth} />
        ))}
        <g transform={cast(110)} opacity={0.75}>
          {PILLOWS.map(({ x, width }) => (
            <path key={x} d={puffed(x, PILLOW.top, width, PILLOW.bottom - PILLOW.top, 34)} />
          ))}
        </g>
        {LAMPS.map(({ plate, shade }) => (
          <path key={plate} d={`M${plate} 1390H${shade}`} transform={cast(120)} fill="none" stroke="black" strokeWidth={14} />
        ))}
      </Shade>
    </>
  )
}

function FormShade() {
  const down = useFade('down')
  const right = useFade('right')
  return (
    <Shade form>
      {PILLOWS.map(({ x, width }) => (
        <path key={x} d={puffed(x + 30, PILLOW.top + 120, width - 60, PILLOW.bottom - PILLOW.top - 120, 18)} fill={down} opacity={0.38} />
      ))}
      {LAMPS.map(({ shade }) => (
        <path key={shade} d={shadePath(shade)} transform={`translate(${SHADE.crown / 4} 0)`} fill={right} opacity={0.55} />
      ))}
      <path d={puffed(1030, 1890, 340, 100, 20)} transform="rotate(-4 1200 1990)" fill={down} opacity={0.5} />
      <path d={puffed(1850, 1900, 320, 90, 18)} transform="rotate(3 2010 1990)" fill={down} opacity={0.42} />
      {/* The duvet rounds over the mattress's edge and down the foot, darker as it turns away from the light. */}
      <rect x={BED.x - 10} y={BED.mattress + 20} width={BED.width + 20} height={BLANKET.top - BED.mattress - 10} fill={down} opacity={0.28} />
      <rect x={BED.x + BED.width - 120} y={BED.mattress + 10} width={140} height={BLANKET.hem - BED.mattress} fill={right} opacity={0.32} />
      <rect x={BED.x} y={BLANKET.hem - 90} width={BED.width} height={90} fill={down} opacity={0.5} />
    </Shade>
  )
}

export function BedRoom() {
  const { frame } = USE
  return (
    <Scene frame={frame}>
      <Room frame={frame} />
      <Tiles rect={HEADBOARD} />
      <CastShade />
      {STANDS.map((x) => (
        <Nightstand key={x} x={x} />
      ))}
      <StandThings />
      <Bed />
      {LAMPS.map((lamp) => (
        <Lamp key={lamp.plate} {...lamp} />
      ))}
      <FormShade />
    </Scene>
  )
}
