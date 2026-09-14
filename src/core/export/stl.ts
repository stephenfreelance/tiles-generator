// Binary STL: 80-byte header, uint32 triangle count, then 50 bytes per facet, all little endian.

import type { MeshData } from '../types'

/** A header starting with "solid" makes some readers parse the file as ASCII STL. */
function headerBytes(header: string): Uint8Array {
  const safe = header.replace(/[^\x20-\x7e]/g, ' ')
  const text = /^solid/i.test(safe) ? `binary ${safe}` : safe
  const out = new Uint8Array(80).fill(0x20)
  for (let i = 0; i < Math.min(80, text.length); i++) out[i] = text.charCodeAt(i)
  return out
}

export function writeStl(mesh: MeshData, header: string): Uint8Array {
  const p = mesh.positions
  const idx = mesh.indices
  const count = Math.floor(idx.length / 3)
  const buffer = new ArrayBuffer(84 + 50 * count)
  const bytes = new Uint8Array(buffer)
  bytes.set(headerBytes(header))
  const view = new DataView(buffer)
  view.setUint32(80, count, true)
  let o = 84
  for (let t = 0; t < 3 * count; t += 3) {
    const a = 3 * idx[t]
    const b = 3 * idx[t + 1]
    const c = 3 * idx[t + 2]
    const ux = p[b] - p[a]
    const uy = p[b + 1] - p[a + 1]
    const uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a]
    const vy = p[c + 1] - p[a + 1]
    const vz = p[c + 2] - p[a + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    const s = len > 0 ? 1 / len : 0
    view.setFloat32(o, nx * s, true)
    view.setFloat32(o + 4, ny * s, true)
    view.setFloat32(o + 8, nz * s, true)
    view.setFloat32(o + 12, p[a], true)
    view.setFloat32(o + 16, p[a + 1], true)
    view.setFloat32(o + 20, p[a + 2], true)
    view.setFloat32(o + 24, p[b], true)
    view.setFloat32(o + 28, p[b + 1], true)
    view.setFloat32(o + 32, p[b + 2], true)
    view.setFloat32(o + 36, p[c], true)
    view.setFloat32(o + 40, p[c + 1], true)
    view.setFloat32(o + 44, p[c + 2], true)
    view.setUint16(o + 48, 0, true)
    o += 50
  }
  return bytes
}
