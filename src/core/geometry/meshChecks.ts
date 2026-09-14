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
