import { describe, expect, it } from 'vitest'
import type { MeshData } from '../types'
import { checkMesh, componentCount, downwardArea, pinchedVertices } from './meshChecks'
import { offsetRing, reverseRing, ringFromRect, signedArea } from './polygon'
import { extrudeProfileX, loftSolid, type ProfileCut } from './prism'

const flatten = (points: [number, number][]) => Float64Array.from(points.flat())

/** Closed, manifold, outward, one piece, with the volume to float32 precision (coordinates are snapped). */
function expectSolid(mesh: MeshData, volume: number) {
  const check = checkMesh(mesh)
  expect(check).toMatchObject({ closed: true, manifold: true, oriented: true, boundaryEdges: 0 })
  expect(check.volume / volume).toBeCloseTo(1, 6)
  expect(componentCount(mesh)).toBe(1)
  expect(pinchedVertices(mesh)).toBe(0)
  expect(mesh.topIndexCount).toBe(0)
  expect(mesh.normals?.length).toBe(mesh.positions.length)
}

/** Every stored normal points the way its triangle faces. */
function expectNormalsAgree(mesh: MeshData) {
  const p = mesh.positions
  const n = mesh.normals as Float32Array
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]].map((i) => 3 * i)
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]]
    const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]]
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const len = Math.hypot(cross[0], cross[1], cross[2])
    const dot = (cross[0] * n[a] + cross[1] * n[a + 1] + cross[2] * n[a + 2]) / len
    expect(dot).toBeGreaterThan(0.999)
  }
}

/** A dog-bone key outline: two heads joined by a neck. */
const bone = flatten([
  [0, 0],
  [5, 0],
  [5, 3],
  [11, 3],
  [11, 0],
  [16, 0],
  [16, 9],
  [11, 9],
  [11, 6],
  [5, 6],
  [5, 9],
  [0, 9],
])

describe('loftSolid', () => {
  it('makes a prism from one outline twice', () => {
    const mesh = loftSolid([
      { z: 0, ring: ringFromRect(0, 0, 10, 20) },
      { z: 3, ring: ringFromRect(0, 0, 10, 20) },
    ])
    expectSolid(mesh, 600)
    expectNormalsAgree(mesh)
    expect(mesh.indices.length / 3).toBe(2 + 2 + 8)
  })

  it('makes a concave prism (a key) whose only down face is the one on the bed', () => {
    const mesh = loftSolid([
      { z: 0, ring: bone },
      { z: 2.6, ring: bone },
    ])
    expectSolid(mesh, signedArea(bone) * 2.6)
    expectNormalsAgree(mesh)
    expect(downwardArea(mesh, 0)).toBe(0)
    expect(downwardArea(mesh, -1)).toBeCloseTo(signedArea(bone), 6)
  })

  it('lofts a chamfer: a frustum with the exact volume', () => {
    const mesh = loftSolid([
      { z: 0, ring: ringFromRect(0, 0, 10, 10) },
      { z: 5, ring: ringFromRect(0, 0, 10, 10) },
      { z: 6, ring: ringFromRect(1, 1, 9, 9) },
    ])
    // Box plus a square frustum: h / 3 (A1 + A2 + sqrt(A1 A2)).
    expectSolid(mesh, 500 + (1 / 3) * (100 + 64 + 80))
    expectNormalsAgree(mesh)
  })

  it('lofts an inset outline of a concave ring (a keyed lead-in)', () => {
    const inset = offsetRing(bone, -0.4)
    const mesh = loftSolid([
      { z: 0, ring: inset },
      { z: 0.4, ring: bone },
      { z: 2.6, ring: bone },
    ])
    const check = checkMesh(mesh)
    expect(check.closed && check.manifold && check.oriented).toBe(true)
    expect(check.volume).toBeGreaterThan(signedArea(inset) * 2.6)
    expect(check.volume).toBeLessThan(signedArea(bone) * 2.6)
  })

  it('builds flat steps: a ledge facing up and an overhang facing down', () => {
    const big = ringFromRect(0, 0, 20, 10)
    const small = ringFromRect(5, 2, 15, 8)
    const ledge = loftSolid([
      { z: 0, ring: big },
      { z: 2, ring: big },
      { z: 2, ring: small },
      { z: 3, ring: small },
    ])
    expectSolid(ledge, 200 * 2 + 60)
    expectNormalsAgree(ledge)
    expect(downwardArea(ledge, 0)).toBe(0)
    const overhang = loftSolid([
      { z: 0, ring: small },
      { z: 1, ring: small },
      { z: 1, ring: big },
      { z: 3, ring: big },
    ])
    expectSolid(overhang, 60 + 400)
    expect(downwardArea(overhang, 0)).toBeCloseTo(200 - 60, 6)
  })

  it('accepts clockwise outlines and snaps coordinates to float32', () => {
    const mesh = loftSolid([
      { z: 0, ring: reverseRing(ringFromRect(0.1, 0.2, 10.3, 5.7)) },
      { z: 1.3, ring: reverseRing(ringFromRect(0.1, 0.2, 10.3, 5.7)) },
    ])
    expect(checkMesh(mesh).volume).toBeCloseTo(10.2 * 5.5 * 1.3, 4)
  })

  it('refuses outlines it cannot loft', () => {
    const square = ringFromRect(0, 0, 4, 4)
    expect(() => loftSolid([{ z: 0, ring: square }])).toThrow(/two sections/)
    expect(() => loftSolid([{ z: 0, ring: square }, { z: 0, ring: square }])).toThrow()
    expect(() => loftSolid([{ z: 0, ring: square }, { z: 1, ring: reverseRing(square) }])).toThrow(/same way/)
    expect(() => loftSolid([{ z: 0, ring: square }, { z: 1, ring: bone }])).toThrow(/vertex count/)
    expect(() =>
      loftSolid([
        { z: 0, ring: square },
        { z: 1, ring: square },
        { z: 1, ring: ringFromRect(2, 2, 6, 3) },
        { z: 2, ring: ringFromRect(2, 2, 6, 3) },
      ]),
    ).toThrow(/nest/)
    expect(() => loftSolid([{ z: 1, ring: square }, { z: 0, ring: square }])).toThrow(/rise/)
  })
})

/**
 * A two-channel profile, printed on its back: z = 0 on the bed, z = 6 its top face. Each channel has a
 * 7.4 mm mouth, a 0.7 mm land, a 45 degree underside widening to a 10 mm cavity and a 2.5 mm floor.
 * Between the channels, y 14.5 to 35.5 is a plain bar from 0 to 6.
 */
function railProfile(): Float64Array {
  const channel = (c: number): [number, number][] => [
    [c + 3.7, 6],
    [c + 3.7, 5.3],
    [c + 5, 4],
    [c + 5, 2.5],
    [c - 5, 2.5],
    [c - 5, 4],
    [c - 3.7, 5.3],
    [c - 3.7, 6],
  ]
  return flatten([[0, 0], [50, 0], [50, 6], ...channel(40.5), ...channel(9.5), [0, 6]])
}

const railArea = () => signedArea(railProfile())

/** A screw slot through the land at x, with a recess for the head down to z = 3.5. */
const screw = (x: number): ProfileCut[] => [
  { x0: x - 1.9, x1: x + 1.9, y0: 20, y1: 30, z0: 0, z1: 3.5 },
  { x0: x - 4, x1: x + 4, y0: 18, y1: 32, z0: 3.5, z1: 6 },
]

describe('extrudeProfileX', () => {
  it('extrudes a profile into a closed prism', () => {
    const mesh = extrudeProfileX(railProfile(), 120)
    expectSolid(mesh, railArea() * 120)
    expectNormalsAgree(mesh)
  })

  it('cuts screw slots and head recesses into the land between the channels', () => {
    const plain = extrudeProfileX(railProfile(), 200)
    const mesh = extrudeProfileX(railProfile(), 200, { cuts: [...screw(20), ...screw(100), ...screw(180)] })
    const slot = 3.8 * 10 * 3.5
    const recess = 8 * 14 * 2.5
    expectSolid(mesh, railArea() * 200 - 3 * (slot + recess))
    expectNormalsAgree(mesh)
    // Recess floors face up and slots run through: no overhang is added.
    expect(downwardArea(mesh, 0)).toBeCloseTo(downwardArea(plain, 0), 3)
    expect(downwardArea(mesh, 0, 0.75)).toBe(0)
  })

  it('cuts a slot through a channel floor, clear of the lips', () => {
    const cut: ProfileCut = { x0: 30, x1: 34, y0: 7, y1: 12, z0: 0, z1: 2.5 }
    const mesh = extrudeProfileX(railProfile(), 80, { cuts: [cut] })
    expectSolid(mesh, railArea() * 80 - 4 * 5 * 2.5)
  })

  it('merges overlapping and touching cuts into one pocket', () => {
    const cuts: ProfileCut[] = [
      { x0: 10, x1: 20, y0: 16, y1: 24, z0: 4, z1: 6 },
      { x0: 15, x1: 25, y0: 20, y1: 28, z0: 3, z1: 6 },
      // Touching the second one face to face along y = 28.
      { x0: 15, x1: 25, y0: 28, y1: 32, z0: 3, z1: 6 },
    ]
    const mesh = extrudeProfileX(railProfile(), 40, { cuts })
    // Inclusion-exclusion over the first two (overlap x 15-20, y 20-24, z 4-6), plus the third.
    const union = 10 * 8 * 2 + 10 * 8 * 3 - 5 * 4 * 2 + 10 * 4 * 3
    expectSolid(mesh, railArea() * 40 - union)
  })

  it('follows a step of the profile inside a cut', () => {
    // A stair: 6 mm tall for y < 10, 4 mm tall beyond; the cut crosses the step.
    const stair = flatten([
      [0, 0],
      [20, 0],
      [20, 4],
      [10, 4],
      [10, 6],
      [0, 6],
    ])
    const mesh = extrudeProfileX(stair, 30, { cuts: [{ x0: 10, x1: 20, y0: 5, y1: 15, z0: 3, z1: 6 }] })
    expectSolid(mesh, signedArea(stair) * 30 - 10 * (5 * 3 + 5 * 1))
    expectNormalsAgree(mesh)
  })

  it('clamps a cut deeper than the bar to the bar', () => {
    const mesh = extrudeProfileX(railProfile(), 40, { cuts: [{ x0: 10, x1: 14, y0: 20, y1: 30, z0: -5, z1: 50 }] })
    expectSolid(mesh, railArea() * 40 - 4 * 10 * 6)
  })

  it('refuses cuts it cannot represent', () => {
    const profile = railProfile()
    // Across a channel lip: the profile is two separate bars there.
    expect(() => extrudeProfileX(profile, 40, { cuts: [{ x0: 10, x1: 14, y0: 12, y1: 16, z0: 0, z1: 6 }] })).toThrow(/one bar/)
    // Through an end.
    expect(() => extrudeProfileX(profile, 40, { cuts: [{ x0: 0, x1: 4, y0: 20, y1: 30, z0: 0, z1: 6 }] })).toThrow(/inside the length/)
    // Two cuts meeting only along an edge pinch the solid.
    expect(() =>
      extrudeProfileX(profile, 40, {
        cuts: [
          { x0: 10, x1: 20, y0: 20, y1: 25, z0: 3, z1: 6 },
          { x0: 20, x1: 30, y0: 25, y1: 30, z0: 3, z1: 6 },
        ],
      }),
    ).toThrow(/pinch/)
    // Or at a single corner.
    expect(() =>
      extrudeProfileX(profile, 40, {
        cuts: [
          { x0: 10, x1: 20, y0: 20, y1: 25, z0: 3, z1: 6 },
          { x0: 20, x1: 30, y0: 25, y1: 30, z0: 0, z1: 3 },
        ],
      }),
    ).toThrow(/pinch/)
    // A cut sealed inside the bar would leave a void.
    expect(() => extrudeProfileX(profile, 40, { cuts: [{ x0: 10, x1: 20, y0: 20, y1: 25, z0: 2, z1: 4 }] })).toThrow(/pieces/)
    // Outside the profile's z range at that y.
    expect(() => extrudeProfileX(profile, 40, { cuts: [{ x0: 10, x1: 20, y0: 20, y1: 25, z0: 7, z1: 9 }] })).toThrow(/misses/)
  })
})
