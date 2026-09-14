import type { ComponentPropsWithRef, MouseEvent, ReactNode } from 'react'
import styles from './Button.module.scss'
import { buttonClassName, type ButtonSize, type ButtonVariant } from './buttonClassName'
import { cx, type StyleWithVars } from './cx'
import { Spinner } from './Spinner'
import { VisuallyHidden } from './VisuallyHidden'

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** primary is the red-pencil action: use it once per view. */
  variant?: ButtonVariant
  size?: ButtonSize
  /** Busy: keeps its width, draws a spinner (or the progress hatch) and ignores clicks. */
  loading?: boolean
  /** 0..1 while loading: fills the button with hatching instead of the spinner, label kept. */
  progress?: number
  /** Spoken while loading, e.g. "Preparing files". */
  loadingLabel?: string
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  fullWidth?: boolean
}

const SPINNER_PX: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 }

/** The Tessera button. Forwards its ref to the native <button>. */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  progress,
  loadingLabel = 'Working',
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  type = 'button',
  className,
  children,
  onClick,
  ref,
  ...rest
}: ButtonProps) {
  const showProgress = loading && typeof progress === 'number' && Number.isFinite(progress)
  const fraction = showProgress ? Math.min(1, Math.max(0, progress)) : 0
  const progressStyle: StyleWithVars = { '--progress': fraction }

  // A busy button stays focusable (aria-disabled, not disabled) so keyboard focus is not dropped.
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={buttonClassName(variant, size, cx(fullWidth && styles.fullWidth, className))}
      aria-busy={loading || undefined}
      aria-disabled={loading || rest['aria-disabled'] || undefined}
      data-loading={loading ? (showProgress ? 'progress' : 'spinner') : undefined}
      onClick={handleClick}
    >
      {showProgress && <span className={styles.progress} style={progressStyle} aria-hidden="true" />}
      <span className={styles.content}>
        {leadingIcon && (
          <span className={styles.icon} aria-hidden="true">
            {leadingIcon}
          </span>
        )}
        {children !== undefined && children !== null && <span className={styles.label}>{children}</span>}
        {trailingIcon && (
          <span className={styles.icon} aria-hidden="true">
            {trailingIcon}
          </span>
        )}
      </span>
      {loading && !showProgress && (
        <span className={styles.spinner} aria-hidden="true">
          <Spinner size={SPINNER_PX[size]} />
        </span>
      )}
      {loading && (
        <VisuallyHidden>{showProgress ? `${loadingLabel}, ${Math.round(fraction * 100)}%` : loadingLabel}</VisuallyHidden>
      )}
    </button>
  )
}
