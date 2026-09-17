import { ContactShadows } from '@react-three/drei'
import { addTail, useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useEffect, useMemo, type Ref } from 'react'
import { heroPiece } from '@/hooks/previewLod'
import type { LayoutOrigin, LayoutPlan, LengthUnit, Placement } from '@/core/types'
import type { PreviewPiece } from '@/workers/protocol'
import { Backdrop } from './Backdrop'
import { CameraRig, type CameraRigHandle } from './CameraRig'
import { sheetBackground } from './colorMath'
import { Dimensions } from './Dimensions'
import { LOOK, type Presentation, type Tier } from './look'
import type { TileMaterialSet } from './materials'
import { useSceneServices } from './sceneServices'
import { annotationMarginMm, BACKDROP_LAYER, computeFraming, objectComposition, OVERLAY_LAYER, stageFor, stageRotationX, type ViewMode } from './stage'
import { StudioLights } from './StudioLights'
import { TileField } from './TileField'
import { usePieceAssets, useTileMaterials } from './useSceneAssets'
import type { WaveClock } from './wave'

// The composer is as heavy as three.js itself and the lowest tier drops it, so it arrives on its own
// chunk after the first frame instead of blocking it.
const PostFx = lazy(async () => ({ default: (await import('./PostFx')).PostFx }))

/** The geometry currently on screen: it only changes once the worker's meshes match the plan. */
export interface Shown {
  commitId: number
  /** The view these meshes were built for: a mode switch shows once the new mode's meshes are in hand. */
  mode: ViewMode
  plan: LayoutPlan
  pieces: ReadonlyMap<string, PreviewPiece>
  version: number
  surface: { width: number; height: number }
  tile: { width: number; height: number; thickness: number }
  joint: number
  /** Relief depth above the base plate, mm. */
  depth: number
  origin: LayoutOrigin
}

/**
 * The render lives on the drafting sheet: the background is the sheet color, tone mapping included.
 * `color` overrides the sheet for a view that sits on another surface, as '#RRGGBB'.
 */
export function SceneBackground({ tier, color }: { tier: Tier; color?: string }) {
  const background = useMemo(() => sheetBackground(tier > 0, color), [tier, color])
  return <color attach="background" args={[background.r, background.g, background.b]} />
}

/** Runs before every other frame callback: toggles the shadow-map cache. */
function SceneDrivers() {
  const services = useSceneServices()
  const gl = useThree((state) => state.gl)
  useFrame(() => {
    services.shadows.apply((on) => {
      gl.shadowMap.autoUpdate = on
    })
  }, -2)
  useEffect(() => {
    const shadowMap = gl.shadowMap
    return () => {
      shadowMap.autoUpdate = true
    }
  }, [gl])
  return null
}

function MaterialDriver({ set }: { set: TileMaterialSet }) {
  const invalidate = useThree((state) => state.invalidate)
  useFrame((_, delta) => {
    // The loop sleeps between edits, so the first frame of a fade carries a delta of seconds: clamped,
    // or the new color would land in one step instead of fading in.
    if (!set.step(Math.min(delta, 1 / 30))) return
    // No motion bump: a color fade is a few frames right behind a React commit and a page-wide
    // recolor, which measures the main thread rather than the GPU the governor is judging.
    invalidate()
  })
  return null
}

/**
 * Quality tiers, chosen by the app's own governor from frames rendered while something moves. Its
 * verdicts live in SceneServices, so a remounted scene keeps them.
 */
function QualityMonitor({ tier, onTierChange }: { tier: Tier; onTierChange: (update: (tier: Tier) => Tier) => void }) {
  const services = useSceneServices()
  // The loop going to sleep is the one gap no frame interval can be trusted across.
  useEffect(() => addTail(() => services.quality.idle()), [services])
  useFrame(() => {
    const now = performance.now()
    const next = services.quality.frame(now, services.motion.isActive(now, LOOK.quality.sampleWhileMovingMs), tier)
    if (next !== null) onTierChange(() => next)
  })
  return null
}

export interface SceneProps {
  shown: Shown
  lightAngle: number
  showDimensions: boolean
  showLayerLines: boolean
  highlightPieceId: string | null
  /** The view is pointed at or focused: wash every cut piece in red pencil. */
  revealCuts: boolean
  interactive: boolean
  /** Offscreen, hidden, or a hand on the view: the cinematic drift stands down. */
  paused: boolean
  /** Offscreen or hidden on its own: the arrival choreography costs nothing at all. */
  offscreen?: boolean
  reduced: boolean
  tier: Tier
  /** Tile color as '#RRGGBB'. */
  color: string
  unit: LengthUnit
  wave: WaveClock
  rigRef: Ref<CameraRigHandle>
  /** Presentation preset. Omitted or 'studio': today's scene, exactly. */
  presentation?: Presentation
  /** The object presentation's arrival waits at frame 0 until this is true. Omitted: it plays at once. */
  arrivalReady?: boolean
  onTierChange: (update: (tier: Tier) => Tier) => void
}

export function Scene({
  shown,
  lightAngle,
  showDimensions,
  showLayerLines,
  highlightPieceId,
  revealCuts,
  interactive,
  paused,
  offscreen = false,
  reduced,
  tier,
  color,
  unit,
  wave,
  rigRef,
  presentation = 'studio',
  arrivalReady = true,
  onTierChange,
}: SceneProps) {
  // The mode that was built, not the one just asked for: the meshes on screen belong to it.
  const mode = shown.mode
  const stage = stageFor(mode)
  // The object presentation only ever means anything for a wall of tiles; a single tile keeps its own.
  const object = presentation === 'object' && mode === 'surface'
  const standoffMm = object ? LOOK.object.standoffMm : 0
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)

  const hero = useMemo(() => heroPiece(shown.plan) ?? null, [shown.plan])
  const pieces = useMemo(() => (mode === 'tile' ? (hero ? [hero] : []) : shown.plan.pieces), [mode, hero, shown.plan.pieces])
  const placements = useMemo<readonly Placement[]>(
    () => (mode === 'tile' ? (hero ? [{ pieceId: hero.id, x: 0, y: 0, row: 0, col: 0 }] : []) : shown.plan.placements),
    [mode, hero, shown.plan.placements],
  )

  const assets = usePieceAssets(shown.pieces, pieces, shown.tile.width, shown.tile.height)
  const activeNormalMaps = useMemo(() => new Set([...assets.values()].map((asset) => asset.normalMap)), [assets])
  const reliefTop = useMemo(() => {
    let top = shown.tile.thickness + shown.depth
    for (const asset of assets.values()) top = Math.max(top, asset.top)
    return top
  }, [assets, shown.tile.thickness, shown.depth])

  const width = mode === 'tile' ? (hero?.width ?? shown.tile.width) : shown.surface.width
  const height = mode === 'tile' ? (hero?.height ?? shown.tile.height) : shown.surface.height

  const materials = useTileMaterials(color, tier, showLayerLines, activeNormalMaps)

  // Quantized so a one-pixel resize does not re-frame the view.
  const aspect = Math.round((size.width / Math.max(1, size.height)) * 20) / 20
  // Dimension lines and their labels stand outside the tiles, so the camera has to frame them too.
  const annotationMm = showDimensions ? annotationMarginMm(mode, width, height) : 0
  // The cinematic rig sways a wall rather than holding it still, so that view is fitted over the whole
  // sway and centered in the frame. Floor stages run a full turntable instead, which no four-corner fit
  // stands in for, and an interactive view is the visitor's to aim: both keep the plain framing.
  const swayed = !interactive && stage === 'wall'
  // Read as two numbers, not as a merged object: a fresh object here would make `framing` a fresh
  // object every render, and the cinematic rig restarts its clock on every new framing.
  const sweepAzimuthDeg = object ? LOOK.object.cinematic.azimuthAmpDeg : LOOK.camera.cinematic.azimuthAmpDeg
  const sweepPolarDeg = object ? LOOK.object.cinematic.elevationAmpDeg : LOOK.camera.cinematic.elevationAmpDeg
  // Composed for the frame it is actually on, by the width of that frame: a phone and a tablet stand
  // the object on a row of its own with no type over it, and the width is what says so. The aspect
  // does not: the same phone hands this canvas anything from a square to a letterbox. The two
  // compositions are frozen, so this only ever changes identity when the frame crosses the breakpoint.
  const composition = object ? objectComposition(size.width) : undefined
  const framing = useMemo(
    () =>
      computeFraming({
        stage,
        mode,
        width,
        height,
        reliefTop,
        tileWidth: shown.tile.width,
        tileHeight: shown.tile.height,
        aspect,
        fovDeg: LOOK.camera.fovDeg,
        annotationMm,
        sweep: swayed ? { azimuthDeg: sweepAzimuthDeg, polarDeg: sweepPolarDeg } : undefined,
        recenter: swayed,
        presentation,
        composition,
      }),
    [stage, mode, width, height, reliefTop, shown.tile.width, shown.tile.height, aspect, annotationMm, swayed, sweepAzimuthDeg, sweepPolarDeg, presentation, composition],
  )
  const framingKey = `${stage}:${mode}:${Math.round(width)}x${Math.round(height)}:${reliefTop.toFixed(2)}:${annotationMm.toFixed(1)}:${presentation}`

  useEffect(() => {
    camera.layers.enable(OVERLAY_LAYER)
    camera.layers.enable(BACKDROP_LAYER)
  }, [camera])

  return (
    <>
      <SceneDrivers />
      <StudioLights
        stage={stage}
        mode={mode}
        width={width}
        height={height}
        reliefTop={reliefTop}
        lightAngle={lightAngle}
        tier={tier}
        presentation={presentation}
        standoffMm={standoffMm}
        reduced={reduced}
        paused={paused}
        offscreen={offscreen}
        arrivalReady={arrivalReady}
      />
      <group rotation={[stageRotationX(stage), 0, 0]}>
        <Backdrop
          width={width}
          height={height}
          grout={mode === 'surface' && shown.joint > 0}
          lightAngle={lightAngle}
          standoffMm={standoffMm}
          shadowOpacity={object ? LOOK.object.shadowOpacity : undefined}
          poolIntensity={object ? LOOK.object.poolIntensity : undefined}
          poolScale={object ? LOOK.object.poolScale : undefined}
        />
        <group position={[-width / 2, -height / 2, 0]}>
          <TileField
            assets={assets}
            pieces={pieces}
            placements={placements}
            materials={materials}
            wave={wave}
            highlightPieceId={highlightPieceId}
            revealCuts={revealCuts}
            reduced={reduced}
            stage={stage}
          />
          {showDimensions && (
            <Dimensions mode={mode} width={width} height={height} thickness={shown.tile.thickness} relief={shown.depth} unit={unit} />
          )}
        </group>
      </group>
      {mode === 'tile' && (
        <ContactShadows
          position={[0, 0.02, 0]}
          scale={Math.hypot(width, height) * LOOK.contact.scale}
          far={Math.max(1, reliefTop * LOOK.contact.farHeightMultiple)}
          blur={LOOK.contact.blur}
          opacity={LOOK.contact.opacity}
          resolution={LOOK.contact.resolution[tier]}
          color={LOOK.contact.color}
        />
      )}
      <CameraRig
        ref={rigRef}
        framing={framing}
        framingKey={framingKey}
        mode={mode}
        stage={stage}
        interactive={interactive}
        reduced={reduced}
        paused={paused}
        offscreen={offscreen}
        presentation={presentation}
        arrivalReady={arrivalReady}
      />
      {tier > 0 && (
        <Suspense fallback={null}>
          <PostFx tier={tier} reliefMm={shown.depth} />
        </Suspense>
      )}
      <MaterialDriver set={materials} />
      <QualityMonitor tier={tier} onTierChange={onTierChange} />
    </>
  )
}
