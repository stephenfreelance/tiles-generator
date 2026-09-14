import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cx } from './cx'
import styles from './IconButton.module.scss'
import { Tooltip } from './Tooltip'

export type IconButtonSize = 'sm' | 'md' | 'lg'
export type IconButtonVariant = 'ghost' | 'outline'

export interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'aria-label' | 'children'> {
  /** Required: the button's only name, also shown in its tooltip. */
  'aria-label': string
  /** A lucide icon (or a small authored SVG). */
  icon: ReactNode
  /** Shown as key caps in the tooltip, e.g. "D" or ["Shift", "R"]. */
  shortcut?: string | string[]
  size?: IconButtonSize
  variant?: IconButtonVariant
  /** On/off tools (dimensions, layer lines): inked while pressed, announced as a toggle. */
  pressed?: boolean
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
  /** Skip the tooltip when the same words already sit next to the button. */
  hideTooltip?: boolean
}

/** A square icon button whose label always shows in a tooltip. Forwards its ref. */
export function IconButton({
  'aria-label': label,
  icon,
  shortcut,
  size = 'md',
  variant = 'ghost',
  pressed,
  tooltipSide = 'top',
  hideTooltip = false,
  type = 'button',
  className,
  ref,
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide} disabled={hideTooltip}>
      <button
        {...rest}
        ref={ref}
        type={type}
        aria-label={label}
        aria-pressed={pressed}
        className={cx(styles.button, styles[size], styles[variant], className)}
      >
        <span className={styles.glyph} aria-hidden="true">
          {icon}
        </span>
      </button>
    </Tooltip>
  )
}
