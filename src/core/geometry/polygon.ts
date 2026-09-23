// Flat polygons for the backs of tiles and for the printed parts: rings, their helpers, and a triangulator.
// A ring is a flat [x0, y0, x1, y1, ...] array, closed implicitly (the last vertex joins the first), with no
// repeated vertex. Every predicate here is a sign of a 2x2 determinant on coordinate differences, so on
// rings snapped to one power-of-two quantum (`snapRing` with `float32Quantum` of the part size) every
// orientation test is exact: no ear flips, no sliver is taken for a line.

/** Twice the signed area of the triangle a, b, c: positive when a, b, c turn counter-clockwise. */
function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

/** Is p, known to be on the line through a and b, within the segment's box? */
function onSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean {
  return Math.min(ax, bx) <= px && px <= Math.max(ax, bx) && Math.min(ay, by) <= py && py <= Math.max(ay, by)
}

/** Signed area of a ring (mm²), positive when it runs counter-clockwise. */
export function signedArea(ring: ArrayLike<number>): number {
  const n = ring.length >> 1
  let twice = 0
  for (let k = 0, j = n - 1; k < n; j = k++) {
    twice += ring[2 * j] * ring[2 * k + 1] - ring[2 * k] * ring[2 * j + 1]
  }
  return twice / 2
}

/** The same ring running the other way, starting from the same vertex. */
export function reverseRing(ring: ArrayLike<number>): Float64Array {
  const n = ring.length >> 1
  const out = new Float64Array(2 * n)
  for (let k = 0; k < n; k++) {
    const from = (n - k) % n
    out[2 * k] = ring[2 * from]
    out[2 * k + 1] = ring[2 * from + 1]
  }
  return out
}

export function ringBounds(ring: ArrayLike<number>): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let k = 0; k + 1 < ring.length; k += 2) {
    minX = Math.min(minX, ring[k])
    maxX = Math.max(maxX, ring[k])
    minY = Math.min(minY, ring[k + 1])
    maxY = Math.max(maxY, ring[k + 1])
  }
  return { minX, minY, maxX, maxY }
}

/** Axis-aligned rectangle, counter-clockwise from (x0, y0). */
export function ringFromRect(x0: number, y0: number, x1: number, y1: number): Float64Array {
  const lx = Math.min(x0, x1)
  const hx = Math.max(x0, x1)
  const ly = Math.min(y0, y1)
  const hy = Math.max(y0, y1)
  return Float64Array.of(lx, ly, hx, ly, hx, hy, lx, hy)
}

/** The rectangle grown by `d` on every side (a negative `d` shrinks it), counter-clockwise. */
export function offsetRectRing(x0: number, y0: number, x1: number, y1: number, d: number): Float64Array {
  return ringFromRect(Math.min(x0, x1) - d, Math.min(y0, y1) - d, Math.max(x0, x1) + d, Math.max(y0, y1) + d)
}

/**
 * Rectangle with rounded corners, counter-clockwise, `segments` chords per quarter circle. It has
 * 4 * (segments + 1) vertices while 2r is shorter than both sides, so two of them with the same
 * `segments` loft vertex to vertex; r is clamped to half the shorter side, where coincident arc ends merge.
 */
export function roundedRectRing(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  segments: number,
): Float64Array {
  const lx = Math.min(x0, x1)
  const hx = Math.max(x0, x1)
  const ly = Math.min(y0, y1)
  const hy = Math.max(y0, y1)
  const radius = Math.min(Math.max(r, 0), (hx - lx) / 2, (hy - ly) / 2)
  const steps = Math.max(1, Math.round(segments))
  if (radius <= 0) return ringFromRect(lx, ly, hx, hy)
  const centres: [number, number, number][] = [
    [hx - radius, ly + radius, -Math.PI / 2],
    [hx - radius, hy - radius, 0],
    [lx + radius, hy - radius, Math.PI / 2],
    [lx + radius, ly + radius, Math.PI],
  ]
  const out: number[] = []
  for (const [cx, cy, start] of centres) {
    for (let k = 0; k <= steps; k++) {
      // Exact quadrant ends, so the straight sides stay exactly axis-aligned.
      const t = start + ((k / steps) * Math.PI) / 2
      const c = k === 0 ? Math.round(Math.cos(start)) : k === steps ? Math.round(Math.cos(start + Math.PI / 2)) : Math.cos(t)
      const s = k === 0 ? Math.round(Math.sin(start)) : k === steps ? Math.round(Math.sin(start + Math.PI / 2)) : Math.sin(t)
      const x = cx + radius * c
      const y = cy + radius * s
      const n = out.length
      if (n >= 2 && out[n - 2] === x && out[n - 1] === y) continue
      out.push(x, y)
    }
  }
  if (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2
  return Float64Array.from(out)
}

/**
 * Mitred offset of a simple ring: every edge moves `d` away from the inside (the ring grows for d > 0,
 * whatever its orientation) and neighbouring edges meet again at their intersection. Same vertex count,
 * so an offset ring lofts onto its source. Throws when the offset would fold the ring (an edge flips over
 * or a narrow part closes up).
 */
export function offsetRing(ring: ArrayLike<number>, d: number): Float64Array {
  const n = ring.length >> 1
  const sign = signedArea(ring) >= 0 ? 1 : -1
  const out = new Float64Array(2 * n)
  // Unit outward normal of the edge from vertex k to k + 1.
  const nx = new Float64Array(n)
  const ny = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n
    const ex = ring[2 * j] - ring[2 * k]
    const ey = ring[2 * j + 1] - ring[2 * k + 1]
    const len = Math.hypot(ex, ey)
    if (len === 0) throw new Error('offsetRing: repeated vertex')
    nx[k] = (sign * ey) / len
    ny[k] = (-sign * ex) / len
  }
  for (let k = 0; k < n; k++) {
    const p = (k + n - 1) % n
    // The mitre point sits on both offset lines: along the normals' bisector, scaled by 1 / cos(half angle).
    const bx = nx[p] + nx[k]
    const by = ny[p] + ny[k]
    const dot = bx * nx[k] + by * ny[k]
    if (dot <= 1e-9) throw new Error('offsetRing: a vertex folds back on itself')
    out[2 * k] = ring[2 * k] + (d * bx) / dot
    out[2 * k + 1] = ring[2 * k + 1] + (d * by) / dot
  }
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n
    const along =
      (ring[2 * j] - ring[2 * k]) * (out[2 * j] - out[2 * k]) +
      (ring[2 * j + 1] - ring[2 * k + 1]) * (out[2 * j + 1] - out[2 * k + 1])
    if (along <= 0) throw new Error(`offsetRing: offset ${d} collapses edge ${k}`)
  }
  // A neck narrower than 2|d| crosses itself without any edge flipping: outlines are short, so check all pairs.
  if (ringSelfIntersects(out)) throw new Error(`offsetRing: offset ${d} collapses a narrow part of the ring`)
  return out
}

/** Does any edge of the ring cross or touch a non-adjacent edge? O(n²), for short outlines. */
export function ringSelfIntersects(ring: ArrayLike<number>): boolean {
  const n = ring.length >> 1
  for (let i = 0; i < n; i++) {
    const i1 = (i + 1) % n
    for (let j = i + 1; j < n; j++) {
      const j1 = (j + 1) % n
      if (j === i1 || j1 === i) continue
      if (
        segmentsMeet(ring[2 * i], ring[2 * i + 1], ring[2 * i1], ring[2 * i1 + 1], ring[2 * j], ring[2 * j + 1], ring[2 * j1], ring[2 * j1 + 1])
      ) {
        return true
      }
    }
  }
  return false
}

/** Does any edge of ring a cross or touch any edge of ring b? O(n m), for short outlines. */
export function ringsTouch(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  const na = a.length >> 1
  const nb = b.length >> 1
  for (let i = 0; i < na; i++) {
    const i1 = (i + 1) % na
    for (let j = 0; j < nb; j++) {
      const j1 = (j + 1) % nb
      if (segmentsMeet(a[2 * i], a[2 * i + 1], a[2 * i1], a[2 * i1 + 1], b[2 * j], b[2 * j + 1], b[2 * j1], b[2 * j1 + 1])) return true
    }
  }
  return false
}

/** Do the closed segments a-b and c-d share any point? */
function segmentsMeet(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d1 = orient(ax, ay, bx, by, cx, cy)
  const d2 = orient(ax, ay, bx, by, dx, dy)
  const d3 = orient(cx, cy, dx, dy, ax, ay)
  const d4 = orient(cx, cy, dx, dy, bx, by)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  return (
    (d1 === 0 && onSegment(ax, ay, bx, by, cx, cy)) ||
    (d2 === 0 && onSegment(ax, ay, bx, by, dx, dy)) ||
    (d3 === 0 && onSegment(cx, cy, dx, dy, ax, ay)) ||
    (d4 === 0 && onSegment(cx, cy, dx, dy, bx, by))
  )
}

/**
 * Where a point lies against a ring (either orientation): 1 inside, 0 on the boundary, -1 outside.
 * Exact on snapped coordinates (no division).
 */
export function pointInRing(ring: ArrayLike<number>, x: number, y: number): -1 | 0 | 1 {
  const n = ring.length >> 1
  let winding = 0
  for (let k = 0, j = n - 1; k < n; j = k++) {
    const ax = ring[2 * j]
    const ay = ring[2 * j + 1]
    const bx = ring[2 * k]
    const by = ring[2 * k + 1]
    const o = orient(ax, ay, bx, by, x, y)
    if (o === 0 && Math.min(ax, bx) <= x && x <= Math.max(ax, bx) && Math.min(ay, by) <= y && y <= Math.max(ay, by)) return 0
    if (ay <= y) {
      if (by > y && o > 0) winding++
    } else if (by <= y && o < 0) winding--
  }
  return winding !== 0 ? 1 : -1
}

/** Every coordinate rounded to a multiple of `quantum` (use `float32Quantum` of the part size). */
export function snapRing(ring: ArrayLike<number>, quantum: number): Float64Array {
  const out = new Float64Array(ring.length)
  for (let k = 0; k < ring.length; k++) out[k] = Math.round(ring[k] / quantum) * quantum + 0 // + 0 turns -0 into 0
  return out
}

// ---------------------------------------------------------------------------------------------------------
// Triangulation: ear clipping over one ring, holes first bridged into the outer ring (David Eberly's scheme,
// as earcut does it: the rightmost vertex of the rightmost hole always sees a vertex of the ring built so
// far). No Steiner points and no vertex dropped, collinear ones included, so every vertex a neighbouring
// face shares is kept and the solid has no T-junction.

/** Linked ring of polygon nodes; bridges add a copy of both of their ends. */
interface Nodes {
  x: Float64Array
  y: Float64Array
  /** Index of the vertex in the concatenation [outer, ...holes]. */
  id: Uint32Array
  prev: Int32Array
  next: Int32Array
  size: number
}

/** Is the direction from v to (px, py) strictly inside the polygon's corner at v (interior on the left)? */
function cornerContains(nodes: Nodes, v: number, px: number, py: number): boolean {
  const { x, y } = nodes
  const a = nodes.prev[v]
  const b = nodes.next[v]
  const vx = x[v]
  const vy = y[v]
  const turn = orient(x[a], y[a], vx, vy, x[b], y[b])
  const fromNext = orient(vx, vy, x[b], y[b], px, py) // > 0: left of v -> next
  const toPrev = orient(vx, vy, px, py, x[a], y[a]) // > 0: prev direction is left of v -> p
  if (turn > 0) return fromNext > 0 && toPrev > 0
  if (turn < 0) return fromNext > 0 || toPrev > 0
  const straight = (vx - x[a]) * (x[b] - vx) + (vy - y[a]) * (y[b] - vy) > 0
  return straight && fromNext > 0
}

/** Does the closed segment m-v meet the edge p-q anywhere but at a shared end position? */
function segmentBlocked(
  mx: number,
  my: number,
  vx: number,
  vy: number,
  px: number,
  py: number,
  qx: number,
  qy: number,
): boolean {
  const pAtEnd = (px === mx && py === my) || (px === vx && py === vy)
  const qAtEnd = (qx === mx && qy === my) || (qx === vx && qy === vy)
  if (pAtEnd && qAtEnd) return false
  const d1 = orient(mx, my, vx, vy, px, py)
  const d2 = orient(mx, my, vx, vy, qx, qy)
  if (pAtEnd || qAtEnd) {
    // Touching at a shared end is fine; running back along the segment is not.
    const ox = pAtEnd ? qx : px
    const oy = pAtEnd ? qy : py
    return (pAtEnd ? d2 : d1) === 0 && onSegment(mx, my, vx, vy, ox, oy)
  }
  if (d1 === 0 && onSegment(mx, my, vx, vy, px, py)) return true
  if (d2 === 0 && onSegment(mx, my, vx, vy, qx, qy)) return true
  const d3 = orient(px, py, qx, qy, mx, my)
  const d4 = orient(px, py, qx, qy, vx, vy)
  if (d3 === 0 && onSegment(px, py, qx, qy, mx, my)) return true
  if (d4 === 0 && onSegment(px, py, qx, qy, vx, vy)) return true
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** Joins the hole through node m to the ring through `outer` with a two-way bridge to the closest visible vertex. */
function bridgeHole(nodes: Nodes, outer: number, m: number, pending: number[]): void {
  const { x, y } = nodes
  const mx = x[m]
  const my = y[m]
  const candidates: number[] = []
  let p = outer
  do {
    candidates.push(p)
    p = nodes.next[p]
  } while (p !== outer)
  const dist = (v: number) => (x[v] - mx) ** 2 + (y[v] - my) ** 2
  candidates.sort((a, b) => dist(a) - dist(b) || a - b)
  // The hole's own ring counts too: from its rightmost vertex a bridge can still run back across it.
  const rings = [outer, m, ...pending]
  const blocked = (v: number) => {
    const vx = x[v]
    const vy = y[v]
    for (const start of rings) {
      let e = start
      do {
        const f = nodes.next[e]
        if (segmentBlocked(mx, my, vx, vy, x[e], y[e], x[f], y[f])) return true
        e = f
      } while (e !== start)
    }
    return false
  }
  for (const v of candidates) {
    if (!cornerContains(nodes, v, mx, my) || !cornerContains(nodes, m, x[v], y[v])) continue
    if (blocked(v)) continue
    splitRing(nodes, v, m)
    return
  }
  throw new Error('triangulatePolygon: a hole touches or crosses the outer ring or another hole')
}

/** Bridges node a (outer) to node b (hole): a -> b ... around the hole ... b' -> a' -> a's old next. */
function splitRing(nodes: Nodes, a: number, b: number): void {
  const a2 = nodes.size++
  const b2 = nodes.size++
  nodes.x[a2] = nodes.x[a]
  nodes.y[a2] = nodes.y[a]
  nodes.id[a2] = nodes.id[a]
  nodes.x[b2] = nodes.x[b]
  nodes.y[b2] = nodes.y[b]
  nodes.id[b2] = nodes.id[b]
  const an = nodes.next[a]
  const bp = nodes.prev[b]
  nodes.next[a] = b
  nodes.prev[b] = a
  nodes.next[a2] = an
  nodes.prev[an] = a2
  nodes.next[b2] = a2
  nodes.prev[a2] = b2
  nodes.next[bp] = b2
  nodes.prev[b2] = bp
}

/**
 * Can the triangle prev(b), b, next(b) be cut off? `strict` also refuses a vertex on the new diagonal,
 * which keeps every later ring simple; the relaxed pass only runs if a strict ear cannot be found.
 */
function isEar(nodes: Nodes, b: number, strict: boolean): boolean {
  const { x, y } = nodes
  const a = nodes.prev[b]
  const c = nodes.next[b]
  const ax = x[a]
  const ay = y[a]
  const bx = x[b]
  const by = y[b]
  const cx = x[c]
  const cy = y[c]
  if (orient(ax, ay, bx, by, cx, cy) <= 0) return false
  const minX = Math.min(ax, bx, cx)
  const maxX = Math.max(ax, bx, cx)
  const minY = Math.min(ay, by, cy)
  const maxY = Math.max(ay, by, cy)
  for (let p = nodes.next[c]; p !== a; p = nodes.next[p]) {
    const px = x[p]
    const py = y[p]
    if (px < minX || px > maxX || py < minY || py > maxY) continue
    if (px === bx && py === by) {
      // A bridge copy of the tip: the ear is only wrong if one of its edges runs into the triangle.
      const q = nodes.prev[p]
      const r = nodes.next[p]
      const into = (qx: number, qy: number) => orient(bx, by, cx, cy, qx, qy) > 0 && orient(bx, by, qx, qy, ax, ay) > 0
      if (into(x[q], y[q]) || into(x[r], y[r])) return false
      continue
    }
    if ((px === ax && py === ay) || (px === cx && py === cy)) continue
    const o1 = orient(ax, ay, bx, by, px, py)
    const o2 = orient(bx, by, cx, cy, px, py)
    const o3 = orient(cx, cy, ax, ay, px, py)
    if (strict ? o1 >= 0 && o2 >= 0 && o3 >= 0 : o1 > 0 && o2 > 0 && o3 > 0) return false
  }
  return true
}

/**
 * Triangles covering a polygon with holes. `outer` and `holes` are rings of xy pairs in any orientation
 * (the outer is read counter-clockwise, holes clockwise); holes lie strictly inside the outer ring and
 * touch nothing. Returns indices into the concatenation [outer, ...holes], every triangle
 * counter-clockwise (positive area), n + 2h - 2 of them for n vertices and h holes, every vertex used and
 * no vertex added. Exact on coordinates snapped to one power-of-two quantum no finer than a float32 step at
 * the part's size (`snapRing` with `float32Quantum`). About O(n²): meant for outlines (a tile's bottom, a
 * part's cap), not for relief grids. Throws when a hole crosses or touches another ring.
 */
export function triangulatePolygon(outer: ArrayLike<number>, holes: readonly ArrayLike<number>[] = []): Uint32Array {
  const counts = [outer.length >> 1, ...holes.map((h) => h.length >> 1)]
  const total = counts.reduce((s, c) => s + c, 0)
  if (counts[0] < 3) throw new Error('triangulatePolygon: the outer ring needs 3 vertices')
  const capacity = total + 2 * holes.length
  const nodes: Nodes = {
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    id: new Uint32Array(capacity),
    prev: new Int32Array(capacity),
    next: new Int32Array(capacity),
    size: total,
  }
  const starts: number[] = []
  let base = 0
  const rings = [outer, ...holes]
  rings.forEach((ring, r) => {
    const n = counts[r]
    if (n < 3) throw new Error(`triangulatePolygon: ring ${r} needs 3 vertices`)
    const area = signedArea(ring)
    if (area === 0) throw new Error(`triangulatePolygon: ring ${r} has no area`)
    // Outer counter-clockwise, holes clockwise: after bridging, the domain is always on the left.
    const reversed = r === 0 ? area < 0 : area > 0
    for (let k = 0; k < n; k++) {
      const v = base + k
      nodes.x[v] = ring[2 * k]
      nodes.y[v] = ring[2 * k + 1]
      nodes.id[v] = v
      const after = base + ((k + 1) % n)
      const before = base + ((k + n - 1) % n)
      nodes.next[v] = reversed ? before : after
      nodes.prev[v] = reversed ? after : before
    }
    starts.push(base)
    base += n
  })

  // Holes from right to left, each bridged from its rightmost vertex.
  const rightmost = starts.slice(1).map((start, h) => {
    let best = start
    for (let v = start; v < start + counts[h + 1]; v++) {
      if (nodes.x[v] > nodes.x[best] || (nodes.x[v] === nodes.x[best] && nodes.y[v] < nodes.y[best])) best = v
    }
    return best
  })
  const order = rightmost.map((_, h) => h).sort((a, b) => nodes.x[rightmost[b]] - nodes.x[rightmost[a]] || a - b)
  const pending = new Set(order)
  for (const h of order) {
    pending.delete(h)
    bridgeHole(nodes, starts[0], rightmost[h], [...pending].map((k) => starts[k + 1]))
  }

  const ringSize = total + 2 * holes.length
  const out = new Uint32Array(3 * (ringSize - 2))
  let o = 0
  let left = ringSize
  let ear = starts[0]
  let stop = ear
  // 0: strict ears; 1: vertices may touch the diagonal; 2: any convex corner; 3: anything (never on valid rings).
  let pass = 0
  while (left > 3) {
    const a = nodes.prev[ear]
    const c = nodes.next[ear]
    const ok =
      pass === 3 ||
      (pass === 2
        ? orient(nodes.x[a], nodes.y[a], nodes.x[ear], nodes.y[ear], nodes.x[c], nodes.y[c]) > 0
        : isEar(nodes, ear, pass === 0))
    if (ok) {
      out[o++] = nodes.id[a]
      out[o++] = nodes.id[ear]
      out[o++] = nodes.id[c]
      nodes.next[a] = c
      nodes.prev[c] = a
      left--
      // Moving on past the next corner spreads the ears around the ring instead of fanning slivers.
      ear = nodes.next[c]
      stop = ear
      pass = 0
      continue
    }
    ear = nodes.next[ear]
    if (ear === stop) pass++
  }
  out[o] = nodes.id[nodes.prev[ear]]
  out[o + 1] = nodes.id[ear]
  out[o + 2] = nodes.id[nodes.next[ear]]
  return out
}
