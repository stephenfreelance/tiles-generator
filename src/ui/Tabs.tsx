import { useEffect, useRef, type ReactNode } from 'react'
import { Tabs as RadixTabs } from 'radix-ui'
import { cx } from './cx'
import styles from './Tabs.module.scss'

export interface TabItem {
  value: string
  label: string
  /** Shown after the label, e.g. how many colors a line holds. */
  count?: number
  disabled?: boolean
}

export interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  items: readonly TabItem[]
  /** Names the tab list, e.g. "Filament lines". */
  'aria-label': string
  /** TabPanel elements (at least the active one). */
  children: ReactNode
  className?: string
}

/** Sheet tabs along the top edge of a panel; the active tab joins the sheet below it. */
export function Tabs({ value, onValueChange, items, children, className, 'aria-label': ariaLabel }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null)

  // Thirteen filament lines overflow a narrow column: keep the chosen tab in view.
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-state="active"]')
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [value])

  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={cx(styles.root, className)}>
      <div className={styles.scroller}>
        <RadixTabs.List ref={listRef} aria-label={ariaLabel} className={styles.list}>
          {items.map((item) => (
            <RadixTabs.Trigger key={item.value} value={item.value} disabled={item.disabled} className={styles.tab}>
              <span>{item.label}</span>
              {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
            </RadixTabs.Trigger>
          ))}
        </RadixTabs.List>
      </div>
      {children}
    </RadixTabs.Root>
  )
}

export interface TabPanelProps {
  value: string
  children: ReactNode
  className?: string
}

/** The sheet under a tab. */
export function TabPanel({ value, children, className }: TabPanelProps) {
  return (
    <RadixTabs.Content value={value} className={cx(styles.panel, className)}>
      {children}
    </RadixTabs.Content>
  )
}
