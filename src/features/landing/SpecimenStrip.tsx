// The specimen board: every relief in the catalog, rendered as a lit sample you can start from.
import { useEffect, useMemo, useRef, useState } from 'react'
import { TEXTURES } from '@/core/textures/registry'
import type { DesignConfig } from '@/core/types'
import { useTextureChips, type ChipItem } from '@/hooks'
import { PATTERN_CHIP_PX } from './chipBudget'
import styles from './SpecimenStrip.module.scss'

/** How far ahead of the grid the worker is asked for its 23 chips: a screen's warning on a phone. */
const LEAD_PX = 600

export interface SpecimenStripProps {
  /** The design the samples are rendered in: its tile size, depth range and color. */
  base: DesignConfig
  /** Draws every sample as four tiles, so the relief can be watched running across the joints. */
  showJoints: boolean
  /** The relief the visitor chose. The page owns the wall and the color, so it builds the link. */
  onPick: (textureId: string) => void
}

export function SpecimenStrip({ base, showJoints, onPick }: SpecimenStripProps) {
  const stripRef = useRef<HTMLUListElement>(null)
  // 23 lit samples are the page's heaviest work and every one of them starts below the fold, so the
  // hero's mesh and the LCP image get the worker and the main thread first.
  const [near, setNear] = useState(false)

  // The observer is the cheap half; the rect is the half that cannot be missed. A jump (a restored
  // scroll position, find-in-page, the skip link) can carry the grid into view without a scroll
  // event, and an observer that never fires would leave 23 blank squares, so both are watched.
  useEffect(() => {
    const element = stripRef.current
    if (near || !element) return
    const check = () => {
      const box = element.getBoundingClientRect()
      if (box.top < window.innerHeight + LEAD_PX && box.bottom > -LEAD_PX) setNear(true)
    }
    check()
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true)
      },
      { rootMargin: `${LEAD_PX}px` },
    )
    observer.observe(element)
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check, { passive: true })
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [near])

  const items = useMemo<ChipItem[]>(
    () =>
      near
        ? TEXTURES.map((texture) => ({
            key: texture.id,
            config: {
              ...base,
              texture: {
                ...base.texture,
                id: texture.id,
                depth: texture.defaults.depth,
                scale: texture.defaults.scale,
                params: {},
              },
            },
          }))
        : [],
    [base, near],
  )
  const chips = useTextureChips(base, items, PATTERN_CHIP_PX)

  return (
    <ul ref={stripRef} className={styles.strip} data-joints={showJoints ? '' : undefined}>
      {TEXTURES.map((texture) => {
        const src = chips.get(texture.id)
        return (
          <li key={texture.id}>
            <button
              type="button"
              className={styles.specimen}
              // The blurb used to hang in a hover tooltip: out of a finger's reach, and over the next row.
              aria-label={`${texture.name}. ${texture.blurb} Opens the studio with this pattern.`}
              onClick={() => onPick(texture.id)}
            >
              <span className={styles.sample}>
                {src ? (
                  <>
                    <img src={src} alt="" draggable={false} decoding="async" />
                    {/* The joints view is this same PNG laid four times: no second render, no new bytes. */}
                    <span className={styles.joints} style={{ backgroundImage: `url("${src}")` }} aria-hidden="true" />
                  </>
                ) : (
                  <span className={styles.pending} aria-hidden="true" />
                )}
              </span>
              <span className={styles.caption}>
                <span className={styles.name}>{texture.name}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
