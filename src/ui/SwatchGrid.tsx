import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { cx, type StyleWithVars } from './cx'
import styles from './SwatchGrid.module.scss'
import { Tooltip } from './Tooltip'

export interface SwatchItem {
  name: string
  /** '#RRGGBB'; also the radio's value. */
  hex: string
}

export interface SwatchGridProps {
  items: readonly SwatchItem[]
  /** Hex of the chosen swatch. A hex that matches none of them (a custom color) leaves every radio unchecked. */
  value: string
  onChange: (hex: string) => void
  /** Names the group, e.g. "Preset colors". */
  'aria-label': string
  /** One control drawn in the cell after the last swatch but outside the radio group, e.g. a custom-color trigger. */
  trailing?: ReactNode
  /** Swatches per row; the cells shrink together on a narrow screen rather than wrapping unevenly. */
  columns?: number
  size?: 'sm' | 'md'
  className?: string
}

/** Color picker: lit samples in a radio group with roving focus (arrow keys choose). */
export function SwatchGrid({
  items,
  value,
  onChange,
  trailing,
  columns = 6,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: SwatchGridProps) {
  const cells = items.length + (trailing ? 1 : 0)
  const layout: StyleWithVars = { '--columns': columns, '--rows': Math.max(1, Math.ceil(cells / columns)) }
  // The trailing cell shares the swatches' grid, so it sits exactly where one more swatch would.
  const trailingCell = { gridColumn: (items.length % columns) + 1, gridRow: Math.floor(items.length / columns) + 1 }

  return (
    <div className={cx(styles.grid, styles[size], className)} style={layout}>
      <RadioGroup.Root value={value} onValueChange={onChange} loop aria-label={ariaLabel} className={styles.radios}>
        {items.map((item) => (
          <Swatch key={item.hex} item={item} />
        ))}
      </RadioGroup.Root>
      {trailing && (
        <div className={styles.trailing} style={trailingCell}>
          {trailing}
        </div>
      )}
    </div>
  )
}

export interface SwatchProps {
  item: SwatchItem
}

/** One color chip, named by its tooltip. Render inside SwatchGrid. */
export function Swatch({ item }: SwatchProps) {
  const color: StyleWithVars = { '--c': item.hex }
  const tip = (
    <span className={styles.tip}>
      <span className={styles.tipName}>{item.name}</span>
      <span className={styles.tipHex}>{item.hex}</span>
    </span>
  )
  return (
    <Tooltip content={tip}>
      <RadioGroup.Item value={item.hex} aria-label={item.name} style={color} className={styles.swatch}>
        <RadioGroup.Indicator className={styles.check}>
          <Check aria-hidden="true" />
        </RadioGroup.Indicator>
      </RadioGroup.Item>
    </Tooltip>
  )
}
