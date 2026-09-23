// Solid checks on a raw triangle mesh. Vertices are welded by exact position first, because the mesh
// carries duplicated positions on purpose (the rim and the walls need different normals) and STL / STEP
// consumers weld the same way.

import type { MeshData } from '../types'

/** Signed volume in mm³ (divergence theorem); positive when the normals point outwards. */
export function meshVolume(mesh: MeshData): number {
  const p = mesh.positions
  const idx = mesh.indices
  let volume = 0
  for (let t = 0; t < idx.length; t += 3) {
    const a = 3 * idx[t]
    const b = 3 * idx[t + 1]
    const c = 3 * idx[t + 2]
    const ax = p[a], ay = p[a + 1], az = p[a + 2]
    const bx = p[b], by = p[b + 1], bz = p[b + 2]
    const cx = p[c], cy = p[c + 1], cz = p[c + 2]
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return volume
}

/** Maps every vertex to the id of the first vertex with the same float32 position. */
export function weldByPosition(positions: Float32Array): { ids: Uint32Array; count: number } {
  const n = positions.length / 3
  const words = new Uint32Array(positions.buffer, positions.byteOffset, positions.length)
  const word = (i: number) => (words[i] === 0x80000000 ? 0 : words[i]) // -0 is 0
  let size = 8
  while (size < 2 * n) size *= 2
  const mask = size - 1
  const table = new Int32Array(size).fill(-1)
  const ids = new Uint32Array(n)
  let count = 0
  for (let v = 0; v < n; v++) {
    const x = word(3 * v)
    const y = word(3 * v + 1)
    const z = word(3 * v + 2)
    let h = (Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b) ^ Math.imul(z, 0xc2b2ae35)) >>> 0
    h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0) & mask
    for (;;) {
      const slot = table[h]
      if (slot === -1) {
        table[h] = v
        ids[v] = count++
        break
      }
      if (word(3 * slot) === x && word(3 * slot + 1) === y && word(3 * slot + 2) === z) {
        ids[v] = ids[slot]
        break
      }
      h = (h + 1) & mask
    }
  }
  return { ids, count }
}

/**
 * Closed / manifold / oriented check plus the volume. Linear in the triangle count (a CSR half-edge
 * table, no per-edge hashing), so a 2M-triangle mesh stays well under a second.
 */
export function checkMesh(mesh: MeshData): {
  closed: boolean
  manifold: boolean
  oriented: boolean
  boundaryEdges: number
  volume: number
} {
  const idx = mesh.indices
  const { ids, count } = weldByPosition(mesh.positions)
  const half = idx.length
  const start = new Uint32Array(count + 1)
  let manifold = true
  let oriented = true
  let boundaryEdges = 0
  for (let t = 0; t < half; t += 3) {
    const a = ids[idx[t]]
    const b = ids[idx[t + 1]]
    const c = ids[idx[t + 2]]
    if (a === b || b === c || c === a) manifold = false // collapsed triangle
    start[a]++
    start[b]++
    start[c]++
  }
  let sum = 0
  for (let v = 0; v <= count; v++) {
    const d = v < count ? start[v] : 0
    start[v] = sum
    sum += d
  }
  const cursor = start.slice()
  const targets = new Uint32Array(half)
  for (let t = 0; t < half; t += 3) {
    const a = ids[idx[t]]
    const b = ids[idx[t + 1]]
    const c = ids[idx[t + 2]]
    targets[cursor[a]++] = b
    targets[cursor[b]++] = c
    targets[cursor[c]++] = a
  }
  for (let a = 0; a < count; a++) {
    const from = start[a]
    const to = start[a + 1]
    for (let p = from; p < to; p++) {
      const b = targets[p]
      if (b === a) continue
      let forward = 0
      let firstHere = true
      for (let q = from; q < to; q++) {
        if (targets[q] !== b) continue
        forward++
        if (q < p) firstHere = false
      }
      if (!firstHere) continue
      let reverse = 0
      for (let q = start[b]; q < start[b + 1]; q++) if (targets[q] === a) reverse++
      if (a > b && reverse > 0) continue // already counted from the other end
      const total = forward + reverse
      if (total === 1) boundaryEdges++
      if (total !== 2) manifold = false
      if (forward !== 1 || reverse !== 1) oriented = false
    }
  }
  return { closed: boundaryEdges === 0, manifold, oriented, boundaryEdges, volume: meshVolume(mesh) }
}

/**
 * Area (mm²) of the faces that look down, with their lowest corner strictly above `zAbove`: the overhangs
 * a face-up print has to bridge. The bottom face (z = 0) never counts for zAbove >= 0. `minCos` is the
 * least downward tilt that counts, as -n.z of the unit normal (1e-6: anything that faces down at all;
 * 0.7: steeper than 45 degrees), so tests can check that planned ceilings are the only overhangs.
 */
export function downwardArea(mesh: MeshData, zAbove: number, minCos = 1e-6): number {
  const p = mesh.positions
  const idx = mesh.indices
  let area = 0
  for (let t = 0; t < idx.length; t += 3) {
    const a = 3 * idx[t]
    const b = 3 * idx[t + 1]
    const c = 3 * idx[t + 2]
    if (Math.min(p[a + 2], p[b + 2], p[c + 2]) <= zAbove) continue
    const ux = p[b] - p[a]
    const uy = p[b + 1] - p[a + 1]
    const uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a]
    const vy = p[c + 1] - p[a + 1]
    const vz = p[c + 2] - p[a + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const twice = Math.hypot(nx, ny, nz)
    if (twice > 0 && -nz >= minCos * twice) area += twice / 2
  }
  return area
}

/** Number of separate pieces: triangles joined through shared corners, vertices welded by exact position. */
export function componentCount(mesh: MeshData): number {
  const { ids, count } = weldByPosition(mesh.positions)
  const parent = new Int32Array(count)
  for (let v = 0; v < count; v++) parent[v] = v
  const find = (v: number) => {
    while (parent[v] !== v) {
      parent[v] = parent[parent[v]]
      v = parent[v]
    }
    return v
  }
  const idx = mesh.indices
  const used = new Uint8Array(count)
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(ids[idx[t]])
    used[ids[idx[t]]] = 1
    for (let k = 1; k < 3; k++) {
      used[ids[idx[t + k]]] = 1
      const b = find(ids[idx[t + k]])
      if (a !== b) parent[b] = a
    }
  }
  let components = 0
  for (let v = 0; v < count; v++) if (used[v] && find(v) === v) components++
  return components
}

/**
 * Vertices where the surface pinches: the triangles around the vertex (welded by position) form more
 * than one fan, as where two boxes cut out of a solid touch at a single corner. An edge-manifold mesh
 * (checkMesh) can still pinch at a vertex; slicers cope, but a B-rep solid cannot.
 */
export function pinchedVertices(mesh: MeshData): number {
  const { ids, count } = weldByPosition(mesh.positions)
  const idx = mesh.indices
  const start = new Uint32Array(count + 1)
  for (let t = 0; t < idx.length; t++) start[ids[idx[t]]]++
  let sum = 0
  for (let v = 0; v <= count; v++) {
    const d = v < count ? start[v] : 0
    start[v] = sum
    sum += d
  }
  // For every vertex, the far edge of each triangle around it: its link, one cycle when the vertex is sound.
  const cursor = start.slice()
  const linkA = new Uint32Array(idx.length)
  const linkB = new Uint32Array(idx.length)
  for (let t = 0; t < idx.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const v = ids[idx[t + k]]
      linkA[cursor[v]] = ids[idx[t + ((k + 1) % 3)]]
      linkB[cursor[v]++] = ids[idx[t + ((k + 2) % 3)]]
    }
  }
  const parent = new Map<number, number>()
  const find = (v: number): number => {
    let r = v
    while (parent.get(r) !== r) r = parent.get(r) as number
    parent.set(v, r)
    return r
  }
  let pinched = 0
  for (let v = 0; v < count; v++) {
    if (start[v] === start[v + 1]) continue
    parent.clear()
    for (let p = start[v]; p < start[v + 1]; p++) {
      if (!parent.has(linkA[p])) parent.set(linkA[p], linkA[p])
      if (!parent.has(linkB[p])) parent.set(linkB[p], linkB[p])
      const a = find(linkA[p])
      const b = find(linkB[p])
      if (a !== b) parent.set(a, b)
    }
    let fans = 0
    for (const [node] of parent) if (find(node) === node) fans++
    if (fans > 1) pinched++
  }
  return pinched
}
