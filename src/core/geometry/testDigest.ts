// A fingerprint of a mesh for the tests that hold a part byte for byte against the one shipped before a change:
// comparing the builder with itself proves nothing, and a pinned digest fails on any moved vertex or flipped quad.

import type { MeshData } from '../types'

/** FNV-1a over the positions and normals (to a millionth of a mm) and the indices, as eight hex digits. */
export function meshDigest(mesh: MeshData): string {
  let hash = 0x811c9dc5
  const add = (value: number) => {
    let v = value | 0
    for (let k = 0; k < 4; k++) {
      hash ^= v & 0xff
      hash = Math.imul(hash, 0x01000193)
      v >>>= 8
    }
  }
  for (const v of mesh.positions) add(Math.round(v * 1e6))
  for (const v of mesh.normals ?? []) add(Math.round(v * 1e6))
  for (const i of mesh.indices) add(i)
  add(mesh.topIndexCount)
  return (hash >>> 0).toString(16).padStart(8, '0')
}
