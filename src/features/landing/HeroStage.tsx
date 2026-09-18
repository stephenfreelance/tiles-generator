// The object: the visitor's wall photographed on the page itself. No board, no frame, no panel.
// The page opens on the lamp already lit over the spot the wall will hang in; the render is built
// behind it and the lamp then dissolves off it in one long ramp, and the camera settles where that
// ramp ends. One continuous move, never a swap. The whole 3D stack stays off the first paint, so the
// page has something true on it from frame one.
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type TransitionEvent } from 'react'
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
 * The reveal: the lamp dissolving off the finished render, milliseconds. It is the only thing that
 * moves in the handover. The lamp is one opaque layer over an opaque canvas, so a single opacity ramp
 * on it takes the light down and brings the wall up together, with no second layer to keep in step
 * and nothing to mis-register. It is written onto the stage as --reveal, so the CSS ramp and the
 * timers below are one number.
 */
const REVEAL_MS = 1200
/**
 * The same dissolve for a reader who asked for less motion. Nothing travels, nothing scales and
 * nothing is staged: it is only long enough that the wall paints in rather than flashing on, which is
 * what a hard swap of two still pictures would be.
 */
const REVEAL_STILL_MS = 200
/** A ceiling on the reveal, over its own length: the ramp's own end event is what normally lands it. */
const REVEAL_CEILING_MS = 1600
/** Frames this cheap in a row mean the machine has the handover to spare. */
const QUIET_FRAMES = 3
const QUIET_BUDGET_MS = 50
/** A machine that never goes quiet still gets its wall: the reveal starts anyway. */
const QUIET_CEILING_MS = 1400
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
  // The reveal: the lamp starts coming off the wall.
  const [lit, setLit] = useState(false)
  // The far end of it: the render has the frame to itself, so the camera and the key light take over
  // from the ramp and the lamp stops being composited at all.
  const [settled, setSettled] = useState(false)
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
  const settleRef = useRef<number | undefined>(undefined)
  const frameRef = useRef<number | undefined>(undefined)
  const handedRef = useRef(false)
  const plateRef = useRef<HTMLImageElement>(null)
  const lampRef = useRef<HTMLDivElement>(null)

  const texture = textureById(config.texture.id)
  const revealMs = reduced ? REVEAL_STILL_MS : REVEAL_MS

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
    window.clearTimeout(settleRef.current)
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
  }, [])

  /**
   * The handover, started once and only once the machine can carry it. The frame the meshes land on
   * is also the frame that uploads them, compiles their shaders and fits the shadow map: a dissolve
   * begun on it does not play, it waits, and then jumps to wherever its clock has run to, which is
   * the cut this replaces. So the reveal waits for QUIET_FRAMES cheap frames in a row, which costs a
   * frame or two on a fast machine and exactly as long as it takes on a slow one, and starts anyway
   * at the ceiling so a machine that never goes quiet still gets its wall.
   *
   * Nothing in the view moves while the ramp runs: the camera and the key light hold at the first
   * frame of their own arrival until `settled`, so the dissolve plays over a still picture and costs
   * the machine nothing but the compositing. The move starts where the ramp ends, on its end event.
   */
  const handOver = useCallback(() => {
    if (handedRef.current) return
    handedRef.current = true
    const deadline = performance.now() + QUIET_CEILING_MS
    let last = performance.now()
    let calm = 0
    const step = (now: number) => {
      calm = now - last <= QUIET_BUDGET_MS ? calm + 1 : 0
      last = now
      if (calm < QUIET_FRAMES && now < deadline) {
        frameRef.current = requestAnimationFrame(step)
        return
      }
      frameRef.current = undefined
      setLit(true)
      // The ramp says when it is done rather than a second clock guessing, so the arrival starts on
      // the frame the light finishes leaving. The timer is only a ceiling, for a transition that never
      // reports (an interrupted one, or a browser that skipped it).
      settleRef.current = window.setTimeout(() => setSettled(true), revealMs + REVEAL_CEILING_MS)
    }
    frameRef.current = requestAnimationFrame(step)
  }, [revealMs])

  const land = useCallback((event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== 'opacity' || event.target !== lampRef.current) return
    window.clearTimeout(settleRef.current)
    setSettled(true)
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
      // The view has a wall to show: start the reveal as soon as the machine can carry it. Every later
      // rebuild lands here too, hence the once-only guard inside.
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

  // One number for the handover, read by the CSS ramp and by the timer above.
  const stageVars: StyleWithVars = { '--reveal': `${revealMs}ms` }

  return (
    <div className={styles.stage} style={stageVars}>
      <div
        className={styles.object}
        data-lit={lit || undefined}
        data-settled={settled || undefined}
        {...raking.handlers}
      >
        <div className={styles.canvas} data-pending={pending || undefined}>
          {live && (
            <Suspense fallback={null}>
              <HeroCanvas
                config={config}
                plan={plan}
                lightAngle={raking.angleDeg}
                paused={raking.paused}
                // Held at its first frame until the lamp is all the way off, so the dissolve plays over
                // a still picture and the move starts where the dissolve ends: one gesture, not two
                // competing for the same frames. The first frames of the arrival are the dearest this
                // view ever draws (a shadow map refit per degree of rake), and a ramp sharing them
                // with the arrival stalls and then steps, which is the cut this replaces.
                arrivalReady={settled}
                onPendingChange={handlePending}
              />
            </Suspense>
          )}
        </div>
        {/* The lamp: a pool of the page's own light over the spot the wall will hang in, with the
            wall's own colour standing in it, blurred past every edge it has. Not a picture of the
            render: a silhouette here would have to register against a live view that reframes with
            the window, and the miss showed as a hard outline around the whole wall at the swap. This
            has nothing to mis-register, and it is one layer over an opaque canvas, so the handover is
            one ramp on one thing. */}
        <div
          ref={lampRef}
          className={styles.lamp}
          aria-hidden="true"
          onTransitionEnd={lit && !settled ? land : undefined}
        >
          <img
            ref={plateRef}
            className={styles.plate}
            data-plate=""
            src={PLATE_SRC}
            alt=""
            width={1400}
            height={800}
            fetchPriority="high"
            decoding="sync"
            draggable={false}
          />
        </div>
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
