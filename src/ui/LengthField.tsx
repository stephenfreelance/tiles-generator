import type { ReactNode } from 'react'
import type { LengthUnit } from '@/core/types'
import { formatLength, fromMm } from '@/core/units'
import { MeasureInput, type CommitMeta, type LimitReasons } from './MeasureInput'
import { parseLength } from './parseLength'

export interface LengthFieldProps {
  label: string
  valueMm: number
  /** Commits (Enter, blur, arrows, steppers) with the clamped value in mm. */
  onChangeMm: (mm: number, meta: CommitMeta) => void
  /** Display unit; typing another unit ("1.2 m", "4 ft") still works. */
  unit?: LengthUnit
  /** Limits in mm, shown in the hint and enforced on commit. */
  min?: number
  max?: number
  /** Arrow and stepper increment in mm (Shift x10, Alt x0.1). */
  step?: number
  hint?: ReactNode
  error?: ReactNode
  /** Off when the limits would only add numbers to read; a clamp still says why it clamped. */
  showLimits?: boolean
  id?: string
  disabled?: boolean
  /** Label and field on one row, limits kept for screen readers. */
  compact?: boolean
  labelHidden?: boolean
  limitReasons?: LimitReasons
  hideSteppers?: boolean
  className?: string
}

const EXAMPLE = 'a length like 1.2 m, 120 cm or 1200 mm'

/** The measurement input: reads what people type off a tape measure and stores millimetres. */
export function LengthField({
  valueMm,
  onChangeMm,
  unit = 'mm',
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  ...rest
}: LengthFieldProps) {
  return (
    <MeasureInput
      {...rest}
      value={valueMm}
      onCommit={onChangeMm}
      min={min}
      max={max}
      step={step}
      suffix={unit}
      formatInput={(mm) => formatLength(mm, unit, false)}
      formatReadout={(mm) => formatLength(mm, unit)}
      parse={(text) => parseLength(text, unit)}
      ariaValue={(mm) => fromMm(mm, unit)}
      example={EXAMPLE}
    />
  )
}
