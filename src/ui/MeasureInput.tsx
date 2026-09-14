import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { Minus, Plus, TriangleAlert } from 'lucide-react'
import { cx } from './cx'
import styles from './Field.module.scss'
import { clampToRange, nudge, stepMultiplier, type LimitEdge } from './fieldMath'
import { announce } from './toast'
import { VisuallyHidden } from './VisuallyHidden'

/** How long a clamp or parse notice replaces the hint line. */
const NOTICE_MS = 3000

/** Why each limit exists; ends the clamp notice ("Kept to 400 mm, the largest tile Tessera makes"). */
export interface LimitReasons {
  min?: string
  max?: string
}

export interface CommitMeta {
  /** True for arrow keys and stepper clicks, which a store may coalesce into one undo step. */
  stepped: boolean
}

const DEFAULT_REASON: Record<LimitEdge, string> = {
  min: 'the smallest this field takes',
  max: 'the largest this field takes',
}

export interface MeasureInputProps {
  label: string
  labelHidden?: boolean
  id?: string
  /** In the field's canonical unit (mm for lengths). */
  value: number
  onCommit: (value: number, meta: CommitMeta) => void
  min: number
  max: number
  step: number
  /** Editable text for a value, without unit. */
  formatInput: (value: number) => string
  /** Value with its unit, for limits, notices and assistive technology. */
  formatReadout: (value: number) => string
  parse: (text: string) => number | null
  /** The number a screen reader reports, in display units. */
  ariaValue: (value: number) => number
  /** Completes "Could not read ... Type ___." */
  example: string
  suffix?: string
  hint?: ReactNode
  error?: ReactNode
  showLimits?: boolean
  limitReasons?: LimitReasons
  disabled?: boolean
  compact?: boolean
  hideSteppers?: boolean
  className?: string
}

/**
 * The shared text-with-steppers input behind LengthField and NumberField: commits on Enter or
 * blur, Escape reverts, arrows step live (Shift x10, Alt x0.1), out-of-range values clamp and say why.
 */
export function MeasureInput({
  label,
  labelHidden = false,
  id,
  value,
  onCommit,
  min,
  max,
  step,
  formatInput,
  formatReadout,
  parse,
  ariaValue,
  example,
  suffix,
  hint,
  error,
  showLimits = true,
  limitReasons,
  disabled = false,
  compact = false,
  hideSteppers = false,
  className,
}: MeasureInputProps) {
  const autoId = useId()
  const inputId = id ?? `measure${autoId}`
  const hintId = `${inputId}-hint`
  const [draft, setDraft] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)
  const focusFromPointer = useRef(false)

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  const showNotice = (message: string) => {
    setNotice(message)
    announce(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS)
  }

  const commit = (requested: number, stepped: boolean) => {
    const { value: next, edge } = clampToRange(requested, min, max)
    if (edge) showNotice(`Kept to ${formatReadout(next)}, ${limitReasons?.[edge] ?? DEFAULT_REASON[edge]}`)
    if (next !== value) onCommit(next, { stepped })
  }

  const commitDraft = () => {
    if (draft === null) return
    const text = draft.trim()
    setDraft(null)
    // An emptied field goes back to its value rather than guessing one.
    if (text === '') return
    const parsed = parse(text)
    if (parsed === null) {
      showNotice(`Could not read "${text}". Type ${example}.`)
      return
    }
    commit(parsed, false)
  }

  const stepBy = (direction: 1 | -1, multiplier: number) => {
    const base = draft === null ? value : (parse(draft) ?? value)
    setDraft(null)
    commit(nudge(base, step, direction, multiplier), true)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'Enter': {
        event.preventDefault()
        commitDraft()
        const input = event.currentTarget
        requestAnimationFrame(() => input.select())
        break
      }
      case 'Escape':
        if (draft !== null) {
          // Only swallow Escape when it did something, so it still closes an enclosing popover.
          event.preventDefault()
          event.stopPropagation()
          setDraft(null)
        }
        break
      case 'ArrowUp':
      case 'ArrowDown':
        event.preventDefault()
        stepBy(event.key === 'ArrowUp' ? 1 : -1, stepMultiplier(event))
        break
      case 'PageUp':
      case 'PageDown':
        event.preventDefault()
        stepBy(event.key === 'PageUp' ? 1 : -1, 10)
        break
    }
  }

  // Stepper presses must not pull focus out of the input mid-edit.
  const keepFocus = (event: MouseEvent) => event.preventDefault()

  const limitsText =
    showLimits && Number.isFinite(min) && Number.isFinite(max) ? `${formatInput(min)} to ${formatReadout(max)}` : null
  const message = notice ?? (error || null)
  const hasHint = Boolean(message || hint || limitsText)
  const labelElement = (
    <label htmlFor={inputId} className={labelHidden ? undefined : styles.label}>
      {label}
    </label>
  )

  return (
    <div className={cx(styles.field, compact && styles.compact, className)} data-disabled={disabled || undefined}>
      {labelHidden ? <VisuallyHidden>{labelElement}</VisuallyHidden> : labelElement}
      <div className={styles.control} data-invalid={error ? true : undefined}>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          role="spinbutton"
          aria-valuenow={ariaValue(value)}
          aria-valuemin={Number.isFinite(min) ? ariaValue(min) : undefined}
          aria-valuemax={Number.isFinite(max) ? ariaValue(max) : undefined}
          aria-valuetext={formatReadout(value)}
          aria-describedby={hasHint ? hintId : undefined}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          value={draft ?? formatInput(value)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          onPointerDown={() => {
            focusFromPointer.current = true
          }}
          onFocus={(event) => {
            // Tabbing in selects the value for retyping; a click keeps the caret where it landed.
            if (!focusFromPointer.current) event.currentTarget.select()
            focusFromPointer.current = false
          }}
        />
        {suffix && (
          <span className={styles.suffix} aria-hidden="true">
            {suffix}
          </span>
        )}
        {!hideSteppers && (
          <span className={styles.steppers}>
            <button
              type="button"
              tabIndex={-1}
              className={styles.stepper}
              aria-label={`Decrease ${label}`}
              disabled={disabled || value <= min}
              onMouseDown={keepFocus}
              onClick={(event) => stepBy(-1, stepMultiplier(event))}
            >
              <Minus aria-hidden="true" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              className={styles.stepper}
              aria-label={`Increase ${label}`}
              disabled={disabled || value >= max}
              onMouseDown={keepFocus}
              onClick={(event) => stepBy(1, stepMultiplier(event))}
            >
              <Plus aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
      {hasHint && (
        <p
          id={hintId}
          className={cx(styles.hint, message ? styles.hintAlert : undefined, compact && !message ? styles.hintQuiet : undefined)}
        >
          {message ? (
            <>
              <TriangleAlert className={styles.hintIcon} aria-hidden="true" />
              <span>{message}</span>
            </>
          ) : (
            <span>
              {hint}
              {hint && limitsText ? ' · ' : null}
              {limitsText}
            </span>
          )}
        </p>
      )}
    </div>
  )
}
