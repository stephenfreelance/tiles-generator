import * as THREE from 'three'
import { LOOK } from './look'

/** Dimension annotations: kept out of the shadow and contact-shadow passes. */
export const OVERLAY_LAYER = 1
/** Backdrop and light pool: never captured by the contact shadow. */
export const BACKDROP_LAYER = 2

// Scene conventions. Scene units are millimetres. The shown rectangle (the whole surface, or the hero
// tile) is centred at the world origin. Wall stage: the surface stands in the XY plane and print z
// faces the viewer (+Z). Floor stage: the surface lies in the XZ plane with print z up (+Y) and the
// surface's y axis running away from the viewer (-Z).

export type Stage = 'wall' | 'floor'
export type ViewMode = 'surface' | 'tile'

const DEG = Math.PI / 180

export function stageFor(mode: ViewMode): Stage {
  // A surface of tiles is always shown as an elevation, which is what the product covers; a single
  // tile always lies face-up, like fresh off the print bed.
  return mode === 'tile' ? 'floor' : 'wall'
}

/** Rotation of the stage group about x. */
export function stageRotationX(stage: Stage): number {
  return stage === 'floor' ? -Math.PI / 2 : 0
}

/** Maps a point of the centred surface frame (x right, y up the surface, z out of the tiles) to world. */
export function surfaceToWorld(stage: Stage, x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  return stage === 'floor' ? out.set(x, z, -y) : out.set(x, y, z)
}

/** World direction of the tile surface normal. */
export function stageNormal(stage: Stage): THREE.Vector3 {
  return surfaceToWorld(stage, 0, 0, 1)
}

/**
 * Unit vector toward the raking key light. Azimuth is measured in the surface plane from the surface's
 * +x axis, counter-clockwise (90 = light from the top edge); elevation is above the tile surface.
 */
export function keyLightDirection(stage: Stage, azimuthDeg: number, elevationDeg: number): THREE.Vector3 {
  const az = azimuthDeg * DEG
  const el = elevationDeg * DEG
  return surfaceToWorld(stage, Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)).normalize()
}

/** Direction of the surface's (-1, 1) diagonal in world space, across which hatch lines repeat. */
export function hatchDirection(stage: Stage): THREE.Vector3 {
  return surfaceToWorld(stage, -Math.SQRT1_2, Math.SQRT1_2, 0)
}

/** World corners of a box centred on the surface frame origin. */
export function boxCorners(stage: Stage, width: number, height: number, zMin: number, zMax: number): THREE.Vector3[] {
  const corners: THREE.Vector3[] = []
  for (const x of [-width / 2, width / 2]) {
    for (const y of [-height / 2, height / 2]) {
      for (const z of [zMin, zMax]) corners.push(surfaceToWorld(stage, x, y, z))
    }
  }
  return corners
}

/** Distance from the model to its dimension lines, mm: one formula for the drawing and the camera fit. */
export function dimensionOffsetMm(mode: ViewMode, width: number, height: number): number {
  const spec = mode === 'tile' ? LOOK.dims.tileOffset : LOOK.dims.surfaceOffset
  return THREE.MathUtils.clamp(Math.max(width, height) * spec.fraction, spec.min, spec.max)
}

/**
 * Room the annotations need beyond the model, mm: the dimension line, its extension overshoot and the
 * label tag sitting on it. Without this the camera frames the tiles alone and clips the labels.
 */
export function annotationMarginMm(mode: ViewMode, width: number, height: number): number {
  return dimensionOffsetMm(mode, width, height) * (1 + LOOK.dims.overshootFraction + 0.35)
}

export interface ShadowFit {
  position: THREE.Vector3
  left: number
  right: number
  top: number
  bottom: number
  near: number
  far: number
}

/**
 * Tight orthographic frustum around `corners` for a light shining from `direction` (unit, toward the
 * light), for a shadow camera oriented with `up`. Mirrors how three aims the shadow camera (lookAt).
 */
export function fitShadowCamera(
  corners: THREE.Vector3[],
  center: THREE.Vector3,
  direction: THREE.Vector3,
  up: THREE.Vector3,
  marginMm: number,
): ShadowFit {
  let radius = 0
  for (const c of corners) radius = Math.max(radius, c.distanceTo(center))
  const position = center.clone().addScaledVector(direction, radius * 2 + marginMm * 4)
  // Camera basis as in Matrix4.lookAt(eye, target, up): z points from the target to the eye.
  const zAxis = direction.clone()
  const xAxis = new THREE.Vector3().crossVectors(up, zAxis)
  if (xAxis.lengthSq() < 1e-10) xAxis.set(1, 0, 0)
  xAxis.normalize()
  const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minDepth = Infinity
  let maxDepth = -Infinity
  const rel = new THREE.Vector3()
  for (const c of corners) {
    rel.subVectors(c, position)
    const x = rel.dot(xAxis)
    const y = rel.dot(yAxis)
    const depth = -rel.dot(zAxis)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    minDepth = Math.min(minDepth, depth)
    maxDepth = Math.max(maxDepth, depth)
  }
  return {
    position,
    left: minX - marginMm,
    right: maxX + marginMm,
    bottom: minY - marginMm,
    top: maxY + marginMm,
    near: Math.max(0.1, minDepth - marginMm),
    far: maxDepth + marginMm,
  }
}

/** World direction from the target toward the camera for camera-controls style azimuth/elevation. */
export function cameraDirection(azimuthDeg: number, elevationDeg: number): THREE.Vector3 {
  const az = azimuthDeg * DEG
  const el = elevationDeg * DEG
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
}

/** Smallest camera distance along `direction` that keeps every corner inside the frustum. */
export function fitDistance(corners: THREE.Vector3[], target: THREE.Vector3, direction: THREE.Vector3, fovDeg: number, aspect: number): number {
  const forward = direction.clone().negate()
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0))
  if (right.lengthSq() < 1e-10) right.set(1, 0, 0)
  right.normalize()
  const upAxis = new THREE.Vector3().crossVectors(right, forward)
  const tanV = Math.tan((fovDeg * DEG) / 2)
  const tanH = tanV * Math.max(0.1, aspect)
  let distance = 0
  const rel = new THREE.Vector3()
  for (const c of corners) {
    rel.subVectors(c, target)
    const along = rel.dot(direction)
    distance = Math.max(distance, along + Math.abs(rel.dot(right)) / tanH, along + Math.abs(rel.dot(upAxis)) / tanV)
  }
  return distance
}

export interface FramingInput {
  stage: Stage
  mode: ViewMode
  /** Size of the shown rectangle (surface or hero tile), mm. */
  width: number
  height: number
  /** Highest point of the relief above the bottom face, mm. */
  reliefTop: number
  /** Nominal tile size, mm, for dolly limits. */
  tileWidth: number
  tileHeight: number
  aspect: number
  fovDeg: number
  /** Room to keep for the dimension annotations, mm; 0 when they are hidden. */
  annotationMm?: number
}

export interface Framing {
  target: THREE.Vector3
  position: THREE.Vector3
  distance: number
  /** camera-controls convention: azimuth around +Y from +Z, polar from +Y (radians). */
  azimuth: number
  polar: number
  minDistance: number
  maxDistance: number
  azimuthLimits: [number, number]
  polarLimits: [number, number]
  near: number
  far: number
  /** The orbit target cannot leave this box. */
  boundary: THREE.Box3
}

export function computeFraming(input: FramingInput): Framing {
  const { stage, mode, width, height, reliefTop } = input
  const preset = mode === 'tile' ? LOOK.camera.tile : LOOK.camera.wall
  const corners = boxCorners(stage, width, height, 0, reliefTop)
  const target = surfaceToWorld(stage, 0, 0, reliefTop / 2)
  const direction = cameraDirection(preset.azimuthDeg, preset.elevationDeg)
  // Fit the annotated rectangle, grown on all four sides so the model still sits centred in the frame.
  const annotation = Math.max(0, input.annotationMm ?? 0)
  const fitCorners = annotation > 0 ? boxCorners(stage, width + annotation * 2, height + annotation * 2, 0, reliefTop) : corners
  const distance = fitDistance(fitCorners, target, direction, input.fovDeg, input.aspect) * preset.margin
  const position = target.clone().addScaledVector(direction, distance)

  const tileEdge = Math.max(input.tileWidth, input.tileHeight)
  const tileDiagonal = Math.hypot(input.tileWidth, input.tileHeight)
  const minDistance =
    mode === 'tile'
      ? tileDiagonal * LOOK.camera.tileMinDistanceDiagonals
      : Math.min(distance * 0.8, Math.max(40, tileEdge * LOOK.camera.surfaceMinDistanceTiles))
  const maxDistance = Math.max(distance * LOOK.camera.maxDistanceFit, minDistance * 1.5)
  const span = Math.max(width, height)

  const wall = stage === 'wall'
  const azLimit = LOOK.camera.wallAzimuthLimitDeg * DEG
  const polarRange = wall ? LOOK.camera.wallPolarRangeDeg : LOOK.camera.floorPolarRangeDeg

  const boundary = new THREE.Box3().setFromPoints(corners).expandByScalar(span * 0.08)
  return {
    target,
    position,
    distance,
    azimuth: Math.atan2(direction.x, direction.z),
    polar: Math.acos(THREE.MathUtils.clamp(direction.y, -1, 1)),
    minDistance,
    maxDistance,
    azimuthLimits: wall ? [-azLimit, azLimit] : [-Infinity, Infinity],
    polarLimits: [polarRange[0] * DEG, polarRange[1] * DEG],
    near: Math.max(0.5, minDistance / 20),
    far: maxDistance * 2 + span * 4,
    boundary,
  }
}
