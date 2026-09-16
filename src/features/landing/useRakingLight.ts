// The hand on the board: pointer x sweeps the key light, so every ridge throws a shadow that moves
// with it. It is the one gesture that proves the relief is geometry and not a photograph, and while
// it runs the cinematic orbit stands down, so the hand replaces the loop instead of adding to it.
import { useMotionValue, useMotionValueEvent, useSpring } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEventHandler } from 'react'
import { useMediaQuery } from '@/app/useMediaQuery'

/** Where the light rests with no hand on the board: TileViewport's own default azimuth. */
const REST_DEG = 35
/** The whole sweep, centered on rest: 13 degrees at the left edge of the board, 57 at the right. */
const SWEEP_DEG = 44
/** The angle is rounded to this, so a full sweep commits about 20 times instead of once a frame. */
const QUANTUM_DEG = 2
/** The spring-back plus its tail: how long the orbit keeps out of the way after the hand leaves. */
const SETTLE_MS = 420
/** Short enough to feel attached to the hand, damped so a fast sweep never overshoots the range. */
const SPRING = { visualDuration: 0.25, bounce: 0 } as const

export interface RakingLight {
  /** Degrees for TileViewport's lightAngle. 35 whenever no hand is driving it. */
  angleDeg: number
  /** True while the hand is on the board, so the caller can stop the orbit for the duration. */
  paused: boolean
  /** Spread onto the board. Empty where the gesture is not offered, so no listener is attached. */
  handlers: {
    onPointerMove?: PointerEventHandler<HTMLElement>
    onPointerLeave?: PointerEventHandler<HTMLElement>
  }
}

export function useRakingLight(): RakingLight {
  // A finger cannot hover, and a moving light is motion nobody asked for: neither gets the listener.
  const fine = useMediaQuery('(pointer: fine)')
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const offered = fine && !reduced

  const target = useMotionValue(REST_DEG)
  // A style-bound motion value ignores MotionConfig entirely, which is why `offered` above, and not
  // the provider, is what keeps this still for a reader who asked for reduced motion instead.
  const smooth = useSpring(target, SPRING)
  const [angleDeg, setAngleDeg] = useState(REST_DEG)
  const [driven, setDriven] = useState(false)
  // Measured once per visit to the board: a rect read per pointermove is a layout flush per move.
  const boxRef = useRef<DOMRect | null>(null)
  const settleRef = useRef<number | undefined>(undefined)

  useMotionValueEvent(smooth, 'change', (value) => {
    const next = Math.round(value / QUANTUM_DEG) * QUANTUM_DEG
    // React bails out on an unchanged value, so the frames inside one quantum cost no commit at all.
    setAngleDeg((current) => (current === next ? current : next))
  })

  const onPointerMove = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      window.clearTimeout(settleRef.current)
      settleRef.current = undefined
      const box = boxRef.current ?? event.currentTarget.getBoundingClientRect()
      boxRef.current = box
      if (box.width <= 0) return
      const across = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
      target.set(REST_DEG + (across - 0.5) * SWEEP_DEG)
      setDriven(true)
    },
    [target],
  )

  const onPointerLeave = useCallback<PointerEventHandler<HTMLElement>>(() => {
    boxRef.current = null
    target.set(REST_DEG)
    // The orbit waits for the spring to land, so the wall never starts turning mid-recovery.
    settleRef.current = window.setTimeout(() => {
      settleRef.current = undefined
      setDriven(false)
    }, SETTLE_MS)
  }, [target])

  // The rect is held for as long as the hand stays on the board, and a resize moves the board under it:
  // forget it so the next move measures again. Scroll cannot stale it: both it and clientX are viewport
  // coordinates.
  useEffect(() => {
    const forget = () => {
      boxRef.current = null
    }
    window.addEventListener('resize', forget)
    return () => {
      window.removeEventListener('resize', forget)
      window.clearTimeout(settleRef.current)
    }
  }, [])

  const handlers = useMemo(
    () => (offered ? { onPointerMove, onPointerLeave } : {}),
    [offered, onPointerMove, onPointerLeave],
  )

  // A device that turns coarse mid-visit (a tablet leaving its keyboard) hands the light back to rest.
  return { angleDeg: offered ? angleDeg : REST_DEG, paused: offered && driven, handlers }
}
