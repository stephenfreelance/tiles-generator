// The object: the visitor's wall photographed on the page itself. No board, no frame, no panel. The
// live render arrives once the browser has a spare moment and dissolves in over a plate of the wall's
// own color and light, so the whole 3D stack stays off the first paint and the page still has
// something true on it from frame one.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '@/app/useMediaQuery'
import { colorName } from '@/core/colors'
import { textureById } from '@/core/textures/registry'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { formatLength } from '@/core/units'
import type { StyleWithVars } from '@/ui/cx'
import { LANDING_SPECIMENS } from './landingDesign'
import { useRakingLight } from './useRakingLight'
import styles from './HeroStage.module.scss'

const HeroCanvas = lazy(() => import('./HeroCanvas'))

// From public/ rather than imported: a bundled copy's URL is content-hashed and lives inside this
// chunk, so the preload in index.html could not name it and this LCP fetch waited for the chunk.
const PLATE_SRC = `${import.meta.env.BASE_URL}hero-poster.webp`

/** Once the plate is on screen, but never later than this: the object is above the fold everywhere. */
const IDLE_MS = 300
/** A plate that never answers must not strand the page on a still image. */
const PLATE_CEILING_MS = 1500
/**
 * The dissolve from the plate to the live render, milliseconds. It is written onto the stage as
 * --plate-fade, so the CSS transition and the arrival below are one number: the arrival is armed the
 * frame the plate is gone. Long enough that no single frame of the handover carries a visible step,
 * and it runs under prefers-reduced-motion too: a dissolve between two still pictures moves nothing,
 * travels nowhere and has no direction, while the hard cut it replaces is a flash of the whole wall.
 */
const PLATE_FADE_MS = 560
/** A rest this long lays a relief on the object: long enough that crossing the keys lays nothing. */
const DWELL_MS = 320
/** No second preview inside this, and the committed relief comes back this long after the hand goes. */
const PREVIEW_FLOOR_MS = 600

export interface HeroStageProps {
  config: DesignConfig
  plan: LayoutPlan
  /** Index into LANDING_SPECIMENS, or -1 when the object shows a pairing no key offers. */
  specimenIndex: number
  onPickSpecimen: (index: number) => void
  /** Fine pointers only: a rest on a key lays that relief on the object without committing it. */
  onPreviewTexture: (textureId: string | null) => void
}

export function HeroStage({ config, plan, specimenIndex, onPickSpecimen, onPreviewTexture }: HeroStageProps) {
  const [live, setLive] = useState(false)
  const [pending, setPending] = useState(true)
  const [plateGone, setPlateGone] = useState(false)
  // The shared contract with TileViewport: the arrival holds at its first frame until this is true, so
  // the wall lays in where the visitor is looking at it rather than behind the plate.
  const [arrivalReady, setArrivalReady] = useState(false)
  const raking = useRakingLight()
  const fine = useMediaQuery('(pointer: fine)')
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  // The preview is a pointer affordance: not offered to a finger, and not to a reader who asked for
  // less motion, since relaying the wall is the largest movement on the page.
  const dwells = fine && !reduced

  // What the pointer is asking for against what the object was last told, so one rebuild runs at a time.
  const wantedRef = useRef<string | null>(null)
  const shownRef = useRef<string | null>(null)
  const floorRef = useRef(0)
  const pendingRef = useRef(true)
  const dwellRef = useRef<number | undefined>(undefined)
  const applyRef = useRef<number | undefined>(undefined)
  const armRef = useRef<number | undefined>(undefined)
  const frameRef = useRef<number | undefined>(undefined)
  const handedRef = useRef(false)
  const plateRef = useRef<HTMLImageElement>(null)

  const texture = textureById(config.texture.id)

  // The canvas is worth about 284 kB gz and the plate is this page's LCP element, so the download is
  // armed by the plate rather than by first paint: asking for both at once is the canvas taking
  // bandwidth off the only thing the visitor can see. An error arms it too, and a timer caps the wait.
  useEffect(() => {
    const plate = plateRef.current
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
    const ceiling = window.setTimeout(arm, PLATE_CEILING_MS)
    // A plate already decoded (back button, second visit) never fires load, hence the complete test.
    if (plate && !plate.complete) {
      plate.addEventListener('load', arm, { once: true })
      plate.addEventListener('error', arm, { once: true })
    } else {
      arm()
    }
    return () => {
      plate?.removeEventListener('load', arm)
      plate?.removeEventListener('error', arm)
      window.clearTimeout(ceiling)
      if (idle !== undefined) window.cancelIdleCallback(idle)
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => () => {
    window.clearTimeout(dwellRef.current)
    window.clearTimeout(applyRef.current)
    window.clearTimeout(armRef.current)
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
  }, [])

  // The handover, started once and only once the live wall is on screen. Two frames, not zero: the
  // frame the meshes land on is the frame that uploads them and draws the wall for the first time, and
  // a dissolve begun on it steps through that work instead of playing over it. Waiting for the browser
  // to paint costs a frame on a fast machine and exactly as long as it takes on a slow one.
  const handOver = useCallback(() => {
    if (handedRef.current) return
    handedRef.current = true
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = undefined
        setPlateGone(true)
        armRef.current = window.setTimeout(() => setArrivalReady(true), PLATE_FADE_MS)
      })
    })
  }, [])

  const applyPreview = useCallback(() => {
    applyRef.current = undefined
    if (wantedRef.current === shownRef.current) return
    // One rebuild in flight: a preview asked for while the object is meshing waits for that to land.
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
      // The view has a wall to show: dissolve the plate off it, and arm the arrival for the frame the
      // dissolve ends. Every later rebuild lands here too, hence the once-only guard inside.
      handOver()
      if (wantedRef.current !== shownRef.current) armPreview(floorRef.current)
    },
    [armPreview, handOver],
  )

  const startDwell = useCallback(
    (textureId: string) => {
      window.clearTimeout(dwellRef.current)
      // The object already wears this relief, so there is nothing to lay and no rebuild to pay for.
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

  // One number for the dissolve, read by the CSS transition and by the arrival timer above.
  const stageVars: StyleWithVars = { '--plate-fade': `${PLATE_FADE_MS}ms` }

  return (
    <div className={styles.stage} style={stageVars}>
      <div className={styles.object} {...raking.handlers}>
        <div className={styles.canvas} data-pending={pending || undefined}>
          {live && (
            <Suspense fallback={null}>
              <HeroCanvas
                config={config}
                plan={plan}
                lightAngle={raking.angleDeg}
                paused={raking.paused}
                arrivalReady={arrivalReady}
                onPendingChange={handlePending}
              />
            </Suspense>
          )}
        </div>
        {/* Not a picture of the render: a plate of the wall's own color and the light coming off it,
            blurred past every edge it has. The live view reframes by the width of the window, so a
            plate with a silhouette in it would have to register against a frame it cannot know, and
            the miss showed as a hard outline around the whole wall. A plate with no edges has nothing
            to mis-register: what dissolves away is light, and the render arrives into the same light. */}
        <img
          ref={plateRef}
          className={styles.plate}
          data-plate=""
          data-gone={plateGone || undefined}
          src={PLATE_SRC}
          alt=""
          width={1400}
          height={800}
          fetchPriority="high"
          decoding="sync"
          draggable={false}
        />
      </div>

      {/* The plate caption: what is standing there, and the other five it could be. Set as a caption
          to a photograph, on the page itself, because the object has no panel to be labelled inside. */}
      <div className={styles.index}>
        <p className={styles.caption}>
          <span className={styles.captionDot} style={{ background: config.color }} aria-hidden="true" />
          <span className={styles.captionName}>
            {texture.name} in {colorName(config.color)}
          </span>
          {/* Read off the plan, never typed. The grid, not the tally: the fit line beside the fields
              already counts the whole tiles and the cuts, and a caption to a photograph says what is
              in the frame. The landing lays every wall from the corner with no row offset, so columns
              times rows is exactly the number of tiles standing there. */}
          <span className={styles.captionNote}>
            {`${formatLength(config.tile.width)} tiles, ${plan.columns} across and ${plan.rows} down`}
          </span>
        </p>
        <div
          className={styles.keys}
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
                className={styles.key}
                // A color picked further down the page puts a pairing here that no key offers.
                aria-pressed={entryIndex === specimenIndex}
                aria-label={`Show ${entryTexture.name} in ${colorName(entry.color)}`}
                onClick={() => pickSpecimen(entryIndex)}
                onPointerEnter={dwells ? () => startDwell(entry.textureId) : undefined}
                onPointerLeave={dwells ? stopDwell : undefined}
              >
                <span className={styles.keySwatch} style={{ background: entry.color }} aria-hidden="true" />
                {entryTexture.name}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
