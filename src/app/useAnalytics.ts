import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { usePrefs } from '@/state/prefsStore'
import { toast } from '@/ui'
import { toggleFromHash, track, trackPageview } from './analytics'

/** Counts each screen as it opens, and the first switch to the single tile in a visit. Mounted once, in AppShell. */
export function useAnalytics(): void {
  const { pathname } = useLocation()

  // Before the first count, so the visit that switches counting off is not counted either.
  useEffect(() => {
    const state = toggleFromHash()
    if (state === 'off') toast('This browser is no longer counted by Tessera’s visit counter.', { tone: 'info' })
    if (state === 'on') toast('This browser is counted again by Tessera’s visit counter.', { tone: 'info' })
  }, [])

  useEffect(() => trackPageview(pathname), [pathname])

  useEffect(
    () =>
      usePrefs.subscribe((next, previous) => {
        if (next.viewMode === 'tile' && previous.viewMode !== 'tile') track('studio-view-tile', { once: true })
      }),
    [],
  )
}
