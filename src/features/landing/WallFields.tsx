// The hero's one instrument: the visitor's wall in centimetres, and three walls they can borrow.
import { useId } from 'react'
import { formatSize } from '@/core/units'
import { LengthField } from '@/ui'
import { EXAMPLE_WALLS, LANDING_WALL_LIMITS } from './landingDesign'
import type { StyleWithVars } from '@/ui/cx'
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
 * The longest wall on offer, drawn this wide in px. Every other sample is drawn at the same scale off
 * the same number, so the three little walls are a scale drawing: a niche really is a sixth of the
 * width of a feature wall on this row, which is the fastest way to say what these three are.
 */
const FIGURE_LONG_PX = 48

/** px per mm, from the samples themselves: adding a larger wall rescales the whole row rather than
    overflowing its box. */
const FIGURE_SCALE =
  FIGURE_LONG_PX / EXAMPLE_WALLS.reduce((longest, wall) => Math.max(longest, wall.widthMm, wall.heightMm), 1)

/** The name without the size that follows it: the size is set under it, in the figures it is edited in. */
const exampleName = (label: string): string => label.replace(/\s+\d.*$/, '')

/**
 * Two measurements and three walls to borrow. The fields commit on Enter, blur, arrows and steppers
 * and never per keystroke, so a half-typed number never re-lays the page; a clamp says why it clamped.
 */
export function WallFields({ widthMm, heightMm, onWall, onExample, exampleIndex }: WallFieldsProps) {
  const autoId = useId()
  const samplesId = `wall-samples${autoId}`

  return (
    <fieldset className={styles.block}>
      <legend className={styles.legend}>Your wall</legend>
      {/* Hidden from the tree because the legend above already names the group: this is the printed head. */}
      <p className={styles.head} aria-hidden="true">
        Your wall
      </p>
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

      <div className={styles.samples}>
        <p className={styles.samplesHead}>
          {/* The id sits on the words, not on the line: the state beside them would otherwise become
              part of the group's own name. */}
          <span id={samplesId}>Or take one of ours</span>
          {/* A typed size matches no sample, so the row would otherwise read as three walls and no
              answer. This is the answer: the wall standing there is the visitor's own. */}
          {exampleIndex < 0 && <span className={styles.samplesState}>Showing your own size</span>}
        </p>
        <div className={styles.examples} role="group" aria-labelledby={samplesId}>
          {EXAMPLE_WALLS.map((wall, index) => {
            const figure: StyleWithVars = {
              '--fig-w': `${Math.round(wall.widthMm * FIGURE_SCALE)}px`,
              '--fig-h': `${Math.round(wall.heightMm * FIGURE_SCALE)}px`,
            }
            return (
              <button
                key={wall.label}
                type="button"
                className={styles.example}
                aria-pressed={index === exampleIndex}
                onClick={() => onExample(index)}
              >
                {/* The wall itself, drawn to scale and standing on the same line as the other two:
                    three shapes say what three walls are faster than three names do. */}
                <span className={styles.figure} aria-hidden="true">
                  <span className={styles.figureWall} style={figure} />
                </span>
                <span className={styles.exampleName}>{exampleName(wall.label)}</span>
                <span className={styles.exampleSize}>{formatSize(wall.widthMm, wall.heightMm, 'cm')}</span>
              </button>
            )
          })}
        </div>
      </div>
    </fieldset>
  )
}
