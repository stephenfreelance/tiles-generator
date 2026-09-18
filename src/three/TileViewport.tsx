import { Canvas, type RootState } from '@react-three/fiber'
import { Component, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import * as THREE from 'three'
import { presetByHex } from '@/core/colors'
import type { DesignConfig, LayoutPlan, PieceSpec } from '@/core/types'
import { formatSize } from '@/core/units'
import { heroPiece } from '@/hooks/previewLod'
import { usePreviewMeshes } from '@/hooks/usePreviewMeshes'
import type { CameraRigHandle } from './CameraRig'
import { meshMatchesPiece } from './geometry'
import { LOOK, type Presentation, type Tier } from './look'
import { Scene, SceneBackground, type Shown } from './Scene'
import { SceneServices, ServicesContext, usePrefersReducedMotion } from './sceneServices'
import { settingOutPoint, waveAnimates, WaveDirector, waveSettleDelay, type WaveClock } from './wave'
import styles from './TileViewport.module.scss'

export interface TileViewportProps {
  config: DesignConfig
  plan: LayoutPlan
  mode: 'surface' | 'tile'
  /** Degrees of key-light azimuth across the tile surface. */
  lightAngle?: number
  showDimensions?: boolean
  showLayerLines?: boolean
  highlightPieceId?: string | null
  /** false on the landing hero: no controls, a slow cinematic orbit. */
  interactive?: boolean
  /** OR-ed with the view's own offscreen state: a caller can stop the orbit while it drives the light. */
  paused?: boolean
  /** Scene background as '#RRGGBB': the surface the board sits on. Omitted, it is the drafting sheet. */
  background?: string
  /** Framing and lighting preset. Omitted or 'studio': every route's view, exactly as it is today. */
  presentation?: Presentation
  /**
   * The object presentation holds its arrival at frame 0 until this is true: the camera stays back and
   * round, the key stays up near the top edge of the wall, and the tiles stay unlaid. The hero sets it
   * when the poster has handed over to the live canvas, which is what makes the arrival something the
   * visitor sees rather than something that played out behind a still image. Omitted, or under
   * presentation 'studio', it changes nothing.
   */
  arrivalReady?: boolean
  /** Hold the cut-piece wash on whatever the pointer does. Omitted: the pointer alone decides. */
  revealCuts?: boolean
  className?: string
  onPendingChange?: (pending: boolean) => void
}

export interface TileViewportHandle {
  /**
   * WebP data URL of the current view (PNG where WebP is unavailable), for history thumbnails. It waits
   * for the re-lay wave to settle; with `maxWaitMs` it gives up after that long and returns null.
   */
  capture(widthPx: number, options?: { maxWaitMs?: number }): Promise<string | null>
  resetView(): void
}

type GlState = 'ok' | 'unsupported' | 'lost' | 'error'

let webglChecked: boolean | null = null

function isWebGLAvailable(recheck = false): boolean {
  if (webglChecked !== null && !recheck) return webglChecked
  try {
    const probe = document.createElement('canvas')
    const context = probe.getContext('webgl2')
    webglChecked = context !== null
    context?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webglChecked = false
  }
  return webglChecked
}

function initialTier(): Tier {
  if (typeof window === 'undefined') return 1
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const cores = navigator.hardwareConcurrency ?? 4
  return coarse || cores <= 4 ? 1 : 2
}

/** Halving steps keep a small thumbnail sharp instead of aliased. */
function downscale(source: HTMLCanvasElement, widthPx: number): HTMLCanvasElement | null {
  const targetWidth = Math.max(1, Math.round(widthPx))
  const targetHeight = Math.max(1, Math.round((targetWidth * source.height) / Math.max(1, source.width)))
  let current: HTMLCanvasElement = source
  let width = source.width
  let height = source.height
  while (width > targetWidth * 2) {
    width = Math.max(targetWidth, Math.round(width / 2))
    height = Math.max(targetHeight, Math.round(height / 2))
    const step = document.createElement('canvas')
    step.width = width
    step.height = height
    const stepContext = step.getContext('2d')
    if (!stepContext) return null
    stepContext.imageSmoothingQuality = 'high'
    stepContext.drawImage(current, 0, 0, width, height)
    current = step
  }
  const out = document.createElement('canvas')
  out.width = targetWidth
  out.height = targetHeight
  const context = out.getContext('2d')
  if (!context) return null
  context.imageSmoothingQuality = 'high'
  context.drawImage(current, 0, 0, targetWidth, targetHeight)
  return out
}

class ViewportErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[tessera] the 3D preview stopped', error)
    this.props.onError()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

const NOTICES = {
  unsupported: {
    title: 'The 3D view needs WebGL',
    body: 'This browser could not start WebGL, so the preview stays off. The setting-out plan and every download still work.',
    action: 'Try again',
  },
  lost: {
    title: 'The 3D view lost its graphics context',
    body: 'The browser reset WebGL, which usually happens after the machine sleeps or another tab takes the graphics card.',
    action: 'Restart the 3D view',
  },
  error: {
    title: 'The 3D view stopped',
    body: 'Something went wrong while drawing the preview. The setting-out plan and every download still work.',
    action: 'Restart the 3D view',
  },
} as const

function ViewportNotice({ kind, onRetry }: { kind: Exclude<GlState, 'ok'>; onRetry: () => void }) {
  const copy = NOTICES[kind]
  return (
    <div className={[styles.notice, kind === 'unsupported' ? '' : styles.noticeOverlay].filter(Boolean).join(' ')} role="status">
      <h2 className={styles.noticeTitle}>{copy.title}</h2>
      <p className={styles.noticeBody}>{copy.body}</p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        {copy.action}
      </button>
    </div>
  )
}

/**
 * The 3D preview: a studio render of the whole surface or of one tile, lit by a raking key light on the
 * drafting sheet. Geometry comes from the worker through usePreviewMeshes; the previous meshes stay on
 * screen while a rebuild runs, and each new build re-lays the tiles from the setting-out point.
 */
export const TileViewport = forwardRef<TileViewportHandle, TileViewportProps>(function TileViewport(
  {
    config,
    plan,
    mode,
    lightAngle = 35,
    showDimensions = false,
    showLayerLines = false,
    highlightPieceId = null,
    interactive = true,
    paused = false,
    background,
    presentation = 'studio',
    arrivalReady = true,
    revealCuts: holdCuts = false,
    className,
    onPendingChange,
  },
  ref,
) {
  const preview = usePreviewMeshes(config, plan, mode)
  const reduced = usePrefersReducedMotion()
  const [services] = useState(() => new SceneServices())
  const [director] = useState(() => new WaveDirector())
  const [tier, setTier] = useState<Tier>(initialTier)
  const [glState, setGlState] = useState<GlState>(() => (isWebGLAvailable() ? 'ok' : 'unsupported'))
  const [canvasKey, setCanvasKey] = useState(0)
  const [offscreen, setOffscreen] = useState(false)
  const rootRef = useRef<RootState | null>(null)
  // Detaches the context-loss listeners from the canvas they were added to.
  const detachRef = useRef<(() => void) | null>(null)
  const rigRef = useRef<CameraRigHandle>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  // Pointing at the wall, or tabbing to it, asks "which of these are cut?"; the answer washes in.
  const [pointerOver, setPointerOver] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)

  // The same piece the worker builds for the tile view, so the view never waits on a piece nobody asked for.
  const hero = useMemo(() => heroPiece(plan) ?? null, [plan])

  // Only show geometry that matches the current plan, so an old tile size is never drawn at a new pitch.
  const needed: readonly PieceSpec[] = mode === 'tile' ? (hero ? [hero] : []) : plan.pieces
  const ready =
    needed.length > 0 &&
    needed.every((piece) => {
      const entry = preview.pieces.get(piece.id)
      return entry !== undefined && meshMatchesPiece(entry.mesh, piece)
    })
  // A footprint match only means these meshes are safe to draw at this pitch. Changing the texture,
  // the relief depth, the thickness or the bevel keeps every footprint, so it cannot tell this
  // design's relief from the one before it: `current` is what says the meshes were built for the
  // design on the sheet.
  const showsThisDesign = ready && preview.current

  const [shown, setShown] = useState<Shown | null>(null)
  // The mode is committed with its meshes: switching to the whole wall keeps the tile on screen until
  // every piece of the wall is in hand, instead of drawing the tile-view hero at every placement.
  if (ready && (shown === null || shown.pieces !== preview.pieces || shown.plan !== plan || shown.mode !== mode)) {
    setShown({
      commitId: (shown?.commitId ?? 0) + 1,
      mode,
      plan,
      pieces: preview.pieces,
      version: preview.version,
      surface: { width: config.surface.width, height: config.surface.height },
      tile: { ...config.tile },
      joint: config.joint,
      depth: config.texture.depth,
      origin: config.layout.origin,
    })
  }

  const waveInput = useMemo(() => {
    if (!shown) return null
    if (shown.mode === 'tile') {
      const shownHero = heroPiece(shown.plan)
      const w = shownHero?.width ?? shown.tile.width
      const h = shownHero?.height ?? shown.tile.height
      return { origin: { x: w / 2, y: h / 2 }, maxDistance: 1 }
    }
    const origin = settingOutPoint(shown.origin, shown.surface.width, shown.surface.height)
    const sizes = new Map(shown.plan.pieces.map((piece) => [piece.id, piece]))
    let maxDistance = 1
    for (const placement of shown.plan.placements) {
      const piece = sizes.get(placement.pieceId)
      if (!piece) continue
      const distance = Math.hypot(placement.x + piece.width / 2 - origin.x, placement.y + piece.height / 2 - origin.y)
      if (distance > maxDistance) maxDistance = distance
    }
    return { origin, maxDistance }
  }, [shown])

  const wave = director.clockFor(
    `${shown?.commitId ?? 0}:${shown?.mode ?? mode}:${reduced ? 'still' : 'lay'}`,
    waveInput?.origin ?? { x: 0, y: 0 },
    waveInput?.maxDistance ?? 1,
    !reduced,
  )

  // What a capture waits on: the wave on screen, whether its tiles move at all, and whether cuts flash.
  const settleRef = useRef<{ wave: WaveClock; animating: boolean; flashes: boolean } | null>(null)
  useEffect(() => {
    if (!shown) {
      settleRef.current = null
      return
    }
    const onScreen = shown.mode === 'tile' ? [heroPiece(shown.plan)] : shown.plan.pieces
    settleRef.current = {
      wave,
      animating: waveAnimates(wave, shown.mode === 'tile' ? 1 : shown.plan.placements.length),
      flashes: onScreen.some((piece) => piece !== undefined && piece.kind !== 'full'),
    }
  })

  useEffect(() => {
    onPendingChange?.(preview.pending)
  }, [preview.pending, onPendingChange])

  // A hidden or offscreen hero stops asking for frames.
  useEffect(() => {
    const element = wrapperRef.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => setOffscreen(!entries[entries.length - 1].isIntersecting), { threshold: 0 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // R3F force-loses a replaced canvas 500 ms after unmounting it: only the live canvas speaks for the view.
  const isLiveCanvas = (event: Event) => event.target !== null && event.target === rootRef.current?.gl.domElement

  const detachCanvas = useCallback(() => {
    detachRef.current?.()
    detachRef.current = null
  }, [])

  const handleContextLost = useCallback((event: Event) => {
    if (!isLiveCanvas(event)) return
    event.preventDefault()
    // A failed canvas is force-lost after the error boundary caught it: the error is the truer notice.
    setGlState((state) => (state === 'error' ? state : 'lost'))
  }, [])

  const handleContextRestored = useCallback(
    (event: Event) => {
      if (!isLiveCanvas(event)) return
      detachCanvas()
      setGlState('ok')
      setCanvasKey((key) => key + 1)
    },
    [detachCanvas],
  )

  const handleCreated = useCallback(
    (state: RootState) => {
      detachCanvas()
      rootRef.current = state
      // The composer forces NoToneMapping while mounted; this is the tier-0 path.
      state.gl.toneMapping = THREE.NeutralToneMapping
      state.gl.toneMappingExposure = 1
      // `alpha: false` leaves the renderer's clear alpha at 1, which only matters for a render whose
      // scene has no background: the contact shadow's own target is cleared opaque black and its plane
      // then paints a grey square around the tile. The canvas itself always clears to SceneBackground's
      // colour (three clears a Color background at alpha 1 whatever this says), so 0 costs it nothing.
      state.gl.setClearAlpha(0)
      const canvas = state.gl.domElement
      canvas.addEventListener('webglcontextlost', handleContextLost)
      canvas.addEventListener('webglcontextrestored', handleContextRestored)
      detachRef.current = () => {
        canvas.removeEventListener('webglcontextlost', handleContextLost)
        canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      }
    },
    [detachCanvas, handleContextLost, handleContextRestored],
  )

  useEffect(() => detachCanvas, [detachCanvas])

  const retry = useCallback(() => {
    detachCanvas()
    rootRef.current = null
    setGlState(isWebGLAvailable(true) ? 'ok' : 'unsupported')
    setCanvasKey((key) => key + 1)
  }, [detachCanvas])

  const capture = useCallback(async (widthPx: number, options?: { maxWaitMs?: number }): Promise<string | null> => {
    // A thumbnail of the wall mid-wave would keep lifted and missing tiles in the history for good. Timers,
    // not animation frames, pace the wait: a hidden tab gets no frames.
    const unstarted = () => {
      const settle = settleRef.current
      return !!settle && settle.animating && settle.wave.startedAt(performance.now()) === null
    }
    // The wave clock starts on its first drawn frame, so without frames the wait would never shrink: draw one.
    if (unstarted() && rootRef.current) {
      rootRef.current.advance(performance.now(), true)
      // advance() spends the frames the wave asked for, so the on-demand loop is asked to carry on.
      rootRef.current.invalidate()
    }
    const deadline = performance.now() + (options?.maxWaitMs ?? LOOK.wave.captureWaitMaxMs)
    let settled: boolean
    for (;;) {
      const settle = settleRef.current
      const now = performance.now()
      const wait = settle ? waveSettleDelay(settle.wave, now, settle) : 0
      settled = wait <= 0
      if (settled || now >= deadline) break
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(wait, deadline - now)))
    }
    // A caller with its own budget takes no thumbnail over a moving one, and a wave that never started drew nothing.
    if (!settled && (options?.maxWaitMs !== undefined || unstarted())) return null
    const root = rootRef.current
    if (!root) return null
    try {
      // Render one frame and read it back before the browser clears the drawing buffer.
      root.advance(performance.now(), true)
      const scaled = downscale(root.gl.domElement, widthPx)
      if (!scaled) return null
      const webp = scaled.toDataURL('image/webp', 0.82)
      return webp.startsWith('data:image/webp') ? webp : scaled.toDataURL('image/png')
    } finally {
      // advance() spends the frames useFrame callbacks asked for, which lets the on-demand loop stop for good.
      root.invalidate()
    }
  }, [])

  const resetView = useCallback(() => {
    rigRef.current?.reset()
  }, [])

  useImperativeHandle(ref, () => ({ capture, resetView }), [capture, resetView])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const rig = rigRef.current
    if (!rig) return
    switch (event.key) {
      case 'ArrowLeft':
        rig.orbit(-LOOK.camera.keyAzimuthStepDeg, 0)
        break
      case 'ArrowRight':
        rig.orbit(LOOK.camera.keyAzimuthStepDeg, 0)
        break
      case 'ArrowUp':
        rig.orbit(0, -LOOK.camera.keyPolarStepDeg)
        break
      case 'ArrowDown':
        rig.orbit(0, LOOK.camera.keyPolarStepDeg)
        break
      case '+':
      case '=':
        rig.dolly(LOOK.camera.keyDollyFactor)
        break
      case '-':
      case '_':
        rig.dolly(1 / LOOK.camera.keyDollyFactor)
        break
      case '0':
      case 'Home':
        rig.reset()
        break
      default:
        return
    }
    event.preventDefault()
  }, [])

  // The legend counts what is on screen rather than what is being built, so it agrees with the wash.
  const shownCuts = shown?.plan.partialCount ?? 0
  const canRevealCuts = interactive && (shown?.mode ?? mode) === 'surface' && shownCuts > 0
  // The legend keeps following the pointer; a caller holding the wash on is naming the cuts itself.
  const revealCuts = (canRevealCuts && (pointerOver || focusWithin)) || (holdCuts && (shown?.mode ?? mode) === 'surface' && shownCuts > 0)

  const description =
    mode === 'tile'
      ? `3D view of one ${formatSize(config.tile.width, config.tile.height)} tile in ${presetByHex(config.color)?.name ?? `color ${config.color}`}`
      : `3D elevation of a ${formatSize(config.surface.width, config.surface.height, config.surfaceUnit)} surface: ${plan.fullCount} full tiles and ${plan.partialCount} cut pieces`

  const classes = [styles.viewport, interactive ? styles.interactive : styles.static, className].filter(Boolean).join(' ')

  return (
    <div
      ref={wrapperRef}
      className={classes}
      role="group"
      aria-roledescription="3D preview"
      aria-label={description}
      aria-busy={preview.pending}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      onPointerEnter={interactive ? () => setPointerOver(true) : undefined}
      onPointerLeave={interactive ? () => setPointerOver(false) : undefined}
      onFocus={interactive ? () => setFocusWithin(true) : undefined}
      onBlur={interactive ? () => setFocusWithin(false) : undefined}
    >
      {glState === 'unsupported' ? (
        <ViewportNotice kind="unsupported" onRetry={retry} />
      ) : (
        <ViewportErrorBoundary key={canvasKey} onError={() => setGlState('error')}>
          <Canvas
            key={canvasKey}
            frameloop="demand"
            dpr={[1, presentation === 'object' ? Math.min(LOOK.quality.dprMax[tier], LOOK.object.dprMax) : LOOK.quality.dprMax[tier]]}
            shadows="percentage"
            camera={{ fov: LOOK.camera.fovDeg, near: 1, far: 100000, position: [0, 0, 2000] }}
            gl={(defaults) =>
              new THREE.WebGLRenderer({
                ...defaults,
                antialias: false,
                alpha: false,
                stencil: false,
                powerPreference: 'high-performance',
              } as THREE.WebGLRendererParameters)
            }
            onCreated={handleCreated}
          >
            <SceneBackground tier={tier} color={background} />
            <ServicesContext.Provider value={services}>
              {shown && (
                <Scene
                  shown={shown}
                  lightAngle={lightAngle}
                  showDimensions={showDimensions}
                  showLayerLines={showLayerLines}
                  highlightPieceId={highlightPieceId}
                  revealCuts={revealCuts}
                  interactive={interactive}
                  paused={paused || offscreen}
                  offscreen={offscreen}
                  reduced={reduced}
                  tier={tier}
                  color={config.color}
                  unit={config.surfaceUnit}
                  wave={wave}
                  rigRef={rigRef}
                  presentation={presentation}
                  arrivalReady={arrivalReady}
                  onTierChange={setTier}
                />
              )}
            </ServicesContext.Provider>
          </Canvas>
        </ViewportErrorBoundary>
      )}
      {glState !== 'ok' && glState !== 'unsupported' && <ViewportNotice kind={glState} onRetry={retry} />}
      {/* The render is the promise: once a build has finished and what is drawn was not built for this
          design, the view says so instead of passing off the previous wall as this one. */}
      {glState === 'ok' && !showsThisDesign && !preview.pending && (
        <div className={[styles.notice, styles.noticeOverlay].join(' ')} role="status">
          <h2 className={styles.noticeTitle}>The preview could not be built</h2>
          <p className={styles.noticeBody}>
            {preview.error ??
              'The 3D view could not build these settings, so it is not showing them. The setting-out plan and every download still work.'}
          </p>
        </div>
      )}
      {/* Names what the red wash means while it is on screen. The same count is in this view's own
          accessible name, in the fit sentence and on the plan, so it never depends on a pointer. */}
      {canRevealCuts && (
        <p className={styles.cutLegend} data-shown={revealCuts || undefined} aria-hidden="true">
          <span className={styles.cutSwatch} />
          {shownCuts} cut {shownCuts === 1 ? 'piece' : 'pieces'}
        </p>
      )}
    </div>
  )
})
