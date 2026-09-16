// The studio's preset colors as one radio group, then the wheel cell that reaches every other one.
import { useRef, useState } from 'react'
import { Popover, RadioGroup } from 'radix-ui'
import { COLOR_PRESETS, presetByHex } from '@/core/colors'
import { ColorPicker, type ColorChangeHint, type Hsv } from '@/ui'
import type { StyleWithVars } from '@/ui/cx'
import styles from './ColorStrip.module.scss'

export interface ColorStripProps {
  /** '#RRGGBB' the page shows right now; the matching preset reads as chosen. */
  color: string
  /** Every color the strip reaches, drag frames included: the wall and the accent follow this one. */
  onPick: (hex: string) => void
  /** The same color once the gesture behind it settled, for work a drag must not repeat 60 times a second. */
  onPickEnd: (hex: string) => void
}

export function ColorStrip({ color, onPick, onPickEnd }: ColorStripProps) {
  // No preset holds this hex, so the wheel cell is the chosen one and wears the color itself.
  const custom = presetByHex(color) === undefined
  // The picker unmounts on close; its HSV lives here so a color taken to black or gray reopens on its hue.
  const [hsv, setHsv] = useState<Hsv | null>(null)
  // The last hex a drag frame sent: the picker's end callback names the gesture, not the color it stopped on.
  const dragged = useRef<string | null>(null)
  const wheelStyle: StyleWithVars | undefined = custom ? { '--custom': color } : undefined

  // A swatch is picked and settled in the same breath.
  const choose = (hex: string) => {
    onPick(hex)
    onPickEnd(hex)
  }

  const steer = (hex: string, hint: ColorChangeHint) => {
    onPick(hex)
    // A coalesce key marks a frame of a drag or a key run: only its release settles. A typed code has settled.
    if (hint.coalesce) dragged.current = hex
    else onPickEnd(hex)
  }

  // Also runs when a dismissal unmounts the picker mid-drag, before its release reaches React.
  const settle = () => {
    if (dragged.current === null) return
    onPickEnd(dragged.current)
    dragged.current = null
  }

  return (
    // The group is the grid itself: a roving tab stop needs a box, which display: contents never makes.
    <RadioGroup.Root className={styles.strip} value={color} onValueChange={choose} loop aria-label="Tile color">
      {COLOR_PRESETS.map((preset) => (
        <RadioGroup.Item
          key={preset.hex}
          className={`${styles.item} ${styles.key}`}
          value={preset.hex}
          aria-label={preset.name}
        >
          <span className={styles.chip} style={{ background: preset.hex }} aria-hidden="true" />
          <span className={styles.name}>{preset.name}</span>
          <span className={styles.hex}>{preset.hex}</span>
        </RadioGroup.Item>
      ))}

      {/* The twelfth cell, and the group's one non-radio child: its name says it leads out of the eleven.
          Uncontrolled: unlike the studio's, this popover has no undo step to close on its way out. */}
      <Popover.Root
        onOpenChange={(open) => {
          if (!open) settle()
        }}
      >
        <Popover.Trigger
          className={`${styles.item} ${styles.key}`}
          style={wheelStyle}
          data-custom={custom || undefined}
          aria-label={custom ? `Any color, ${color}, opens a color picker` : 'Any color, opens a color picker'}
        >
          <span className={`${styles.chip} ${styles.wheel}`} aria-hidden="true" />
          <span className={styles.name}>Any color</span>
          {/* A color off the list has no name to read, so the cell shows the code instead of the hint. */}
          {custom ? <span className={styles.hex}>{color}</span> : <span className={styles.hint}>Wheel or hex</span>}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className={styles.popover}
            side="bottom"
            align="start"
            sideOffset={10}
            collisionPadding={12}
            aria-label="Any color"
          >
            <p className={styles.popoverTitle}>Any color</p>
            {/* Every frame of a drag paints; only its release is a pick the page has to answer in full. */}
            <ColorPicker value={color} onChange={steer} onChangeEnd={settle} hsv={hsv} onHsvChange={setHsv} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </RadioGroup.Root>
  )
}
