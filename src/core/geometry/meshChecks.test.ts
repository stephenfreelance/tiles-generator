import { describe, expect, it } from 'vitest'
import type { MeshData } from '../types'
import { checkMesh, componentCount, downwardArea, meshVolume, pinchedVertices, weldByPosition } from './meshChecks'

/** Unit cube from 12 triangles, with every corner duplicated per face (as the tile meshes do). */
function cube(size = 1, flipOne = false, dropOne = false): MeshData {
  const c: [number, number, number][] = [
    [0, 0, 0],
    [size, 0, 0],
    [size, size, 0],
    [0, size, 0],
    [0, 0, size],
    [size, 0, size],
    [size, size, size],
    [0, size, size],
  ]
  const quads: [number, number, number, number][] = [
    [0, 3, 2, 1], // bottom, normal -z
    [4, 5, 6, 7], // top
    [0, 1, 5, 4], // front
    [1, 2, 6, 5], // right
    [2, 3, 7, 6], // back
    [3, 0, 4, 7], // left
  ]
  const positions: number[] = []
  const indices: number[] = []
  quads.forEach((quad, q) => {
    if (dropOne && q === 5) return
    const base = positions.length / 3
    for (const v of quad) positions.push(...c[v])
    const tri = [base, base + 1, base + 2, base, base + 2, base + 3]
    if (flipOne && q === 5) indices.push(tri[2], tri[1], tri[0], tri[5], tri[4], tri[3])
    else indices.push(...tri)
  })
  return {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
    topIndexCount: 6,
  }
}

describe('weldByPosition', () => {
  it('merges duplicated corners and treats -0 as 0', () => {
    const welded = weldByPosition(cube().positions)
    expect(welded.count).toBe(8)
    const zeros = weldByPosition(Float32Array.from([0, 0, 0, -0, -0, -0]))
    expect(zeros.count).toBe(1)
  })
})

describe('meshVolume', () => {
  it('is the cube volume, positive for outward normals', () => {
    expect(meshVolume(cube(10))).toBeCloseTo(1000, 6)
  })
})

describe('checkMesh', () => {
  it('accepts a closed, manifold, oriented solid', () => {
    expect(checkMesh(cube(10))).toEqual({
      closed: true,
      manifold: true,
      oriented: true,
      boundaryEdges: 0,
      volume: expect.closeTo(1000, 6),
    })
  })

  it('reports a hole', () => {
    const check = checkMesh(cube(10, false, true))
    expect(check.closed).toBe(false)
    expect(check.boundaryEdges).toBe(4)
  })

  it('reports a flipped face', () => {
    const check = checkMesh(cube(10, true))
    expect(check.closed).toBe(true)
    expect(check.oriented).toBe(false)
  })

  it('handles a 2M triangle mesh quickly', () => {
    // A fan of degenerate-free triangles is enough to exercise the half-edge pass at scale.
    const n = 700_000
    const positions = new Float32Array(3 * (n + 2))
    const indices = new Uint32Array(3 * n)
    for (let i = 0; i < n + 2; i++) {
      positions[3 * i] = i
      positions[3 * i + 1] = i % 2
    }
    for (let t = 0; t < n; t++) {
      indices[3 * t] = t
      indices[3 * t + 1] = t + 1
      indices[3 * t + 2] = t + 2
    }
    const started = performance.now()
    const check = checkMesh({ positions, indices, topIndexCount: 0 })
    expect(check.closed).toBe(false)
    expect(performance.now() - started).toBeLessThan(4000)
  })
})

/** Concatenates meshes into one buffer, as a multi-part file would hold them. */
function merge(...meshes: MeshData[]): MeshData {
  const positions = new Float32Array(meshes.reduce((n, m) => n + m.positions.length, 0))
  const indices = new Uint32Array(meshes.reduce((n, m) => n + m.indices.length, 0))
  let p = 0
  let i = 0
  for (const m of meshes) {
    positions.set(m.positions, p)
    for (let k = 0; k < m.indices.length; k++) indices[i + k] = m.indices[k] + p / 3
    p += m.positions.length
    i += m.indices.length
  }
  return { positions, indices, topIndexCount: 0 }
}

function shifted(mesh: MeshData, dx: number, dz = 0): MeshData {
  const positions = mesh.positions.slice()
  for (let k = 0; k < positions.length; k += 3) {
    positions[k] += dx
    positions[k + 2] += dz
  }
  return { ...mesh, positions }
}

describe('downwardArea', () => {
  it('counts faces looking down above the given height only', () => {
    expect(downwardArea(cube(10), 0)).toBe(0)
    expect(downwardArea(cube(10), -1)).toBe(100)
    // A cube floating 5 mm up: its bottom is an overhang.
    expect(downwardArea(shifted(cube(10), 0, 5), 0)).toBe(100)
    expect(downwardArea(shifted(cube(10), 0, 5), 5)).toBe(0)
  })

  it('ignores faces tilted less than the threshold', () => {
    // One triangle on a 45 degree slope, facing +x and down.
    const slope: MeshData = {
      positions: Float32Array.of(0, 0, 2, 0, 2, 2, 2, 0, 4),
      indices: Uint32Array.of(0, 1, 2),
      topIndexCount: 0,
    }
    const area = Math.hypot(2, 2) * 2 / 2
    expect(downwardArea(slope, 0)).toBeCloseTo(area, 6)
    expect(downwardArea(slope, 0, 0.75)).toBe(0)
  })
})

describe('componentCount', () => {
  it('counts separate solids, welded by position', () => {
    expect(componentCount(cube(10))).toBe(1)
    expect(componentCount(merge(cube(10), shifted(cube(10), 20)))).toBe(2)
    // Touching along a face still leaves two closed shells sharing positions: one welded component.
    expect(componentCount(merge(cube(10), shifted(cube(10), 10)))).toBe(1)
    expect(componentCount({ positions: new Float32Array(0), indices: new Uint32Array(0), topIndexCount: 0 })).toBe(0)
  })
})

describe('pinchedVertices', () => {
  it('finds a vertex where two solids touch at a corner only', () => {
    expect(pinchedVertices(cube(10))).toBe(0)
    const corner = merge(cube(10), { ...cube(10), positions: cube(10).positions.map((v) => v + 10) })
    expect(checkMesh(corner).manifold).toBe(true)
    expect(pinchedVertices(corner)).toBe(1)
  })
})
