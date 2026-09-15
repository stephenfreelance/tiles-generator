import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { Popover } from 'radix-ui'
import { COLOR_PRESETS, colorName, presetByHex } from '@/core/colors'
import { useDesign } from '@/state/designStore'
import { ColorPicker, SwatchGrid, Tooltip, type ColorChangeHint, type Hsv } from '@/ui'
import type { StyleWithVars } from '@/ui/cx'
import { FieldGroup } from './FieldGroup'
import styles from './studio.module.scss'
import type { CellProps } from './types'

/** Choice 5: the color it prints in, which is also the color the whole screen takes on. */
export function ColorGroup({ config, update }: CellProps) {
  const { color } = config
  const custom = presetByHex(color) === undefined
  const [open, setOpen] = useState(false)
  // The picker unmounts on close; its HSV lives here so a color taken to black or grey reopens on its hue.
  const [hsvMemory, setHsvMemory] = useState<Hsv | null>(null)

  const choose = (hex: string, hint: ColorChangeHint = {}) =>
    update((design) => ({ ...design, color: hex }), hint.coalesce ? { coalesce: hint.coalesce } : undefined)
  // A released drag closes its undo step, so the next drag on the wheel is an undo of its own.
  const endGesture = (coalesce: string) => useDesign.getState().endEdit(coalesce)
  const onOpenChange = (next: boolean) => {
    if (!next) {
      // A dismissal (Escape, a press outside) can unmount the picker mid-gesture, before its release
      // reaches React; the store ignores a key that is not the open one.
      endGesture('color.wheel')
      endGesture('color.brightness')
    }
    setOpen(next)
  }

  // Once the color is custom the trigger wears it, so the chosen cell is never an empty ring.
  const customStyle: StyleWithVars | undefined = custom ? { '--custom': color } : undefined
  const trigger = (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Tooltip content={custom ? `Custom color ${color}` : 'Custom color'}>
        <Popover.Trigger
          className={styles.colorCustom}
          style={customStyle}
          data-custom={custom || undefined}
          aria-label={custom ? `Custom color, ${color}` : 'Custom color'}
        >
          {custom ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          className={styles.colorPopover}
          side="bottom"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          aria-label="Custom color"
        >
          <p className={styles.colorPopoverTitle}>Custom color</p>
          <ColorPicker
            value={color}
            onChange={choose}
            onChangeEnd={endGesture}
            coalesceKey="color"
            hsv={hsvMemory}
            onHsvChange={setHsvMemory}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )

  return (
    <FieldGroup step={5} title="Color">
      <div className={styles.colorChosen}>
        <span className={styles.colorSwatch} style={{ background: color }} aria-hidden="true" />
        <span className={styles.colorText}>
          <span className={styles.colorName}>{colorName(color)}</span>
          <span className={styles.colorHex}>{color}</span>
        </span>
      </div>

      <SwatchGrid
        className={styles.colorGrid}
        aria-label="Preset colors"
        items={COLOR_PRESETS}
        value={color}
        onChange={(hex) => choose(hex)}
        trailing={trigger}
      />
    </FieldGroup>
  )
}
