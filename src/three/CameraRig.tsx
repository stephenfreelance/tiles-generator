import { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { LOOK } from './look'
import { useSceneServices } from './sceneServices'
import type { Framing, Stage, ViewMode } from './stage'

export interface CameraRigHandle {
  /** Frames the view again, animated. */
  reset(): void
  orbit(azimuthDeg: number, polarDeg: number): void
  dolly(factor: number): void
}

export interface CameraRigProps {
  framing: Framing
  /** Identity of the framed subject: changes when the mode, the stage or the surface size changes. */
  framingKey: string
  mode: ViewMode
  stage: Stage
  interactive: boolean
  reduced: boolean
  /** Offscreen or hidden: stop asking for frames. */
  paused: boolean
}

function applyCameraClipping(camera: THREE.PerspectiveCamera, framing: Framing) {
  camera.near = framing.near
  camera.far = framing.far
  camera.updateProjectionMatrix()
}

const _direction = new THREE.Vector3()
const _position = new THREE.Vector3()

/** Orbit, dolly and the idle turntable, with limits that never let the view go behind the wall. */
const InteractiveRig = forwardRef<CameraRigHandle, CameraRigProps>(function InteractiveRig({ framing, framingKey, mode, reduced }, ref) {
  const controlsRef = useRef<CameraControls>(null)
  const stateRef = useRef({ lastInteraction: 0, dragging: false, key: '', moved: false })
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((state) => state.invalidate)
  const services = useSceneServices()

  const applyFraming = useCallback(
    (animate: boolean) => {
      const controls = controlsRef.current
      if (!controls) return
      controls.normalizeRotations()
      controls.minDistance = framing.minDistance
      controls.maxDistance = framing.maxDistance
      controls.minAzimuthAngle = framing.azimuthLimits[0]
      controls.maxAzimuthAngle = framing.azimuthLimits[1]
      controls.minPolarAngle = framing.polarLimits[0]
      controls.maxPolarAngle = framing.polarLimits[1]
      controls.setBoundary(framing.boundary)
      applyCameraClipping(camera, framing)
      void controls.setLookAt(
        framing.position.x,
        framing.position.y,
        framing.position.z,
        framing.target.x,
        framing.target.y,
        framing.target.z,
        animate,
      )
      const now = performance.now()
      // Hold the turntable off until just after the framing settles.
      stateRef.current.lastInteraction = now - LOOK.camera.idleResumeMs + LOOK.camera.turntableStartMs
      stateRef.current.moved = false
      services.motion.bump(now)
      invalidate()
    },
    [framing, camera, invalidate, services],
  )

  useEffect(() => {
    const state = stateRef.current
    const first = state.key === ''
    if (state.key === framingKey && state.moved) {
      // Only the viewport aspect changed and the view is the user's: keep it, refresh the clipping.
      applyCameraClipping(camera, framing)
      invalidate()
      return
    }
    state.key = framingKey
    applyFraming(!first && !reduced)
  }, [applyFraming, framing, framingKey, camera, invalidate, reduced])

  useImperativeHandle(
    ref,
    () => ({
      reset: () => applyFraming(!reduced),
      orbit: (azimuthDeg: number, polarDeg: number) => {
        const controls = controlsRef.current
        if (!controls) return
        stateRef.current.lastInteraction = performance.now()
        stateRef.current.moved = true
        void controls.rotate(THREE.MathUtils.degToRad(azimuthDeg), THREE.MathUtils.degToRad(polarDeg), !reduced)
        invalidate()
      },
      dolly: (factor: number) => {
        const controls = controlsRef.current
        if (!controls) return
        stateRef.current.lastInteraction = performance.now()
        stateRef.current.moved = true
        void controls.dollyTo(THREE.MathUtils.clamp(controls.distance * factor, framing.minDistance, framing.maxDistance), !reduced)
        invalidate()
      },
    }),
    [applyFraming, framing.minDistance, framing.maxDistance, invalidate, reduced],
  )

  const noteInteraction = useCallback(
    (dragging: boolean) => {
      const state = stateRef.current
      state.dragging = dragging
      state.moved = true
      state.lastInteraction = performance.now()
      services.motion.bump(state.lastInteraction)
    },
    [services],
  )

  const onControlStart = useCallback(() => noteInteraction(true), [noteInteraction])
  const onControlEnd = useCallback(() => noteInteraction(false), [noteInteraction])
  const onControl = useCallback(() => noteInteraction(stateRef.current.dragging), [noteInteraction])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    if (!controls || mode !== 'tile' || reduced) return
    const state = stateRef.current
    const now = performance.now()
    if (state.dragging || now - state.lastInteraction < LOOK.camera.idleResumeMs) return
    void controls.rotate(THREE.MathUtils.degToRad(LOOK.camera.turntableDegPerSec) * delta, 0, false)
    services.motion.bump(now)
    invalidate()
  })

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      regress
      smoothTime={LOOK.camera.smoothTime}
      draggingSmoothTime={LOOK.camera.draggingSmoothTime}
      dollyToCursor={mode === 'surface'}
      onControlStart={onControlStart}
      onControl={onControl}
      onControlEnd={onControlEnd}
    />
  )
})

/** Landing hero: no controls, a slow cinematic move (a sway across a wall, a turntable around a tile). */
const CinematicRig = forwardRef<CameraRigHandle, CameraRigProps>(function CinematicRig({ framing, stage, reduced, paused }, ref) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((state) => state.invalidate)
  const services = useSceneServices()
  const stateRef = useRef({ startedAt: 0 })

  const place = useCallback(
    (azimuth: number, polar: number, distance: number) => {
      _direction.set(Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth))
      _position.copy(framing.target).addScaledVector(_direction, distance)
      camera.position.copy(_position)
      camera.lookAt(framing.target)
      camera.updateMatrixWorld()
    },
    [camera, framing.target],
  )

  useEffect(() => {
    applyCameraClipping(camera, framing)
    stateRef.current.startedAt = performance.now()
    place(framing.azimuth, framing.polar, framing.distance)
    invalidate()
  }, [camera, framing, place, invalidate])

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        stateRef.current.startedAt = performance.now()
        place(framing.azimuth, framing.polar, framing.distance)
        invalidate()
      },
      orbit: () => {},
      dolly: () => {},
    }),
    [framing, place, invalidate],
  )

  useFrame(() => {
    if (reduced || paused) return
    const now = performance.now()
    const seconds = (now - stateRef.current.startedAt) / 1000
    const cinematic = LOOK.camera.cinematic
    const sway = stage === 'wall'
    const azimuth =
      framing.azimuth +
      (sway
        ? THREE.MathUtils.degToRad(cinematic.azimuthAmpDeg) * Math.sin((2 * Math.PI * seconds) / cinematic.periodS)
        : THREE.MathUtils.degToRad(cinematic.turntableDegPerSec * seconds))
    const polar =
      framing.polar + THREE.MathUtils.degToRad(cinematic.elevationAmpDeg) * Math.sin((2 * Math.PI * seconds) / (cinematic.periodS * 1.7))
    place(azimuth, THREE.MathUtils.clamp(polar, framing.polarLimits[0], framing.polarLimits[1]), framing.distance)
    services.motion.bump(now)
    invalidate()
  })

  return null
})

export const CameraRig = forwardRef<CameraRigHandle, CameraRigProps>(function CameraRig(props, ref) {
  return props.interactive ? <InteractiveRig {...props} ref={ref} /> : <CinematicRig {...props} ref={ref} />
})
