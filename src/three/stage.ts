import * as THREE from 'three'
import { LOOK, type Presentation } from './look'

/** Dimension annotations: kept out of the shadow and contact-shadow passes. */
export const OVERLAY_LAYER = 1
/** Backdrop and light pool: never captured by the contact shadow. */
export const BACKDROP_LAYER = 2

// Scene conventions. Scene units are millimeters. The shown rectangle (the whole surface, or the hero
// tile) is centered at the world origin. Wall stage: the surface stands in the XY plane and print z
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

/** Maps a point of the centered surface frame (x right, y up the surface, z out of the tiles) to world. */
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

/** World corners of a box centered on the surface frame origin. */
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

const WORLD_UP = /* @__PURE__ */ new THREE.Vector3(0, 1, 0)

/** Screen basis of a camera standing at `direction` from its target: forward, right and up, all unit. */
function screenAxes(direction: THREE.Vector3): { forward: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3 } {
  const forward = direction.clone().negate()
  const right = new THREE.Vector3().crossVectors(forward, WORLD_UP)
  if (right.lengthSq() < 1e-10) right.set(1, 0, 0)
  right.normalize()
  return { forward, right, up: new THREE.Vector3().crossVectors(right, forward) }
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

/** Peak swing either side of the framed direction, degrees, in the rig's azimuth/polar convention. */
export interface CameraSweep {
  azimuthDeg: number
  polarDeg: number
}

/**
 * Offset along one screen axis that centers the corners the camera sees. `values` are the corner
 * offsets from the camera along that axis and `depths` their distance in front of it: moving the
 * target sideways moves the camera with it, so depth never changes and the two extreme corners alone
 * fix the offset. A few passes settle which pair that is.
 */
function centerOffset(values: readonly number[], depths: readonly number[]): number {
  let offset = 0
  for (let pass = 0; pass < 8; pass++) {
    let high = -Infinity
    let low = Infinity
    let highValue = 0
    let highDepth = 1
    let lowValue = 0
    let lowDepth = 1
    for (let i = 0; i < values.length; i++) {
      const screen = (values[i] - offset) / depths[i]
      if (screen > high) {
        high = screen
        highValue = values[i]
        highDepth = depths[i]
      }
      if (screen < low) {
        low = screen
        lowValue = values[i]
        lowDepth = depths[i]
      }
    }
    // The offset where the two extremes land at equal and opposite screen positions.
    const next = (highValue * lowDepth + lowValue * highDepth) / (highDepth + lowDepth)
    if (Math.abs(next - offset) < 1e-6) return next
    offset = next
  }
  return offset
}

/**
 * The target that puts `corners` in the middle of the frame, seen from `direction` at `distance`.
 * Fitting alone only promises they are inside it: a wall seen at an angle has one edge nearer than the
 * other, so the near edge fills its side of the frame while the far one leaves a gap.
 */
function recenterTarget(
  corners: readonly THREE.Vector3[],
  target: THREE.Vector3,
  direction: THREE.Vector3,
  distance: number,
): THREE.Vector3 {
  const forward = direction.clone().negate()
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0))
  if (right.lengthSq() < 1e-10) right.set(1, 0, 0)
  right.normalize()
  const upAxis = new THREE.Vector3().crossVectors(right, forward)
  const position = target.clone().addScaledVector(direction, distance)
  const lateral: number[] = []
  const vertical: number[] = []
  const depths: number[] = []
  const rel = new THREE.Vector3()
  for (const c of corners) {
    rel.subVectors(c, position)
    lateral.push(rel.dot(right))
    vertical.push(rel.dot(upAxis))
    // A corner level with the camera would divide by zero; the fit never puts one there.
    depths.push(Math.max(1e-6, rel.dot(forward)))
  }
  return target
    .clone()
    .addScaledVector(right, centerOffset(lateral, depths))
    .addScaledVector(upAxis, centerOffset(vertical, depths))
}

export interface ScreenBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * Where `corners` land on screen, in fractions of the half-frame: +1 is the right edge, -1 the left,
 * +1 the top. The union over every direction the fit holds for, not one view, because a frame the
 * sway swings through has to keep its composition at the ends of that swing as well.
 */
export function screenBounds(
  corners: readonly THREE.Vector3[],
  target: THREE.Vector3,
  directions: readonly THREE.Vector3[],
  distance: number,
  fovDeg: number,
  aspect: number,
): ScreenBounds {
  const tanV = Math.tan((fovDeg * DEG) / 2)
  const tanH = tanV * Math.max(0.1, aspect)
  const bounds: ScreenBounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  const position = new THREE.Vector3()
  const rel = new THREE.Vector3()
  for (const direction of directions) {
    const axes = screenAxes(direction)
    position.copy(target).addScaledVector(direction, distance)
    for (const corner of corners) {
      rel.subVectors(corner, position)
      // A corner level with the camera would divide by zero; the fit never puts one there.
      const depth = Math.max(1e-6, rel.dot(axes.forward))
      const x = rel.dot(axes.right) / (depth * tanH)
      const y = rel.dot(axes.up) / (depth * tanV)
      bounds.minX = Math.min(bounds.minX, x)
      bounds.maxX = Math.max(bounds.maxX, x)
      bounds.minY = Math.min(bounds.minY, y)
      bounds.maxY = Math.max(bounds.maxY, y)
    }
  }
  return bounds
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
  /** The cinematic sway this framing will be swung through: the fit then holds at its extremes too. */
  sweep?: CameraSweep
  /** Center the subject in the frame instead of only fitting it inside. Off: today's framing, exactly. */
  recenter?: boolean
  /** Presentation preset. Omitted or 'studio': today's framing, exactly. */
  presentation?: Presentation
  /**
   * Where the subject sits in the frame and how much air the fit leaves around it. Omitted: centered
   * at the preset's own margin, which is what every route asks for.
   */
  composition?: Composition
}

/** How a subject is composed in its frame. `objectComposition` is the one place these are chosen. */
export interface Composition {
  /**
   * Where the subject is asked to sit, in fractions of the half-frame: 0 is dead center, +0.2 puts it
   * a fifth of the way toward the right edge (and toward the top). An intent, not a promise: a frame
   * with a column of type laid over it holds the subject clear of that column first, and keeps this
   * only where it already does.
   */
  screenShift: { x: number; y: number }
  /** Air the fit leaves around the subject, replacing the preset's own: 1 is edge to edge. */
  margin: number
  /**
   * Fraction of the frame's width that has to stay clear on the left, because the page lays a column
   * of type over exactly that much of this same screen. The fit pulls back until the subject fits
   * what is left of the frame, then sits inside it. Omitted or 0: nothing is laid over this frame.
   */
  clearLeft?: number
}

// Frozen at module scope, so a frame on the narrow side hands back the same object every render and
// nothing downstream re-frames (the cinematic rig restarts its clock on every new framing).
const OBJECT_NARROW: Composition = { screenShift: LOOK.object.narrow.screenShift, margin: LOOK.object.narrow.margin }

// The last wide composition handed out, by the exact frame width it was built for. The clearance is a
// continuous function of that width, so there is no second constant to freeze: this is what keeps a
// render at an unchanged width handing back the identical object.
let wideAt = Number.NaN
let wideComposition: Composition | null = null

/**
 * Where the page's column of type ends on a frame `frameWidthPx` CSS pixels wide, plus the air the
 * wall keeps off it, in CSS pixels. Mirrors `.hero` in LandingPage.module.scss (see
 * `LOOK.object.typeColumn`): a --gutter, then a lede column of at most 27rem, then one --pad of air.
 */
export function typeColumnClearancePx(frameWidthPx: number): number {
  const spec = LOOK.object.typeColumn
  const width = Math.max(1, frameWidthPx)
  const pad = THREE.MathUtils.clamp(spec.padBasePx + width * spec.padPerPx, spec.padMinPx, spec.padMaxPx)
  const gutter = Math.max(pad, (width - spec.contentMaxPx) / 2)
  const column = Math.min(spec.columnPx, Math.max(0, width - gutter * 2))
  return gutter + column + pad * spec.airPads
}

/**
 * How the 'object' presentation composes a frame `frameWidthPx` CSS pixels wide. Wide enough and the
 * page lays its column of type over the left of the same screen: the wall is then held clear of that
 * column, continuously, by the width of the column at this exact width rather than by a breakpoint.
 * A cliff there is what printed the headline over the wall on every window between 993 and 1300 px.
 * Narrower than `narrow.widthPx`, the object stands on a row of its own with nothing over it, so the
 * wall is composed square on: the whole of it, cut column and cut row included, inside a frame that
 * has no width to lose. That one step is the page's own, not the camera's. Read only under
 * presentation 'object'.
 */
export function objectComposition(frameWidthPx: number): Composition {
  if (frameWidthPx <= LOOK.object.narrow.widthPx) return OBJECT_NARROW
  if (wideComposition !== null && wideAt === frameWidthPx) return wideComposition
  wideAt = frameWidthPx
  wideComposition = {
    screenShift: LOOK.object.screenShift,
    margin: LOOK.object.wall.margin,
    clearLeft: Math.min(LOOK.object.typeColumn.maxFraction, typeColumnClearancePx(frameWidthPx) / frameWidthPx),
  }
  return wideComposition
}

/**
 * The opt-in arrival: where the camera stands and how high the key light sits when the wall first
 * appears, and how they settle onto the framing. Pure so the choreography is tested without a canvas;
 * `LOOK.object.arrival` is the one instance of it, and nothing under presentation 'studio' reads it.
 */
export interface ArrivalSpec {
  seconds: number
  power: number
  distanceFactor: number
  azimuthDeg: number
  elevationDeg: number
  keyFromDeg: number
  keySeconds: number
  keyPower: number
}

/**
 * How far the arrival is still from home at `progress`: 1 at the start, 0 once it has landed. Gentle
 * at both ends, so the move leaves the held pose without a jerk and lands without a bounce, and so it
 * carries its length through the middle and the end of its window rather than spending it in the
 * first third: the first third is the one part of it played under a poster that is still dissolving.
 * `power` is the tail: 1 is the ease itself, above 1 settles sooner, below 1 keeps moving later.
 */
function remaining(progress: number, power: number): number {
  return Math.pow(1 - THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(progress, 0, 1), 0, 1), power)
}

/**
 * The camera's offset from the settled framing at `progress`: further back along its own axis, round
 * toward the face of the wall, and higher. The fit already holds over the whole sway and the arrival
 * only ever pulls back from it, so nothing it passes through is outside the frame.
 */
export function arrivalOffset(spec: ArrivalSpec, progress: number): { azimuthDeg: number; polarDeg: number; distanceFactor: number } {
  const back = remaining(progress, spec.power)
  return {
    azimuthDeg: spec.azimuthDeg * back,
    // Polar counts down from +Y where elevation counts up: a higher camera is a smaller polar angle.
    polarDeg: -spec.elevationDeg * back,
    distanceFactor: 1 + (spec.distanceFactor - 1) * back,
  }
}

/**
 * Key-light elevation at `progress` of its own rake, from near the top edge of the wall down to
 * `restDeg`. Gentler than the camera's curve, so the shadows are still lengthening as it comes to rest.
 */
export function rakeElevationDeg(spec: ArrivalSpec, restDeg: number, progress: number): number {
  return restDeg + (spec.keyFromDeg - restDeg) * remaining(progress, spec.keyPower)
}

/**
 * How far the object has turned at `progress` of the hero leaving the screen: 0 while the first screen
 * is where it started, 1 once it has gone. Eased out, so the first turn of the wheel is where most of
 * the turn is, which is the part the visitor is still looking at the object for. `LOOK.object.scroll`
 * is the one instance of it, and nothing under presentation 'studio' reads it.
 */
export function scrollOffset(
  spec: { azimuthDeg: number; elevationDeg: number; distanceFactor: number },
  progress: number,
): { azimuthDeg: number; polarDeg: number; distanceFactor: number } {
  const t = THREE.MathUtils.clamp(progress, 0, 1)
  const eased = t * (2 - t)
  return {
    azimuthDeg: spec.azimuthDeg * eased,
    // Polar counts down from +Y where elevation counts up: dropping the eye is a larger polar angle.
    polarDeg: -spec.elevationDeg * eased,
    distanceFactor: 1 + (spec.distanceFactor - 1) * eased,
  }
}

/** The camera preset a mode and a presentation ask for. */
export function framingPreset(mode: ViewMode, presentation: Presentation = 'studio'): { azimuthDeg: number; elevationDeg: number; margin: number } {
  if (mode === 'tile') return LOOK.camera.tile
  return presentation === 'object' ? LOOK.object.wall : LOOK.camera.wall
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
  const preset = framingPreset(mode, input.presentation)
  const corners = boxCorners(stage, width, height, 0, reliefTop)
  let target = surfaceToWorld(stage, 0, 0, reliefTop / 2)
  const direction = cameraDirection(preset.azimuthDeg, preset.elevationDeg)
  // Fit the annotated rectangle, grown on all four sides so the model still sits centered in the frame.
  const annotation = Math.max(0, input.annotationMm ?? 0)
  const fitCorners = annotation > 0 ? boxCorners(stage, width + annotation * 2, height + annotation * 2, 0, reliefTop) : corners
  // The sway swings the camera around the framing, so the fit has to hold at the corners of that swing
  // as well: polar counts down from +Y where elevation counts up, and both signs are sampled anyway.
  const directions = [direction]
  const sweep = input.sweep
  if (sweep) {
    for (const azimuthDeg of [-sweep.azimuthDeg, sweep.azimuthDeg]) {
      for (const polarDeg of [-sweep.polarDeg, sweep.polarDeg]) {
        directions.push(cameraDirection(preset.azimuthDeg + azimuthDeg, preset.elevationDeg - polarDeg))
      }
    }
  }
  // The composition's own margin where it carries one: a narrow frame is fitted looser than a wide one.
  const margin = input.composition?.margin ?? preset.margin
  const fitAll = (from: THREE.Vector3): number => {
    let fit = 0
    for (const d of directions) fit = Math.max(fit, fitDistance(fitCorners, from, d, input.fovDeg, input.aspect))
    return fit * margin
  }
  let distance = fitAll(target)
  if (input.recenter) {
    // The fit measures the corners against the target and recentering moves it, so the two settle
    // together; two passes land inside a millimeter of that, and the fit runs last so it still holds.
    for (let pass = 0; pass < 2; pass++) {
      target = recenterTarget(fitCorners, target, direction, distance)
      distance = fitAll(target)
    }
  }
  // Off-centre composition: the camera aims beside the subject rather than at it. Where the page lays
  // a column of type over the left of this same frame, what the type leaves is the picture: the fit
  // pulls back until the subject sits inside that band with the same air the margin asks for, and it
  // is centred in the band rather than in a frame it only has the right-hand end of.
  const composition = input.composition
  if (composition) {
    const clear = THREE.MathUtils.clamp(composition.clearLeft ?? 0, 0, 0.8)
    // Half-frame coordinates: -1 is the left edge of the frame and +1 the right, so the column ends here.
    const leftLimit = clear * 2 - 1
    const band = 1 - leftLimit
    // With nothing laid over the frame this is dead centre and the whole width: a frame that keeps no
    // column clear is composed exactly as it was before there was a band to speak of.
    const bandCenter = (leftLimit + 1) / 2
    const axes = screenAxes(direction)
    const tanV = Math.tan((input.fovDeg * DEG) / 2)
    const tanH = tanV * Math.max(0.1, input.aspect)
    // Two passes: moving the target moves the camera with it, which shifts what the swayed views see
    // by a fraction of a percent, and the second pass takes that back out.
    for (let pass = 0; pass < 2; pass++) {
      const seen = screenBounds(fitCorners, target, directions, distance, input.fovDeg, input.aspect)
      // Only ever further back, and only as far as the column asks: a frame with nothing over it keeps
      // the fit it was given. The margin comes with the subject into the band, so a window that hands
      // the object half its width photographs it with air rather than jamming it against the type.
      const pull = Math.max(1, ((seen.maxX - seen.minX) * margin) / band)
      distance *= pull
      const halfWidth = (seen.maxX - seen.minX) / (2 * pull)
      const halfHeight = (seen.maxY - seen.minY) / (2 * pull)
      // The shift is a nudge inside the band, in fractions of its own half-width, so the same number
      // means the same composition whether the page lays a column over this frame or none at all.
      const x = THREE.MathUtils.clamp(bandCenter + composition.screenShift.x * (band / 2), leftLimit + halfWidth, 1 - halfWidth)
      const y = THREE.MathUtils.clamp(composition.screenShift.y, -1 + halfHeight, 1 - halfHeight)
      // Moving the target left is what puts the subject right: the camera travels with it, and both
      // axes are square to the view, so nothing here changes how far away anything is.
      target
        .addScaledVector(axes.right, -(x - (seen.minX + seen.maxX) / (2 * pull)) * distance * tanH)
        .addScaledVector(axes.up, -(y - (seen.minY + seen.maxY) / (2 * pull)) * distance * tanV)
    }
  }
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
