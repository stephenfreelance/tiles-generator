// The hero's one instrument: the visitor's wall in centimetres, and three walls they can borrow.
import { useId } from 'react'
import { LengthField } from '@/ui'
import { EXAMPLE_WALLS, LANDING_WALL_LIMITS } from './landingDesign'
import styles from './WallFields.module.scss'

export interface WallFieldsProps {
  widthMm: number
  heightMm: number
  onWall: (next: { widthMm?: number; heightMm?: number }) => void
  onExample: (index: number) => void
  /** Index of the matching EXAMPLE_WALLS entry, or -1. */
  exampleIndex: number
}

/** One mark of the unit on screen: an arrow or a stepper moves the tape by a centimetre. */
const STEP_MM = 10

const LIMIT_REASONS = {
  min: 'the smallest wall this page lays out',
  max: 'the largest wall this page lays out',
}

/**
 * Two measurements and three walls to borrow. The fields commit on Enter, blur, arrows and steppers
 * and never per keystroke, so a half-typed number never re-lays the page; a clamp says why it clamped.
 */
export function WallFields({ widthMm, heightMm, onWall, onExample, exampleIndex }: WallFieldsProps) {
  const autoId = useId()
  const hintId = `wall-hint${autoId}`

  return (
    <fieldset className={styles.block} aria-describedby={hintId}>
      {/* Hidden because the same words sit beside the example walls: the group is named once, not twice. */}
      <legend className={styles.legend}>Your wall</legend>
      <div className={styles.head}>
        <span className={styles.headLabel} aria-hidden="true">
          Your wall
        </span>
        <div className={styles.examples} role="group" aria-label="Example walls">
          {EXAMPLE_WALLS.map((wall, index) => (
            <button
              key={wall.label}
              type="button"
              className={styles.example}
              // A typed size matches no example, so none of the three reads as pressed.
              aria-pressed={index === exampleIndex}
              onClick={() => onExample(index)}
            >
              {wall.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.fields}>
        <LengthField
          label="Width"
          className={styles.field}
          valueMm={widthMm}
          unit="cm"
          min={LANDING_WALL_LIMITS.min}
          max={LANDING_WALL_LIMITS.max}
          step={STEP_MM}
          limitReasons={LIMIT_REASONS}
          compact
          onChangeMm={(mm) => onWall({ widthMm: mm })}
        />
        <LengthField
          label="Height"
          className={styles.field}
          valueMm={heightMm}
          unit="cm"
          min={LANDING_WALL_LIMITS.min}
          max={LANDING_WALL_LIMITS.max}
          step={STEP_MM}
          limitReasons={LIMIT_REASONS}
          compact
          onChangeMm={(mm) => onWall({ heightMm: mm })}
        />
      </div>
      {/* The tile size is captioned under the wall itself, so this says the one thing the fields cannot. */}
      <p id={hintId} className={styles.hint}>
        In the studio you pick the tile size, or Tessera works out one that needs no cuts.
      </p>
    </fieldset>
  )
}
