import { Check } from 'lucide-react'
import type { SideName, SurfaceSides } from '@/core/types'
import { cx } from '@/ui/cx'
import { SIDE_LABELS, SIDE_ORDER } from './edges'
import styles from './studio.module.scss'

export interface SidePickerProps {
  sides: SurfaceSides
  onChange: (side: SideName, on: boolean) => void
  className?: string
}

/**
 * The band each side takes, drawn as a trapezoid so two ticked sides meet in a mitre at the corner,
 * exactly as the profile does on the printed tiles.
 */
const BANDS: Record<SideName, string> = {
  top: '1,1 95,1 88,8 8,8',
  right: '95,1 95,59 88,52 88,8',
  bottom: '95,59 1,59 8,52 88,52',
  left: '1,59 1,1 8,8 8,52',
}

const EDGES: Record<SideName, [number, number, number, number]> = {
  top: [1, 1, 95, 1],
  right: [95, 1, 95, 59],
  bottom: [95, 59, 1, 59],
  left: [1, 59, 1, 1],
}

/** The wall seen from the front: faint tiles, and a band along each side that carries the profile. */
function WallSides({ sides }: { sides: SurfaceSides }) {
  return (
    <svg className={styles.sidesWall} viewBox="0 0 96 60" width="96" height="60" aria-hidden="true">
      <rect className={styles.sidesField} x="1" y="1" width="94" height="58" />
      {[25, 48, 71].map((x) => (
        <line key={`x${x}`} className={styles.sidesTile} x1={x} y1="1" x2={x} y2="59" />
      ))}
      <line className={styles.sidesTile} x1="1" y1="30" x2="95" y2="30" />
      {SIDE_ORDER.map((side) => (
        <polygon key={side} className={styles.sidesBand} data-on={sides[side] || undefined} points={BANDS[side]} />
      ))}
      {SIDE_ORDER.map((side) => {
        const [x1, y1, x2, y2] = EDGES[side]
        return (
          <line
            key={`edge-${side}`}
            className={styles.sidesEdge}
            data-on={sides[side] || undefined}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
          />
        )
      })}
    </svg>
  )
}

/**
 * Which sides of the wall carry the profile: four real checkboxes set around a drawing of the wall,
 * each beside the side it names. A backsplash on a worktop, say, keeps its bottom square.
 */
export function SidePicker({ sides, onChange, className }: SidePickerProps) {
  return (
    <fieldset className={cx(styles.sides, className)}>
      <legend className={styles.sidesLegend}>Sides with the profile</legend>
      <div className={styles.sidesGrid}>
        {SIDE_ORDER.map((side) => (
          <label key={side} className={styles.sideCheck} data-side={side}>
            <span className={styles.sideBox}>
              <input
                type="checkbox"
                className={styles.sideInput}
                checked={sides[side]}
                onChange={(event) => onChange(side, event.currentTarget.checked)}
              />
              <Check className={styles.sideTick} aria-hidden="true" />
            </span>
            {SIDE_LABELS[side]}
          </label>
        ))}
        <WallSides sides={sides} />
      </div>
    </fieldset>
  )
}
