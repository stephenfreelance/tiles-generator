import { useState } from 'react'
import { Check } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { cx } from './cx'
import styles from './TextureChip.module.scss'
import { Tooltip } from './Tooltip'

export interface TextureChipItem {
  id: string
  /** Catalog mark, "T-07": the register's own language, so the picker leaves it off. */
  mark?: string
  name: string
  /** Rendered relief sample (object URL), or null while it is still being drawn. */
  src: string | null
  /** One sentence shown in a tooltip. */
  description?: string
  disabled?: boolean
}

export interface TextureChipGridProps {
  items: readonly TextureChipItem[]
  value: string
  onChange: (id: string) => void
  'aria-label': string
  className?: string
}

/** The relief sample catalog as a radio group; arrow keys move between chips and choose. */
export function TextureChipGrid({ items, value, onChange, className, 'aria-label': ariaLabel }: TextureChipGridProps) {
  return (
    <RadioGroup.Root value={value} onValueChange={onChange} loop aria-label={ariaLabel} className={cx(styles.grid, className)}>
      {items.map((item) => (
        <TextureChip key={item.id} item={item} />
      ))}
    </RadioGroup.Root>
  )
}

export interface TextureChipProps {
  item: TextureChipItem
}

/** One relief sample chip with its catalog mark. Render inside TextureChipGrid. */
export function TextureChip({ item }: TextureChipProps) {
  // Only the first image fades in. A new colour swaps src under an image already on screen, and the
  // browser keeps painting the old one until the new one decodes, so fading again would only blink.
  const [loaded, setLoaded] = useState(false)
  const chip = (
    <RadioGroup.Item
      value={item.id}
      disabled={item.disabled}
      aria-label={item.mark ? `${item.mark} ${item.name}` : item.name}
      className={styles.chip}
    >
      <span className={styles.sample}>
        <span className={styles.placeholder} aria-hidden="true" />
        {item.src && (
          <img
            className={styles.image}
            src={item.src}
            alt=""
            draggable={false}
            decoding="async"
            data-loaded={loaded || undefined}
            onLoad={() => setLoaded(true)}
          />
        )}
        <RadioGroup.Indicator className={styles.check}>
          <Check aria-hidden="true" />
        </RadioGroup.Indicator>
      </span>
      <span className={styles.caption} aria-hidden="true">
        {item.mark && <span className={styles.mark}>{item.mark}</span>}
        <span className={styles.name}>{item.name}</span>
      </span>
    </RadioGroup.Item>
  )
  return item.description ? (
    <Tooltip content={item.description} side="bottom">
      {chip}
    </Tooltip>
  ) : (
    chip
  )
}
