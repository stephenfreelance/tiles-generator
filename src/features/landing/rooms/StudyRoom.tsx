// The study, close on the cube shelf: four cells by four, the tiled doors in a checkerboard so the open
// cells between them show the shelf it is, with books, records, a basket and a trailing plant in them,
// a few small things on top, and a snake plant standing beside it.
import { CUBE_SHELF, cubeCell, FLOOR, USES, type RoomRect } from '../uses'
import { cast, leafPath, type Leaf } from './drawing'
import { FloorShade, LeafShape, Room, Scene, Shade, StandingShade, Tiles } from './roomKit'
import { useFade } from './sceneShade'
import styles from './rooms.module.scss'

const USE = USES[4]

const { x: SHELF_X, y: SHELF_Y, columns, rows, board, divider, cell: CELL } = CUBE_SHELF
const SHELF_W = 2 * board + columns * CELL.width + (columns - 1) * divider
const SHELF_DEPTH = 390

/**
 * Every cell of the shelf and the door that closes it, if one does: the door is the use's own place, the
 * very object the tiles are laid for, never a copy of its rect.
 */
const CELLS = Array.from({ length: columns * rows }, (_, i) => {
  const rect = cubeCell(i % columns, Math.floor(i / columns))
  return { rect, door: USE.places.find((place) => place.x === rect.x && place.y === rect.y) }
})

const openCell = (column: number, row: number): RoomRect => cubeCell(column, row)

/** Upright spines, left to right: width, height and tint of each. */
type Spine = readonly [number, number, string]

function Spines({ x, floor, spines }: { x: number; floor: number; spines: readonly Spine[] }) {
  const lefts = spines.map((_, i) => x + spines.slice(0, i).reduce((sum, [width]) => sum + width + 2, 0))
  return (
    <g>
      {spines.map(([width, height, tint], i) => (
        <g key={i}>
          <rect x={lefts[i]} y={floor - height} width={width} height={height} rx={3} className={tint} />
          <path d={`M${lefts[i] + 6} ${floor - height + 36}H${lefts[i] + width - 6}`} className={styles.hair} />
        </g>
      ))}
    </g>
  )
}

function BooksUpright() {
  const a = openCell(1, 0)
  const b = openCell(3, 2)
  const floorA = a.y + a.height
  const floorB = b.y + b.height
  return (
    <g>
      <Spines
        x={a.x + 22}
        floor={floorA}
        spines={[
          [36, 270, styles.t48],
          [44, 300, styles.t20],
          [30, 248, styles.t66],
          [40, 288, styles.t32],
          [34, 262, styles.t84],
          [46, 280, styles.t12],
        ]}
      />
      <Spines
        x={b.x + 120}
        floor={floorB}
        spines={[
          [40, 286, styles.t32],
          [32, 254, styles.t84],
          [46, 300, styles.t12],
          [36, 270, styles.t48],
        ]}
      />
      {/* One book leaning on the row. */}
      <rect x={b.x + 64} y={floorB - 266} width={40} height={266} rx={3} transform={`rotate(-14 ${b.x + 104} ${floorB})`} className={styles.t66} />
    </g>
  )
}

/** A row of record sleeves, thin and close. */
function Records() {
  const c = openCell(2, 3)
  const floor = c.y + c.height
  const tints = [styles.t66, styles.t84, styles.t48, styles.t20, styles.t84, styles.t32, styles.t66, styles.t12, styles.t84, styles.t48, styles.t66, styles.t20, styles.t84, styles.t48]
  return (
    <g>
      {tints.map((tint, i) => (
        <rect key={i} x={c.x + 26 + i * 20} y={floor - 304 + (i % 3) * 4} width={18} height={304 - (i % 3) * 4} className={tint} />
      ))}
    </g>
  )
}

function Basket() {
  const c = openCell(0, 1)
  const floor = c.y + c.height
  const top = floor - 210
  return (
    <g>
      <rect x={c.x + 24} y={top} width={c.width - 48} height={210} rx={22} className={styles.t32} />
      {[1, 2, 3, 4, 5].map((i) => (
        <path key={i} d={`M${c.x + 30} ${top + i * 34}H${c.x + c.width - 30}`} className={styles.vein} />
      ))}
      <rect x={c.x + 18} y={top - 4} width={c.width - 36} height={26} rx={10} className={styles.t48} />
      {[c.x + 70, c.x + c.width - 110].map((x) => (
        <rect key={x} x={x} y={top + 34} width={40} height={18} rx={9} className={styles.t84} />
      ))}
    </g>
  )
}

function FlatBooks() {
  const c = openCell(2, 1)
  const floor = c.y + c.height
  return (
    <g>
      <rect x={c.x + 30} y={floor - 46} width={260} height={46} rx={4} className={styles.t66} />
      <rect x={c.x + 44} y={floor - 80} width={230} height={34} rx={4} className={styles.t12} />
      <rect x={c.x + 36} y={floor - 122} width={250} height={42} rx={4} className={styles.t48} />
      <path d={`M${c.x + 120} ${floor - 122}C${c.x + 96} ${floor - 170} ${c.x + 120} ${floor - 240} ${c.x + 160} ${floor - 240}C${c.x + 200} ${floor - 240} ${c.x + 224} ${floor - 170} ${c.x + 200} ${floor - 122}Z`} className={styles.paper} />
    </g>
  )
}

function Jug() {
  const c = openCell(1, 2)
  const floor = c.y + c.height
  const x = c.x + 70
  return (
    <g>
      <path d={`M${x + 150} ${floor - 190}C${x + 220} ${floor - 190} ${x + 220} ${floor - 90} ${x + 156} ${floor - 80}`} className={styles.loop} />
      <path
        d={`M${x + 20} ${floor - 240}H${x + 150}L${x + 140} ${floor - 200}C${x + 190} ${floor - 150} ${x + 186} ${floor - 40} ${x + 150} ${floor}H${x + 20}C${x - 16} ${floor - 40} ${x - 20} ${floor - 150} ${x + 30} ${floor - 200}Z`}
        className={styles.paper}
      />
      <path d={`M${x + 4} ${floor - 248}L${x + 20} ${floor - 240}`} className={styles.hairDark} />
    </g>
  )
}

function StorageBox() {
  const c = openCell(0, 3)
  const floor = c.y + c.height
  const top = floor - 230
  return (
    <g>
      <rect x={c.x + 24} y={top} width={c.width - 48} height={230} rx={8} className={styles.t48} />
      <rect x={c.x + 18} y={top} width={c.width - 36} height={40} rx={8} className={styles.t66} />
      <rect x={c.x + c.width / 2 - 60} y={top + 90} width={120} height={56} rx={6} className={styles.t20} />
      <path d={`M${c.x + c.width / 2 - 40} ${top + 118}H${c.x + c.width / 2 + 40}`} className={styles.hair} />
    </g>
  )
}

/** A pothos in the top-right cell, its vines trailing over the edge and down the door below. */
const POTHOS = { x: openCell(3, 0).x + 30, floor: openCell(3, 0).y + openCell(3, 0).height } as const
const VINES = [
  { from: { x: POTHOS.x + 70, y: POTHOS.floor - 100 }, to: { x: POTHOS.x + 40, y: POTHOS.floor + 230 }, bend: { x: POTHOS.x - 30, y: POTHOS.floor + 30 } },
  { from: { x: POTHOS.x + 90, y: POTHOS.floor - 100 }, to: { x: POTHOS.x + 190, y: POTHOS.floor + 140 }, bend: { x: POTHOS.x + 150, y: POTHOS.floor - 10 } },
  { from: { x: POTHOS.x + 80, y: POTHOS.floor - 110 }, to: { x: POTHOS.x + 250, y: POTHOS.floor - 200 }, bend: { x: POTHOS.x + 150, y: POTHOS.floor - 220 } },
] as const

/** Leaves along each vine, alternating sides, each turned off the vine's own direction where it springs. */
const POTHOS_LEAVES: readonly Leaf[] = VINES.flatMap(({ from, to, bend }, v) =>
  [0.3, 0.55, 0.8, 1].map((t, i) => {
    const x = (1 - t) ** 2 * from.x + 2 * (1 - t) * t * bend.x + t ** 2 * to.x
    const y = (1 - t) ** 2 * from.y + 2 * (1 - t) * t * bend.y + t ** 2 * to.y
    const dx = 2 * (1 - t) * (bend.x - from.x) + 2 * t * (to.x - bend.x)
    const dy = 2 * (1 - t) * (bend.y - from.y) + 2 * t * (to.y - bend.y)
    const along = (Math.atan2(dx, -dy) * 180) / Math.PI
    const side = (i + v) % 2 ? 1 : -1
    return { x: Math.round(x), y: Math.round(y), angle: Math.round(along + side * 55), length: 72, width: 60, shape: 'oval' as const }
  }),
)

const vinePath = ({ from, to, bend }: (typeof VINES)[number]) => `M${from.x} ${from.y}Q${bend.x} ${bend.y} ${to.x} ${to.y}`

function Pothos() {
  const { x, floor } = POTHOS
  return (
    <g>
      {VINES.map((vine) => (
        <path key={vine.to.x} d={vinePath(vine)} className={styles.hairDark} />
      ))}
      {POTHOS_LEAVES.map((leaf, i) => (
        <LeafShape key={i} leaf={leaf} />
      ))}
      <path d={`M${x} ${floor - 120}H${x + 160}L${x + 146} ${floor}H${x + 14}Z`} className={styles.t20} />
      <rect x={x - 6} y={floor - 124} width={172} height={24} rx={6} className={styles.t32} />
    </g>
  )
}

/** On top of the shelf: a succulent in a bowl, a small framed print leaning on the wall, books and a candle. */
const SUCCULENT: readonly Leaf[] = [-64, -40, -18, 0, 18, 40, 64].map((angle) => ({
  x: SHELF_X + 210,
  y: SHELF_Y - 60,
  angle,
  length: 110 - Math.abs(angle) * 0.6,
  width: 40,
  shape: 'sword' as const,
}))

function ShelfTop() {
  const top = SHELF_Y
  const print = { x: SHELF_X + 560, width: 230, height: 190 }
  const books = SHELF_X + 1060
  return (
    <g>
      {SUCCULENT.map((leaf) => (
        <LeafShape key={leaf.angle} leaf={leaf} />
      ))}
      <path d={`M${SHELF_X + 120} ${top - 70}H${SHELF_X + 300}Q${SHELF_X + 292} ${top} ${SHELF_X + 250} ${top}H${SHELF_X + 170}Q${SHELF_X + 128} ${top} ${SHELF_X + 120} ${top - 70}Z`} className={styles.t20} />
      <rect x={print.x} y={top - print.height} width={print.width} height={print.height} rx={4} className={styles.t66} />
      <rect x={print.x + 18} y={top - print.height + 18} width={print.width - 36} height={print.height - 36} className={styles.paper} />
      {/* The print itself: an arch over a sun, in the book's own two tints. */}
      <path d={`M${print.x + 66} ${top - 44}V${top - 104}A49 49 0 0 1 ${print.x + 164} ${top - 104}V${top - 44}Z`} className={styles.t32} />
      <circle cx={print.x + 115} cy={top - 104} r={20} className={styles.t66} />
      <rect x={books} y={top - 40} width={220} height={40} rx={4} className={styles.t48} />
      <rect x={books + 14} y={top - 72} width={190} height={32} rx={4} className={styles.t12} />
      {/* A pillar candle, its wax a tint the wall does not swallow, its top catching the light. */}
      <rect x={books + 270} y={top - 120} width={70} height={120} rx={6} className={styles.t20} />
      <rect x={books + 270} y={top - 120} width={70} height={12} rx={6} className={styles.t6} />
      <path d={`M${books + 305} ${top - 120}V${top - 138}`} className={styles.hairDark} />
    </g>
  )
}

/** A snake plant beside the shelf: tall sword leaves fanned out of a stoneware pot. */
const SNAKE = { x: 2320, potTop: 2130, potWidth: 260, depth: 260 } as const
const SNAKE_LEAVES: readonly Leaf[] = [
  { angle: -26, length: 560 },
  { angle: 24, length: 600 },
  { angle: -14, length: 820 },
  { angle: 13, length: 860 },
  { angle: -4, length: 960 },
  { angle: 5, length: 900 },
].map(({ angle, length }) => ({ x: SNAKE.x + angle * 2, y: SNAKE.potTop + 10, angle, length, width: 104, shape: 'sword' as const }))

function SnakePlant() {
  const { x, potTop, potWidth } = SNAKE
  const left = x - potWidth / 2
  return (
    <g>
      {SNAKE_LEAVES.map((leaf) => (
        <LeafShape key={leaf.angle} leaf={leaf} />
      ))}
      <path d={`M${left} ${potTop}H${left + potWidth}L${left + potWidth - 26} ${FLOOR}H${left + 26}Z`} className={styles.t12} />
      <rect x={left - 8} y={potTop - 8} width={potWidth + 16} height={40} rx={10} className={styles.t20} />
    </g>
  )
}

function Shelf() {
  return (
    <g>
      <rect x={SHELF_X} y={SHELF_Y} width={SHELF_W} height={FLOOR - SHELF_Y} className={styles.paper} />
      {CELLS.map(({ rect, door }) =>
        door ? (
          <g key={`${rect.x}-${rect.y}`}>
            <Tiles rect={door} />
            <rect x={rect.x + rect.width - 44} y={rect.y + rect.height / 2 - 44} width={14} height={88} rx={7} className={styles.t84} />
          </g>
        ) : (
          <rect key={`${rect.x}-${rect.y}`} {...rect} className={styles.t12} />
        ),
      )}
    </g>
  )
}

function CastShade() {
  return (
    <>
      <Shade>
        <g transform={cast(SNAKE.depth)} opacity={0.7}>
          {SNAKE_LEAVES.map((leaf) => (
            <path key={leaf.angle} d={leafPath(leaf)} />
          ))}
          <rect x={SNAKE.x - SNAKE.potWidth / 2} y={SNAKE.potTop} width={SNAKE.potWidth} height={FLOOR - SNAKE.potTop} />
        </g>
        <g transform={cast(160)} opacity={0.6}>
          <rect x={SHELF_X + 120} y={SHELF_Y - 150} width={180} height={150} rx={40} />
          <rect x={SHELF_X + 1060} y={SHELF_Y - 120} width={340} height={120} rx={20} />
        </g>
        <StandingShade x={SHELF_X} width={SHELF_W} top={SHELF_Y} bottom={FLOOR} depth={SHELF_DEPTH} />
        <FloorShade x={SNAKE.x - SNAKE.potWidth / 2} width={SNAKE.potWidth} />
        <rect x={SHELF_X + 560} y={SHELF_Y - 190} width={230} height={190} transform={cast(30)} opacity={0.8} />
      </Shade>
    </>
  )
}

/** Inside each open cell, the shade its top board and left side throw across the back; round things darken right. */
function FormShade() {
  const down = useFade('down')
  const right = useFade('right')
  const left = useFade('left')
  const up = useFade('up')
  const open = CELLS.filter((c) => !c.door)
  return (
    <Shade form>
      {open.map(({ rect }) => (
        <g key={`${rect.x}-${rect.y}`}>
          <rect x={rect.x} y={rect.y} width={rect.width} height={120} fill={up} opacity={0.6} />
          <rect x={rect.x} y={rect.y} width={90} height={rect.height} fill={left} opacity={0.45} />
        </g>
      ))}
      <rect x={SNAKE.x - 20} y={SNAKE.potTop + 30} width={SNAKE.potWidth / 2 + 10} height={FLOOR - SNAKE.potTop - 30} fill={right} opacity={0.5} />
      <rect x={openCell(1, 2).x + 150} y={openCell(1, 2).y + 90} width={120} height={240} fill={right} opacity={0.45} />
      <rect x={openCell(2, 1).x + 160} y={openCell(2, 1).y + 90} width={70} height={118} fill={right} opacity={0.45} />
      <rect x={openCell(0, 1).x + 24} y={openCell(0, 1).y + 260} width={openCell(0, 1).width - 48} height={70} fill={down} opacity={0.4} />
    </Shade>
  )
}

export function StudyRoom() {
  const { frame } = USE
  return (
    <Scene frame={frame}>
      <Room frame={frame} />
      <CastShade />
      <Shelf />
      <FormShade />
      <BooksUpright />
      <Records />
      <Basket />
      <FlatBooks />
      <Jug />
      <StorageBox />
      <ShelfTop />
      <SnakePlant />
      <Pothos />
    </Scene>
  )
}
