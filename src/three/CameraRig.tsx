import { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { LOOK, type Presentation } from './look'
import { useSceneServices } from './sceneServices'
import { arrivalOffset, type Framing, type Stage, type ViewMode } from './stage'

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
  /** Offscreen, hidden, or a hand on the view: stop asking for frames. */
  paused: boolean
  /** Offscreen or hidden on its own: nothing at all runs, the arrival included. */
  offscreen?: boolean
  /** Presentation preset. Omitted or 'studio': today's cinematic sway, exactly. */
  presentation?: Presentation
  /**
   * The object presentation's arrival holds at frame 0 until this is true. The hero sets it when the
   * poster has handed over to the live canvas: without it the whole move plays out behind a still
   * image and the visitor meets a camera that has already landed. Omitted: it plays at once.
   */
  arrivalReady?: boolean
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
      smoothTime={LOOK.camera.smoothTime}
      draggingSmoothTime={LOOK.camera.draggingSmoothTime}
      dollyToCursor={mode === 'surface'}
      onControlStart={onControlStart}
      onControl={onControl}
      onControlEnd={onControlEnd}
    />
  )
})

/**
 * Landing hero: no controls, a slow cinematic move (a sway across a wall, a turntable around a tile).
 * The object presentation opens with an arrival, once: the camera settles in from further back and
 * further round onto the framing, and afterwards keeps the drift. Under prefers-reduced-motion none
 * of it runs and the view is placed at its settled framing from the first frame.
 */
const CinematicRig = forwardRef<CameraRigHandle, CameraRigProps>(function CinematicRig(
  { framing, stage, reduced, paused, offscreen = false, presentation = 'studio', arrivalReady = true },
  ref,
) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((state) => state.invalidate)
  const services = useSceneServices()
  // How long the drift carries on after the arrival with no hand near the wall. 0: forever, which is
  // every view but the object's.
  const idleStopMs = presentation === 'object' && stage === 'wall' ? LOOK.object.driftIdleMs : 0
  // `played` is per mount, not per framing: the visitor sizes this wall in a field beside it, and an
  // arrival that replayed on every re-frame would pull the camera back on every keystroke.
  const stateRef = useRef({ startedAt: 0, progress: 0, lastAt: 0, arriving: false, played: false, idleAt: 0 })
  const arrival = presentation === 'object' && stage === 'wall' && !reduced ? LOOK.object.arrival : null

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

  /** The arrival frozen at `progress`, or the settled framing itself at 1. */
  const placeAt = useCallback(
    (progress: number) => {
      if (!arrival) {
        place(framing.azimuth, framing.polar, framing.distance)
        return
      }
      const offset = arrivalOffset(arrival, progress)
      place(
        framing.azimuth + THREE.MathUtils.degToRad(offset.azimuthDeg),
        THREE.MathUtils.clamp(
          framing.polar + THREE.MathUtils.degToRad(offset.polarDeg),
          framing.polarLimits[0],
          framing.polarLimits[1],
        ),
        framing.distance * offset.distanceFactor,
      )
    },
    [arrival, framing, place],
  )

  useEffect(() => {
    applyCameraClipping(camera, framing)
    const state = stateRef.current
    state.startedAt = performance.now()
    if (arrival && !state.played) {
      // A re-frame mid-arrival (a resize, a wall retyped) keeps the progress it had: only a fresh
      // mount starts at 0, so the camera never jumps back out to make the same entrance twice.
      state.arriving = true
      state.lastAt = state.startedAt
      placeAt(state.progress)
    } else {
      // A new framing is a visitor typing a new wall: the drift is worth running again for them.
      if (state.idleAt > 0) state.idleAt = state.startedAt
      placeAt(1)
    }
    invalidate()
  }, [camera, framing, placeAt, arrival, invalidate])

  // The hold ends between frames, so the loop has to be woken for it: nothing else would ask.
  useEffect(() => {
    const state = stateRef.current
    if (!arrivalReady || !state.arriving) return
    state.lastAt = performance.now()
    invalidate()
  }, [arrivalReady, invalidate])

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        const state = stateRef.current
        state.startedAt = performance.now()
        state.arriving = false
        state.played = true
        state.progress = 1
        place(framing.azimuth, framing.polar, framing.distance)
        invalidate()
      },
      orbit: () => {},
      dolly: () => {},
    }),
    [framing, place, invalidate],
  )

  useFrame(() => {
    // Off screen nothing runs at all, the arrival included, and nothing asks for another frame.
    if (offscreen) return
    const state = stateRef.current
    const now = performance.now()
    // The arrival runs to its end even while the caller pauses the drift: a hand on the wall is a
    // reason to stop the loop, never to leave the camera stranded halfway in. Paced by the clock and
    // not by frames, so it takes the same LOOK.object.arrival.seconds on a machine drawing 12 of them a
    // second as on one drawing 120, and a view scrolled away and come back to finds it over.
    if (arrival && state.arriving) {
      // Held at frame 0 until the hero says the canvas is the thing on screen: the clock is kept level
      // with now, so the wait costs the arrival none of its length, and no frame is asked for.
      if (!arrivalReady) {
        state.lastAt = now
        return
      }
      const elapsed = Math.max(0, now - state.lastAt) / 1000
      state.lastAt = now
      state.progress = Math.min(1, state.progress + elapsed / arrival.seconds)
      placeAt(state.progress)
      if (state.progress >= 1) {
        state.arriving = false
        state.played = true
        state.startedAt = now
        state.idleAt = now
      }
      services.motion.bump(now)
      invalidate()
      return
    }
    if (reduced) return
    if (paused) {
      // A hand on the wall, or a hero scrolled off screen: the countdown to the idle stop runs from
      // the moment that ends, so coming back to the object always brings the drift back with it.
      state.idleAt = now
      return
    }
    // The drift is scenery, not a thing being watched: once the arrival has landed and nothing has
    // touched the wall for a while it stands down and the loop is allowed to sleep, the way the
    // studio's turntable holds off until the view has been left alone. It costs a landing page a
    // frame every 16 ms for as long as the tab is open, and nobody is watching a 7 degree drift.
    if (idleStopMs > 0 && state.idleAt > 0 && now - state.idleAt > idleStopMs) return
    const seconds = (now - state.startedAt) / 1000
    const sway = stage === 'wall'
    // A product photograph drifts rather than sways: the object presentation halves the swing and
    // stretches the period, so the wall is alive without ever looking like it is being waved about.
    const cinematic = presentation === 'object' && sway ? { ...LOOK.camera.cinematic, ...LOOK.object.cinematic } : LOOK.camera.cinematic
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
