import type { ReactNode } from 'react'
import { formatNumber } from '@/core/units'
import { decimalsOf, roundTo } from './fieldMath'
import { withUnit } from './format'
import { MeasureInput, type CommitMeta, type LimitReasons } from './MeasureInput'
import { parseNumber } from './parseLength'

export interface NumberFieldProps {
  label: string
  value: number
  onChange: (value: number, meta: CommitMeta) => void
  min?: number
  max?: number
  step?: number
  /** Suffix such as "°", "%" or "mm"; typing it after the number is tolerated. */
  unit?: string
  /** Fraction digits shown; defaults to the step's. */
  decimals?: number
  /** Custom display text for a value, without unit. */
  format?: (value: number) => string
  hint?: ReactNode
  error?: ReactNode
  id?: string
  disabled?: boolean
  compact?: boolean
  labelHidden?: boolean
  hideSteppers?: boolean
  showLimits?: boolean
  limitReasons?: LimitReasons
  className?: string
}

/** LengthField's interaction for unitless or custom-unit values (degrees, percent, seeds). */
export function NumberField({
  value,
  onChange,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  unit,
  decimals,
  format,
  ...rest
}: NumberFieldProps) {
  const places = decimals ?? Math.min(4, decimalsOf(step))
  const formatInput = format ?? ((v: number) => formatNumber(v, places))
  const formatReadout = (v: number) => withUnit(formatInput(v), unit)
  const sample = Number.isFinite(min) && Number.isFinite(max) ? roundTo((min + max) / 2, places) : 12

  return (
    <MeasureInput
      {...rest}
      value={value}
      onCommit={onChange}
      min={min}
      max={max}
      step={step}
      suffix={unit}
      formatInput={formatInput}
      formatReadout={formatReadout}
      parse={(text) => parseNumber(text, unit)}
      ariaValue={(v) => v}
      example={`a number such as ${formatReadout(sample)}`}
    />
  )
}
