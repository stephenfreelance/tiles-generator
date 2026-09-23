// The printed parts as they sit in the single tile's back, for the Back view: each clip in its pocket, each
// key half in its notch and half out past the side. Where they go is core's (seatedParts); this turns it
// into models the scene can draw, with the meshes built on the main thread (cheap prisms and lofts) and
// cached by accessory id. Pure: no three, so it is tested in vitest's node environment.
import { presetByHex } from '@/core/colors'
import { accessoryParts } from '@/core/fixing/accessories'
import { tabLimits } from '@/core/fixing/capability'
import { buildKeyMesh } from '@/core/fixing/joins'
import { buildClipMesh } from '@/core/fixing/mount'
import { seatedParts, type SeatedPart } from '@/core/fixing/seated'
import type { AccessorySpec } from '@/core/fixing/types'
import type { DesignConfig, LayoutPlan, MeshData, PieceSpec } from '@/core/types'
import { formatSize } from '@/core/units'
import type { TileFace } from './flip'

/** An axis-aligned box, mm. */
export interface PartBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

/** One part of a model on the piece: the centre of its box in piece-local mm, its bottom's z, its quarter turns. */
export type PartSeat = Pick<SeatedPart, 'x' | 'y' | 'z' | 'turns'>

/** One printed model and every place it sits in the piece. */
export interface SeatedModel {
  accessoryId: string
  kind: SeatedPart['kind']
  /** The mesh as printed: bottom on the bed, from the part's own mesher. */
  mesh: MeshData
  /** Its bounding box as printed: a seat puts the centre of this box at (x, y) and its bottom at z. */
  box: PartBox
  seats: PartSeat[]
}

export interface SeatedSet {
  /** Stable while the parts and their places stay the same, so a recolour never rebuilds anything. */
  key: string
  models: SeatedModel[]
  /** Box of every part as seated, in the tile frame: what the turn to the back has to clear. */
  extent: PartBox
  keys: number
  clips: number
}

/** Bounding box of a mesh, mm. */
export function meshBox(mesh: MeshData): PartBox {
  const p = mesh.positions
  const box: PartBox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }
  for (let i = 0; i + 2 < p.length; i += 3) {
    box.minX = Math.min(box.minX, p[i])
    box.maxX = Math.max(box.maxX, p[i])
    box.minY = Math.min(box.minY, p[i + 1])
    box.maxY = Math.max(box.maxY, p[i + 1])
    box.minZ = Math.min(box.minZ, p[i + 2])
    box.maxZ = Math.max(box.maxZ, p[i + 2])
  }
  return box
}

/** (x, y) turned by quarter turns about the origin, counter-clockwise seen from +z. Exact: no 1e-17 residue. */
export function turnXY(x: number, y: number, turns: PartSeat['turns']): [number, number] {
  switch (turns) {
    case 1:
      return [-y + 0, x + 0]
    case 2:
      return [-x + 0, -y + 0]
    case 3:
      return [y + 0, -x + 0]
    default:
      return [x, y]
  }
}

/** Where the part of `box` lands in the tile frame at `seat`: its box centred on (x, y), bottom at z, turned. */
export function seatBox(box: PartBox, seat: PartSeat): PartBox {
  const halfX = (box.maxX - box.minX) / 2
  const halfY = (box.maxY - box.minY) / 2
  // A quarter turn swaps the box's sides; a half turn keeps them.
  const [hx, hy] = seat.turns % 2 === 1 ? [halfY, halfX] : [halfX, halfY]
  return {
    minX: seat.x - hx,
    maxX: seat.x + hx,
    minY: seat.y - hy,
    maxY: seat.y + hy,
    minZ: seat.z,
    maxZ: seat.z + (box.maxZ - box.minZ),
  }
}

/** Box of every seated part, tile frame; null with no parts. */
export function seatedExtent(models: readonly Pick<SeatedModel, 'box' | 'seats'>[]): PartBox | null {
  let extent: PartBox | null = null
  for (const model of models) {
    for (const seat of model.seats) {
      const b = seatBox(model.box, seat)
      extent = extent
        ? {
            minX: Math.min(extent.minX, b.minX),
            maxX: Math.max(extent.maxX, b.maxX),
            minY: Math.min(extent.minY, b.minY),
            maxY: Math.max(extent.maxY, b.maxY),
            minZ: Math.min(extent.minZ, b.minZ),
            maxZ: Math.max(extent.maxZ, b.maxZ),
          }
        : b
    }
  }
  return extent
}

/**
 * The mesh of a part that can be seated: only clips and keys ever are. Not buildAccessoryMesh, whose
 * fit-test branch reaches the tile mesher and would pull it into the main-thread bundle.
 */
export function partMesh(config: DesignConfig, spec: AccessorySpec): MeshData {
  switch (spec.kind) {
    case 'clip':
      return buildClipMesh(spec)
    case 'key':
      return buildKeyMesh(config, spec)
    default:
      throw new Error(`${spec.id}: a ${spec.kind} part is never seated in a tile`)
  }
}

/** Meshes by accessory id: the id encodes the part's geometry, so one id is always one solid. */
const meshCache = new Map<string, MeshData>()
/** A few fit classes of a few designs; past that the oldest goes. */
const MESH_CACHE_SIZE = 12

function cachedMesh(config: DesignConfig, spec: AccessorySpec): MeshData {
  const hit = meshCache.get(spec.id)
  if (hit) {
    // Refreshed, so the models in use are the last ever dropped.
    meshCache.delete(spec.id)
    meshCache.set(spec.id, hit)
    return hit
  }
  const mesh = partMesh(config, spec)
  meshCache.set(spec.id, mesh)
  if (meshCache.size > MESH_CACHE_SIZE) {
    const oldest = meshCache.keys().next().value
    if (oldest !== undefined) meshCache.delete(oldest)
  }
  return mesh
}

/** What the set is built from, injectable so the grouping is tested apart from the core planners. */
export interface SeatedSources {
  seat: (config: DesignConfig, piece: PieceSpec) => SeatedPart[]
  parts: (config: DesignConfig, plan: LayoutPlan) => AccessorySpec[]
  mesh: (config: DesignConfig, spec: AccessorySpec) => MeshData
}

const CORE_SOURCES: SeatedSources = { seat: seatedParts, parts: accessoryParts, mesh: cachedMesh }

/**
 * How far this piece's own mesh stands out past its right side, mm: a tab is part of the tile, so it seats
 * nothing, yet the turn to the Back view has to lift clear of it all the same. 0 on a piece with no tab.
 */
function tabReach(config: DesignConfig, piece: Pick<PieceSpec, 'edges'>): number {
  return piece.edges.tabs === 0 ? 0 : (tabLimits(config)?.projection ?? 0)
}

/**
 * The parts seated in `piece`, grouped by model, or null when it carries none and nothing of the piece
 * itself stands past its sides. A part whose accessory the download does not hold is left out: the view
 * never draws a part the maker will not print.
 */
export function buildSeatedSet(config: DesignConfig, plan: LayoutPlan, piece: PieceSpec, sources: SeatedSources = CORE_SOURCES): SeatedSet | null {
  const seated = sources.seat(config, piece)
  const reach = tabReach(config, piece)
  if (seated.length === 0 && reach === 0) return null
  const specs = new Map(sources.parts(config, plan).map((spec) => [spec.id, spec]))
  const byId = new Map<string, SeatedModel>()
  for (const part of seated) {
    let model = byId.get(part.accessoryId)
    if (!model) {
      const spec = specs.get(part.accessoryId)
      if (!spec) continue
      const mesh = sources.mesh(config, spec)
      model = { accessoryId: spec.id, kind: part.kind, mesh, box: meshBox(mesh), seats: [] }
      byId.set(spec.id, model)
    }
    model.seats.push({ x: part.x, y: part.y, z: part.z, turns: part.turns })
  }
  const models = [...byId.values()]
  // The tile's own tab is no seated part, so the extent takes it in here: without it the turn to the Back
  // view swings the tab through the bench floor.
  const tabbed: PartBox = { minX: 0, maxX: piece.width + reach, minY: 0, maxY: piece.height, minZ: 0, maxZ: 0 }
  const extent = reach > 0 ? (seatedExtent([...models, { box: tabbed, seats: [{ x: tabbed.maxX / 2, y: tabbed.maxY / 2, z: 0, turns: 0 }] }]) ?? tabbed) : seatedExtent(models)
  if (!extent) return null
  const count = (kind: SeatedPart['kind']) => models.reduce((sum, m) => sum + (m.kind === kind ? m.seats.length : 0), 0)
  return {
    key: JSON.stringify([reach, ...models.map((m) => [m.accessoryId, m.seats.map((s) => [s.x, s.y, s.z, s.turns])])]),
    models,
    extent,
    keys: count('key'),
    clips: count('clip'),
  }
}

/** The design as the parts see it: the name and the tile color shape no part. */
const partsKeyOf = (config: DesignConfig) => JSON.stringify({ ...config, name: '', color: '' })

let lastSet: { plan: LayoutPlan; piece: PieceSpec; key: string; set: SeatedSet | null } | null = null

/**
 * buildSeatedSet for the viewport, remembering its last answer: a recolour or a rename hands back the same
 * set without asking the planners again (accessoryParts walks every joint of the wall). Never throws: a
 * part that cannot be built leaves the back without parts rather than stopping the view.
 */
export function seatedSetFor(config: DesignConfig, plan: LayoutPlan, piece: PieceSpec): SeatedSet | null {
  const key = partsKeyOf(config)
  if (lastSet && lastSet.plan === plan && lastSet.piece === piece && lastSet.key === key) return lastSet.set
  let set: SeatedSet | null = null
  try {
    set = buildSeatedSet(config, plan, piece)
  } catch (error) {
    console.error('[tessera] could not seat the printed parts in the Back view', error)
  }
  lastSet = { plan, piece, key, set }
  return set
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** ", with its 8 keys and 4 wall clips in place": what the Back view shows besides the pockets. */
function partsPhrase(parts: SeatedSet | null): string {
  if (!parts) return ''
  const named = [parts.keys > 0 ? plural(parts.keys, 'key', 'keys') : '', parts.clips > 0 ? plural(parts.clips, 'wall clip', 'wall clips') : '']
  const list = named.filter(Boolean).join(' and ')
  return list ? `, with its ${list} in place` : ''
}

/**
 * What the single-tile view is called for a screen reader. It names the piece the view really shows at
 * that piece's own size, which is not the tile size on a wall whose hero is a cut piece, and calls it a
 * tile only when it is a whole one, the way step 7 does (pieceName). The back adds the parts seated in it.
 */
export function tileViewLabel(config: DesignConfig, piece: Pick<PieceSpec, 'kind' | 'mark' | 'width' | 'height'> | null, face: TileFace, parts: SeatedSet | null): string {
  const what = piece ? `${piece.kind === 'full' ? 'tile' : 'piece'} ${piece.mark}, ${formatSize(piece.width, piece.height)}` : `one ${formatSize(config.tile.width, config.tile.height)} tile`
  const color = presetByHex(config.color)?.name ?? `color ${config.color}`
  return `3D view of ${face === 'back' ? 'the back of ' : ''}${what}, in ${color}${face === 'back' ? partsPhrase(parts) : ''}`
}
