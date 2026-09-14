// Side-wall triangulation. A wall is the planar polygon B0, B1, R_n..R_0 seen from outside: two bottom
// corners and the top rim. Plain fans from B0 and B1 fold over as soon as the rim slope exceeds z / s
// (about 0.05 mid-wall on a 150 mm tile), so the wall is triangulated as an s-monotone polygon: fans from
// the bottom corners wherever they are valid, ears clipped at rim peaks elsewhere. No Steiner points, so
// the rim stays exactly the top surface's border and the bottom edge stays one edge (two-triangle bottom).

/** Local vertex ids in the returned triangles: 0 = B0, 1 = B1, 2 + k = rim vertex k. */
export const WALL_B0 = 0
export const WALL_B1 = 1

/**
 * Triangulates one wall in its own 2D frame: `s` along the wall (increasing to the right seen from
 * outside, s[0] = 0 over B0, s[n] = length over B1) and `z` up (> 0). Returns CCW triangles (outward).
 * With float32-exact inputs the orientation test is exact, so no triangle is ever flipped.
 */
export function triangulateWall(s: ArrayLike<number>, z: ArrayLike<number>): Uint32Array {
  const n = s.length
  const out = new Uint32Array(3 * n)
  let o = 0
  const length = s[n - 1]
  const sOf = (id: number) => (id === WALL_B0 ? 0 : id === WALL_B1 ? length : s[id - 2])
  const zOf = (id: number) => (id < 2 ? 0 : z[id - 2])
  const stack = new Uint32Array(n + 1)
  let top = 0
  stack[top++] = WALL_B0
  stack[top++] = 2
  for (let k = 1; k < n; k++) {
    const v = 2 + k
    const sv = sOf(v)
    const zv = zOf(v)
    while (top >= 2) {
      const t = stack[top - 1]
      const b = stack[top - 2]
      const sb = sOf(b)
      const zb = zOf(b)
      // T lies above the chord B-V: the triangle B, V, T is inside the wall.
      const cross = (sOf(t) - sb) * (zv - zb) - (zOf(t) - zb) * (sv - sb)
      if (cross >= 0) break
      out[o++] = b
      out[o++] = v
      out[o++] = t
      top--
    }
    stack[top++] = v
  }
  for (let k = 0; k + 1 < top; k++) {
    out[o++] = stack[k]
    out[o++] = WALL_B1
    out[o++] = stack[k + 1]
  }
  return o === out.length ? out : out.slice(0, o)
}
