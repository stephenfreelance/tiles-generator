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

/**
 * Triangulates a wall whose bottom edge steps up into notches (a key notch open at the back and the side).
 * The polygon, seen from outside, runs along the bottom chain left to right, up the right end, back along
 * the rim and down the left end:
 * - `topS` / `topZ`: the rim, s strictly increasing, starting over the first bottom vertex and ending over
 *   the last one;
 * - `bottomS` / `bottomZ`: s non-decreasing, below the rim everywhere; two consecutive vertices with the
 *   same s are a vertical notch side (going up at a notch's left end, down at its right end). The chain
 *   leaves its first vertex and reaches its last one with a step in s, so a notch at a corner starts or
 *   ends the chain at its ceiling height instead.
 *
 * Local vertex ids: bottom vertex j is j, rim vertex k is bottomS.length + k. With the bottom chain
 * [B0, B1] at z = 0 that is exactly `triangulateWall`'s numbering and its output. The textbook monotone
 * stack sweep in s (O(n), no Steiner points): every rim and every bottom vertex is used as given, so the
 * rim still matches the top surface and the notch corners still match the pocket walls. A vertical side
 * is swept so its triangles lie on the side the wall continues: bottom first at a rising side, rim first
 * at a falling one, which keeps any rim vertex at the same s out of a degenerate triangle. Returns
 * counter-clockwise (outward) triangles, n + m - 2 of them; exact on float32-snapped inputs.
 */
export function triangulateNotchedWall(
  topS: ArrayLike<number>,
  topZ: ArrayLike<number>,
  bottomS: ArrayLike<number>,
  bottomZ: ArrayLike<number>,
): Uint32Array {
  const n = topS.length
  const m = bottomS.length
  if (n < 2 || m < 2 || topZ.length !== n || bottomZ.length !== m) throw new Error('triangulateNotchedWall: need 2 rim and 2 bottom vertices')
  if (bottomS[0] !== topS[0] || bottomS[m - 1] !== topS[n - 1]) throw new Error('triangulateNotchedWall: the chains must share their end s')
  if (!(bottomS[1] > bottomS[0]) || !(bottomS[m - 1] > bottomS[m - 2])) {
    throw new Error('triangulateNotchedWall: the bottom chain must leave its ends along s')
  }
  for (let k = 1; k < n; k++) if (!(topS[k] > topS[k - 1])) throw new Error('triangulateNotchedWall: rim s must increase')
  // +1 where bottom vertex j belongs to a rising vertical side, -1 to a falling one, 0 elsewhere.
  const side = new Int8Array(m)
  for (let j = 1; j < m; j++) {
    if (bottomS[j] < bottomS[j - 1]) throw new Error('triangulateNotchedWall: bottom s must not decrease')
    if (bottomS[j] !== bottomS[j - 1]) continue
    const dir = bottomZ[j] > bottomZ[j - 1] ? 1 : bottomZ[j] < bottomZ[j - 1] ? -1 : 0
    if (dir === 0 || (side[j - 1] !== 0 && side[j - 1] !== dir)) throw new Error('triangulateNotchedWall: a vertical side folds back')
    side[j - 1] = dir
    side[j] = dir
  }

  const total = n + m
  const sOf = (id: number) => (id < m ? bottomS[id] : topS[id - m])
  const zOf = (id: number) => (id < m ? bottomZ[id] : topZ[id - m])
  // Sweep order: by s; at a tie the bottom vertex goes first only at the start or on a rising side.
  const order = new Uint32Array(total)
  for (let o = 0, j = 0, k = 0; o < total; o++) {
    const takeBottom =
      k === n || (j < m && (bottomS[j] < topS[k] || (bottomS[j] === topS[k] && (j === 0 || side[j] > 0))))
    order[o] = takeBottom ? j++ : m + k++
  }

  const out = new Uint32Array(3 * (total - 2))
  let o = 0
  const stack = new Uint32Array(total)
  let top = 0
  stack[top++] = order[0]
  stack[top++] = order[1]
  const fan = (v: number) => {
    // v sees every vertex on the stack (all on the other chain but the lowest): one triangle per pair.
    const onBottom = v < m
    for (let q = 0; q + 1 < top; q++) {
      out[o++] = stack[q]
      out[o++] = onBottom ? v : stack[q + 1]
      out[o++] = onBottom ? stack[q + 1] : v
    }
  }
  for (let q = 2; q < total - 1; q++) {
    const v = order[q]
    const vOnBottom = v < m
    const last = stack[top - 1]
    if (vOnBottom !== last < m) {
      fan(v)
      top = 0
      stack[top++] = last
      stack[top++] = v
      continue
    }
    const sv = sOf(v)
    const zv = zOf(v)
    let t = stack[--top]
    while (top > 0) {
      const b = stack[top - 1]
      const sb = sOf(b)
      const zb = zOf(b)
      const cross = (sOf(t) - sb) * (zv - zb) - (zOf(t) - zb) * (sv - sb)
      // The chord b-v runs inside the wall when t lies beyond it, away from the chain's own side.
      if (vOnBottom ? cross <= 0 : cross >= 0) break
      out[o++] = b
      out[o++] = vOnBottom ? t : v
      out[o++] = vOnBottom ? v : t
      t = stack[--top]
    }
    stack[top++] = t
    stack[top++] = v
  }
  fan(order[total - 1])
  if (o !== out.length) throw new Error('triangulateNotchedWall: the bottom chain crosses the rim')
  return out
}
