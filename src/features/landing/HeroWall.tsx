// The object: the visitor's own wall, built out of the same printed relief chips the pieces plate is
// built from, laid in their real positions and lit like a photograph of a thing standing in a room.
// No WebGL, no poster, no handover: four CPU renders from the worker cover a wall of any size, because
// a wall of 289 tiles is still only a full tile and its cuts.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { useTextureChips, type ChipItem } from '@/hooks'
import type { StyleWithVars } from '@/ui/cx'
import { PROOF_CHIP_PX } from './chipBudget'
import { buildWallGrid } from './wallGrid'
import styles from './HeroWall.module.scss'

/**
 * Past this many tiles the wall lays in as one sheet rather than tile by tile. A staggered transition
 * is one composited layer per cell while it runs, and the feature wall alone is 128 of them: at the
 * cap the wave still reads, and past it the spread collapses to 0 and every tile takes the same 420 ms
 * together, which nobody can tell from the wave at that density anyway.
 */
const STAGGER_CAP = 120

/**
 * The lay-in: how long the wave takes to cross the wall, and how long one tile takes to land. Long
 * enough to be watched as a wall being laid from its setting-out corner, which is the one thing on
 * this screen that moves on its own; short enough to be over inside two seconds.
 */
const LAY_SPREAD_MS = 1100
const LAY_TILE_MS = 700
/** And the longest it waits for its pictures first: past this the wall lays in whatever it has. */
const LAY_CEILING_MS = 2400

export interface HeroWallProps {
  config: DesignConfig
  plan: LayoutPlan
  /** What the wall is, for a reader who cannot see it. */
  label: string
  /** Chip size in px. The pieces plate and the kit ask for the same one, so all three share a cache. */
  sizePx?: number
}

/**
 * The wall, as a grid of real millimetres. Every cell paints one chip PNG scaled so the piece inside
 * its square fills the cell exactly, which is how a cut piece carries its own slice of the relief and
 * the pattern runs straight across every joint.
 */
export function HeroWall({ config, plan, label, sizePx = PROOF_CHIP_PX }: HeroWallProps) {
  const items = useMemo<ChipItem[]>(
    () => plan.pieces.map((piece) => ({ key: piece.id, config, crop: piece.crop })),
    [plan.pieces, config],
  )
  const chips = useTextureChips(config, items, sizePx)
  const wall = useMemo(() => buildWallGrid(plan), [plan])
  const ready = plan.pieces.every((piece) => chips.has(piece.id))
  const staggered = wall.cells.length <= STAGGER_CAP

  // The wave runs once, on the frame after the first full set of chips is up: started in the same
  // commit it would play against the decode of four PNGs and be over before they landed. The ceiling
  // is what makes it safe to hide a tile before it: the start state is inside the wave, so a worker
  // that never answers would otherwise leave the whole first screen blank rather than showing the
  // wall's own grid waiting for its pictures.
  const [laid, setLaid] = useState(false)
  const laidRef = useRef(false)
  useEffect(() => {
    if (laidRef.current) return
    const lay = () => {
      laidRef.current = true
      setLaid(true)
    }
    if (ready) {
      const frame = requestAnimationFrame(lay)
      return () => cancelAnimationFrame(frame)
    }
    const ceiling = window.setTimeout(lay, LAY_CEILING_MS)
    return () => window.clearTimeout(ceiling)
  }, [ready])

  const wallVars: StyleWithVars = {
    gridTemplateColumns: wall.columns,
    gridTemplateRows: wall.rows,
    aspectRatio: wall.aspect,
    // The wall has proportions of its own, so it is fitted into the box the hero leaves it rather than
    // stretched to it: the CSS reads this against the frame's own width and height (HeroWall.module.scss).
    '--wall-ratio': `${wall.ratio}`,
    // What a tile is before it has a picture: the visitor's own colour, so the opening frame is their
    // wall with its joints rather than a grey slab waiting for the worker.
    '--tile-ink': config.color,
    '--lay-spread': `${staggered ? LAY_SPREAD_MS : 0}ms`,
    '--lay-tile': `${LAY_TILE_MS}ms`,
  }

  return (
    <div
      className={styles.wall}
      role="img"
      aria-label={label}
      aria-busy={ready ? undefined : true}
      data-laid={laid || undefined}
      style={wallVars}
    >
      {wall.cells.map((cell) => {
        const { piece } = cell
        const src = chips.get(piece.id)
        // Chips are square with the piece centred in them, so the picture is scaled by the piece's own
        // long side: that is the fit it was drawn to, whatever size the cell around it is.
        const longSide = Math.max(piece.width, piece.height)
        const cellVars: StyleWithVars = {
          gridColumn: cell.column,
          gridRow: cell.row,
          '--lay': `${cell.lay}`,
          '--chip': src ? `url("${src}")` : 'none',
          '--chip-size': `${(longSide / piece.width) * 100}% ${(longSide / piece.height) * 100}%`,
        }
        // A cut piece carries no mark here: the geometry says it, in every color. The last column and
        // the last row are narrower than the rest and their relief stops mid-pattern. The pieces plate
        // below is where the marks go, because that is where there is room to read them.
        return <div key={cell.key} className={styles.tile} style={cellVars} data-chip={src ? '' : undefined} />
      })}
    </div>
  )
}
