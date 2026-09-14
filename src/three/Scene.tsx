import { AdaptiveDpr, ContactShadows, PerformanceMonitor } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type Ref } from 'react'
import type { Filament } from '@/core/filaments'
import { heroPiece } from '@/hooks/previewLod'
import type { LayoutOrigin, LayoutPlan, LengthUnit, Placement } from '@/core/types'
import type { PreviewPiece } from '@/workers/protocol'
import { Backdrop } from './Backdrop'
import { CameraRig, type CameraRigHandle } from './CameraRig'
import { sheetBackground } from './colorMath'
import { Dimensions } from './Dimensions'
import { LOOK, type Tier } from './look'
import type { FinishMaterialSet } from './materials'
import { useSceneServices } from './sceneServices'
import { annotationMarginMm, BACKDROP_LAYER, computeFraming, OVERLAY_LAYER, stageFor, stageRotationX, type ViewMode } from './stage'
import { StudioLights } from './StudioLights'
import { TileField } from './TileField'
import { useFinishMaterials, usePieceAssets } from './useSceneAssets'
import type { WaveClock } from './wave'

// The composer is as heavy as three.js itself and the lowest tier drops it, so it arrives on its own
// chunk after the first frame instead of blocking it.
const PostFx = lazy(async () => ({ default: (await import('./PostFx')).PostFx }))

/** The geometry currently on screen: it only changes once the worker's meshes match the plan. */
export interface Shown {
  commitId: number
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

/** The render lives on the drafting sheet: the background is the sheet colour, tone mapping included. */
export function SceneBackground({ tier }: { tier: Tier }) {
  const color = useMemo(() => sheetBackground(tier > 0), [tier])
  return <color attach="background" args={[color.r, color.g, color.b]} />
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

function MaterialDriver({ set }: { set: FinishMaterialSet }) {
  const invalidate = useThree((state) => state.invalidate)
  const services = useSceneServices()
  useFrame((_, delta) => {
    if (!set.step(delta)) return
    services.motion.bump(performance.now())
    invalidate()
  })
  return null
}

/**
 * Quality tiers. The frameloop is on demand, so frames-per-second only means something while something
 * moves; the monitor is mounted for those stretches only.
 */
function QualityMonitor({ onTierChange }: { onTierChange: (update: (tier: Tier) => Tier) => void }) {
  const services = useSceneServices()
  const [sampling, setSampling] = useState(false)
  useFrame(() => {
    const active = services.motion.isActive(performance.now(), LOOK.quality.sampleWhileMovingMs)
    if (active !== sampling) setSampling(active)
  })
  const decline = useCallback(() => onTierChange((tier) => (tier > 0 ? ((tier - 1) as Tier) : tier)), [onTierChange])
  const incline = useCallback(() => onTierChange((tier) => (tier < 2 ? ((tier + 1) as Tier) : tier)), [onTierChange])
  const fallback = useCallback(() => onTierChange(() => 0), [onTierChange])
  if (!sampling) return null
  return <PerformanceMonitor flipflops={LOOK.quality.flipflops} onDecline={decline} onIncline={incline} onFallback={fallback} />
}

export interface SceneProps {
  shown: Shown
  mode: ViewMode
  lightAngle: number
  showDimensions: boolean
  showLayerLines: boolean
  highlightPieceId: string | null
  /** The view is pointed at or focused: wash every cut piece in red pencil. */
  revealCuts: boolean
  interactive: boolean
  paused: boolean
  reduced: boolean
  tier: Tier
  filament: Filament
  unit: LengthUnit
  wave: WaveClock
  rigRef: Ref<CameraRigHandle>
  onTierChange: (update: (tier: Tier) => Tier) => void
}

export function Scene({
  shown,
  mode,
  lightAngle,
  showDimensions,
  showLayerLines,
  highlightPieceId,
  revealCuts,
  interactive,
  paused,
  reduced,
  tier,
  filament,
  unit,
  wave,
  rigRef,
  onTierChange,
}: SceneProps) {
  const stage = stageFor(mode)
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

  const materials = useFinishMaterials(filament, tier, shown.tile.thickness + shown.depth / 2, showLayerLines, activeNormalMaps)

  // Quantised so a one-pixel resize does not re-frame the view.
  const aspect = Math.round((size.width / Math.max(1, size.height)) * 20) / 20
  // Dimension lines and their labels stand outside the tiles, so the camera has to frame them too.
  const annotationMm = showDimensions ? annotationMarginMm(mode, width, height) : 0
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
      }),
    [stage, mode, width, height, reliefTop, shown.tile.width, shown.tile.height, aspect, annotationMm],
  )
  const framingKey = `${stage}:${mode}:${Math.round(width)}x${Math.round(height)}:${reliefTop.toFixed(2)}:${annotationMm.toFixed(1)}`

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
      />
      <group rotation={[stageRotationX(stage), 0, 0]}>
        <Backdrop width={width} height={height} grout={mode === 'surface' && shown.joint > 0} lightAngle={lightAngle} />
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
      />
      {tier > 0 && (
        <Suspense fallback={null}>
          <PostFx tier={tier} reliefMm={shown.depth} bloomIntensity={materials.recipe.bloom} />
        </Suspense>
      )}
      <MaterialDriver set={materials} />
      <QualityMonitor onTierChange={onTierChange} />
      <AdaptiveDpr />
    </>
  )
}
