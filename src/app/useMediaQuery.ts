import { useCallback, useSyncExternalStore } from 'react'

/** Live answer to a media query, for the few choices CSS cannot make (a component prop, a mounted control). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia?.(query)
      if (!list) return () => {}
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  const matches = useCallback(() => window.matchMedia?.(query).matches ?? false, [query])
  return useSyncExternalStore(subscribe, matches)
}
