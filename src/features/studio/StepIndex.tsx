import { useCallback, useEffect, useRef, useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { Tooltip } from '@/ui'
import { cx } from '@/ui/cx'
import { PLAN_SECTION_ID, stepSectionId } from './stepIds'
import styles from './studio.module.scss'

/**
 * Each step by its own heading, word for word. Eight names do not fit the column's width (579 px of
 * them against 494 at the widest rail), so the row shows the numbers the headings already wear and
 * spells out only the step being read; the rest are named on hover and to assistive tech.
 */
const STEPS = [
  { step: 1, label: 'Your wall' },
  { step: 2, label: 'Tile size' },
  { step: 3, label: 'Thickness' },
  { step: 4, label: 'Texture' },
  { step: 5, label: 'Color' },
  { step: 6, label: 'Edges' },
  { step: 7, label: 'Putting it up' },
] as const

const PLAN_LABEL = 'Tiling plan'

type Place = number | 'plan'

/** How far down the visible column a heading has to come before its step counts as the one being read. */
const READ_LINE = 0.3

/** A jump scrolls past every step between; the index holds the one asked for until the scroll has landed. */
const JUMP_HOLD_MS = 800

/** The rail scrolls on its own from this width; below it the window does (StudioPage.module.scss). */
const OWN_SCROLL = '(min-width: 1100px)'

function sectionFor(place: Place): HTMLElement | null {
  return document.getElementById(place === 'plan' ? PLAN_SECTION_ID : stepSectionId(place))
}

export interface StepIndexProps {
  /** The column the steps scroll in on a wide screen. */
  scroller: HTMLElement | null
}

/**
 * The seven questions at a glance, and a way straight to any of them: the column is four screens long,
 * and a maker who has chosen a wall and wants to try a color should not have to scroll past three
 * steps to find it. It follows the reading, marking the step whose heading has crossed a line near the
 * top of what is visible, and it ends on the plan, which is the answer the seven steps add up to.
 */
export function StepIndex({ scroller }: StepIndexProps) {
  const [current, setCurrent] = useState<Place>(1)
  const navRef = useRef<HTMLElement>(null)
  const holdRef = useRef(0)

  useEffect(() => {
    if (!scroller) return
    const wide = window.matchMedia(OWN_SCROLL)
    let frame = 0
    const measure = () => {
      frame = 0
      if (performance.now() < holdRef.current) return
      const own = wide.matches
      const top = own ? scroller.getBoundingClientRect().top : 0
      const height = own ? scroller.clientHeight : window.innerHeight
      const index = navRef.current?.getBoundingClientRect().height ?? 0
      const line = top + index + (height - index) * READ_LINE
      let next: Place = 1
      for (const { step } of STEPS) {
        const section = sectionFor(step)
        if (section && section.getBoundingClientRect().top <= line) next = step
      }
      const plan = sectionFor('plan')
      if (plan && plan.getBoundingClientRect().top <= line) next = 'plan'
      setCurrent(next)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    scroller.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    wide.addEventListener('change', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      scroller.removeEventListener('scroll', schedule)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      wide.removeEventListener('change', schedule)
    }
  }, [scroller])

  const jump = useCallback(
    (place: Place) => {
      const section = sectionFor(place)
      if (!section) return
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const behavior: ScrollBehavior = reduced ? 'auto' : 'smooth'
      const margin = Number.parseFloat(getComputedStyle(section).scrollMarginTop) || 0
      holdRef.current = performance.now() + (reduced ? 0 : JUMP_HOLD_MS)
      setCurrent(place)
      // Only the column that holds the steps is scrolled. scrollIntoView would scroll every ancestor it
      // can, and the studio's own frame is overflow: hidden, which a script may still scroll: the whole
      // bench slid up under the window and took the bar with it.
      if (scroller && window.matchMedia(OWN_SCROLL).matches) {
        const top = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
        scroller.scrollTo({ top: top - margin, behavior })
      } else {
        window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - margin, behavior })
      }
      // Keyboard reading carries on from the step it was sent to, not from the index.
      section.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
    },
    [scroller],
  )

  return (
    <nav ref={navRef} className={styles.stepIndex} aria-label="Steps">
      <ol className={styles.stepList}>
        {STEPS.map(({ step, label }) => (
          <li key={step}>
            <Tooltip content={label} side="bottom" disabled={current === step}>
              <button
                type="button"
                className={styles.stepLink}
                aria-current={current === step ? 'step' : undefined}
                onClick={() => jump(step)}
              >
                <span className={styles.stepLinkNo} aria-hidden="true">
                  {step}
                </span>
                <span className={styles.stepLinkLabel}>{label}</span>
              </button>
            </Tooltip>
          </li>
        ))}
        <li className={styles.stepPlanItem}>
          <Tooltip content={PLAN_LABEL} side="bottom" disabled={current === 'plan'}>
            <button
              type="button"
              className={cx(styles.stepLink, styles.stepPlan)}
              aria-current={current === 'plan' ? 'location' : undefined}
              onClick={() => jump('plan')}
            >
              <LayoutGrid className={styles.stepPlanIcon} aria-hidden="true" />
              <span className={styles.stepLinkLabel}>{PLAN_LABEL}</span>
            </button>
          </Tooltip>
        </li>
      </ol>
    </nav>
  )
}
