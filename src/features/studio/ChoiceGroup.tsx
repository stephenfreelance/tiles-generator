import { useId, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { cx } from '@/ui/cx'
import styles from './studio.module.scss'

export interface Choice {
  value: string
  /** The name that does the choosing: "Standard", "150 × 150 mm". */
  name: string
  /** The figure that confirms it, where the name does not already say it. */
  figure?: string
  /** What it means for the wall: "32 tiles, no cuts". */
  note?: string
  /** A short word after the name: "Recommended". */
  badge?: string
  /** The one option Tessera would pick: drawn as a full-width card with a tick. */
  featured?: boolean
  /** ok tints the note green: this choice leaves nothing to cut. */
  tone?: 'default' | 'ok'
  /** A drawn sample, where a picture answers faster than a number. */
  sample?: ReactNode
  /** Not available for this design; the note says why, on the card itself. */
  disabled?: boolean
}

export interface ChoiceGroupProps {
  /** The group's name, where no visible heading names it. */
  'aria-label'?: string
  /** The visible heading that names the group, in place of aria-label. */
  'aria-labelledby'?: string
  /** The chosen value, or '' when the design matches none of them. */
  value: string
  onChange: (value: string) => void
  options: readonly Choice[]
  /** stack: one choice per line, for options whose consequence needs a sentence. */
  layout?: 'inline' | 'stack'
  className?: string
}

/** Named options as pressable chips: arrow keys move between them and choose, as in every picker here. */
export function ChoiceGroup({
  value,
  onChange,
  options,
  layout = 'inline',
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
}: ChoiceGroupProps) {
  const uid = useId()
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={onChange}
      loop
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      className={cx(styles.choices, layout === 'stack' && styles.choicesStack, className)}
    >
      {options.map((option, index) => {
        // A card is named by its name alone; its figure, badge and note describe it, so a screen reader
        // says "Wall clips" and then what it means rather than reading the whole card as its name.
        const id = `${uid}-${index}`
        const described = [option.figure && `${id}-figure`, option.badge && `${id}-badge`, option.note && `${id}-note`].filter(Boolean)
        return (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            data-tone={option.tone ?? 'default'}
            className={cx(styles.choice, option.featured && styles.choiceFeatured)}
            aria-labelledby={`${id}-name`}
            aria-describedby={described.length > 0 ? described.join(' ') : undefined}
          >
            {option.featured && (
              <span className={styles.choiceTick} aria-hidden="true">
                <Check />
              </span>
            )}
            {option.sample && (
              <span className={styles.choiceSample} aria-hidden="true">
                {option.sample}
              </span>
            )}
            <span className={styles.choiceText}>
              <span className={styles.choiceName}>
                <span id={`${id}-name`}>{option.name}</span>
                {option.figure && (
                  <span id={`${id}-figure`} className={styles.choiceFigure}>
                    {option.figure}
                  </span>
                )}
                {option.badge && (
                  <span id={`${id}-badge`} className={styles.choiceBadge}>
                    {option.badge}
                  </span>
                )}
              </span>
              {option.note && (
                <span id={`${id}-note`} className={styles.choiceNote}>
                  {option.note}
                </span>
              )}
            </span>
            {!option.featured && (
              <RadioGroup.Indicator className={styles.choiceMark}>
                <Check aria-hidden="true" />
              </RadioGroup.Indicator>
            )}
          </RadioGroup.Item>
        )
      })}
    </RadioGroup.Root>
  )
}
