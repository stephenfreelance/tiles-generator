// Ported from React Bits (github.com/DavidHDev/react-bits), component "Counter".
// Copyright (c) 2026 David Haz. MIT + Commons Clause License Condition v1.0: permission is granted to
// use, copy, modify, merge, publish and distribute this software as part of an application, provided
// this notice is kept. Selling, sublicensing or redistributing the components themselves, including as
// a ported version, is not granted.
//
// What changed: the original's Digit returned early for a '.' place and only then called useSpring,
// which eslint-plugin-react-hooks 7 rejects; the kit counts whole pieces, so the decimal place is
// gone and what is left is one NumericDigit whose hooks are unconditional. The inner `Number` was
// renamed (it shadowed the global), the black gradient masks became a mask-image so the fade works
// on any panel, every animated span is an `m` one because LazyMotion runs strict, and the roll is an
// animate() on a MotionValue: that ignores MotionConfig, so reduced motion is an explicit branch.
import { animate, m, useInView, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { cx } from '@/ui/cx'
import styles from './Odometer.module.scss'

export interface OdometerProps {
  /** A count of printed pieces: whole and positive. */
  value: number
  className?: string
}

/** One roll, inside the kit's 400 ms envelope. No bounce: a count of tiles is not springy. */
const ROLL = { type: 'spring', visualDuration: 0.34, bounce: 0 } as const

const NUMERALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

/** The count rolls by itself this long after mount, in view or not, so it can never read zero. */
const LATEST_ROLL_MS = 2600

/** Place columns from the number's own size, so 24 rolls two digits and never a leading zero. */
function placesOf(value: number): number[] {
  const columns: number[] = []
  for (let place = 1; place <= Math.max(1, value); place *= 10) columns.unshift(place)
  return columns
}

/** One of the ten glyphs in a column, held at its offset from whatever the column reads right now. */
function Numeral({ column, numeral }: { column: MotionValue<number>; numeral: number }) {
  const y = useTransform(column, (latest) => {
    const current = latest % 10
    const offset = (10 + numeral - current) % 10
    // Past halfway the short way round is upwards, which is what keeps 9 -> 0 rolling on.
    return `${offset > 5 ? offset * 100 - 1000 : offset * 100}%`
  })
  return (
    <m.span className={styles.numeral} style={{ y }}>
      {numeral}
    </m.span>
  )
}

/** One place of the number. Each column counts in its own place, so the ones spin while the tens turn. */
function NumericDigit({ place, value, rolling }: { place: number; value: number; rolling: boolean }) {
  const column = useMotionValue(0)
  const target = rolling ? Math.floor(value / place) : 0

  useEffect(() => {
    const controls = animate(column, target, ROLL)
    // StrictMode runs the effect twice: without this the second tween lands on top of the first.
    return () => controls.stop()
  }, [column, target])

  return (
    <span className={styles.digit}>
      {NUMERALS.map((numeral) => (
        <Numeral key={numeral} column={column} numeral={numeral} />
      ))}
    </span>
  )
}

/**
 * A count that rolls up to itself once, when it comes into view. The number is read as a number: it
 * is written out in the page beside the roll, where find-in-page, a selection and a screen reader all
 * reach it, and the ten-deep digit stack is decoration hidden from assistive technology and from paper.
 */
export function Odometer({ value, className }: OdometerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  // Once, and at 0.4: a count that re-rolls on every pass of the section is a fidget, not a fact.
  const inView = useInView(ref, { once: true, amount: 0.4 })
  // A count is a fact before it is an animation. A jump past the section (restored scroll, find-in-page)
  // never reports in view, so the roll runs anyway shortly after, rather than leaving the column on zero.
  const [late, setLate] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setLate(true), LATEST_ROLL_MS)
    return () => window.clearTimeout(timer)
  }, [])
  const rolling = inView || late
  const reduced = useReducedMotion()
  const count = Math.max(0, Math.round(value))
  const label = String(count)

  // animate() on a MotionValue never sees MotionConfig, so the quiet version is its own render.
  if (reduced) return <span className={cx(styles.odometer, className)}>{label}</span>

  return (
    <span ref={ref} className={cx(styles.odometer, className)}>
      {/* The figure itself: visually hidden, never display: none, so it stays findable and copyable. */}
      <span className={styles.plain}>{label}</span>
      <span className={styles.stack} aria-hidden="true">
        {placesOf(count).map((place) => (
          <NumericDigit key={place} place={place} value={count} rolling={rolling} />
        ))}
      </span>
    </span>
  )
}
