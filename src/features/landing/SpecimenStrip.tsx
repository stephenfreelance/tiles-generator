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

/**
 * One lit sample. The picture on screen lags the one the strip is offered: a color change hands all 23
 * chips a freshly tinted PNG at once, and putting an image that has not decoded yet into 23 `src`
 * attributes is what makes the grid flinch. The incoming PNG is decoded first and only then put up, so
 * the chip already on the square holds it until its replacement can be painted in the same frame.
 *
 * The URL held is the one the strip was offered the render before, and it is held only as long as the
 * incoming PNG takes to decode: its picture is already decoded and on screen, so nothing is fetched
 * again even if the chip cache's LRU lets go of that URL in the meantime. A chip the strip stops
 * offering a URL for unmounts this and goes back to its placeholder, so a URL the cache has finished
 * with can never be put back up, and nothing but the browser's own image cache is kept alive.
 */
function Sample({ src }: { src: string }) {
  // The URL whose picture the browser holds decoded. The first one goes up as it arrives: an empty
  // square has nothing to protect.
  const [shown, setShown] = useState(src)

  useEffect(() => {
    if (src === shown) return
    let live = true
    const image = new Image()
    image.src = src
    // Decoded, the picture is in memory, so the swap below paints it without a gap. A rejected decode
    // swaps too, rather than leaving the old tint up for good: the element's own load is the retry.
    const swap = () => {
      if (live) setShown(src)
    }
    void image.decode().then(swap, swap)
    return () => {
      live = false
    }
  }, [src, shown])

  return (
    <>
      <img src={shown} alt="" draggable={false} decoding="async" />
      {/* The joints view is this same PNG laid four times: no second render, no new bytes. */}
      <span className={styles.joints} style={{ backgroundImage: `url("${shown}")` }} aria-hidden="true" />
    </>
  )
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
                {src ? <Sample src={src} /> : <span className={styles.pending} aria-hidden="true" />}
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
