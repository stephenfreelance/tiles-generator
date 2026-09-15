import { useLayoutEffect, useMemo } from 'react'
import { accentPalette, accentVariables } from '@/core/accent'
import { DEFAULT_COLOR, parseHex } from '@/core/colors'
import { useDesign } from '@/state/designStore'
import { useThemeColor } from '@/state/themeStore'

/**
 * Paints the accent family and --filament from the tile color on the root element. The root, not the
 * app's own wrapper: the legacy aliases in _tokens.scss (--chalk, --accent-wash...) hold var() and
 * resolve where :root declares them, and portalled tooltips and dialogs live outside the app anyway.
 * Values swap without a transition, so a color change restyles the document once, not every frame.
 */
export function useAccentTheme(): void {
  const designColor = useDesign((s) => s.config.color)
  const override = useThemeColor((s) => s.override)
  const color = parseHex(override ?? designColor) ?? DEFAULT_COLOR
  const variables = useMemo(() => ({ ...accentVariables(accentPalette(color)), '--filament': color }), [color])

  // A layout effect, so the first paint after a color change already carries it.
  useLayoutEffect(() => {
    const { style } = document.documentElement
    for (const [name, value] of Object.entries(variables)) style.setProperty(name, value)
  }, [variables])
}
