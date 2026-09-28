import { useLayoutEffect, useMemo } from 'react'
import { accentPalette, accentVariables, markTones } from '@/core/accent'
import { DEFAULT_COLOR, parseHex } from '@/core/colors'
import { useDesign } from '@/state/designStore'
import { useThemeColor } from '@/state/themeStore'
import { faviconSvg } from './mark'

/**
 * Paints the accent family, --filament and the mark's tones from the tile color on the root element,
 * and redraws the tab icon in the same color. The root, not the app's own wrapper: the legacy aliases
 * in _tokens.scss (--chalk, --accent-wash...) hold var() and resolve where :root declares them, and
 * portalled tooltips and dialogs live outside the app anyway. Values swap without a transition, so a
 * color change restyles the document once, not every frame.
 */
export function useAccentTheme(): void {
  const designColor = useDesign((s) => s.config.color)
  const override = useThemeColor((s) => s.override)
  const color = parseHex(override ?? designColor) ?? DEFAULT_COLOR
  const variables = useMemo(() => {
    const tones = markTones(color)
    return { ...accentVariables(accentPalette(color)), '--filament': color, '--mark': tones.whole, '--mark-cut': tones.cut }
  }, [color])

  // A layout effect, so the first paint after a color change already carries it.
  useLayoutEffect(() => {
    const { style } = document.documentElement
    for (const [name, value] of Object.entries(variables)) style.setProperty(name, value)
  }, [variables])

  // A data URL, so the icon needs no file and no base path; index.html's static one covers the first paint.
  useLayoutEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (icon) icon.href = `data:image/svg+xml,${encodeURIComponent(faviconSvg(color))}`
  }, [color])
}
