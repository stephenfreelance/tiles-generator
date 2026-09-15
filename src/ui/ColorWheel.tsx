import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { hsvToHex } from '@/core/colors'
import styles from './ColorWheel.module.scss'
import { cx, type StyleWithVars } from './cx'
import { hueSatText, hueSatToPoint, pointToHueSat, stepHueSat, type HueSat } from './wheelMath'

export interface ColorWheelProps {
  /** Degrees in [0, 360), clockwise from red at the top. */
  hue: number
  /** 0 at the centre, 1 at the rim. */
  saturation: number
  /** 0 to 1: darkens the disc, so it only offers colors the brightness allows. */
  brightness: number
  /** Every drag frame and arrow key press. */
  onChange: (next: HueSat) => void
  /** The drag was released or the arrow key let go: the gesture that changed the color is over. */
  onChangeEnd?: () => void
  disabled?: boolean
  /** Names the thumb for assistive technology. */
  'aria-label'?: string
  className?: string
}

/**
 * An HSV disc: hue by angle, saturation by radius, drawn with CSS gradients so it stays crisp at any
 * size. Press anywhere to pick, drag to steer; the thumb is a slider for the keyboard.
 */
export function ColorWheel({
  hue,
  saturation,
  brightness,
  onChange,
  onChangeEnd,
  disabled = false,
  'aria-label': ariaLabel = 'Hue and saturation',
  className,
}: ColorWheelProps) {
  const thumbRef = useRef<HTMLSpanElement>(null)
  const [dragging, setDragging] = useState(false)
  const at = hueSatToPoint({ h: hue, s: saturation })
  const vars: StyleWithVars = {
    '--thumb-x': `${at.x * 100}%`,
    '--thumb-y': `${at.y * 100}%`,
    '--thumb-color': hsvToHex({ h: hue, s: saturation, v: brightness }),
    '--dim': Math.min(1, Math.max(0, 1 - brightness)),
  }

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (!(box.width > 0 && box.height > 0)) return
    const point = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }
    onChange(pointToHueSat(point, hue))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return
    // No text selection and no focus jump to the disc: the thumb takes focus, so arrows follow on.
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    thumbRef.current?.focus({ preventScroll: true })
    setDragging(true)
    pick(event)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    // The capture, not the state flag: the first moves can land before the pointerdown re-render.
    if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event)
  }

  // Fires after pointerup releases the capture and after a cancel, so every drag ends exactly here.
  const onLostPointerCapture = () => {
    setDragging(false)
    onChangeEnd?.()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return
    const next = stepHueSat({ h: hue, s: saturation }, event)
    if (!next) return
    event.preventDefault()
    onChange(next)
  }

  const onKeyUp = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (!disabled && event.key.startsWith('Arrow')) onChangeEnd?.()
  }

  return (
    <div
      className={cx(styles.wheel, className)}
      style={vars}
      data-dragging={dragging || undefined}
      data-disabled={disabled || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onLostPointerCapture={onLostPointerCapture}
    >
      <span
        ref={thumbRef}
        className={styles.thumb}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(hue) % 360}
        aria-valuetext={hueSatText({ h: hue, s: saturation })}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        // Tab pressed while an arrow is held lets go on another control, so leaving ends the run too.
        onBlur={() => onChangeEnd?.()}
      />
    </div>
  )
}
