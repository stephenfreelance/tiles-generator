import { useCallback, useState, type RefCallback } from 'react'

export interface ElementSize {
  width: number
  height: number
}

/** The measured box of an element, kept live by a ResizeObserver: the drawing scales to its frame. */
export function useElementSize<T extends Element>(): [RefCallback<T>, ElementSize] {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })

  const ref = useCallback<RefCallback<T>>((node) => {
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1].contentRect
      // Sub-pixel jitter would redraw the whole plan for nothing.
      setSize((prev) =>
        Math.abs(prev.width - box.width) < 0.5 && Math.abs(prev.height - box.height) < 0.5
          ? prev
          : { width: box.width, height: box.height },
      )
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, size]
}
