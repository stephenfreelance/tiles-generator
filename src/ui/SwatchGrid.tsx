import { Check } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { FINISH_LABEL, type Finish } from '@/core/filaments'
import { cx, type StyleWithVars } from './cx'
import styles from './SwatchGrid.module.scss'
import { Tooltip } from './Tooltip'

export interface SwatchItem {
  id: string
  name: string
  line: string
  finish: Finish
  hex: string
  /** Flakes, speckle, grain or glow color, depending on the finish. */
  secondaryHex?: string
  /** The hex is not published by the manufacturer. */
  estimated?: boolean
}

export interface SwatchGridProps {
  items: readonly SwatchItem[]
  /** Id of the chosen filament. */
  value: string
  onChange: (id: string) => void
  /** Names the group, e.g. "PLA Matte colors". */
  'aria-label': string
  size?: 'sm' | 'md'
  className?: string
}

/** Filament picker: paper-chip samples in a radio group with roving focus (arrow keys choose). */
export function SwatchGrid({ items, value, onChange, size = 'md', className, 'aria-label': ariaLabel }: SwatchGridProps) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={onChange}
      loop
      aria-label={ariaLabel}
      className={cx(styles.grid, styles[size], className)}
    >
      {items.map((item) => (
        <Swatch key={item.id} item={item} />
      ))}
    </RadioGroup.Root>
  )
}

export interface SwatchProps {
  item: SwatchItem
}

/** One filament chip with an honest hint of its finish. Render inside SwatchGrid. */
export function Swatch({ item }: SwatchProps) {
  const colors: StyleWithVars = { '--c': item.hex, '--c2': item.secondaryHex ?? item.hex }
  const tip = (
    <span className={styles.tip}>
      <span className={styles.tipName}>{item.name}</span>
      <span className={styles.tipLine}>
        {item.line} · {FINISH_LABEL[item.finish]}
        {item.estimated ? ' · color estimated' : ''}
      </span>
    </span>
  )
  return (
    <Tooltip content={tip}>
      <RadioGroup.Item
        value={item.id}
        aria-label={`${item.name}, ${item.line}`}
        data-finish={item.finish}
        style={colors}
        className={styles.swatch}
      >
        <RadioGroup.Indicator className={styles.check}>
          <Check aria-hidden="true" />
        </RadioGroup.Indicator>
      </RadioGroup.Item>
    </Tooltip>
  )
}
