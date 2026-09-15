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
import { LOOK, type Tier } from './look'
import type { TileMaterialSet } from './materials'
import { useSceneServices } from './sceneServices'
import { annotationMarginMm, BACKDROP_LAYER, computeFraming, OVERLAY_LAYER, stageFor, stageRotationX, type ViewMode } from './stage'
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

function MaterialDriver({ set }: { set: TileMaterialSet }) {
  const invalidate = useThree((state) => state.invalidate)
  useFrame((_, delta) => {
    // The loop sleeps between edits, so the first frame of a fade carries a delta of seconds: clamped,
    // or the new colour would land in one step instead of fading in.
    if (!set.step(Math.min(delta, 1 / 30))) return
    // No motion bump: a colour fade is a few frames right behind a React commit and a page-wide
    // recolour, which measures the main thread rather than the GPU the governor is judging.
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
  paused: boolean
  reduced: boolean
  tier: Tier
  /** Tile color as '#RRGGBB'. */
  color: string
  unit: LengthUnit
  wave: WaveClock
  rigRef: Ref<CameraRigHandle>
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
  reduced,
  tier,
  color,
  unit,
  wave,
  rigRef,
  onTierChange,
}: SceneProps) {
  // The mode that was built, not the one just asked for: the meshes on screen belong to it.
  const mode = shown.mode
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

  const materials = useTileMaterials(color, tier, showLayerLines, activeNormalMaps)

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
          <PostFx tier={tier} reliefMm={shown.depth} />
        </Suspense>
      )}
      <MaterialDriver set={materials} />
      <QualityMonitor tier={tier} onTierChange={onTierChange} />
    </>
  )
}
