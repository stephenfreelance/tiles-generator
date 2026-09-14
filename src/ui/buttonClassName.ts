import styles from './Button.module.scss'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger-quiet'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASS: Record<ButtonVariant, string | undefined> = {
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
  'danger-quiet': styles.dangerQuiet,
}

/** Button styling for elements that are not <Button>, such as a react-router <Link>. */
export function buttonClassName(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra?: string): string {
  return cx(styles.button, VARIANT_CLASS[variant], styles[size], extra)
}
