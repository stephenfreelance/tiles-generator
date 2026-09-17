import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { LOOK } from './look'
import {
  annotationMarginMm,
  arrivalOffset,
  boxCorners,
  cameraDirection,
  computeFraming,
  fitDistance,
  fitShadowCamera,
  type Framing,
  keyLightDirection,
  objectComposition,
  rakeElevationDeg,
  stageFor,
  stageNormal,
  surfaceToWorld,
} from './stage'

describe('stage frames', () => {
  it('stands a surface up as an elevation and lays a single tile face-up', () => {
    expect(stageFor('surface')).toBe('wall')
    expect(stageFor('tile')).toBe('floor')
  })

  it('stands the wall in XY and lays the floor in XZ with print z up', () => {
    const axes = (v: THREE.Vector3) => v.toArray().map((n) => n + 0)
    expect(axes(surfaceToWorld('wall', 1, 2, 3))).toEqual([1, 2, 3])
    expect(axes(surfaceToWorld('floor', 1, 2, 3))).toEqual([1, 3, -2])
    expect(axes(stageNormal('floor'))).toEqual([0, 1, 0])
  })

  it('rakes the key light at the requested elevation above the surface', () => {
    for (const stage of ['wall', 'floor'] as const) {
      const d = keyLightDirection(stage, 35, 16)
      const elevation = Math.asin(d.dot(stageNormal(stage))) * (180 / Math.PI)
      expect(elevation).toBeCloseTo(16, 5)
    }
  })
})

describe('fitDistance', () => {
  it('keeps every corner of a wide wall inside the frustum', () => {
    const corners = boxCorners('wall', 2400, 1200, 0, 6)
    const target = new THREE.Vector3(0, 0, 3)
    const dir = cameraDirection(-24, 11)
    const aspect = 1.6
    const fov = 30
    const d = fitDistance(corners, target, dir, fov, aspect)
    const camera = new THREE.PerspectiveCamera(fov, aspect, 1, 1e6)
    camera.position.copy(target).addScaledVector(dir, d * 1.001)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    for (const c of corners) {
      const ndc = c.clone().project(camera)
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1.0001)
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1.0001)
    }
  })
})

describe('fitShadowCamera', () => {
  it('encloses every corner in the light frustum', () => {
    const corners = boxCorners('wall', 1200, 600, 0, 8)
    const center = new THREE.Vector3()
    const dir = keyLightDirection('wall', 35, 16)
    const fit = fitShadowCamera(corners, center, dir, stageNormal('wall'), 4)
    const cam = new THREE.OrthographicCamera(fit.left, fit.right, fit.top, fit.bottom, fit.near, fit.far)
    cam.up.copy(stageNormal('wall'))
    cam.position.copy(fit.position)
    cam.lookAt(center)
    cam.updateMatrixWorld()
    cam.updateProjectionMatrix()
    for (const c of corners) {
      const ndc = c.clone().project(cam)
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(ndc.z)).toBeLessThanOrEqual(1)
    }
  })
})

describe('computeFraming', () => {
  /** The landing board's wall: 1,000 x 700 mm on a 16/11 board, the one view fitted for a sway. */
  const BOARD = {
    stage: 'wall',
    mode: 'surface',
    width: 1000,
    height: 700,
    reliefTop: 6.4,
    tileWidth: 150,
    tileHeight: 150,
    aspect: 1.45,
    fovDeg: 30,
  } as const

  const expectVector = (actual: THREE.Vector3, expected: readonly number[]) => {
    actual.toArray().forEach((value, index) => expect(value).toBeCloseTo(expected[index], 3))
  }

  /** Where the corners land in the frame, from the framed view or from a given point of its sway. */
  function screenExtent(corners: THREE.Vector3[], framing: Framing, swayAzimuthDeg = 0, swayPolarDeg = 0) {
    // As CinematicRig places the camera: azimuth around +Y from +Z, polar down from +Y.
    const azimuth = framing.azimuth + swayAzimuthDeg * (Math.PI / 180)
    const polar = framing.polar + swayPolarDeg * (Math.PI / 180)
    const direction = new THREE.Vector3(Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth))
    const camera = new THREE.PerspectiveCamera(BOARD.fovDeg, BOARD.aspect, framing.near, framing.far)
    camera.position.copy(framing.target).addScaledVector(direction, framing.distance)
    camera.lookAt(framing.target)
    camera.updateMatrixWorld()
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const corner of corners) {
      const ndc = corner.clone().project(camera)
      minX = Math.min(minX, ndc.x)
      maxX = Math.max(maxX, ndc.x)
      minY = Math.min(minY, ndc.y)
      maxY = Math.max(maxY, ndc.y)
    }
    return { minX, maxX, minY, maxY }
  }

  it('frames a wall from the front and limits the orbit to the front half', () => {
    const f = computeFraming({ stage: 'wall', mode: 'surface', width: 1200, height: 600, reliefTop: 6.4, tileWidth: 150, tileHeight: 150, aspect: 1.5, fovDeg: 30 })
    expect(f.position.z).toBeGreaterThan(0)
    expect(f.azimuthLimits[1]).toBeLessThan(Math.PI / 2)
    expect(f.minDistance).toBeLessThan(f.distance)
    expect(f.maxDistance).toBeGreaterThan(f.distance)
    expect(f.near).toBeLessThan(f.minDistance)
    expect(f.far).toBeGreaterThan(f.maxDistance)
  })

  it('pulls back far enough to keep the dimension annotations in frame', () => {
    const base = {
      stage: 'wall',
      mode: 'surface',
      width: 1200,
      height: 600,
      reliefTop: 6.4,
      tileWidth: 150,
      tileHeight: 150,
      aspect: 1.5,
      fovDeg: 30,
    } as const
    const margin = annotationMarginMm('surface', base.width, base.height)
    const plain = computeFraming(base)
    const annotated = computeFraming({ ...base, annotationMm: margin })
    expect(annotated.distance).toBeGreaterThan(plain.distance)

    const cam = new THREE.PerspectiveCamera(base.fovDeg, base.aspect, annotated.near, annotated.far)
    cam.position.copy(annotated.position)
    cam.lookAt(annotated.target)
    cam.updateMatrixWorld()
    for (const corner of boxCorners('wall', base.width + margin * 2, base.height + margin * 2, 0, base.reliefTop)) {
      const ndc = corner.clone().project(cam)
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1)
    }
  })

  it('leaves every view that asks for no sweep and no recentering exactly where it was', () => {
    // The landing board is the only caller that asks for either, so these are the studio's own numbers.
    const studio = computeFraming({ ...BOARD, width: 1200, height: 600, aspect: 1.5, annotationMm: annotationMarginMm('surface', 1200, 600) })
    expectVector(studio.target, [0, 0, 3.2])
    expectVector(studio.position, [-831.0129316906334, 397.14285228381436, 1869.6856041671151])
    expect(studio.distance).toBeCloseTo(2081.363362875465, 3)

    const tile = computeFraming({ stage: 'floor', mode: 'tile', width: 150, height: 150, reliefTop: 6.4, tileWidth: 150, tileHeight: 150, aspect: 1, fovDeg: 30 })
    expectVector(tile.target, [0, 3.2, 0])
    expectVector(tile.position, [213.08851235640628, 259.27299088426446, 369.08012991056427])
    expect(tile.distance).toBeCloseTo(497.1923501558304, 3)

    const plain = computeFraming(BOARD)
    expectVector(plain.target, [0, 0, 3.2])
    expectVector(plain.position, [-674.7663168846373, 322.47226185448955, 1518.7499615148006])
    expect(plain.distance).toBeCloseTo(1690.02651692662, 3)
    // A sway of nothing is the same view, so the fit over it has to come out at the same place.
    const still = computeFraming({ ...BOARD, sweep: { azimuthDeg: 0, polarDeg: 0 } })
    expectVector(still.position, plain.position.toArray())
    expect(still.distance).toBeCloseTo(plain.distance, 6)
  })

  it('centers the tilted wall in the frame without giving up any of its scale', () => {
    const corners = boxCorners('wall', BOARD.width, BOARD.height, 0, BOARD.reliefTop)
    const before = screenExtent(corners, computeFraming(BOARD))
    // The fit alone leaves the wall lopsided: the near edge fills its side of the frame, the far one
    // stops well short, which is what put 60 px of board on one side of it and 122 px on the other.
    expect(Math.abs(before.minX + before.maxX)).toBeGreaterThan(0.1)

    const after = screenExtent(corners, computeFraming({ ...BOARD, recenter: true }))
    expect(Math.abs(after.minX + after.maxX)).toBeLessThan(0.001)
    expect(Math.abs(after.minY + after.maxY)).toBeLessThan(0.001)
    // Recentered, not zoomed out: the wall covers at least as much of the frame as it did.
    expect(after.maxX - after.minX).toBeGreaterThanOrEqual(before.maxX - before.minX)
    expect(after.maxY - after.minY).toBeGreaterThanOrEqual(before.maxY - before.minY)
  })

  it('keeps the wall whole through the sway it is told about', () => {
    const sweep = { azimuthDeg: 14, polarDeg: 3 }
    const corners = boxCorners('wall', BOARD.width, BOARD.height, 0, BOARD.reliefTop)
    const extremes = [
      [-sweep.azimuthDeg, -sweep.polarDeg],
      [-sweep.azimuthDeg, sweep.polarDeg],
      [sweep.azimuthDeg, -sweep.polarDeg],
      [sweep.azimuthDeg, sweep.polarDeg],
    ] as const
    const whole = (e: { minX: number; maxX: number; minY: number; maxY: number }) => e.minX >= -1 && e.maxX <= 1 && e.minY >= -1 && e.maxY <= 1

    // Fitted for the still camera alone, the sway carries the wall off the bottom of the frame.
    const plain = computeFraming(BOARD)
    expect(extremes.some(([az, polar]) => !whole(screenExtent(corners, plain, az, polar)))).toBe(true)

    const swept = computeFraming({ ...BOARD, sweep, recenter: true })
    for (const [az, polar] of extremes) expect(whole(screenExtent(corners, swept, az, polar))).toBe(true)
    // And it is still centered at rest, which is where the visitor meets it.
    const rest = screenExtent(corners, swept)
    expect(Math.abs(rest.minX + rest.maxX)).toBeLessThan(0.01)
    expect(Math.abs(rest.minY + rest.maxY)).toBeLessThan(0.01)
  })

  it('keeps the tile view above the floor', () => {
    const f = computeFraming({ stage: 'floor', mode: 'tile', width: 150, height: 150, reliefTop: 6.4, tileWidth: 150, tileHeight: 150, aspect: 1, fovDeg: 30 })
    expect(f.position.y).toBeGreaterThan(0)
    expect(f.polarLimits[1]).toBeLessThan(Math.PI / 2)
  })
})

describe('the object arrival', () => {
  const ARRIVAL = LOOK.object.arrival
  /** The hero's own wall, framed the way the object presentation frames it. */
  const OBJECT = {
    stage: 'wall',
    mode: 'surface',
    width: 1000,
    height: 700,
    reliefTop: 6.4,
    tileWidth: 150,
    tileHeight: 150,
    aspect: 1.6,
    fovDeg: 30,
    presentation: 'object',
    sweep: { azimuthDeg: LOOK.object.cinematic.azimuthAmpDeg, polarDeg: LOOK.object.cinematic.elevationAmpDeg },
    recenter: true,
    composition: objectComposition(1440),
  } as const

  const steps = Array.from({ length: 21 }, (_, i) => i / 20)

  it('starts back, round and high, and lands exactly on the framing', () => {
    const start = arrivalOffset(ARRIVAL, 0)
    expect(start.distanceFactor).toBeCloseTo(ARRIVAL.distanceFactor, 6)
    expect(start.azimuthDeg).toBeCloseTo(ARRIVAL.azimuthDeg, 6)
    // A higher camera is a smaller polar angle, so the offset is negative.
    expect(start.polarDeg).toBeCloseTo(-ARRIVAL.elevationDeg, 6)
    const end = arrivalOffset(ARRIVAL, 1)
    expect(end.distanceFactor).toBeCloseTo(1, 6)
    expect(end.azimuthDeg).toBeCloseTo(0, 6)
    expect(end.polarDeg).toBeCloseTo(0, 6)
  })

  it('only ever comes in, and holds at both ends of its window', () => {
    let previous = Number.POSITIVE_INFINITY
    for (const t of steps) {
      const { distanceFactor } = arrivalOffset(ARRIVAL, t)
      expect(distanceFactor).toBeLessThanOrEqual(previous + 1e-9)
      previous = distanceFactor
    }
    expect(arrivalOffset(ARRIVAL, -1)).toEqual(arrivalOffset(ARRIVAL, 0))
    expect(arrivalOffset(ARRIVAL, 2)).toEqual(arrivalOffset(ARRIVAL, 1))
  })

  it('never carries the wall outside the frame it is settling onto', () => {
    const framing = computeFraming(OBJECT)
    const corners = boxCorners('wall', OBJECT.width, OBJECT.height, 0, OBJECT.reliefTop)
    for (const t of steps) {
      const offset = arrivalOffset(ARRIVAL, t)
      const azimuth = framing.azimuth + THREE.MathUtils.degToRad(offset.azimuthDeg)
      const polar = framing.polar + THREE.MathUtils.degToRad(offset.polarDeg)
      const direction = new THREE.Vector3(Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth))
      const camera = new THREE.PerspectiveCamera(OBJECT.fovDeg, OBJECT.aspect, framing.near, framing.far)
      camera.position.copy(framing.target).addScaledVector(direction, framing.distance * offset.distanceFactor)
      camera.lookAt(framing.target)
      camera.updateMatrixWorld()
      for (const corner of corners) {
        const ndc = corner.clone().project(camera)
        expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1)
        expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('rakes the key down from near the top edge to the resting elevation', () => {
    const rest = LOOK.object.keyElevationDeg
    expect(rakeElevationDeg(ARRIVAL, rest, 0)).toBeCloseTo(ARRIVAL.keyFromDeg, 6)
    expect(rakeElevationDeg(ARRIVAL, rest, 1)).toBeCloseTo(rest, 6)
    expect(ARRIVAL.keyFromDeg).toBeGreaterThan(rest)
    let previous = Number.POSITIVE_INFINITY
    for (const t of steps) {
      const elevation = rakeElevationDeg(ARRIVAL, rest, t)
      expect(elevation).toBeLessThanOrEqual(previous + 1e-9)
      // A key at or below the surface throws no shadow across the relief at all.
      expect(elevation).toBeGreaterThan(0)
      previous = elevation
    }
  })

  it('leaves the studio\'s own key where it is: nothing reads the arrival without the object preset', () => {
    expect(rakeElevationDeg(ARRIVAL, LOOK.key.elevationDeg.wall, 1)).toBe(LOOK.key.elevationDeg.wall)
  })
})

describe('the object on the frame it is standing in', () => {
  /** The hero's own wall: 1,000 x 700 mm of 150 mm tiles, 7 across and 5 down, so both edges are cut. */
  const WALL = {
    stage: 'wall',
    mode: 'surface',
    width: 1000,
    height: 700,
    reliefTop: 6.4,
    tileWidth: 150,
    tileHeight: 150,
    fovDeg: 30,
    presentation: 'object',
    sweep: { azimuthDeg: LOOK.object.cinematic.azimuthAmpDeg, polarDeg: LOOK.object.cinematic.elevationAmpDeg },
    recenter: true,
  } as const

  /** The frames the landing actually hands the object, as canvas width in CSS pixels by canvas aspect. */
  const PHONES = [
    { label: '360 x 387', widthPx: 360, aspect: 0.95 },
    { label: '390 x 387', widthPx: 390, aspect: 1 },
    { label: '414 x 387', widthPx: 414, aspect: 1.05 },
    { label: '768 x 419', widthPx: 768, aspect: 1.85 },
  ] as const

  const expectVector = (actual: THREE.Vector3, expected: readonly number[]) => {
    actual.toArray().forEach((value, index) => expect(value).toBeCloseTo(expected[index], 3))
  }

  /** Where the corners land in a frame of this shape, from the framed view or a point of its sway. */
  function extent(corners: THREE.Vector3[], framing: Framing, aspect: number, swayAzimuthDeg = 0, swayPolarDeg = 0) {
    const azimuth = framing.azimuth + THREE.MathUtils.degToRad(swayAzimuthDeg)
    const polar = framing.polar + THREE.MathUtils.degToRad(swayPolarDeg)
    const direction = new THREE.Vector3(Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth))
    const camera = new THREE.PerspectiveCamera(WALL.fovDeg, aspect, framing.near, framing.far)
    camera.position.copy(framing.target).addScaledVector(direction, framing.distance)
    camera.lookAt(framing.target)
    camera.updateMatrixWorld()
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const corner of corners) {
      const ndc = corner.clone().project(camera)
      minX = Math.min(minX, ndc.x)
      maxX = Math.max(maxX, ndc.x)
      minY = Math.min(minY, ndc.y)
      maxY = Math.max(maxY, ndc.y)
    }
    return { minX, maxX, minY, maxY }
  }

  it('reads the frame by its width, not by its aspect', () => {
    // A phone hands this canvas anything from a square to a letterbox, so only the width can say
    // whether the page has a column of type standing beside the object.
    for (const widthPx of [320, 360, 390, 414, 768, 992]) {
      expect(objectComposition(widthPx)).toEqual({ screenShift: LOOK.object.narrow.screenShift, margin: LOOK.object.narrow.margin })
      // Nothing stands over the object down here, so it keeps no column clear and is composed square on.
      expect(objectComposition(widthPx).clearLeft).toBeUndefined()
    }
    for (const widthPx of [993, 1024, 1280, 1440, 2560]) {
      const wide = objectComposition(widthPx)
      expect(wide.screenShift).toEqual(LOOK.object.screenShift)
      expect(wide.margin).toBe(LOOK.object.wall.margin)
      // The page lays its type over the left of this frame, so the wall is held off it by that column's
      // own width at this exact width: a fraction of the frame, never past the ceiling the look sets.
      expect(wide.clearLeft).toBeGreaterThan(0)
      expect(wide.clearLeft).toBeLessThanOrEqual(LOOK.object.typeColumn.maxFraction)
    }
    // The column is a smaller share of a wider window, which is the whole point of measuring it rather
    // than stepping it: at 1024 it takes about half the frame, at 1440 about a third.
    expect(objectComposition(1024).clearLeft).toBeGreaterThan(objectComposition(1440).clearLeft ?? 0)
    // Frozen below the step and memoized above it, so a resize that changes nothing re-frames nothing.
    expect(objectComposition(390)).toBe(objectComposition(414))
    expect(objectComposition(1440)).toBe(objectComposition(1440))
    // Square on, and standing off the frame rather than jammed against it. The desktop's own fit is
    // looser still, because out there the margin is also paying for the column of type on the left.
    expect(LOOK.object.narrow.screenShift.x).toBe(0)
    expect(LOOK.object.narrow.margin).toBeGreaterThan(1)
  })

  it('keeps the whole wall, cut column and cut row included, inside every phone frame', () => {
    const corners = boxCorners('wall', WALL.width, WALL.height, 0, WALL.reliefTop)
    const sway = WALL.sweep
    for (const phone of PHONES) {
      const framing = computeFraming({ ...WALL, aspect: phone.aspect, composition: objectComposition(phone.widthPx) })
      for (const [azimuthDeg, polarDeg] of [
        [0, 0],
        [-sway.azimuthDeg, -sway.polarDeg],
        [-sway.azimuthDeg, sway.polarDeg],
        [sway.azimuthDeg, -sway.polarDeg],
        [sway.azimuthDeg, sway.polarDeg],
      ] as const) {
        const seen = extent(corners, framing, phone.aspect, azimuthDeg, polarDeg)
        // Every edge of the wall inside the frame: on a phone the right-hand cut column is the first
        // thing an off-center composition loses, and it is the whole point of the picture.
        expect(seen.minX, `${phone.label} left`).toBeGreaterThanOrEqual(-1)
        expect(seen.maxX, `${phone.label} right`).toBeLessThanOrEqual(1)
        expect(seen.minY, `${phone.label} bottom`).toBeGreaterThanOrEqual(-1)
        expect(seen.maxY, `${phone.label} top`).toBeLessThanOrEqual(1)
      }
      const rest = extent(corners, framing, phone.aspect)
      // Centred, and still filling its frame: the binding axis keeps at least 80% of the frame.
      expect(Math.abs(rest.minX + rest.maxX), `${phone.label} centered across`).toBeLessThan(0.05)
      expect(Math.abs(rest.minY + rest.maxY), `${phone.label} centered down`).toBeLessThan(0.1)
      expect(Math.max(rest.maxX - rest.minX, rest.maxY - rest.minY), `${phone.label} scale`).toBeGreaterThan(1.6)
    }
  })

  it('holds the whole wall through the arrival on a phone too', () => {
    // The arrival only ever pulls back from the framing, but a narrow frame is where a wall that is
    // already at the edges would show it: the first frame the visitor meets has to be whole as well.
    const corners = boxCorners('wall', WALL.width, WALL.height, 0, WALL.reliefTop)
    const framing = computeFraming({ ...WALL, aspect: 1, composition: objectComposition(390) })
    for (const t of Array.from({ length: 21 }, (_, i) => i / 20)) {
      const offset = arrivalOffset(LOOK.object.arrival, t)
      const azimuth = framing.azimuth + THREE.MathUtils.degToRad(offset.azimuthDeg)
      const polar = framing.polar + THREE.MathUtils.degToRad(offset.polarDeg)
      const direction = new THREE.Vector3(Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth))
      const camera = new THREE.PerspectiveCamera(WALL.fovDeg, 1, framing.near, framing.far)
      camera.position.copy(framing.target).addScaledVector(direction, framing.distance * offset.distanceFactor)
      camera.lookAt(framing.target)
      camera.updateMatrixWorld()
      for (const corner of corners) {
        const ndc = corner.clone().project(camera)
        expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1)
        expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('frames the phone exactly here', () => {
    const framing = computeFraming({ ...WALL, aspect: 1, composition: objectComposition(390) })
    expectVector(framing.target, [-44.535591129931376, -29.72680449075017, -18.68568694700568])
    expectVector(framing.position, [-1008.9538067148716, 233.438479054877, 1586.375761656109])
    expect(framing.distance).toBeCloseTo(1890.9205998157668, 3)
  })

  it('leaves the studio on that same phone frame exactly where it was', () => {
    // Nothing reads the narrow composition without being handed one, which is what keeps /studio,
    // /download and /history on a phone the views they have always been.
    const studio = computeFraming({ stage: 'wall', mode: 'surface', width: 1000, height: 700, reliefTop: 6.4, tileWidth: 150, tileHeight: 150, aspect: 1, fovDeg: 30 })
    expectVector(studio.target, [0, 0, 3.2])
    expectVector(studio.position, [-850.811096740571, 406.6044375830008, 1914.1530109250998])
    expect(studio.distance).toBeCloseTo(2130.950046566739, 3)
    expect(computeFraming({ stage: 'wall', mode: 'surface', width: 1000, height: 700, reliefTop: 6.4, tileWidth: 150, tileHeight: 150, aspect: 1, fovDeg: 30, presentation: 'studio' }).distance).toBeCloseTo(
      studio.distance,
      9,
    )
  })
})
