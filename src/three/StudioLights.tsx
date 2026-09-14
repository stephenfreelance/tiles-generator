import { Environment, Lightformer } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { memo, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { LOOK, type LightformerSpec, type Tier } from './look'
import { useSceneServices } from './sceneServices'
import { boxCorners, fitShadowCamera, keyLightDirection, stageNormal, surfaceToWorld, type ShadowFit, type Stage, type ViewMode } from './stage'

/** Photo-studio lighting built from emissive cards, baked once into a cubemap (no network assets). */
const StudioEnvironment = memo(function StudioEnvironment({ stage, tier }: { stage: Stage; tier: Tier }) {
  const specs: readonly LightformerSpec[] = stage === 'wall' ? LOOK.env.wall : LOOK.env.floor
  return (
    <Environment frames={1} resolution={LOOK.env.resolution[tier]} environmentIntensity={LOOK.env.intensity}>
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
}

/** Aims the light and fits its shadow camera; a changed map size frees the old shadow map. */
function configureKeyLight(light: THREE.DirectionalLight, { fit, normal, center, mapSize }: KeyLightSetup): void {
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
  light.shadow.radius = LOOK.key.radius
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
}

/**
 * The one shadow-casting light: a low raking beam so every ridge throws a long shadow. Its shadow
 * camera is fitted to the view, and the map only re-renders when the scene (not the camera) changes.
 */
function RakingKeyLight({ stage, mode, width, height, reliefTop, lightAngle, tier }: RakingKeyLightProps) {
  const invalidate = useThree((state) => state.invalidate)
  const services = useSceneServices()
  const light = useMemo(() => {
    const created = new THREE.DirectionalLight(LOOK.key.color, LOOK.key.intensity)
    created.castShadow = true
    return created
  }, [])

  useEffect(
    () => () => {
      light.shadow.map?.dispose()
      light.dispose()
    },
    [light],
  )

  useEffect(() => {
    const elevation = mode === 'tile' ? LOOK.key.elevationDeg.tile : LOOK.key.elevationDeg.wall
    const direction = keyLightDirection(stage, lightAngle, elevation)
    const normal = stageNormal(stage)
    const center = surfaceToWorld(stage, 0, 0, reliefTop / 2)
    // Relief shadows reach past the tiles on the backdrop; include that spill in the fit.
    const spill = reliefTop / Math.tan(THREE.MathUtils.degToRad(elevation)) + LOOK.key.marginMm
    const corners = boxCorners(stage, width + spill * 2, height + spill * 2, 0, reliefTop)
    const fit = fitShadowCamera(corners, center, direction, normal, LOOK.key.marginMm)
    configureKeyLight(light, { fit, normal, center, mapSize: LOOK.key.mapSize[tier] })
    services.shadows.mark(3)
    invalidate()
  }, [light, stage, mode, width, height, reliefTop, lightAngle, tier, services, invalidate])

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
  const { stage, tier, lightAngle } = props
  return (
    <>
      <StudioEnvironment stage={stage} tier={tier} />
      <EnvironmentSpin stage={stage} lightAngle={lightAngle} envKey={`${stage}:${tier}`} />
      <RakingKeyLight {...props} />
    </>
  )
}
