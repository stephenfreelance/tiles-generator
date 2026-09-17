import { Environment, Lightformer } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { LOOK, type LightformerSpec, type Presentation, type Tier } from './look'
import { useSceneServices } from './sceneServices'
import {
  boxCorners,
  fitShadowCamera,
  keyLightDirection,
  rakeElevationDeg,
  stageNormal,
  surfaceToWorld,
  type ShadowFit,
  type Stage,
  type ViewMode,
} from './stage'

/** Photo-studio lighting built from emissive cards, baked once into a cubemap (no network assets). */
const StudioEnvironment = memo(function StudioEnvironment({ stage, tier, intensity }: { stage: Stage; tier: Tier; intensity: number }) {
  const specs: readonly LightformerSpec[] = stage === 'wall' ? LOOK.env.wall : LOOK.env.floor
  return (
    <Environment frames={1} resolution={LOOK.env.resolution[tier]} environmentIntensity={intensity}>
      {specs.map((spec, index) => (
        <Lightformer
          key={index}
          form={spec.form}
          intensity={spec.intensity}
          color={spec.color}
          position={[...spec.position]}
          scale={typeof spec.scale === 'number' ? spec.scale : [...spec.scale]}
          target={[0, 0, 0]}
        />
      ))}
    </Environment>
  )
})

/** Sweeps the studio reflections with the key light. drei only applies the rotation when it rebakes. */
function EnvironmentSpin({ stage, lightAngle, envKey }: { stage: Stage; lightAngle: number; envKey: string }) {
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => {
    const azimuth = THREE.MathUtils.degToRad(lightAngle)
    if (stage === 'wall') scene.environmentRotation.set(0, 0, azimuth)
    else scene.environmentRotation.set(0, azimuth, 0)
    invalidate()
    // envKey re-applies the rotation after drei rebakes the environment.
  }, [scene, stage, lightAngle, envKey, invalidate])
  return null
}

interface KeyLightSetup {
  fit: ShadowFit
  normal: THREE.Vector3
  center: THREE.Vector3
  mapSize: number
  /** PCF softness in texels. Omitted: LOOK.key.radius. */
  radius?: number
}

/** Aims the light and fits its shadow camera; a changed map size frees the old shadow map. */
function configureKeyLight(light: THREE.DirectionalLight, { fit, normal, center, mapSize, radius }: KeyLightSetup): void {
  light.position.copy(fit.position)
  light.target.position.copy(center)
  light.target.updateMatrixWorld()
  if (light.shadow.mapSize.x !== mapSize) {
    light.shadow.mapSize.setScalar(mapSize)
    light.shadow.map?.dispose()
    light.shadow.map = null
  }
  const camera = light.shadow.camera
  camera.up.copy(normal)
  camera.left = fit.left
  camera.right = fit.right
  camera.top = fit.top
  camera.bottom = fit.bottom
  camera.near = fit.near
  camera.far = fit.far
  camera.updateProjectionMatrix()
  const texelMm = Math.max(fit.right - fit.left, fit.top - fit.bottom) / mapSize
  light.shadow.bias = LOOK.key.bias
  // normalBias in world mm, sized from the shadow texel: grazing slopes acne without it.
  light.shadow.normalBias = texelMm * LOOK.key.normalBiasTexels
  light.shadow.radius = radius ?? LOOK.key.radius
  light.shadow.needsUpdate = true
}

interface RakingKeyLightProps {
  stage: Stage
  mode: ViewMode
  width: number
  height: number
  reliefTop: number
  lightAngle: number
  tier: Tier
  /** Presentation preset. Omitted or 'studio': today's rake, exactly. */
  presentation?: Presentation
  /** Tiles stand this far off the shadow catcher, mm: the fit has to reach back to it. */
  standoffMm?: number
  /** prefers-reduced-motion: the key sits at its resting elevation from the first frame. */
  reduced?: boolean
  /** A hand on the view is driving the light itself: the arrival rake runs out of its way. */
  paused?: boolean
  /** Offscreen or hidden: the rake costs nothing, and resumes where it stopped. */
  offscreen?: boolean
  /**
   * The arrival rake holds at frame 0 (the key up near the top edge of the wall) until this is true.
   * The hero sets it when the poster has handed over to the live canvas. Omitted, or without the
   * object presentation, it changes nothing.
   */
  arrivalReady?: boolean
}

/**
 * The one shadow-casting light: a low raking beam so every ridge throws a long shadow. Its shadow
 * camera is fitted to the view, and the map only re-renders when the scene (not the camera) changes.
 *
 * The object presentation opens on a rake: the key starts near the top edge of the wall and walks
 * down to its resting elevation while the tiles lay in, which is the one moment every ridge shows the
 * whole length of the shadow it throws. It is driven from this frame loop rather than from a tween,
 * because the aiming here is a handful of vector operations and an imperative animate() would put
 * about 3 kB gzipped into the landing chunk to move one number.
 */
function RakingKeyLight({
  stage,
  mode,
  width,
  height,
  reliefTop,
  lightAngle,
  tier,
  presentation = 'studio',
  standoffMm = 0,
  reduced = false,
  paused = false,
  offscreen = false,
  arrivalReady = true,
}: RakingKeyLightProps) {
  const invalidate = useThree((state) => state.invalidate)
  const services = useSceneServices()
  const object = presentation === 'object' && mode === 'surface'
  const rakes = object && !reduced
  const light = useMemo(() => {
    const created = new THREE.DirectionalLight(LOOK.key.color, object ? LOOK.object.keyIntensity : LOOK.key.intensity)
    created.castShadow = true
    return created
  }, [object])
  // Progress of the arrival rake, and the elevation the shadow camera was last fitted for. Per mount,
  // like the camera's own arrival: 1 means the key is at rest, which is every view but a hero arriving.
  const rakeRef = useRef<{ progress: number; lastAt: number; appliedDeg: number } | null>(null)
  if (rakeRef.current === null) rakeRef.current = { progress: rakes ? 0 : 1, lastAt: 0, appliedDeg: Number.NaN }
  // Mount only: the rake's clock starts when the camera's arrival does, not on its first frame, so a
  // slow first frame does not leave the light behind the camera it was choreographed with.
  useEffect(() => {
    const rake = rakeRef.current
    if (rake) rake.lastAt = performance.now()
  }, [])

  useEffect(
    () => () => {
      light.shadow.map?.dispose()
      light.dispose()
    },
    [light],
  )

  const restDeg = object ? LOOK.object.keyElevationDeg : mode === 'tile' ? LOOK.key.elevationDeg.tile : LOOK.key.elevationDeg.wall

  /** Aims the key at `elevationDeg` above the surface and refits its shadow camera for that rake. */
  const aim = useCallback(
    (elevationDeg: number) => {
      const direction = keyLightDirection(stage, lightAngle, elevationDeg)
      const normal = stageNormal(stage)
      const back = Math.max(0, standoffMm)
      const center = surfaceToWorld(stage, 0, 0, reliefTop / 2)
      // Relief shadows reach past the tiles on the backdrop; include that spill in the fit. A standing-off
      // wall throws from its whole depth, so the spill is measured from the catcher, not from the tile back.
      const spill = (reliefTop + back) / Math.tan(THREE.MathUtils.degToRad(elevationDeg)) + LOOK.key.marginMm
      const corners = boxCorners(stage, width + spill * 2, height + spill * 2, -back, reliefTop)
      const fit = fitShadowCamera(corners, center, direction, normal, LOOK.key.marginMm)
      configureKeyLight(light, { fit, normal, center, mapSize: LOOK.key.mapSize[tier], radius: object ? LOOK.object.shadowRadius : undefined })
      const rake = rakeRef.current
      if (rake) rake.appliedDeg = elevationDeg
    },
    [light, stage, lightAngle, width, height, reliefTop, tier, object, standoffMm],
  )

  useEffect(() => {
    const rake = rakeRef.current
    // Whatever moved (the pointer's azimuth, a new wall, a tier change), the key is re-aimed where the
    // rake has it now, so a light angle that changes mid-arrival never snaps the elevation back.
    aim(rakes && rake ? rakeElevationDeg(LOOK.object.arrival, restDeg, rake.progress) : restDeg)
    services.shadows.mark(3)
    invalidate()
  }, [aim, restDeg, rakes, services, invalidate])

  // The hold ends between frames, so the loop has to be woken for it: nothing else would ask.
  useEffect(() => {
    const rake = rakeRef.current
    if (!arrivalReady || !rake || rake.progress >= 1) return
    rake.lastAt = performance.now()
    invalidate()
  }, [arrivalReady, invalidate])

  useFrame(() => {
    const rake = rakeRef.current
    if (!rake || rake.progress >= 1 || offscreen) return
    if (!rakes) {
      rake.progress = 1
      return
    }
    // Held with the camera's own arrival: the key stays up near the top edge of the wall until the
    // hero says the canvas is what is on screen, so the two still land together.
    if (!arrivalReady) {
      rake.lastAt = performance.now()
      return
    }
    // A hand on the wall is driving this very light: the rake runs itself out rather than fight it.
    const speed = paused ? LOOK.object.arrival.keyYield : 1
    // Paced by the clock like the camera's own arrival, so the two stay together whatever the frame rate.
    const now = performance.now()
    const elapsed = rake.lastAt === 0 ? 0 : Math.max(0, now - rake.lastAt) / 1000
    rake.lastAt = now
    rake.progress = Math.min(1, rake.progress + (elapsed * speed) / LOOK.object.arrival.keySeconds)
    const elevationDeg = rakeElevationDeg(LOOK.object.arrival, restDeg, rake.progress)
    // Every aim re-renders a shadow map, so the rake is quantized: about fifty of them, not two hundred.
    if (rake.progress >= 1 || Math.abs(elevationDeg - rake.appliedDeg) >= LOOK.object.arrival.keyQuantumDeg) {
      aim(elevationDeg)
      // One frame, not the default two: the next aim is a frame or two away for the whole of the rake,
      // so a two-frame mark re-renders the shadow map for a light that has not moved since.
      services.shadows.mark(1)
    }
    invalidate()
  })

  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  )
}

export interface StudioLightsProps extends RakingKeyLightProps {
  stage: Stage
}

export function StudioLights(props: StudioLightsProps) {
  const { stage, mode, tier, lightAngle, presentation = 'studio' } = props
  const intensity = presentation === 'object' && mode === 'surface' ? LOOK.object.envIntensity : LOOK.env.intensity
  return (
    <>
      <StudioEnvironment stage={stage} tier={tier} intensity={intensity} />
      <EnvironmentSpin stage={stage} lightAngle={lightAngle} envKey={`${stage}:${tier}`} />
      <RakingKeyLight {...props} />
    </>
  )
}
