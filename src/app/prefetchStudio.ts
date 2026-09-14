// The studio's chunk carries the renderer, so it is warmed on intent rather than paid for on click.
let started = false

/** Starts fetching the studio route's chunk. Safe to call on every hover: it only ever runs once. */
export function prefetchStudio(): void {
  if (started) return
  started = true
  void import('@/pages/StudioPage')
}

/** Spread onto a link into the studio; a pointer and a tab stop both count as intent. */
export const studioIntent = { onPointerEnter: prefetchStudio, onFocus: prefetchStudio } as const
