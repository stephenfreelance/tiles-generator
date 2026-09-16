// The stage: the visitor's wall under a warm lamp, on a board that answers the hand. The live render
// arrives once the browser has a spare moment and fades in over a poster of itself, so the whole 3D
// stack stays off the first paint and the board still has something true on it from the first frame.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '@/app/useMediaQuery'
import { colorName } from '@/core/colors'
import { textureById } from '@/core/textures/registry'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { LANDING_SPECIMENS } from './landingDesign'
import { useRakingLight } from './useRakingLight'
import styles from './HeroStage.module.scss'

const HeroCanvas = lazy(() => import('./HeroCanvas'))

// From public/ rather than imported: a bundled copy's URL is content-hashed and lives inside this
// chunk, so the preload in index.html could not name it and this LCP fetch waited for the chunk.
const POSTER_SRC = `${import.meta.env.BASE_URL}hero-poster.webp`

/** Once the poster is on screen, but never later than this: the board is above the fold on both breakpoints. */
const IDLE_MS = 300
/** A poster that never answers must not strand the board on a still image. */
const POSTER_CEILING_MS = 1500
/** A rest this long lays a relief on the board: long enough that crossing the keys lays nothing. */
const DWELL_MS = 320
/** No second preview inside this, and the committed relief comes back this long after the hand goes. */
const PREVIEW_FLOOR_MS = 600

export interface HeroStageProps {
  config: DesignConfig
  plan: LayoutPlan
  /** Index into LANDING_SPECIMENS, or -1 when the board shows a pairing no key offers. */
  specimenIndex: number
  onPickSpecimen: (index: number) => void
  /** Fine pointers only: a rest on a key lays that relief on the board without committing it. */
  onPreviewTexture: (textureId: string | null) => void
}

export function HeroStage({ config, plan, specimenIndex, onPickSpecimen, onPreviewTexture }: HeroStageProps) {
  const [live, setLive] = useState(false)
  const [pending, setPending] = useState(true)
  const [posterGone, setPosterGone] = useState(false)
  const raking = useRakingLight()
  const fine = useMediaQuery('(pointer: fine)')
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  // The preview is a pointer affordance: not offered to a finger, and not to a reader who asked for
  // less motion, since relaying the wall is the largest movement on the page.
  const dwells = fine && !reduced

  // What the pointer is asking for against what the board was last told, so one rebuild runs at a time.
  const wantedRef = useRef<string | null>(null)
  const shownRef = useRef<string | null>(null)
  const floorRef = useRef(0)
  const pendingRef = useRef(true)
  const dwellRef = useRef<number | undefined>(undefined)
  const applyRef = useRef<number | undefined>(undefined)
  const posterRef = useRef<HTMLImageElement>(null)

  const texture = textureById(config.texture.id)

  // The canvas is worth about 284 kB gz and the poster is this page's LCP element, so the download is
  // armed by the poster rather than by first paint: asking for both at once is the canvas taking
  // bandwidth off the only thing the visitor can see. An error arms it too, and a timer caps the wait.
  useEffect(() => {
    const poster = posterRef.current
    let idle: number | undefined
    let timer: number | undefined
    let armed = false
    const start = () => setLive(true)
    const arm = () => {
      if (armed) return
      armed = true
      // requestIdleCallback is missing on older Safari, hence the plain timer beside it.
      if (typeof window.requestIdleCallback === 'function') {
        idle = window.requestIdleCallback(start, { timeout: IDLE_MS })
      } else {
        timer = window.setTimeout(start, IDLE_MS)
      }
    }
    const ceiling = window.setTimeout(arm, POSTER_CEILING_MS)
    // A poster already decoded (back button, second visit) never fires load, hence the complete test.
    if (poster && !poster.complete) {
      poster.addEventListener('load', arm, { once: true })
      poster.addEventListener('error', arm, { once: true })
    } else {
      arm()
    }
    return () => {
      poster?.removeEventListener('load', arm)
      poster?.removeEventListener('error', arm)
      window.clearTimeout(ceiling)
      if (idle !== undefined) window.cancelIdleCallback(idle)
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => () => {
    window.clearTimeout(dwellRef.current)
    window.clearTimeout(applyRef.current)
  }, [])

  const applyPreview = useCallback(() => {
    applyRef.current = undefined
    if (wantedRef.current === shownRef.current) return
    // One rebuild in flight: a preview asked for while the board is meshing waits for that to land.
    if (pendingRef.current) return
    shownRef.current = wantedRef.current
    floorRef.current = performance.now() + PREVIEW_FLOOR_MS
    onPreviewTexture(wantedRef.current)
  }, [onPreviewTexture])

  const armPreview = useCallback(
    (at: number) => {
      window.clearTimeout(applyRef.current)
      applyRef.current = window.setTimeout(applyPreview, Math.max(0, at - performance.now()))
    },
    [applyPreview],
  )

  const requestPreview = useCallback(
    (textureId: string | null, delayMs: number) => {
      wantedRef.current = textureId
      armPreview(Math.max(floorRef.current, performance.now() + delayMs))
    },
    [armPreview],
  )

  const handlePending = useCallback(
    (next: boolean) => {
      pendingRef.current = next
      setPending(next)
      if (next) return
      // The first wall the board draws is the one the poster is a picture of: hand over here.
      setPosterGone(true)
      if (wantedRef.current !== shownRef.current) armPreview(floorRef.current)
    },
    [armPreview],
  )

  const startDwell = useCallback(
    (textureId: string) => {
      window.clearTimeout(dwellRef.current)
      // The board already wears this relief, so there is nothing to lay and no rebuild to pay for.
      if (textureId === config.texture.id) return
      dwellRef.current = window.setTimeout(() => requestPreview(textureId, 0), DWELL_MS)
    },
    [config.texture.id, requestPreview],
  )

  const stopDwell = useCallback(() => window.clearTimeout(dwellRef.current), [])

  const endPreview = useCallback(() => {
    window.clearTimeout(dwellRef.current)
    requestPreview(null, PREVIEW_FLOOR_MS)
  }, [requestPreview])

  const pickSpecimen = useCallback(
    (index: number) => {
      window.clearTimeout(dwellRef.current)
      window.clearTimeout(applyRef.current)
      applyRef.current = undefined
      wantedRef.current = null
      shownRef.current = null
      // A commit is itself a rebuild, so it starts the floor: no dwell may stomp on it.
      floorRef.current = performance.now() + PREVIEW_FLOOR_MS
      onPreviewTexture(null)
      onPickSpecimen(index)
    },
    [onPickSpecimen, onPreviewTexture],
  )

  return (
    <div className={styles.stage}>
      <div className={styles.board} {...raking.handlers}>
        <div className={styles.canvas} data-pending={pending || undefined}>
          {live && (
            <Suspense fallback={null}>
              <HeroCanvas
                config={config}
                plan={plan}
                lightAngle={raking.angleDeg}
                paused={raking.paused}
                onPendingChange={handlePending}
              />
            </Suspense>
          )}
        </div>
        {/* A capture of this same board, sheen and all, which is why it sits over the sheen rather than
            under it. The wall it shows is the wall the page starts on, so the handover has nothing to jump. */}
        <img
          ref={posterRef}
          className={styles.poster}
          data-gone={posterGone || undefined}
          src={POSTER_SRC}
          alt=""
          width={1280}
          height={880}
          fetchPriority="high"
          decoding="sync"
          draggable={false}
        />
        <p className={styles.pill}>
          <span className={styles.pillDot} style={{ background: config.color }} aria-hidden="true" />
          <span className={styles.pillText}>
            <span className={styles.pillName}>{texture.name}</span>
            <span className={styles.pillNote}>in {colorName(config.color)}</span>
          </span>
        </p>
      </div>
      <div
        className={styles.picker}
        role="group"
        aria-label="Choose a sample"
        onPointerLeave={dwells ? endPreview : undefined}
      >
        {LANDING_SPECIMENS.map((entry, entryIndex) => {
          const entryTexture = textureById(entry.textureId)
          return (
            <button
              key={entry.textureId}
              type="button"
              className={styles.pick}
              // A color picked further down the page puts a pairing on the board that no key offers.
              aria-pressed={entryIndex === specimenIndex}
              aria-label={`Show ${entryTexture.name} in ${colorName(entry.color)}`}
              onClick={() => pickSpecimen(entryIndex)}
              onPointerEnter={dwells ? () => startDwell(entry.textureId) : undefined}
              onPointerLeave={dwells ? stopDwell : undefined}
            >
              <span className={styles.pickSwatch} style={{ background: entry.color }} aria-hidden="true" />
              {entryTexture.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
