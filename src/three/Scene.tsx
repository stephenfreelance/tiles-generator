import { ContactShadows } from '@react-three/drei'
import { addTail, useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import type * as THREE from 'three'
import { heroPiece } from '@/hooks/previewLod'
import type { LayoutOrigin, LayoutPlan, LengthUnit, Placement } from '@/core/types'
import type { PreviewPiece } from '@/workers/protocol'
import { Backdrop } from './Backdrop'
import { CameraRig, type CameraRigHandle } from './CameraRig'
import { sheetBackground } from './colorMath'
import { Dimensions } from './Dimensions'
import { flipPose, stepFlip, type FlipExtent, type TileFace } from './flip'
import { LOOK, type Presentation, type Tier } from './look'
import type { TileMaterialSet } from './materials'
import { useSceneServices } from './sceneServices'
import { SeatedParts } from './SeatedParts'
import type { SeatedSet } from './seatedSet'
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
  /** How far a tab stands out past its piece's right side, mm; 0 on a wall that cuts none. */
  tabGrow: number
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
 * Lays the turning group at `progress`: the axis through the middle of the width and thickness. What turns
 * on the back (`extent`) only counts once it shows, so face up the tile rests exactly where it always has.
 */
function poseFlip(group: THREE.Group, back: THREE.Group | null, progress: number, width: number, thickness: number, extent: FlipExtent | null) {
  const showsBack = progress > 0
  const { angle, axisZ } = flipPose(progress, width, thickness, showsBack && extent ? extent : undefined)
  group.position.set(width / 2, 0, axisZ)
  group.rotation.set(0, angle, 0)
  if (back) back.visible = showsBack
}

/**
 * Turns the single tile over so its back (the key notches and clip pockets) faces the light: a half turn
 * about its upright axis, the way a tile is turned over on the bench, lifted so it never cuts the floor.
 * At rest face up the two groups cancel exactly, so the front view is the view it always was. `instant`
 * lands on the asked face at once: reduced motion, or a view that is not the single tile. `back` (the
 * printed parts seated in the tile's back) turns with the tile and shows from the moment the turn starts
 * until the tile lands face up again; `extent` is its box, which the turn lifts clear of the floor.
 */
function TileFlip({
  face,
  width,
  thickness,
  instant,
  onTurning,
  back,
  extent = null,
  children,
}: {
  face: TileFace
  width: number
  thickness: number
  instant: boolean
  /** Told when a turn starts and when it lands, so the key light can cover the tile on its edge. */
  onTurning: (turning: boolean) => void
  back?: ReactNode
  extent?: FlipExtent | null
  children: ReactNode
}) {
  const ref = useRef<THREE.Group>(null)
  const backRef = useRef<THREE.Group>(null)
  const progressRef = useRef(face === 'back' ? 1 : 0)
  const invalidate = useThree((state) => state.invalidate)
  const services = useSceneServices()
  // Read by the frame loop, which must not wait on a render to see the parts that are there now.
  const extentRef = useRef(extent)
  const hasBack = Boolean(back)

  useLayoutEffect(() => {
    extentRef.current = extent
    if (!ref.current) return
    poseFlip(ref.current, backRef.current, progressRef.current, width, thickness, extent)
    services.shadows.mark()
    invalidate()
  }, [width, thickness, extent, hasBack, services, invalidate])

  // The loop is on demand: asking for the other face has to ask for the frame that starts the turn.
  useEffect(() => {
    invalidate()
  }, [face, instant, invalidate])

  useFrame((_, delta) => {
    const group = ref.current
    if (!group) return
    const current = progressRef.current
    const next = stepFlip(current, face, Math.min(delta * 1000, LOOK.flip.maxStepMs), instant)
    if (next === current) return
    const atRest = (value: number) => value === 0 || value === 1
    if (atRest(current) && !atRest(next)) onTurning(true)
    else if (atRest(next) && !atRest(current)) onTurning(false)
    progressRef.current = next
    poseFlip(group, backRef.current, next, width, thickness, extentRef.current)
    services.shadows.mark()
    services.motion.bump(performance.now())
    invalidate()
  })

  return (
    <group ref={ref}>
      <group position={[-width / 2, 0, -thickness / 2]}>
        {children}
        {back ? <group ref={backRef}>{back}</group> : null}
      </group>
    </group>
  )
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
  /** Which face of the single tile is up. Omitted, or any view but the single tile: the front. */
  face?: TileFace
  /** The object presentation's arrival waits at frame 0 until this is true. Omitted: it plays at once. */
  arrivalReady?: boolean
  /** The printed parts seated in the single tile's back, drawn while its back shows. Omitted: none. */
  parts?: SeatedSet | null
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
  face = 'front',
  arrivalReady = true,
  parts = null,
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

  const assets = usePieceAssets(shown.pieces, pieces, shown.tile.width, shown.tile.height, shown.tabGrow)
  const activeNormalMaps = useMemo(() => new Set([...assets.values()].map((asset) => asset.normalMap)), [assets])
  const reliefTop = useMemo(() => {
    let top = shown.tile.thickness + shown.depth
    for (const asset of assets.values()) top = Math.max(top, asset.top)
    return top
  }, [assets, shown.tile.thickness, shown.depth])

  const width = mode === 'tile' ? (hero?.width ?? shown.tile.width) : shown.surface.width
  const height = mode === 'tile' ? (hero?.height ?? shown.tile.height) : shown.surface.height
  // Only the single tile turns over, so only it ever shows the parts in its back.
  const seated = mode === 'tile' && hero ? parts : null
  // On its edge the tile stands as tall as it is wide, keys standing out past its sides included.
  const turnSpan = seated ? Math.max(width, seated.extent.maxX) - Math.min(0, seated.extent.minX) : width

  const materials = useTileMaterials(color, tier, showLayerLines, activeNormalMaps)
  // While the single tile turns over it stands up to its own width off the floor, far above the
  // relief the key light's shadow camera is fitted to.
  const [turning, setTurning] = useState(false)

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
        castTop={turning ? turnSpan : undefined}
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
          <TileFlip
            face={mode === 'tile' ? face : 'front'}
            width={width}
            thickness={reliefTop}
            instant={reduced || mode !== 'tile'}
            onTurning={setTurning}
            back={seated ? <SeatedParts set={seated} color={color} width={width} height={height} wave={wave} /> : null}
            extent={seated?.extent ?? null}
          >
            <TileField
              assets={assets}
              pieces={pieces}
              placements={placements}
              materials={materials}
              wave={wave}
              highlightPieceId={highlightPieceId}
              revealCuts={revealCuts}
              cutHatch={object ? LOOK.object.waveCutHatch : undefined}
              reduced={reduced}
              stage={stage}
            />
          </TileFlip>
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
          // Captured only up to `far` above the floor, it draws the insides of a tile standing on its edge
          // as stray marks: the soft ground shadow sits the turn out and lands with the tile.
          opacity={turning ? 0 : LOOK.contact.opacity}
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
