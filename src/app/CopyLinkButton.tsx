import { Link2 } from 'lucide-react'
import { useHref, useLocation } from 'react-router'
import type { DesignConfig } from '@/core/types'
import { Button, IconButton, toast } from '@/ui'
import { toSearch } from './designLink'

const LABEL = 'Copy link to this design'

export interface CopyLinkButtonProps {
  config: DesignConfig
  /** icon: an instrument in the header strip. text: a line written on the sheet. */
  as?: 'text' | 'icon'
  className?: string
}

/** Copies a link carrying this whole design, so it can be sent on or opened on another device. */
export function CopyLinkButton({ config, as = 'text', className }: CopyLinkButtonProps) {
  const { pathname } = useLocation()
  // The router's pathname has its basename stripped; the href puts the build's base back on.
  const href = useHref(pathname)

  const copy = async () => {
    const link = `${window.location.origin}${href}?${toSearch(config)}`
    try {
      await navigator.clipboard.writeText(link)
      toast('Link copied. It carries the wall, the tile, the relief and the color.', { tone: 'success' })
    } catch {
      toast('This browser would not let Tessera reach the clipboard. Copy the address bar instead.', { tone: 'error' })
    }
  }

  if (as === 'icon') {
    return (
      <IconButton
        size="sm"
        icon={<Link2 />}
        aria-label={LABEL}
        tooltipSide="bottom"
        className={className}
        onClick={() => void copy()}
      />
    )
  }

  return (
    <Button variant="ghost" size="sm" leadingIcon={<Link2 />} className={className} onClick={() => void copy()}>
      {LABEL}
    </Button>
  )
}
