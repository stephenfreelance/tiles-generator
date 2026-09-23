// The object: the visitor's wall standing on the page, photographed rather than rendered. It is built
// from the same printed relief chips the pieces plate is built from (four CPU renders cover a wall of
// any size), so the whole 3D stack is off this route: nothing to download, nothing to compile, nothing
// to hand over from a poster. What is left to do here is stand the wall in the room: turn it a few
// degrees off square, let it answer the hand and the scroll, and caption it.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useMediaQuery } from '@/app/useMediaQuery'
import { colorName } from '@/core/colors'
import { textureById } from '@/core/textures/registry'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { formatLength } from '@/core/units'
import type { StyleWithVars } from '@/ui/cx'
import { HeroWall } from './HeroWall'
import { LANDING_SPECIMENS } from './landingDesign'
import { wallRatio } from './wallGrid'
import styles from './HeroStage.module.scss'

/** How far the hand may turn the wall, degrees, over its own resting turn. */
const TURN_DEG = 5
/** And how far it may drop the eye under it, or lift it over. */
const LIFT_DEG = 2.6
/** A rest this long lays a relief on the object: long enough that crossing the keys lays nothing. */
const DWELL_MS = 280
/** How far down the first screen the wall has settled all the way back into the room. */
const SETTLE_SCREENS = 0.9

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
  const fine = useMediaQuery('(pointer: fine)')
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  // The parallax is a pointer affordance, and it is motion: not offered to a finger, and not to a
  // reader who asked for less of it. The wall keeps its resting turn either way, because a thing
  // standing at an angle is a composition, not an animation.
  const turns = fine && !reduced
  const dwells = fine && !reduced

  const frameRef = useRef<HTMLDivElement>(null)
  const dwellRef = useRef<number | undefined>(undefined)
  const rafRef = useRef<number | undefined>(undefined)
  const wantRef = useRef<{ turn: number; lift: number } | null>(null)
  // What the pointer last asked for, so a move that changes nothing costs no write at all.
  const [previewing, setPreviewing] = useState<string | null>(null)

  const write = useCallback((turn: number, lift: number) => {
    const frame = frameRef.current
    if (!frame) return
    frame.style.setProperty('--turn', `${turn.toFixed(2)}`)
    frame.style.setProperty('--lift', `${lift.toFixed(2)}`)
  }, [])

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const box = event.currentTarget.getBoundingClientRect()
      if (box.width <= 0 || box.height <= 0) return
      const across = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) - 0.5
      const down = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)) - 0.5
      // One write per frame at most: a pointermove can fire far faster than the compositor draws.
      wantRef.current = { turn: across * 2 * TURN_DEG, lift: -down * 2 * LIFT_DEG }
      if (rafRef.current !== undefined) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = undefined
        const want = wantRef.current
        if (want) write(want.turn, want.lift)
      })
    },
    [write],
  )

  const onPointerLeave = useCallback(() => {
    wantRef.current = null
    write(0, 0)
  }, [write])

  // The wall settles back into the room as the first screen leaves: one passive listener writing one
  // number, read by the transform in CSS, so the scroll never commits React state. Quantized to a
  // hundredth, which is about twenty writes over a screen. The same number stands the sheen down once
  // the hero is behind the reader: a loop nobody can see is a loop nobody should be paying for.
  useEffect(() => {
    if (reduced) return
    let last = -1
    const walk = () => {
      const screen = Math.max(1, window.innerHeight) * SETTLE_SCREENS
      const along = Math.round(Math.min(1, Math.max(0, window.scrollY / screen)) * 100) / 100
      if (along === last) return
      last = along
      const frame = frameRef.current
      if (!frame) return
      frame.style.setProperty('--away', `${along}`)
      frame.style.setProperty('--rake-play', along >= 1 ? 'paused' : 'running')
    }
    walk()
    window.addEventListener('scroll', walk, { passive: true })
    window.addEventListener('resize', walk, { passive: true })
    return () => {
      window.removeEventListener('scroll', walk)
      window.removeEventListener('resize', walk)
    }
  }, [reduced])

  /**
   * The box the wall is fitted into, in pixels. The wall has proportions of its own and has to read
   * both sides of this box to take the smaller fit; a CSS size container does that in one declaration
   * and charges a second layout pass for every commit. Measured at 256 tiles under a 4x CPU throttle,
   * holding a stepper down: average frame 53 ms and p95 309 ms with the container, 36 ms and 192 ms
   * with the box written here. This observer fires when the window resizes, never when the wall does,
   * so the path that was slow reads it zero times.
   */
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let last = ''
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const next = `${Math.round(width)}x${Math.round(height)}`
      if (next === last) return
      last = next
      frame.style.setProperty('--frame-w', `${Math.round(width)}px`)
      frame.style.setProperty('--frame-h', `${Math.round(height)}px`)
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  useEffect(
    () => () => {
      window.clearTimeout(dwellRef.current)
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  const preview = useCallback(
    (textureId: string | null) => {
      setPreviewing(textureId)
      onPreviewTexture(textureId)
    },
    [onPreviewTexture],
  )

  const startDwell = useCallback(
    (textureId: string) => {
      window.clearTimeout(dwellRef.current)
      // The wall already wears this relief, so there is nothing to lay and no render to pay for.
      if (textureId === config.texture.id) return
      dwellRef.current = window.setTimeout(() => preview(textureId), DWELL_MS)
    },
    [config.texture.id, preview],
  )

  const endDwell = useCallback(() => {
    window.clearTimeout(dwellRef.current)
    if (previewing !== null) preview(null)
  }, [preview, previewing])

  const pickSpecimen = useCallback(
    (index: number) => {
      window.clearTimeout(dwellRef.current)
      if (previewing !== null) preview(null)
      onPickSpecimen(index)
    },
    [onPickSpecimen, preview, previewing],
  )

  const texture = textureById(config.texture.id)
  // The frame takes the wall's own proportions, so the wall fills it instead of being letterboxed into
  // a box sized by whatever the type column left over: at 1.05 against the wall's 1.43 a quarter of the
  // frame was empty air above and below the tiles.
  const stageVars: StyleWithVars = {
    '--turn': '0',
    '--lift': '0',
    '--away': '0',
    '--wall-ratio': `${wallRatio(plan).toFixed(3)}`,
  }

  return (
    <div className={styles.stage}>
      <div
        ref={frameRef}
        className={styles.frame}
        style={stageVars}
        onPointerMove={turns ? onPointerMove : undefined}
        onPointerLeave={turns ? onPointerLeave : undefined}
      >
        {/* The light the wall is standing in, thrown on the page behind it: the one mark an object
            with no frame leaves on the page it is standing on. */}
        <div className={styles.pool} aria-hidden="true" />
        <div className={styles.tilt}>
          <HeroWall
            config={config}
            plan={plan}
            label={`${plan.placements.length} printed ${texture.name} tiles in ${colorName(config.color)} laid on a ${formatLength(config.surface.width)} by ${formatLength(config.surface.height)} wall, ${plan.columns} across and ${plan.rows} down, with ${plan.partialCount} of them cut to fit the edges.`}
          />
        </div>
      </div>

      {/* The plate caption: what is standing there, and the other four it could be. */}
      <div className={styles.index}>
        <p className={styles.caption}>
          <span className={styles.captionDot} style={{ background: config.color }} aria-hidden="true" />
          <span className={styles.captionName}>
            {texture.name} in {colorName(config.color)}
          </span>
          {/* Read off the plan, never typed. The landing lays every wall from the corner with no row
              offset, so columns times rows is exactly the number of tiles standing there. */}
          <span className={styles.captionNote}>
            {`${formatLength(config.tile.width)} tiles, ${plan.columns} across and ${plan.rows} down`}
          </span>
        </p>
        <div
          className={styles.keys}
          role="group"
          aria-label="Choose a sample"
          onPointerLeave={dwells ? endDwell : undefined}
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
                onPointerLeave={dwells ? () => window.clearTimeout(dwellRef.current) : undefined}
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
