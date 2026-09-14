import type { CSSProperties } from 'react'

/** Joins the truthy class names. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

/** Inline style that may carry CSS custom properties (the swatch colors, a progress fraction). */
export type StyleWithVars = CSSProperties & Record<`--${string}`, string | number>
