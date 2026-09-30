// One STL per plate, built from the STL files the worker has already written: each file's triangles are
// moved to their place on the plate and copied into one file. Moving a triangle leaves its normal as it
// was, so this is exact, and it never needs a mesher on the main thread.
const HEADER_BYTES = 80
const COUNT_BYTES = 4
const TRIANGLE_BYTES = 50

export interface PlacedStl {
  /** A binary STL as writeStl writes it: little endian, 50 bytes a triangle. */
  data: Uint8Array
  /** How far to move it on the plate, mm. */
  x: number
  y: number
}

export function stlTriangleCount(data: Uint8Array): number {
  if (data.byteLength < HEADER_BYTES + COUNT_BYTES) throw new Error('Not a binary STL: too short for its header.')
  const count = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(HEADER_BYTES, true)
  if (data.byteLength !== HEADER_BYTES + COUNT_BYTES + count * TRIANGLE_BYTES) {
    throw new Error('Not a binary STL: its size does not match its triangle count.')
  }
  return count
}

/** Binary STL headers are 80 ASCII bytes and must not start with "solid", or readers take them for ASCII STL. */
function headerBytes(text: string): Uint8Array {
  const ascii = text.replace(/[^\x20-\x7e]/g, '?').replace(/^solid/i, 'Solid-').slice(0, HEADER_BYTES)
  const bytes = new Uint8Array(HEADER_BYTES).fill(0x20)
  for (let i = 0; i < ascii.length; i++) bytes[i] = ascii.charCodeAt(i)
  return bytes
}

/** Every part moved to its place, in one binary STL. */
export function stlPlate(header: string, parts: readonly PlacedStl[]): Uint8Array {
  const counts = parts.map((part) => stlTriangleCount(part.data))
  const total = counts.reduce((sum, count) => sum + count, 0)
  const out = new Uint8Array(HEADER_BYTES + COUNT_BYTES + total * TRIANGLE_BYTES)
  out.set(headerBytes(header), 0)
  const view = new DataView(out.buffer)
  view.setUint32(HEADER_BYTES, total, true)
  let offset = HEADER_BYTES + COUNT_BYTES
  for (const [index, part] of parts.entries()) {
    const bytes = counts[index] * TRIANGLE_BYTES
    out.set(part.data.subarray(HEADER_BYTES + COUNT_BYTES, HEADER_BYTES + COUNT_BYTES + bytes), offset)
    for (let t = offset; t < offset + bytes; t += TRIANGLE_BYTES) {
      // The normal takes the first 12 bytes; then three vertices of x, y, z.
      for (let v = t + 12; v < t + 48; v += 12) {
        view.setFloat32(v, view.getFloat32(v, true) + part.x, true)
        view.setFloat32(v + 4, view.getFloat32(v + 4, true) + part.y, true)
      }
    }
    offset += bytes
  }
  return out
}

/** The box a binary STL spans, mm: what the tests hold a plate to. */
export function stlBounds(data: Uint8Array): { min: [number, number, number]; max: [number, number, number] } {
  const count = stlTriangleCount(data)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let t = 0; t < count; t++) {
    const base = HEADER_BYTES + COUNT_BYTES + t * TRIANGLE_BYTES + 12
    for (let v = 0; v < 3; v++) {
      for (let axis = 0; axis < 3; axis++) {
        const value = view.getFloat32(base + v * 12 + axis * 4, true)
        if (value < min[axis]) min[axis] = value
        if (value > max[axis]) max[axis] = value
      }
    }
  }
  return { min, max }
}
