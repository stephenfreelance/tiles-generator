import { LIMITS } from '@/core/config'
import { formatLength } from '@/core/units'
import { LengthField } from '@/ui'
import { FieldGroup } from './FieldGroup'
import styles from './studio.module.scss'
import type { CellProps } from './types'

/** An arrow press moves the tape by one mark of the unit on screen. */
const STEP_MM = { mm: 1, cm: 10, m: 100 } as const

const LIMIT_REASONS = {
  min: 'the smallest surface Tessera lays out',
  max: 'the largest surface Tessera lays out',
}

/**
 * Choice 1: the space being covered. Everything else on the screen is computed from it.
 *
 * Two measurements and nothing else. The named places that used to sit above them (kitchen
 * splashback, bathroom niche and the rest) were a row of guesses about someone else's wall: the
 * design opens at a usable size already, and anyone covering a real wall has its measurements in
 * their hand.
 */
export function WallGroup({ config, update }: CellProps) {
  const { surface, surfaceUnit } = config
  const step = STEP_MM[surfaceUnit]

  return (
    <FieldGroup
      step={1}
      title="Your wall"
      now={`${formatLength(surface.width, surfaceUnit, false)} × ${formatLength(surface.height, surfaceUnit)}`}
    >
      <div className={styles.grid2}>
        <LengthField
          label="Width"
          valueMm={surface.width}
          unit={surfaceUnit}
          min={LIMITS.surface.min}
          max={LIMITS.surface.max}
          step={step}
          showLimits={false}
          limitReasons={LIMIT_REASONS}
          onChangeMm={(mm, meta) =>
            update(
              (design) => ({ ...design, surface: { ...design.surface, width: mm } }),
              meta.stepped ? { coalesce: 'surface.width' } : undefined,
            )
          }
        />
        <LengthField
          label="Height"
          valueMm={surface.height}
          unit={surfaceUnit}
          min={LIMITS.surface.min}
          max={LIMITS.surface.max}
          step={step}
          showLimits={false}
          limitReasons={LIMIT_REASONS}
          onChangeMm={(mm, meta) =>
            update(
              (design) => ({ ...design, surface: { ...design.surface, height: mm } }),
              meta.stepped ? { coalesce: 'surface.height' } : undefined,
            )
          }
        />
      </div>
      {/* The field reads any unit off a tape measure, which is why there is no unit picker. */}
      <p className={styles.hint}>Type any unit: 1.2 m, 120 cm and 1200 mm all work.</p>
    </FieldGroup>
  )
}
