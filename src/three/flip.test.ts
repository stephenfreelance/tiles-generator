import { describe, expect, it } from 'vitest'
import { easeInOutCubic, flipPose, stepFlip, type FlipExtent } from './flip'
import { LOOK } from './look'

/** Lowest point of a width x thickness section turned by `angle` about its centre raised to `axisZ`. */
function lowest(width: number, thickness: number, angle: number, axisZ: number): number {
  let low = Infinity
  for (const x of [-width / 2, width / 2]) {
    for (const z of [-thickness / 2, thickness / 2]) low = Math.min(low, axisZ - x * Math.sin(angle) + z * Math.cos(angle))
  }
  return low
}

describe('flipPose', () => {
  it('rests face up at 0 and back up at 1, on the same footprint height', () => {
    const front = flipPose(0, 150, 6)
    const back = flipPose(1, 150, 6)
    expect(front.angle).toBe(0)
    expect(back.angle).toBeCloseTo(Math.PI, 12)
    expect(front.axisZ).toBeCloseTo(3, 12)
    expect(back.axisZ).toBeCloseTo(3, 12)
  })

  it('keeps the lowest corner exactly on the floor through the whole turn', () => {
    for (const [width, thickness] of [
      [150, 6],
      [42.5, 4.8],
      [300, 12],
    ]) {
      for (let i = 0; i <= 40; i++) {
        const pose = flipPose(i / 40, width, thickness)
        expect(lowest(width, thickness, pose.angle, pose.axisZ)).toBeCloseTo(0, 9)
      }
    }
  })

  it('stands the tile on its edge half way, lifting it by half its width', () => {
    const pose = flipPose(0.5, 150, 6)
    expect(pose.angle).toBeCloseTo(Math.PI / 2, 12)
    expect(pose.axisZ).toBeCloseTo(75, 9)
  })

  it('clamps progress outside 0 to 1', () => {
    expect(flipPose(-1, 100, 5)).toEqual(flipPose(0, 100, 5))
    expect(flipPose(2, 100, 5)).toEqual(flipPose(1, 100, 5))
  })
})

/** Lowest point of the box [x0, x1] x [z0, z1] of the tile frame, turned as TileFlip turns it. */
function lowestOf(box: FlipExtent, width: number, thickness: number, angle: number, axisZ: number): number {
  let low = Infinity
  for (const x of [box.minX, box.maxX]) {
    for (const z of [box.minZ, box.maxZ]) {
      low = Math.min(low, axisZ - (x - width / 2) * Math.sin(angle) + (z - thickness / 2) * Math.cos(angle))
    }
  }
  return low
}

describe('flipPose with seated parts', () => {
  const tileBox = (width: number, thickness: number): FlipExtent => ({ minX: 0, maxX: width, minZ: 0, maxZ: thickness })

  it('is the plain turn when the parts stay inside the tile', () => {
    for (let i = 0; i <= 20; i++) {
      const plain = flipPose(i / 20, 150, 6)
      const withParts = flipPose(i / 20, 150, 6, { minX: 10, maxX: 140, minZ: 0.4, maxZ: 2.6 })
      expect(withParts.angle).toBe(plain.angle)
      expect(withParts.axisZ).toBeCloseTo(plain.axisZ, 12)
    }
  })

  it('keeps keys standing out past both sides, and a clip proud of the back, off the floor', () => {
    const width = 150
    const thickness = 6.5
    const parts: FlipExtent = { minX: -8.2, maxX: 158.2, minZ: -0.1, maxZ: 2.6 }
    const union: FlipExtent = { minX: -8.2, maxX: 158.2, minZ: -0.1, maxZ: thickness }
    for (let i = 1; i < 40; i++) {
      const pose = flipPose(i / 40, width, thickness, parts)
      // Nothing dips through the floor, and the lowest point of the tile and its parts rests on it.
      expect(lowestOf(union, width, thickness, pose.angle, pose.axisZ)).toBeCloseTo(0, 9)
      expect(lowestOf(tileBox(width, thickness), width, thickness, pose.angle, pose.axisZ)).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('lands back up exactly where the plain turn lands, resting on its relief', () => {
    const plain = flipPose(1, 150, 6.5)
    const withParts = flipPose(1, 150, 6.5, { minX: -8.2, maxX: 158.2, minZ: -0.1, maxZ: 2.6 })
    expect(withParts.axisZ).toBeCloseTo(plain.axisZ, 12)
  })

  it('rides higher on its edge by exactly how far the parts stand out past the side that goes down', () => {
    const plain = flipPose(0.5, 150, 6)
    const withParts = flipPose(0.5, 150, 6, { minX: -3, maxX: 158, minZ: 0, maxZ: 3 })
    expect(withParts.axisZ - plain.axisZ).toBeCloseTo(8, 9)
  })
})

describe('easeInOutCubic', () => {
  it('runs from 0 to 1, symmetric about the middle', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12)
    for (const t of [0.1, 0.3, 0.45]) expect(easeInOutCubic(t) + easeInOutCubic(1 - t)).toBeCloseTo(1, 12)
  })
})

describe('stepFlip', () => {
  it('moves linearly toward the asked face and stops there', () => {
    const quarter = LOOK.flip.durationMs / 4
    expect(stepFlip(0, 'back', quarter, false)).toBeCloseTo(0.25, 12)
    expect(stepFlip(0.9, 'back', quarter, false)).toBe(1)
    expect(stepFlip(1, 'front', quarter, false)).toBeCloseTo(0.75, 12)
    expect(stepFlip(0.1, 'front', quarter, false)).toBe(0)
    expect(stepFlip(1, 'back', quarter, false)).toBe(1)
  })

  it('turns at once under reduced motion', () => {
    expect(stepFlip(0, 'back', 1, true)).toBe(1)
    expect(stepFlip(0.4, 'front', 1, true)).toBe(0)
  })

  it('never runs backwards on a negative delta', () => {
    expect(stepFlip(0.5, 'back', -100, false)).toBe(0.5)
  })
})
