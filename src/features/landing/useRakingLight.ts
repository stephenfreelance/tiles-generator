// The hand on the object: pointer x sweeps the key light, so every ridge throws a shadow that moves
// with it. It is the one gesture that proves the relief is geometry and not a photograph, and while
// it runs the cinematic drift stands down, so the hand replaces the loop instead of adding to it.
// Scrolling does the same thing more slowly: the light walks around the relief as the first screen
// leaves, which is how the object stays alive on the way down the page without ever moving itself.
import { useMotionValue, useMotionValueEvent, useSpring } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type PointerEventHandler } from 'react'
import { useMediaQuery } from '@/app/useMediaQuery'

/** Where the light rests with nothing driving it: TileViewport's own default azimuth. */
const REST_DEG = 35
/** The whole sweep, centered on rest: 13 degrees at the left edge of the object, 57 at the right. */
const SWEEP_DEG = 44
/** How far the light walks over one screen of scroll. Half the hand's sweep, and one way only. */
const SCROLL_DEG = 22
/** The angle is rounded to this, so a full sweep commits about 20 times instead of once a frame. */
const QUANTUM_DEG = 2
/** The spring-back plus its tail: how long the drift keeps out of the way after the hand leaves. */
const SETTLE_MS = 420
/** Short enough to feel attached to the hand, damped so a fast sweep never overshoots the range. */
const SPRING = { visualDuration: 0.25, bounce: 0 } as const

export interface RakingLight {
  /** Degrees for TileViewport's lightAngle. 35 whenever nothing is driving it. */
  angleDeg: number
  /** True while the hand is on the object, so the caller can stop the drift for the duration. */
  paused: boolean
  /** Spread onto the object. Empty where the gesture is not offered, so no listener is attached. */
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
  // A style-bound motion value ignores MotionConfig entirely, which is why `reduced` below, and not
  // the provider, is what keeps this still for a reader who asked for reduced motion instead.
  const smooth = useSpring(target, SPRING)
  const [angleDeg, setAngleDeg] = useState(REST_DEG)
  const [driven, setDriven] = useState(false)
  // Measured once per visit to the object: a rect read per pointermove is a layout flush per move.
  const boxRef = useRef<DOMRect | null>(null)
  const settleRef = useRef<number | undefined>(undefined)
  // Where the scroll has walked the light to, and whether the hand has taken it over.
  const scrollRef = useRef(0)
  const drivenRef = useRef(false)

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
      target.set(REST_DEG + scrollRef.current + (across - 0.5) * SWEEP_DEG)
      drivenRef.current = true
      setDriven(true)
    },
    [target],
  )

  const onPointerLeave = useCallback<PointerEventHandler<HTMLElement>>(() => {
    boxRef.current = null
    target.set(REST_DEG + scrollRef.current)
    // The drift waits for the spring to land, so the wall never starts turning mid-recovery.
    settleRef.current = window.setTimeout(() => {
      settleRef.current = undefined
      drivenRef.current = false
      setDriven(false)
    }, SETTLE_MS)
  }, [target])

  // The rect is held for as long as the hand stays on the object, and a resize moves it under it:
  // forget it so the next move measures again. Scroll cannot stale it: both it and clientX are
  // viewport coordinates.
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

  // One passive listener, quantized twice over: the walk is clamped to the first screen (past it the
  // object is off screen and its view has already stopped asking for frames), and a move under a
  // degree writes nothing, so a whole screen of scroll commits about twenty times.
  useEffect(() => {
    if (reduced) return
    const walk = () => {
      const screen = Math.max(1, window.innerHeight)
      const along = Math.min(1, Math.max(0, window.scrollY / screen))
      const next = along * SCROLL_DEG
      if (Math.abs(next - scrollRef.current) < 1) return
      scrollRef.current = next
      if (!drivenRef.current) target.set(REST_DEG + next)
    }
    walk()
    window.addEventListener('scroll', walk, { passive: true })
    return () => window.removeEventListener('scroll', walk)
  }, [reduced, target])

  // A device that turns coarse mid-visit (a tablet leaving its keyboard) keeps the scroll walk and
  // simply stops offering the hand.
  return {
    angleDeg: reduced ? REST_DEG : angleDeg,
    paused: offered && driven,
    handlers: offered ? { onPointerMove, onPointerLeave } : {},
  }
}
