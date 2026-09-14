import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  annotationMarginMm,
  boxCorners,
  cameraDirection,
  computeFraming,
  fitDistance,
  fitShadowCamera,
  keyLightDirection,
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

  it('keeps the tile view above the floor', () => {
    const f = computeFraming({ stage: 'floor', mode: 'tile', width: 150, height: 150, reliefTop: 6.4, tileWidth: 150, tileHeight: 150, aspect: 1, fovDeg: 30 })
    expect(f.position.y).toBeGreaterThan(0)
    expect(f.polarLimits[1]).toBeLessThan(Math.PI / 2)
  })
})
