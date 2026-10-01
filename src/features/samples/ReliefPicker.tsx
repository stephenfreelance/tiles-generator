// "What to print": every relief of the catalogue as a checkbox, the maker's own first and marked as theirs,
// each shown by the very chip its sample prints as (the same design and crop as the plate drawings, so the two
// share one render). Two quick picks and a live count sit above the grid, so neither needs a scroll to find.
import { useId, useMemo } from 'react'
import { Check } from 'lucide-react'
import type { DesignConfig } from '@/core/types'
import { useTextureChips, type ChipItem } from '@/hooks'
import { Button } from '@/ui'
import { EVERY_RELIEF, reliefOrder, yoursCarries, type SampleSet } from './samplePlates'
import styles from './ReliefPicker.module.scss'

export interface ReliefPickerProps {
  config: DesignConfig
  set: SampleSet
  /** The texture ids picked. */
  value: ReadonlySet<string>
  onChange: (reliefs: string[]) => void
  /** Chip pixels, the plate drawings' own, so each relief is rendered once for both. */
  chipPx: number
  disabled?: boolean
}

export function ReliefPicker({ config, set, value, onChange, chipPx, disabled = false }: ReliefPickerProps) {
  const labelId = useId()
  const carriesId = useId()
  const order = useMemo(() => reliefOrder(config), [config])
  const own = order[0].id
  const carries = yoursCarries(set)
  // Each relief by the sample that shows it: the maker's as set, every other at its own depth and scale.
  const shown = useMemo(
    () =>
      order.map((texture) => ({
        texture,
        sample: set.core.find((sample) => sample.relief === texture.id && sample.kind === 'relief'),
      })),
    [order, set],
  )
  const chipItems = useMemo<ChipItem[]>(
    () =>
      shown.flatMap(({ texture, sample }) => {
        const piece = sample?.pieces[0]
        return sample && piece ? [{ key: texture.id, config: sample.config, crop: piece.spec.crop, edges: piece.spec.edges }] : []
      }),
    [shown],
  )
  const chips = useTextureChips(config, chipItems, chipPx)
  const count = EVERY_RELIEF.filter((id) => value.has(id)).length

  function toggle(id: string, on: boolean) {
    // Kept in the studio's order, so the same pick always reads the same.
    onChange(EVERY_RELIEF.filter((relief) => (relief === id ? on : value.has(relief))))
  }

  return (
    <div className={styles.picker} role="group" aria-labelledby={labelId}>
      <div className={styles.head}>
        <span className={styles.heading}>
          <span id={labelId} className={styles.label}>
            What to print
          </span>
          <span className={styles.count} aria-live="polite" aria-atomic="true">
            {count} of {EVERY_RELIEF.length} reliefs
          </span>
        </span>
        <span className={styles.quick}>
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange([...EVERY_RELIEF])}>
            Every relief
          </Button>
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange([own])}>
            Only yours
          </Button>
        </span>
      </div>
      <ul className={styles.grid}>
        {shown.map(({ texture }) => {
          const yours = texture.id === own
          const on = value.has(texture.id)
          const src = chips.get(texture.id)
          return (
            <li key={texture.id} className={styles.cell} data-yours={yours || undefined}>
              <label className={styles.relief} data-on={on || undefined} data-disabled={disabled || undefined}>
                <span className={styles.chip}>
                  <span className={styles.sample}>{src && <img src={src} alt="" draggable={false} decoding="async" />}</span>
                  <input
                    type="checkbox"
                    className={styles.box}
                    checked={on}
                    disabled={disabled}
                    aria-label={texture.name}
                    aria-describedby={yours ? carriesId : undefined}
                    onChange={(event) => toggle(texture.id, event.currentTarget.checked)}
                  />
                  <Check className={styles.tick} aria-hidden="true" />
                </span>
                <span className={styles.text}>
                  <span className={styles.name}>{texture.name}</span>
                  {yours && (
                    <span id={carriesId} className={styles.own}>
                      <span className={styles.badge}>Yours</span>
                      {carries && <span className={styles.carries}>{carries}</span>}
                    </span>
                  )}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
