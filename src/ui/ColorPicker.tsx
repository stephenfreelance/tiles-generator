import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Slider } from 'radix-ui'
import { hsvToHex, parseHex } from '@/core/colors'
import { ColorWheel } from './ColorWheel'
import styles from './ColorPicker.module.scss'
import { cx, type StyleWithVars } from './cx'
import { announce } from './toast'
import {
  BRIGHTNESS_LEVELS,
  brightnessLevel,
  dragBrightness,
  openingHsv,
  stepBrightness,
  syncHsv,
  type HueSat,
  type Hsv,
} from './wheelMath'

const HEX_ERROR = 'Use a hex code such as #C0582F'

export interface ColorChangeHint {
  /** Present for drag frames and key runs: pass it to `useDesign.update` so one gesture is one undo step. */
  coalesce?: string
}

export interface ColorPickerProps {
  /** The color as '#RRGGBB'. */
  value: string
  /** Every drag frame and key press (with a coalesce key), and each committed hex (without one). */
  onChange: (hex: string, hint: ColorChangeHint) => void
  /** A drag or key run ended; its coalesce key, for `useDesign.endEdit`. */
  onChangeEnd?: (coalesce: string) => void
  /** Prefix of the coalesce keys, so two pickers on one store never merge their edits. */
  coalesceKey?: string
  /** The HSV the last opening left: a host that unmounts the picker passes it back so a black keeps its hue. */
  hsv?: Hsv | null
  /** Every HSV the picker steers to, for the host to hand back as `hsv`. */
  onHsvChange?: (hsv: Hsv) => void
  className?: string
}

/**
 * Any color: a hue and saturation wheel, a brightness slider and a hex field. The picker keeps its own
 * HSV, because a hex forgets the hue of a grey or a black and dragging through either must not.
 */
export function ColorPicker({
  value,
  onChange,
  onChangeEnd,
  coalesceKey = 'color',
  hsv: memory,
  onHsvChange,
  className,
}: ColorPickerProps) {
  const baseId = `color${useId()}`
  const wheelKey = `${coalesceKey}.wheel`
  const brightnessKey = `${coalesceKey}.brightness`
  const [local, setLocal] = useState<Hsv>(() => openingHsv(memory, value))
  // Derived, not synced: the local state stands while it still makes the incoming hex (undo, a swatch
  // or a typed code replace it), so nothing re-renders twice and no effect chases the prop.
  const hsv = syncHsv(local, value)
  const [draft, setDraft] = useState<string | null>(null)
  // The text that last failed to read, so the error is spoken once per attempt rather than per blur.
  const [failed, setFailed] = useState<string | null>(null)
  const invalid = failed !== null
  const focusFromPointer = useRef(false)
  const brightnessThumb = useRef<HTMLSpanElement>(null)
  // A press on the knob: the stop and pointer x it began at, the knob's travel in px, and the stop last sent
  // (two moves can land before a re-render, so the rendered stop is not enough to skip a repeat).
  const grab = useRef<{ level: number; x: number; travel: number; last: number } | null>(null)

  const level = brightnessLevel(hsv.v)
  const brightness = Math.round(hsv.v * 100)
  const vars: StyleWithVars = { '--full': hsvToHex({ h: hsv.h, s: hsv.s, v: 1 }), '--chip': value }

  const steer = (next: Hsv, coalesce: string) => {
    setLocal(next)
    onHsvChange?.(next)
    // A drag answers the question the typed code asked, so a stale draft and its error go.
    setDraft(null)
    setFailed(null)
    onChange(hsvToHex(next), { coalesce })
  }

  const commitDraft = () => {
    if (draft === null) return
    const text = draft.trim()
    // An emptied field goes back to the color rather than guessing one.
    if (text === '') {
      setDraft(null)
      setFailed(null)
      return
    }
    const hex = parseHex(text)
    if (!hex) {
      // The last valid color stays; the text stays too, so the maker can fix a single typo.
      if (text !== failed) announce(HEX_ERROR)
      setFailed(text)
      return
    }
    setDraft(null)
    setFailed(null)
    if (hex !== value) onChange(hex, {})
  }

  const toLevel = (next: number, from = level) => {
    if (next !== from) steer({ ...hsv, v: next / BRIGHTNESS_LEVELS }, brightnessKey)
  }
  // Closes the brightness undo step; the store ignores it when that step is not the open one.
  const endBrightness = () => onChangeEnd?.(brightnessKey)

  const onSliderPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    // A new press never extends a key run or a drag the store still holds open.
    endBrightness()
    const thumb = brightnessThumb.current
    if (!thumb || event.target !== thumb) {
      grab.current = null
      return
    }
    const travel = event.currentTarget.getBoundingClientRect().width - thumb.getBoundingClientRect().width
    grab.current = { level, x: event.clientX, travel, last: level }
  }

  const onSliderPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    const held = grab.current
    if (!held || !brightnessThumb.current?.hasPointerCapture(event.pointerId)) return
    // Radix maps the pointer to a stop without the knob's in-bounds offset, so merely grabbing the knob
    // would move it; the knob follows the pointer from where it was taken instead.
    event.preventDefault()
    const next = dragBrightness(held.level, event.clientX - held.x, held.travel)
    toLevel(next, held.last)
    held.last = next
  }

  const onBrightnessKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    const next = stepBrightness(level, event)
    // A held key repeats keydown: only its first press opens a new undo step.
    if (!event.repeat && (next !== null || event.key === 'Home' || event.key === 'End')) endBrightness()
    if (next === null) return
    // Handled here, so Radix's own one-stop step never runs.
    event.preventDefault()
    toLevel(next)
  }

  const onHexKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
    } else if (event.key === 'Escape' && draft !== null) {
      // Escape abandons the draft; a popover around the picker still closes on it as well.
      setDraft(null)
      setFailed(null)
    }
  }

  return (
    <div className={cx(styles.picker, className)}>
      <ColorWheel
        className={styles.wheel}
        hue={hsv.h}
        saturation={hsv.s}
        brightness={hsv.v}
        onChange={(next: HueSat) => steer({ ...hsv, ...next }, wheelKey)}
        onChangeEnd={() => onChangeEnd?.(wheelKey)}
      />

      <div className={styles.brightness}>
        <div className={styles.head}>
          <span id={`${baseId}-brightness`} className={styles.label}>
            Brightness
          </span>
          <span className={styles.readout} aria-hidden="true">
            {brightness}%
          </span>
        </div>
        {/* One stop per byte of brightness: a nudge and back restores the exact hex, and presets stay presets. */}
        <Slider.Root
          className={styles.slider}
          style={vars}
          min={0}
          max={BRIGHTNESS_LEVELS}
          step={1}
          value={[level]}
          onValueChange={([next]) => toLevel(next)}
          onPointerDown={onSliderPointerDown}
          onPointerMove={onSliderPointerMove}
          // Radix captures the pointer on press and releases it on pointerup or cancel: every drag ends here.
          onLostPointerCapture={() => {
            grab.current = null
            endBrightness()
          }}
        >
          <Slider.Track className={styles.track} />
          <Slider.Thumb
            ref={brightnessThumb}
            className={styles.thumb}
            aria-labelledby={`${baseId}-brightness`}
            aria-valuetext={`${brightness} percent`}
            onKeyDown={onBrightnessKeyDown}
            onKeyUp={endBrightness}
            onBlur={endBrightness}
          />
        </Slider.Root>
      </div>

      <div className={styles.hex}>
        <label htmlFor={`${baseId}-hex`} className={styles.label}>
          Hex
        </label>
        <div className={styles.control} data-invalid={invalid || undefined} style={vars}>
          <span className={styles.chip} aria-hidden="true" />
          <input
            id={`${baseId}-hex`}
            className={styles.input}
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="done"
            maxLength={16}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${baseId}-hex-error` : undefined}
            value={draft ?? value}
            onChange={(event) => {
              setDraft(event.target.value)
              if (invalid && parseHex(event.target.value)) setFailed(null)
            }}
            onKeyDown={onHexKeyDown}
            onBlur={commitDraft}
            onPointerDown={() => {
              focusFromPointer.current = true
            }}
            onFocus={(event) => {
              // Tabbing in selects the code for retyping; a click keeps the caret where it landed.
              if (!focusFromPointer.current) event.currentTarget.select()
              focusFromPointer.current = false
            }}
          />
        </div>
        {invalid && (
          <p id={`${baseId}-hex-error`} className={styles.error}>
            <TriangleAlert className={styles.errorIcon} aria-hidden="true" />
            <span>{HEX_ERROR}</span>
          </p>
        )}
      </div>
    </div>
  )
}
