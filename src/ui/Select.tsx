import { Fragment, useId, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Select as RadixSelect } from 'radix-ui'
import { cx } from './cx'
import styles from './Select.module.scss'

export interface SelectOption {
  value: string
  label: string
  /** Secondary fact on the right of the menu row, e.g. "256 × 256 mm". */
  detail?: string
  disabled?: boolean
}

export interface SelectOptionGroup {
  label: string
  options: readonly SelectOption[]
}

export interface SelectProps {
  /** Caps field label printed inside the box, e.g. "Printer". */
  label: string
  value: string
  onValueChange: (value: string) => void
  /** Flat list; use `groups` for headed sections (printers by brand). */
  options?: readonly SelectOption[]
  groups?: readonly SelectOptionGroup[]
  placeholder?: string
  hint?: ReactNode
  disabled?: boolean
  id?: string
  className?: string
}

/** A title-block field that opens a paper menu. */
export function Select({
  label,
  value,
  onValueChange,
  options,
  groups,
  placeholder = 'Choose one',
  hint,
  disabled = false,
  id,
  className,
}: SelectProps) {
  const autoId = useId()
  const triggerId = id ?? `select${autoId}`
  const labelId = `${triggerId}-label`
  const sections: readonly SelectOptionGroup[] = groups ?? [{ label: '', options: options ?? [] }]

  return (
    <div className={cx(styles.field, className)}>
      <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <RadixSelect.Trigger id={triggerId} className={styles.trigger} aria-labelledby={labelId}>
          <span id={labelId} className={styles.label}>
            {label}
          </span>
          <span className={styles.value}>
            <RadixSelect.Value placeholder={placeholder} />
          </span>
          <RadixSelect.Icon className={styles.icon}>
            <ChevronDown aria-hidden="true" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content className={styles.content} position="popper" sideOffset={4} collisionPadding={12}>
            <RadixSelect.ScrollUpButton className={styles.scroll}>
              <ChevronUp aria-hidden="true" />
            </RadixSelect.ScrollUpButton>
            <RadixSelect.Viewport className={styles.viewport}>
              {sections.map((section, index) => (
                <Fragment key={section.label || index}>
                  {index > 0 && <RadixSelect.Separator className={styles.separator} />}
                  <RadixSelect.Group>
                    {section.label && <RadixSelect.Label className={styles.groupLabel}>{section.label}</RadixSelect.Label>}
                    {section.options.map((option) => (
                      <RadixSelect.Item
                        key={option.value}
                        value={option.value}
                        disabled={option.disabled}
                        className={styles.item}
                      >
                        <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                        {option.detail && <span className={styles.detail}>{option.detail}</span>}
                        <RadixSelect.ItemIndicator className={styles.indicator}>
                          <Check aria-hidden="true" />
                        </RadixSelect.ItemIndicator>
                      </RadixSelect.Item>
                    ))}
                  </RadixSelect.Group>
                </Fragment>
              ))}
            </RadixSelect.Viewport>
            <RadixSelect.ScrollDownButton className={styles.scroll}>
              <ChevronDown aria-hidden="true" />
            </RadixSelect.ScrollDownButton>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  )
}
