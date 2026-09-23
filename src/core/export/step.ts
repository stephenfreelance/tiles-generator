// ISO 10303-21 (AP214) writer: one MANIFOLD_SOLID_BREP of planar ADVANCED_FACEs sharing EDGE_CURVE and
// VERTEX_POINT entities per connected piece of the mesh (a tile is one; a sheet of printed parts is
// several, all in one file). Validated against OCCT 7.6 (occt-import-js) and OCCT 8.0 (BRepCheck_Analyzer):
// reads back as valid SOLIDs with the exact volume. About 720 bytes per triangle, which is roughly a
// third of what OCCT's own STEP writer produces for the same solid.
//
// Adjacent triangles lying on one plane are merged into a single polygon face, so the walls become one
// face each, the bottom one face, and flat lands of the relief a handful of faces. A merged region that
// closes around holes (a tile's bottom around its pockets, a flat land around a pit) stays one face: its
// outer boundary is the FACE_OUTER_BOUND and each hole a FACE_BOUND. Only a region whose boundary touches
// itself at a vertex is split, until every piece is a disk.

import type { MeshData } from '../types'

/** Coordinates are written at 1e-6 mm, and all plane maths runs on the written values. */
const COORD_DECIMALS = 6
/** Directions get more digits: a 400 mm edge must still land on its LINE well inside the 1e-7 uncertainty. */
const DIR_DECIMALS = 12
/** Normals of two triangles on one plane, as 1 - n1.n2. */
const MERGE_NORMAL = 1e-9
/** float32 positions quantise z to about 1e-6 mm at tile heights, so exact coplanarity is not available. */
const MERGE_DIST = 2e-6

export interface StepOptions {
  name: string
  /** ISO timestamp for FILE_NAME; tests pass a fixed one. */
  timestamp?: string
}

/** STEP REALs always carry a decimal point; exponents use a capital E. */
export function fmtReal(x: number, decimals: number): string {
  if (!Number.isFinite(x)) throw new Error(`STEP: non-finite number ${x}`)
  const factor = 10 ** decimals
  const v = Math.round(x * factor) / factor
  if (v === 0) return '0.'
  const s = String(v)
  if (!s.includes('e')) return s.includes('.') ? s : `${s}.`
  const [mantissa, exponent] = s.split('e')
  const m = mantissa.includes('.') ? mantissa : `${mantissa}.`
  return `${m}E${exponent.replace('+', '')}`
}

/** Part 21 string literal: apostrophes double, backslashes escape, non-ASCII goes through \X2\. */
export function stepString(text: string): string {
  let out = "'"
  for (const ch of text) {
    const code = ch.codePointAt(0) as number
    if (ch === "'") out += "''"
    else if (ch === '\\') out += '\\\\'
    else if (code >= 0x20 && code <= 0x7e) out += ch
    else if (code <= 0xffff) out += `\\X2\\${code.toString(16).toUpperCase().padStart(4, '0')}\\X0\\`
    else {
      const v = code - 0x10000
      const hi = (0xd800 + (v >> 10)).toString(16).toUpperCase()
      const lo = (0xdc00 + (v & 0x3ff)).toString(16).toUpperCase()
      out += `\\X2\\${hi}${lo}\\X0\\`
    }
  }
  return `${out}'`
}

/** Collects the file in chunks: one string per entity would be quadratic to concatenate. */
class StepText {
  private parts: string[] = []
  private chunks: Uint8Array[] = []
  private total = 0
  private encoder = new TextEncoder()

  push(line: string): void {
    this.parts.push(line)
    if (this.parts.length >= 4096) this.flush()
  }

  private flush(): void {
    if (this.parts.length === 0) return
    const bytes = this.encoder.encode(this.parts.join(''))
    this.parts.length = 0
    this.chunks.push(bytes)
    this.total += bytes.length
  }

  done(): Uint8Array {
    this.flush()
    const out = new Uint8Array(this.total)
    let o = 0
    for (const chunk of this.chunks) {
      out.set(chunk, o)
      o += chunk.length
    }
    return out
  }
}

interface WeldedMesh {
  coords: Float64Array
  tris: Uint32Array
  count: number
}

/** Welds vertices by their written (rounded) position and drops triangles that collapse. */
function weld(mesh: MeshData): WeldedMesh {
  const p = mesh.positions
  const n = p.length / 3
  const scale = 10 ** COORD_DECIMALS
  let size = 8
  while (size < 2 * n) size *= 2
  const mask = size - 1
  const table = new Int32Array(size).fill(-1)
  const keys = new Int32Array(3 * n)
  const ids = new Uint32Array(n)
  const coords = new Float64Array(3 * n)
  let count = 0
  for (let v = 0; v < n; v++) {
    const qx = Math.round(p[3 * v] * scale)
    const qy = Math.round(p[3 * v + 1] * scale)
    const qz = Math.round(p[3 * v + 2] * scale)
    let h = (Math.imul(qx, 0x9e3779b1) ^ Math.imul(qy, 0x85ebca6b) ^ Math.imul(qz, 0xc2b2ae35)) >>> 0
    h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0) & mask
    for (;;) {
      const slot = table[h]
      if (slot === -1) {
        table[h] = count
        keys[3 * count] = qx
        keys[3 * count + 1] = qy
        keys[3 * count + 2] = qz
        coords[3 * count] = qx / scale
        coords[3 * count + 1] = qy / scale
        coords[3 * count + 2] = qz / scale
        ids[v] = count++
        break
      }
      if (keys[3 * slot] === qx && keys[3 * slot + 1] === qy && keys[3 * slot + 2] === qz) {
        ids[v] = slot
        break
      }
      h = (h + 1) & mask
    }
  }
  const src = mesh.indices
  const tris = new Uint32Array(src.length)
  let o = 0
  for (let t = 0; t < src.length; t += 3) {
    const a = ids[src[t]]
    const b = ids[src[t + 1]]
    const c = ids[src[t + 2]]
    if (a === b || b === c || c === a) continue
    tris[o++] = a
    tris[o++] = b
    tris[o++] = c
  }
  return { coords: coords.subarray(0, 3 * count), tris: tris.subarray(0, o), count }
}

/**
 * A merged planar face: its boundary loops as vertex ids, the outer loop first (counter-clockwise seen from
 * outside), then any holes (clockwise).
 */
type Face = number[][]

/** Merges coplanar triangles into planar faces. */
function mergeFaces(mesh: WeldedMesh): Face[] {
  const { coords, tris, count } = mesh
  const triCount = tris.length / 3
  const nx = new Float64Array(triCount)
  const ny = new Float64Array(triCount)
  const nz = new Float64Array(triCount)
  const nd = new Float64Array(triCount)
  for (let t = 0; t < triCount; t++) {
    const a = 3 * tris[3 * t]
    const b = 3 * tris[3 * t + 1]
    const c = 3 * tris[3 * t + 2]
    const ux = coords[b] - coords[a]
    const uy = coords[b + 1] - coords[a + 1]
    const uz = coords[b + 2] - coords[a + 2]
    const vx = coords[c] - coords[a]
    const vy = coords[c + 1] - coords[a + 1]
    const vz = coords[c + 2] - coords[a + 2]
    let x = uy * vz - uz * vy
    let y = uz * vx - ux * vz
    let z = ux * vy - uy * vx
    const len = Math.hypot(x, y, z) || 1
    x /= len
    y /= len
    z /= len
    nx[t] = x
    ny[t] = y
    nz[t] = z
    nd[t] = x * coords[a] + y * coords[a + 1] + z * coords[a + 2]
  }

  // CSR of directed edges, so the twin of (a, b) is found by scanning b's short list.
  const deg = new Uint32Array(count + 1)
  for (let i = 0; i < tris.length; i++) deg[tris[i]]++
  let sum = 0
  const start = new Uint32Array(count + 1)
  for (let v = 0; v <= count; v++) {
    start[v] = sum
    sum += v < count ? deg[v] : 0
  }
  const cursor = start.slice()
  const adjTo = new Uint32Array(tris.length)
  const adjTri = new Uint32Array(tris.length)
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tris[3 * t + k]
      const b = tris[3 * t + ((k + 1) % 3)]
      adjTo[cursor[a]] = b
      adjTri[cursor[a]] = t
      cursor[a]++
    }
  }
  const twin = (a: number, b: number) => {
    for (let p = start[b]; p < start[b + 1]; p++) if (adjTo[p] === a) return adjTri[p]
    return -1
  }

  const region = new Int32Array(triCount).fill(-1)
  const groups: number[][] = []
  const stack: number[] = []
  for (let seed = 0; seed < triCount; seed++) {
    if (region[seed] !== -1) continue
    const g = groups.length
    const sx = nx[seed]
    const sy = ny[seed]
    const sz = nz[seed]
    const sd = nd[seed]
    const list: number[] = [seed]
    region[seed] = g
    stack.push(seed)
    while (stack.length) {
      const t = stack.pop() as number
      for (let k = 0; k < 3; k++) {
        const a = tris[3 * t + k]
        const b = tris[3 * t + ((k + 1) % 3)]
        const o = twin(a, b)
        if (o < 0 || region[o] !== -1) continue
        if (1 - (nx[o] * sx + ny[o] * sy + nz[o] * sz) > MERGE_NORMAL) continue
        let fits = true
        for (let m = 0; m < 3 && fits; m++) {
          const q = 3 * tris[3 * o + m]
          fits = Math.abs(sx * coords[q] + sy * coords[q + 1] + sz * coords[q + 2] - sd) <= MERGE_DIST
        }
        if (!fits) continue
        region[o] = g
        list.push(o)
        stack.push(o)
      }
    }
    groups.push(list)
  }

  const inRegion = new Uint8Array(triCount)
  const faces: Face[] = []
  const pending = groups.slice()
  while (pending.length) {
    const list = pending.pop() as number[]
    for (const t of list) inRegion[t] = 1
    const loops = boundaryLoops(list, tris, inRegion, twin)
    const seed = list[0]
    const withHoles = loops && loops.length > 1 ? outerFirst(loops, coords, nx[seed], ny[seed], nz[seed]) : null
    if (loops && loops.length === 1) {
      faces.push([loops[0]])
    } else if (withHoles) {
      faces.push(withHoles)
    } else if (list.length === 1) {
      faces.push([[tris[3 * list[0]], tris[3 * list[0] + 1], tris[3 * list[0] + 2]]])
    } else {
      pending.push(...splitRegion(list, tris, coords))
    }
    for (const t of list) inRegion[t] = 0
  }
  return faces
}

/**
 * The loops of a region with holes, outer first: the one loop with a positive area about the region's
 * normal, which must also be the largest; every other loop must be negative (a hole). Null otherwise,
 * and the region is split instead.
 */
function outerFirst(loops: number[][], coords: Float64Array, nx: number, ny: number, nz: number): Face | null {
  const areas = loops.map((loop) => {
    let x = 0
    let y = 0
    let z = 0
    for (let k = 0; k < loop.length; k++) {
      const a = 3 * loop[k]
      const b = 3 * loop[(k + 1) % loop.length]
      x += (coords[a + 1] - coords[b + 1]) * (coords[a + 2] + coords[b + 2])
      y += (coords[a + 2] - coords[b + 2]) * (coords[a] + coords[b])
      z += (coords[a] - coords[b]) * (coords[a + 1] + coords[b + 1])
    }
    return (x * nx + y * ny + z * nz) / 2
  })
  const outer = areas.findIndex((a) => a > 0)
  if (outer < 0 || areas.some((a, k) => k !== outer && (a >= 0 || -a >= areas[outer]))) return null
  return [loops[outer], ...loops.filter((_, k) => k !== outer)]
}

/** Boundary of a region as closed loops of vertex ids, or null when a vertex pinches it. */
function boundaryLoops(
  list: number[],
  tris: Uint32Array,
  inRegion: Uint8Array,
  twin: (a: number, b: number) => number,
): number[][] | null {
  const next = new Map<number, number>()
  for (const t of list) {
    for (let k = 0; k < 3; k++) {
      const a = tris[3 * t + k]
      const b = tris[3 * t + ((k + 1) % 3)]
      const o = twin(a, b)
      if (o >= 0 && inRegion[o]) continue
      if (next.has(a)) return null
      next.set(a, b)
    }
  }
  const loops: number[][] = []
  const seen = new Set<number>()
  for (const first of next.keys()) {
    if (seen.has(first)) continue
    const loop: number[] = [first]
    seen.add(first)
    for (let v = next.get(first) as number; v !== first; v = next.get(v) as number) {
      if (v === undefined || seen.has(v)) return null
      seen.add(v)
      loop.push(v)
    }
    loops.push(loop)
  }
  return loops
}

/** Halves a region across its longer axis, then returns the connected components of each half. */
function splitRegion(list: number[], tris: Uint32Array, coords: Float64Array): number[][] {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const cx = new Map<number, number>()
  const cy = new Map<number, number>()
  const cz = new Map<number, number>()
  for (const t of list) {
    let x = 0
    let y = 0
    let z = 0
    for (let k = 0; k < 3; k++) {
      const q = 3 * tris[3 * t + k]
      x += coords[q] / 3
      y += coords[q + 1] / 3
      z += coords[q + 2] / 3
    }
    cx.set(t, x)
    cy.set(t, y)
    cz.set(t, z)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  const spanX = maxX - minX
  const spanY = maxY - minY
  const spanZ = maxZ - minZ
  const pick = spanX >= spanY && spanX >= spanZ ? cx : spanY >= spanZ ? cy : cz
  const mid = spanX >= spanY && spanX >= spanZ ? (minX + maxX) / 2 : spanY >= spanZ ? (minY + maxY) / 2 : (minZ + maxZ) / 2
  const a: number[] = []
  const b: number[] = []
  for (const t of list) ((pick.get(t) as number) <= mid ? a : b).push(t)
  if (a.length === 0 || b.length === 0) {
    const half = Math.floor(list.length / 2)
    return [list.slice(0, half), list.slice(half)]
  }
  return [a, b]
}

/** Drops vertices that only two faces use and that are collinear in both: a wall's per-cell rim points. */
function dropCollinear(faces: Face[], coords: Float64Array, count: number): Face[] {
  const uses = new Int32Array(count)
  const owner = new Int32Array(count).fill(-1)
  const repeated = new Uint8Array(count)
  faces.forEach((face, f) => {
    for (const loop of face) {
      for (const v of loop) {
        uses[v]++
        if (owner[v] === -1) owner[v] = f
        else if (owner[v] === f) repeated[v] = 1
      }
    }
  })
  const collinearVotes = new Int32Array(count)
  for (const face of faces) {
    for (const loop of face) {
      const n = loop.length
      for (let k = 0; k < n; k++) {
        const v = loop[k]
        if (uses[v] !== 2 || repeated[v]) continue
        const a = loop[(k + n - 1) % n]
        const b = loop[(k + 1) % n]
        const ux = coords[3 * v] - coords[3 * a]
        const uy = coords[3 * v + 1] - coords[3 * a + 1]
        const uz = coords[3 * v + 2] - coords[3 * a + 2]
        const wx = coords[3 * b] - coords[3 * v]
        const wy = coords[3 * b + 1] - coords[3 * v + 1]
        const wz = coords[3 * b + 2] - coords[3 * v + 2]
        const crossLen = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx)
        const lu = Math.hypot(ux, uy, uz)
        const lw = Math.hypot(wx, wy, wz)
        if (crossLen <= 1e-9 * lu * lw && ux * wx + uy * wy + uz * wz > 0) collinearVotes[v]++
      }
    }
  }
  const dropped = new Uint8Array(count)
  for (let v = 0; v < count; v++) if (collinearVotes[v] === 2 && uses[v] === 2 && !repeated[v]) dropped[v] = 1
  // A vertex must go from both faces that use it or from neither, so keeping a loop at three corners
  // puts its vertices back for the neighbour too, instead of leaving an edge the neighbour has merged.
  for (const face of faces) {
    for (const loop of face) {
      let kept = 0
      for (const v of loop) if (!dropped[v]) kept++
      for (let k = 0; kept < 3 && k < loop.length; k++) {
        if (!dropped[loop[k]]) continue
        dropped[loop[k]] = 0
        kept++
      }
    }
  }
  return faces.map((face) => face.map((loop) => loop.filter((v) => !dropped[v])))
}

/** Connected pieces of the mesh: the component of every face, numbered in order of first appearance. */
function faceComponents(faces: Face[], count: number): { of: Int32Array; total: number } {
  const parent = new Int32Array(count)
  for (let v = 0; v < count; v++) parent[v] = v
  const find = (v: number) => {
    while (parent[v] !== v) {
      parent[v] = parent[parent[v]]
      v = parent[v]
    }
    return v
  }
  for (const face of faces) {
    const root = find(face[0][0])
    for (const loop of face) {
      for (const v of loop) {
        const r = find(v)
        if (r !== root) parent[r] = root
      }
    }
  }
  const label = new Int32Array(count).fill(-1)
  const of = new Int32Array(faces.length)
  let total = 0
  faces.forEach((face, f) => {
    const root = find(face[0][0])
    if (label[root] === -1) label[root] = total++
    of[f] = label[root]
  })
  return { of, total }
}

/** Newell normal of a polygon loop. */
function newellNormal(loop: number[], coords: Float64Array): [number, number, number] {
  let x = 0
  let y = 0
  let z = 0
  for (let k = 0; k < loop.length; k++) {
    const a = 3 * loop[k]
    const b = 3 * loop[(k + 1) % loop.length]
    x += (coords[a + 1] - coords[b + 1]) * (coords[a + 2] + coords[b + 2])
    y += (coords[a + 2] - coords[b + 2]) * (coords[a] + coords[b])
    z += (coords[a] - coords[b]) * (coords[a + 1] + coords[b + 1])
  }
  const len = Math.hypot(x, y, z)
  if (len === 0) throw new Error('STEP: degenerate face')
  return [x / len, y / len, z / len]
}

export function writeStep(mesh: MeshData, opts: StepOptions): Uint8Array {
  const welded = weld(mesh)
  const faces = dropCollinear(mergeFaces(welded), welded.coords, welded.count)
  const { coords, count } = welded
  const components = faceComponents(faces, count)
  const name = opts.name
  const timestamp = opts.timestamp ?? new Date().toISOString().slice(0, 19)

  const text = new StepText()
  text.push('ISO-10303-21;\n')
  text.push('HEADER;\n')
  text.push(`FILE_DESCRIPTION((${stepString(name)}),'2;1');\n`)
  text.push(
    `FILE_NAME(${stepString(`${name}.step`)},'${timestamp}',(''),(''),'Tessera geometry','Tessera','');\n`,
  )
  text.push("FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\n")
  text.push('ENDSEC;\n')
  text.push('DATA;\n')

  let nextId = 0
  const reserve = () => ++nextId
  const put = (ref: number, body: string) => {
    text.push(`#${ref}=${body};\n`)
  }
  const add = (body: string) => {
    const ref = reserve()
    put(ref, body)
    return ref
  }

  const appCtx = add("APPLICATION_CONTEXT('core data for automotive mechanical design processes')")
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${appCtx})`)
  const prodCtx = add(`PRODUCT_CONTEXT('',#${appCtx},'mechanical')`)
  const product = add(`PRODUCT(${stepString(name)},${stepString(name)},'',(#${prodCtx}))`)
  add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(#${product}))`)
  const formation = add(`PRODUCT_DEFINITION_FORMATION('','',#${product})`)
  const defCtx = add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${appCtx},'design')`)
  const definition = add(`PRODUCT_DEFINITION('design','',#${formation},#${defCtx})`)
  const shape = add(`PRODUCT_DEFINITION_SHAPE('','',#${definition})`)
  const repRef = reserve()
  add(`SHAPE_DEFINITION_REPRESENTATION(#${shape},#${repRef})`)
  const mm = add('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))')
  const rad = add('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))')
  const sr = add('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())')
  const uncertainty = add(
    `UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#${mm},'distance_accuracy_value','confusion accuracy')`,
  )
  const context = add(
    `(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${uncertainty}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${mm},#${rad},#${sr}))REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY'))`,
  )
  const worldOrigin = add("CARTESIAN_POINT('',(0.,0.,0.))")
  const directions = new Map<string, number>()
  const direction = (x: number, y: number, z: number) => {
    const key = `(${fmtReal(x, DIR_DECIMALS)},${fmtReal(y, DIR_DECIMALS)},${fmtReal(z, DIR_DECIMALS)})`
    let ref = directions.get(key)
    if (ref === undefined) {
      ref = add(`DIRECTION('',${key})`)
      directions.set(key, ref)
    }
    return ref
  }
  const worldZ = direction(0, 0, 1)
  const worldX = direction(1, 0, 0)
  const world = add(`AXIS2_PLACEMENT_3D('',#${worldOrigin},#${worldZ},#${worldX})`)
  // One solid and one closed shell per connected piece; a single piece keeps the historical numbering.
  const solidRefs: number[] = []
  const shellRefs: number[] = []
  for (let c = 0; c < components.total; c++) {
    solidRefs.push(reserve())
    shellRefs.push(reserve())
  }

  const pointRef = new Int32Array(count)
  const vertexRef = new Int32Array(count)
  const pointOf = (v: number) => {
    if (pointRef[v] === 0) {
      pointRef[v] = add(
        `CARTESIAN_POINT('',(${fmtReal(coords[3 * v], COORD_DECIMALS)},${fmtReal(coords[3 * v + 1], COORD_DECIMALS)},${fmtReal(coords[3 * v + 2], COORD_DECIMALS)}))`,
      )
    }
    return pointRef[v]
  }
  const vertexOf = (v: number) => {
    if (vertexRef[v] === 0) vertexRef[v] = add(`VERTEX_POINT('',#${pointOf(v)})`)
    return vertexRef[v]
  }
  const vectors = new Map<number, number>()
  const vectorOf = (dirRef: number) => {
    let ref = vectors.get(dirRef)
    if (ref === undefined) {
      ref = add(`VECTOR('',#${dirRef},1.)`)
      vectors.set(dirRef, ref)
    }
    return ref
  }

  // Edge lookup as CSR over the final faces: one EDGE_CURVE per undirected edge, shared by both faces.
  const deg = new Uint32Array(count + 1)
  for (const face of faces) {
    for (const loop of face) {
      for (let k = 0; k < loop.length; k++) {
        deg[loop[k]]++
        deg[loop[(k + 1) % loop.length]]++
      }
    }
  }
  const estart = new Uint32Array(count + 1)
  let esum = 0
  for (let v = 0; v <= count; v++) {
    estart[v] = esum
    esum += v < count ? deg[v] : 0
  }
  const efill = estart.slice()
  const adjTo = new Uint32Array(esum)
  const adjEdge = new Uint32Array(esum)
  const edgeStart: number[] = []
  const edgeRef: number[] = []
  const edgeDir: number[] = []
  const edgeOf = (a: number, b: number) => {
    for (let p = estart[a]; p < efill[a]; p++) if (adjTo[p] === b) return adjEdge[p]
    const dx = coords[3 * b] - coords[3 * a]
    const dy = coords[3 * b + 1] - coords[3 * a + 1]
    const dz = coords[3 * b + 2] - coords[3 * a + 2]
    const len = Math.hypot(dx, dy, dz)
    if (len === 0) throw new Error('STEP: zero length edge')
    const dir = direction(dx / len, dy / len, dz / len)
    const va = vertexOf(a)
    const vb = vertexOf(b)
    const line = add(`LINE('',#${pointOf(a)},#${vectorOf(dir)})`)
    const ref = add(`EDGE_CURVE('',#${va},#${vb},#${line},.T.)`)
    const e = edgeRef.length
    edgeRef.push(ref)
    edgeStart.push(a)
    edgeDir.push(dir)
    adjTo[efill[a]] = b
    adjEdge[efill[a]] = e
    efill[a]++
    adjTo[efill[b]] = a
    adjEdge[efill[b]] = e
    efill[b]++
    return e
  }

  const faceRefs: number[][] = shellRefs.map(() => [])
  const oriented: number[] = []
  faces.forEach((face, f) => {
    let refDir = 0
    const bounds: number[] = []
    face.forEach((loop, l) => {
      oriented.length = 0
      for (let k = 0; k < loop.length; k++) {
        const a = loop[k]
        const b = loop[(k + 1) % loop.length]
        const e = edgeOf(a, b)
        if (l === 0 && k === 0) refDir = edgeDir[e]
        oriented.push(add(`ORIENTED_EDGE('',*,*,#${edgeRef[e]},${edgeStart[e] === a ? '.T.' : '.F.'})`))
      }
      const edgeLoop = add(`EDGE_LOOP('',(${oriented.map((r) => `#${r}`).join(',')}))`)
      bounds.push(add(`${l === 0 ? 'FACE_OUTER_BOUND' : 'FACE_BOUND'}('',#${edgeLoop},.T.)`))
    })
    const outer = face[0]
    const [nxv, nyv, nzv] = newellNormal(outer, coords)
    const axis = add(`AXIS2_PLACEMENT_3D('',#${pointOf(outer[0])},#${direction(nxv, nyv, nzv)},#${refDir})`)
    const plane = add(`PLANE('',#${axis})`)
    faceRefs[components.of[f]].push(add(`ADVANCED_FACE('',(${bounds.map((r) => `#${r}`).join(',')}),#${plane},.T.)`))
  })

  const solidName = (c: number) => stepString(components.total === 1 ? name : `${name} ${c + 1}`)
  for (let c = 0; c < components.total; c++) {
    put(shellRefs[c], `CLOSED_SHELL('',(${faceRefs[c].map((r) => `#${r}`).join(',')}))`)
    put(solidRefs[c], `MANIFOLD_SOLID_BREP(${solidName(c)},#${shellRefs[c]})`)
  }
  const items = [world, ...solidRefs].map((r) => `#${r}`).join(',')
  put(repRef, `ADVANCED_BREP_SHAPE_REPRESENTATION(${stepString(name)},(${items}),#${context})`)
  text.push('ENDSEC;\n')
  text.push('END-ISO-10303-21;\n')
  return text.done()
}
