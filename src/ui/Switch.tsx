import { useId, type ReactNode } from 'react'
import { Switch as RadixSwitch } from 'radix-ui'
import { cx } from './cx'
import styles from './Switch.module.scss'

export interface SwitchProps {
  label: ReactNode
  /** One line saying what changes when it is on. */
  description?: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  className?: string
}

/** An on/off setting: words on the left, a square-shuttle switch on the right. The whole row toggles. */
export function Switch({ label, description, checked, onCheckedChange, disabled = false, id, className }: SwitchProps) {
  const autoId = useId()
  const switchId = id ?? `switch${autoId}`
  const descriptionId = `${switchId}-description`

  return (
    <div className={cx(styles.row, className)} data-disabled={disabled || undefined}>
      <span className={styles.text}>
        <label htmlFor={switchId} className={styles.label}>
          {label}
        </label>
        {description && (
          <span id={descriptionId} className={styles.description}>
            {description}
          </span>
        )}
      </span>
      <RadixSwitch.Root
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? descriptionId : undefined}
        className={styles.switch}
      >
        <RadixSwitch.Thumb className={styles.thumb} />
      </RadixSwitch.Root>
    </div>
  )
}
