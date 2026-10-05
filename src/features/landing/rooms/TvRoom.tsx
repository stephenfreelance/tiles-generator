// The TV wall, tiled from end to end: the plate stands inside the tiling on three sides, with a screen
// hung on it, a fluted oak media unit under it, and a bird of paradise in a basket at the left whose
// leaves throw their shadows across the tiles.
import { FLOOR, USES } from '../uses'
import { cast, leafPath, type Leaf } from './drawing'
import { FloorShade, LeafShape, Room, Scene, Shade, StandingShade, Tiles } from './roomKit'
import { useFade } from './sceneShade'
import styles from './rooms.module.scss'

const USE = USES[5]
const [WALL] = USE.places

const TV = { x: 950, y: 1080, width: 1450, height: 830, bezel: 14, depth: 50 } as const
/** The media unit: three fluted doors under an oak top, on slim legs. */
const UNIT = { x: 850, width: 1650, top: 2060, board: 26, bottom: 2380, depth: 420 } as const
const DOOR_W = UNIT.width / 3
const SOUNDBAR = { width: 900, height: 56 } as const

/** A bird of paradise in a woven basket: each leaf on its own long stalk. */
const BASKET = { x: 650, width: 260, top: 2170 } as const
const STALK_FOOT = { x: BASKET.x, y: BASKET.top + 20 } as const
const BIRD: readonly Leaf[] = [
  { x: 560, y: 1640, angle: -24, length: 400, width: 150, shape: 'oval' },
  { x: 690, y: 1480, angle: 8, length: 430, width: 160, shape: 'oval' },
  { x: 800, y: 1660, angle: 34, length: 380, width: 146, shape: 'oval' },
  { x: 610, y: 1880, angle: -50, length: 330, width: 130, shape: 'oval' },
  { x: 740, y: 1900, angle: 56, length: 320, width: 126, shape: 'oval' },
]
const PLANT_DEPTH = 300

/** Dried grass in a tall vase at the right of the unit: three plumes on bare stems. */
const VASE = { x: 2290, width: 110, height: 250 } as const
const PLUMES: readonly Leaf[] = [
  { x: 2318, y: 1660, angle: -18, length: 230, width: 64, shape: 'sword' },
  { x: 2350, y: 1610, angle: 6, length: 260, width: 70, shape: 'sword' },
  { x: 2380, y: 1680, angle: 26, length: 220, width: 60, shape: 'sword' },
]

function Screen() {
  const { x, y, width, height, bezel } = TV
  const pane = { x: x + bezel, y: y + bezel, width: width - 2 * bezel, height: height - 2 * bezel }
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={8} className={styles.t84} />
      {/* The glass, dark, with the light from the upper left lying across it in one long pale band. */}
      <rect {...pane} className={styles.t84} />
      <path
        d={`M${pane.x} ${pane.y + pane.height * 0.62}L${pane.x + pane.width * 0.42} ${pane.y}H${pane.x + pane.width * 0.6}L${pane.x} ${pane.y + pane.height}Z`}
        className={styles.glare}
      />
    </g>
  )
}

function Unit() {
  const legs = [UNIT.x + 60, UNIT.x + UNIT.width - 60]
  const body = UNIT.top + UNIT.board
  return (
    <g>
      {legs.map((x) => (
        <path key={x} d={`M${x - 16} ${UNIT.bottom}H${x + 16}L${x + 10} ${FLOOR}H${x - 10}Z`} className={styles.t84} />
      ))}
      <rect x={UNIT.x + 10} y={body} width={UNIT.width - 20} height={UNIT.bottom - body} className={styles.t48} />
      {[0, 1, 2].map((i) => {
        const left = UNIT.x + 14 + i * DOOR_W
        const width = DOOR_W - 8
        return (
          <g key={i}>
            <rect x={left} y={body + 6} width={width} height={UNIT.bottom - body - 22} className={styles.t32} />
            {/* The flutes: one shadowed groove every 40 mm across the door. */}
            <path
              d={Array.from({ length: Math.floor(width / 40) - 1 }, (_, k) => `M${left + 40 * (k + 1)} ${body + 14}V${UNIT.bottom - 24}`).join('')}
              className={styles.flute}
            />
          </g>
        )
      })}
      <rect x={UNIT.x} y={UNIT.top} width={UNIT.width} height={UNIT.board} rx={4} className={styles.t32} />
      <rect x={UNIT.x} y={UNIT.top} width={UNIT.width} height={6} rx={3} className={styles.t20} />
    </g>
  )
}

function OnUnit() {
  const t = UNIT.top
  const mid = TV.x + TV.width / 2
  const books = UNIT.x + 60
  return (
    <g>
      <rect x={mid - SOUNDBAR.width / 2} y={t - SOUNDBAR.height} width={SOUNDBAR.width} height={SOUNDBAR.height} rx={22} className={styles.t84} />
      <rect x={mid - SOUNDBAR.width / 2 + 30} y={t - SOUNDBAR.height + 14} width={SOUNDBAR.width - 60} height={8} rx={4} className={styles.t66} />
      <rect x={books} y={t - 46} width={270} height={46} rx={4} className={styles.t12} />
      <rect x={books + 16} y={t - 84} width={240} height={38} rx={4} className={styles.t66} />
      <circle cx={books + 136} cy={t - 84 - 44} r={44} className={styles.paper} />
      {PLUMES.map((plume) => (
        <g key={plume.x}>
          <path d={`M${VASE.x + VASE.width / 2} ${t - VASE.height + 20}L${plume.x} ${plume.y}`} className={styles.rod} />
          <path d={leafPath(plume)} className={styles.t20} />
          <path d={leafPath({ ...plume, width: plume.width * 0.5 })} className={styles.t12} />
        </g>
      ))}
      <rect x={VASE.x} y={t - VASE.height} width={VASE.width} height={VASE.height} rx={18} className={styles.paper} />
    </g>
  )
}

function Plant() {
  const { x, width, top } = BASKET
  const left = x - width / 2
  return (
    <g>
      {BIRD.map((leaf) => (
        <path key={leaf.x + leaf.y} d={`M${STALK_FOOT.x} ${STALK_FOOT.y}Q${(STALK_FOOT.x + leaf.x) / 2} ${(STALK_FOOT.y + leaf.y) / 2 + 60} ${leaf.x} ${leaf.y}`} className={styles.rod} />
      ))}
      {BIRD.map((leaf) => (
        <LeafShape key={leaf.x + leaf.y} leaf={leaf} />
      ))}
      <path d={`M${left} ${top}H${left + width}L${left + width - 22} ${FLOOR}H${left + 22}Z`} className={styles.t32} />
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <path key={i} d={`M${left + 4 + i * 3} ${top + i * 46}H${left + width - 4 - i * 3}`} className={styles.vein} />
      ))}
      <rect x={left - 8} y={top - 8} width={width + 16} height={34} rx={10} className={styles.t48} />
    </g>
  )
}

function CastShade() {
  return (
    <>
      <Shade>
        <g transform={cast(180)} opacity={0.7}>
          <rect x={UNIT.x + 60} y={UNIT.top - 172} width={270} height={172} rx={30} />
          <rect x={VASE.x} y={UNIT.top - VASE.height} width={VASE.width} height={VASE.height} rx={18} />
        </g>
        <g transform={cast(PLANT_DEPTH)} opacity={0.6}>
          <rect x={BASKET.x - BASKET.width / 2} y={BASKET.top} width={BASKET.width} height={FLOOR - BASKET.top} />
        </g>
        <StandingShade x={UNIT.x} width={UNIT.width} top={UNIT.top} bottom={UNIT.bottom} depth={UNIT.depth} />
        <FloorShade x={BASKET.x - BASKET.width / 2} width={BASKET.width} />
        <rect x={TV.x} y={TV.y} width={TV.width} height={TV.height} rx={8} transform={cast(TV.depth)} />
        <g transform={cast(PLANT_DEPTH)} opacity={0.9}>
          {BIRD.map((leaf) => (
            <path key={leaf.x + leaf.y} d={leafPath(leaf)} />
          ))}
        </g>
        <g transform={cast(140)} opacity={0.7}>
          {PLUMES.map((plume) => (
            <path key={plume.x} d={leafPath(plume)} />
          ))}
        </g>
      </Shade>
    </>
  )
}

function FormShade() {
  const right = useFade('right')
  const up = useFade('up')
  return (
    <Shade form>
      <rect x={UNIT.x + 10} y={UNIT.top + UNIT.board} width={UNIT.width - 20} height={60} fill={up} opacity={0.45} />
      <rect x={VASE.x + 40} y={UNIT.top - VASE.height + 20} width={VASE.width - 40} height={VASE.height - 20} fill={right} opacity={0.5} />
      <rect x={BASKET.x - 20} y={BASKET.top + 30} width={BASKET.width / 2 + 10} height={FLOOR - BASKET.top - 30} fill={right} opacity={0.45} />
      <circle cx={UNIT.x + 196} cy={UNIT.top - 128} r={44} fill={right} opacity={0.6} />
    </Shade>
  )
}

export function TvRoom() {
  const { frame } = USE
  return (
    <Scene frame={frame}>
      <Room frame={frame} />
      <Tiles rect={WALL} />
      <CastShade />
      <Screen />
      <Unit />
      <OnUnit />
      <Plant />
      <FormShade />
    </Scene>
  )
}
