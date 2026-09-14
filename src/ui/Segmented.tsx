import { useId, type ReactNode } from 'react'
import { RadioGroup } from 'radix-ui'
import { cx } from './cx'
import styles from './Segmented.module.scss'
import { Tooltip } from './Tooltip'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: string
  /** A lucide icon or a small inline SVG diagram drawn in currentColor. */
  icon?: ReactNode
  /** One short line under the label (tiles layout). */
  description?: string
  disabled?: boolean
  /** Show only the icon; the label becomes the name and the tooltip. */
  iconOnly?: boolean
}

export interface SegmentedProps<T extends string | number> {
  value: T
  onChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  /** Visible caps label above the control; otherwise pass aria-label. */
  label?: string
  'aria-label'?: string
  size?: 'sm' | 'md'
  /** inline: one ruled strip. tiles: diagram above words, wrapping, for choices that need a picture. */
  layout?: 'inline' | 'tiles'
  fullWidth?: boolean
  disabled?: boolean
  id?: string
  className?: string
}

/** Single choice as a ruled strip; the chosen segment is inked. Arrow keys move and select. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  'aria-label': ariaLabel,
  size = 'md',
  layout = 'inline',
  fullWidth = false,
  disabled = false,
  id,
  className,
}: SegmentedProps<T>) {
  const autoId = useId()
  const labelId = `${id ?? `segmented${autoId}`}-label`

  // Radix speaks strings; numeric options (row offsets) map back to their typed value.
  const select = (next: string) => {
    const option = options.find((o) => String(o.value) === next)
    if (option) onChange(option.value)
  }

  return (
    <div className={cx(styles.root, className)} id={id}>
      {label && (
        <span id={labelId} className={styles.label}>
          {label}
        </span>
      )}
      <RadioGroup.Root
        value={String(value)}
        onValueChange={select}
        orientation={layout === 'inline' ? 'horizontal' : undefined}
        loop
        disabled={disabled}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className={cx(styles.group, styles[layout], styles[size], fullWidth && styles.fullWidth)}
      >
        {options.map((option) => {
          const key = String(option.value)
          const segment = (
            <RadioGroup.Item
              key={key}
              value={key}
              disabled={option.disabled}
              aria-label={option.iconOnly ? option.label : undefined}
              className={styles.segment}
            >
              {option.icon && (
                <span className={styles.icon} aria-hidden="true">
                  {option.icon}
                </span>
              )}
              {!option.iconOnly && (
                <span className={styles.text}>
                  <span className={styles.optionLabel}>{option.label}</span>
                  {option.description && <span className={styles.description}>{option.description}</span>}
                </span>
              )}
            </RadioGroup.Item>
          )
          return option.iconOnly ? (
            <Tooltip key={key} content={option.label}>
              {segment}
            </Tooltip>
          ) : (
            segment
          )
        })}
      </RadioGroup.Root>
    </div>
  )
}
