import { useEffect, useState, type RefObject } from 'react'

/** True while the element is on screen: what a pinned action bar waits for before showing itself. */
export function useOnScreen(ref: RefObject<Element | null>): boolean {
  const [onScreen, setOnScreen] = useState(true)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    // The whole element has to be there: a button half cut by the foot of the column is not reachable.
    const observer = new IntersectionObserver(
      (entries) => setOnScreen(entries[entries.length - 1].intersectionRatio >= 1),
      { threshold: 1 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return onScreen
}
