import { useEffect, useState } from 'react'

/** How long a rebuild has to run before it is worth saying so: below this it only reads as a flicker. */
export const PENDING_DELAY_MS = 200

/**
 * True only once `value` has stayed true for `delayMs` without a break, and false the instant it
 * drops, so work that finishes inside the delay never announces itself and a label cannot blink.
 * The reset sits in the effect's cleanup because that is precisely when the run it belongs to ends.
 */
export function useDelayedFlag(value: boolean, delayMs: number): boolean {
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (!value) return
    const timer = window.setTimeout(() => setHeld(true), delayMs)
    return () => {
      window.clearTimeout(timer)
      setHeld(false)
    }
  }, [value, delayMs])

  return held
}
