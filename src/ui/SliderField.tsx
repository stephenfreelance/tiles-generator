import { useId, useRef, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { Slider } from 'radix-ui'
import { formatNumber } from '@/core/units'
import { cx, type StyleWithVars } from './cx'
import { decimalsOf } from './fieldMath'
import { withUnit } from './format'
import { HelpTip } from './HelpTip'
import { IconButton } from './IconButton'
import { NumberField } from './NumberField'
import styles from './SliderField.module.scss'

export interface SliderChangeHint {
  /** Present for drag and slider-key moves: pass it to `useDesign.update` so a drag is one undo step. */
  coalesce?: string
}

export interface SliderFieldProps {
  label: string
  value: number
  /** Marked on the scale with a chalk tick; the reset button returns here. */
  defaultValue: number
  min: number
  max: number
  step: number
  unit?: string
  decimals?: number
  /** Live value: every drag frame, key press, typed commit and reset. */
  onChange: (value: number, hint: SliderChangeHint) => void
  /** Final value once the drag or edit ends (for expensive follow-up work). */
  onCommit?: (value: number) => void
  /** Store coalesce key for drags; defaults to the field id. */
  coalesceKey?: string
  hint?: ReactNode
  /** Short explanation behind a "?" next to the label. */
  help?: ReactNode
  format?: (value: number) => string
  disabled?: boolean
  id?: string
  className?: string
}

/** A drafting-scale slider with a typed readout, a default tick and a reset. */
export function SliderField({
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  unit,
  decimals,
  onChange,
  onCommit,
  coalesceKey,
  hint,
  help,
  format,
  disabled = false,
  id,
  className,
}: SliderFieldProps) {
  const autoId = useId()
  const baseId = id ?? `slider${autoId}`
  const labelId = `${baseId}-label`
  // The hint is the note under the scale (what this value really prints): a screen reader reads it with
  // the slider, not only by wandering into it.
  const hintId = `${baseId}-hint`
  const thumbRef = useRef<HTMLSpanElement>(null)
  const coalesce = coalesceKey ?? baseId
  const places = decimals ?? Math.min(4, decimalsOf(step))
  const show = format ?? ((v: number) => formatNumber(v, places))
  const readout = (v: number) => withUnit(show(v), unit)
  const isDefault = Math.abs(value - defaultValue) < step / 1000
  const span = max - min || 1
  const defaultStyle: StyleWithVars = {
    '--at': `${Math.min(100, Math.max(0, ((defaultValue - min) / span) * 100))}%`,
  }

  const setExactly = (next: number) => {
    onChange(next, {})
    onCommit?.(next)
  }

  const reset = () => {
    setExactly(defaultValue)
    // The reset button disappears once the value is back, so hand focus to the thumb.
    thumbRef.current?.focus()
  }

  return (
    <div className={cx(styles.field, className)} data-disabled={disabled || undefined}>
      <div className={styles.head}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        {help && <HelpTip label={label}>{help}</HelpTip>}
        <span className={styles.readout}>
          <NumberField
            compact
            labelHidden
            hideSteppers
            showLimits={false}
            label={label}
            id={`${baseId}-input`}
            value={value}
            min={min}
            max={max}
            step={step}
            unit={unit}
            decimals={places}
            format={format}
            disabled={disabled}
            onChange={setExactly}
            className={styles.number}
          />
          {isDefault ? (
            <span className={styles.resetSpacer} aria-hidden="true" />
          ) : (
            <IconButton
              size="sm"
              icon={<RotateCcw />}
              aria-label={`Reset ${label} to ${readout(defaultValue)}`}
              disabled={disabled}
              onClick={reset}
            />
          )}
        </span>
      </div>
      <Slider.Root
        className={styles.slider}
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        onValueChange={([next]) => onChange(next, { coalesce })}
        onValueCommit={([next]) => onCommit?.(next)}
      >
        <Slider.Track className={styles.track}>
          <Slider.Range className={styles.range} />
        </Slider.Track>
        <span className={styles.defaultTick} style={defaultStyle} aria-hidden="true" />
        <Slider.Thumb
          ref={thumbRef}
          className={styles.thumb}
          aria-labelledby={labelId}
          aria-describedby={hint ? hintId : undefined}
          aria-valuetext={readout(value)}
        />
      </Slider.Root>
      <div className={styles.scale} aria-hidden="true">
        <span>{readout(min)}</span>
        <span>{readout(max)}</span>
      </div>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  )
}
