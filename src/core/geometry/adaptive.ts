// Top-surface triangulation: one triangle pair per cell (uniform), or merged planar rectangles (adaptive).
//
// Adaptive scheme: cover the cell grid with maximal axis-aligned rectangles whose grid samples all sit
// within tolerance/2 of one plane, then triangulate each rectangle using every grid vertex that any
// neighbouring rectangle also uses. Because the "used vertex" set is global, two neighbouring rectangles
// subdivide their common border identically: no T-junctions, no cracks, whatever the merge produced. A
// rectangle is a convex polygon with collinear points on its sides, so it is triangulated by zig-zagging
// between two opposite sides, or (when both axes carry extra points) by a fan from an interior grid
// vertex. Every triangle has its vertices on the sampled surface, so the vertical error against the fine
// grid stays within tolerance.

import type { GridSurface } from './grid'

export interface TopTriangulation {
  /** Triangles as grid vertex ids (row-major, CCW seen from +z). */
  tris: Uint32Array
  /** 1 for grid vertices that carry a mesh vertex. */
  used: Uint8Array
}

/** Triangulates one cell along its chosen diagonal. */
function emitCell(out: Uint32Array | number[], o: number, a: number, w1: number, flip: boolean): number {
  const v00 = a
  const v10 = a + 1
  const v01 = a + w1
  const v11 = a + w1 + 1
  if (!flip) {
    out[o] = v00; out[o + 1] = v10; out[o + 2] = v11
    out[o + 3] = v00; out[o + 4] = v11; out[o + 5] = v01
  } else {
    out[o] = v00; out[o + 1] = v10; out[o + 2] = v01
    out[o + 3] = v10; out[o + 4] = v11; out[o + 5] = v01
  }
  return o + 6
}

export function triangulateTop(g: GridSurface, toleranceMm: number | null): TopTriangulation {
  const nx = g.xs.length - 1
  const ny = g.ys.length - 1
  const w1 = nx + 1
  const used = new Uint8Array(w1 * (ny + 1))
  if (toleranceMm === null || !(toleranceMm > 0)) {
    const tris = new Uint32Array(6 * nx * ny)
    let o = 0
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) o = emitCell(tris, o, j * w1 + i, w1, g.diag[j * nx + i] === 1)
    }
    used.fill(1)
    return { tris, used }
  }

  const { xs, ys, z } = g
  const eps = toleranceMm / 2
  const taken = new Uint8Array(nx * ny)
  const rects: number[] = []
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (taken[j * nx + i]) continue
      const a = j * w1 + i
      const dx = xs[i + 1] - xs[i]
      const dy = ys[j + 1] - ys[j]
      const z00 = z[a]
      const z10 = z[a + 1]
      const z01 = z[a + w1]
      const z11 = z[a + w1 + 1]
      // Least-squares plane of the seed cell; every merged sample is tested against this one plane, so a
      // slowly curving surface cannot drift out of tolerance across a large rectangle.
      const ga = (z10 - z00 + (z11 - z01)) / (2 * dx)
      const gb = (z01 - z00 + (z11 - z10)) / (2 * dy)
      const gc = (z00 + z10 + z01 + z11) / 4 - ga * (xs[i] + xs[i + 1]) / 2 - gb * (ys[j] + ys[j + 1]) / 2
      const fits = (vi: number, vj: number) => Math.abs(z[vj * w1 + vi] - (ga * xs[vi] + gb * ys[vj] + gc)) <= eps
      let i1 = i + 1
      let j1 = j + 1
      if (fits(i, j) && fits(i + 1, j) && fits(i, j + 1) && fits(i + 1, j + 1)) {
        while (i1 < nx && !taken[j * nx + i1] && fits(i1 + 1, j) && fits(i1 + 1, j + 1)) i1++
        rows: while (j1 < ny) {
          for (let ii = i; ii < i1; ii++) if (taken[j1 * nx + ii]) break rows
          for (let vi = i; vi <= i1; vi++) if (!fits(vi, j1 + 1)) break rows
          j1++
        }
      }
      for (let jj = j; jj < j1; jj++) taken.fill(1, jj * nx + i, jj * nx + i1)
      rects.push(i, j, i1, j1)
      used[j * w1 + i] = 1
      used[j * w1 + i1] = 1
      used[j1 * w1 + i] = 1
      used[j1 * w1 + i1] = 1
    }
  }

  const tris: number[] = []
  const side = (fixed: number, from: number, to: number, horizontal: boolean) => {
    const ids: number[] = []
    for (let k = from; k <= to; k++) {
      const id = horizontal ? fixed * w1 + k : k * w1 + fixed
      if (used[id]) ids.push(id)
    }
    return ids
  }
  const tri = (p: number, q: number, r: number) => tris.push(p, q, r)
  for (let r = 0; r < rects.length; r += 4) {
    const i0 = rects[r]
    const j0 = rects[r + 1]
    const i1 = rects[r + 2]
    const j1 = rects[r + 3]
    if (i1 - i0 === 1 && j1 - j0 === 1) {
      const o = tris.length
      tris.length = o + 6
      emitCell(tris, o, j0 * w1 + i0, w1, g.diag[j0 * nx + i0] === 1)
      continue
    }
    const bottom = side(j0, i0, i1, true)
    const top = side(j1, i0, i1, true)
    const left = side(i0, j0, j1, false)
    const right = side(i1, j0, j1, false)
    const extraH = bottom.length > 2 || top.length > 2
    const extraV = left.length > 2 || right.length > 2
    if (!extraV) {
      // Zig-zag between the bottom and top chains, always advancing the side that is behind in x.
      let p = 0
      let q = 0
      while (p + 1 < bottom.length || q + 1 < top.length) {
        const advanceBottom =
          q + 1 >= top.length ||
          (p + 1 < bottom.length && xs[bottom[p + 1] % w1] <= xs[top[q + 1] % w1])
        if (advanceBottom) {
          tri(bottom[p], bottom[p + 1], top[q])
          p++
        } else {
          tri(bottom[p], top[q + 1], top[q])
          q++
        }
      }
    } else if (!extraH) {
      let p = 0
      let q = 0
      while (p + 1 < left.length || q + 1 < right.length) {
        const rowOf = (id: number) => (id - (id % w1)) / w1
        const advanceLeft =
          q + 1 >= right.length || (p + 1 < left.length && ys[rowOf(left[p + 1])] <= ys[rowOf(right[q + 1])])
        if (advanceLeft) {
          tri(left[p], right[q], left[p + 1])
          p++
        } else {
          tri(right[q], right[q + 1], left[p])
          q++
        }
      }
    } else {
      // Extra vertices on both axes: fan from an interior grid vertex (the rectangle is at least 2 x 2).
      const c = ((j0 + j1) >> 1) * w1 + ((i0 + i1) >> 1)
      used[c] = 1
      const loop = bottom.concat(
        right.slice(1),
        top.slice(0, -1).reverse(),
        left.slice(1, -1).reverse(),
      )
      for (let k = 0; k < loop.length; k++) tri(c, loop[k], loop[(k + 1) % loop.length])
    }
  }
  return { tris: Uint32Array.from(tris), used }
}
