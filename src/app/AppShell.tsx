import { useEffect, useRef } from 'react'
import { Redo2, Undo2 } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useDesign } from '@/state/designStore'
import { HelpTip, IconButton } from '@/ui'
import styles from './AppShell.module.scss'
import { BrandMark } from './BrandMark'
import { DrawingTitle } from './DrawingTitle'
import { isTypingTarget, MOD_KEY } from './keyboard'
import { prefetchStudio } from './prefetchStudio'
import { ShortcutsHelp } from './ShortcutsHelp'
import { useAccentTheme } from './useAccentTheme'
import { useAnalytics } from './useAnalytics'
import { useDocumentTitle } from './useDocumentTitle'

// The studio carries the renderer, so pointing at its tab is enough to start fetching it.
const NAV: { to: string; label: string; prefetch?: () => void }[] = [
  { to: '/studio', label: 'Studio', prefetch: prefetchStudio },
  { to: '/history', label: 'History' },
]

const PAGE_TITLES: Record<string, string> = {
  '/': 'Tessera · 3D-printable relief tiles',
  '/download': 'Download files · Tessera',
  '/fit-test': 'Fit test · Tessera',
  '/history': 'Saved designs · Tessera',
}

/**
 * The workbench every screen is built on: a dark espresso bar carrying the name, the screens to move
 * between and, in the studio only, the undo tools, then the screen's own work below it.
 */
export function AppShell() {
  const { pathname } = useLocation()
  const designName = useDesign((s) => s.config.name)
  const undo = useDesign((s) => s.undo)
  const redo = useDesign((s) => s.redo)
  const canUndo = useDesign((s) => s.past.length > 0)
  const canRedo = useDesign((s) => s.future.length > 0)
  const helpRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLElement>(null)

  const isStudio = pathname === '/studio'
  useDocumentTitle(isStudio ? `${designName} · Studio · Tessera` : (PAGE_TITLES[pathname] ?? 'Not found · Tessera'))
  // Every screen, and every portal under body, takes its accent from the tile color.
  useAccentTheme()
  useAnalytics()

  // The running head casts nothing while the page is at its top: there is nothing under it yet, and a
  // shadow on the first screen only draws a line the design does not want. It lifts as soon as the page
  // moves under it. Written straight onto the node from a rAF-throttled passive listener, so scrolling
  // never costs a render; re-read on every route, because a new screen starts at its own scroll position.
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    let frame = 0
    const read = () => {
      frame = 0
      bar.toggleAttribute('data-lifted', window.scrollY > 2)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', schedule, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
    }
  }, [pathname])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return
      // Undo belongs to the bench it edits: elsewhere it would change a design the screen does not show.
      if (isStudio && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        // HelpTip keeps its own popover state, so the way in from a key is its trigger's own click.
        helpRef.current?.querySelector('button')?.click()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isStudio, undo, redo])

  return (
    <div className={styles.app} data-fill={isStudio || undefined}>
      <a className={styles.skipLink} href="#main-content">
        Skip to your wall
      </a>

      <header ref={barRef} className={styles.bar}>
        <Link to="/" className={styles.brand}>
          {/* The label: the mark on its espresso plate, exactly as the tab icon wears it, then the name. */}
          <span className={styles.markPlate} aria-hidden="true">
            <BrandMark />
          </span>
          <span className={styles.wordmark}>Tessera</span>
        </Link>

        {isStudio && (
          <>
            <span className={styles.barDivider} aria-hidden="true" />
            <DrawingTitle />
          </>
        )}

        <nav className={styles.nav} aria-label="Screens">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink)}
              onPointerEnter={item.prefetch}
              onFocus={item.prefetch}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.tools}>
          {isStudio && (
            <>
              <IconButton
                size="sm"
                icon={<Undo2 />}
                aria-label="Undo"
                shortcut={[MOD_KEY, 'Z']}
                tooltipSide="bottom"
                className={styles.barTool}
                disabled={!canUndo}
                onClick={undo}
              />
              <IconButton
                size="sm"
                icon={<Redo2 />}
                aria-label="Redo"
                shortcut={['Shift', MOD_KEY, 'Z']}
                tooltipSide="bottom"
                className={styles.barTool}
                disabled={!canRedo}
                onClick={redo}
              />
            </>
          )}
          <span ref={helpRef} className={styles.help}>
            <HelpTip label="Keyboard shortcuts" side="bottom" cap="?">
              <ShortcutsHelp isStudio={isStudio} />
            </HelpTip>
          </span>
        </div>
      </header>

      {/* The page's one main landmark, and what the skip link lands on: a div gave neither. */}
      <main id="main-content" className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
