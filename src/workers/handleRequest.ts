// Pure request handler shared by the geometry worker and the tests: no postMessage, no DOM.
import { buildReadme } from '@/core/export/readme'
import { accessoryFileName, accessoryZipPath, pieceFileName, README_FILE, SETTING_OUT_PLAN_FILE } from '@/core/export/filenames'
import { writeStep } from '@/core/export/step'
import { writeStl } from '@/core/export/stl'
import { zipFiles } from '@/core/export/zip'
import { accessoryParts, buildAccessoryMesh } from '@/core/fixing/accessories'
import type { AccessorySpec } from '@/core/fixing/types'
import { meshVolume } from '@/core/geometry/meshChecks'
import { bakeNormalMap } from '@/core/geometry/normalMap'
import { buildPieceMesh, QUALITY_CELL_MM, STEP_QUALITY, type PieceMeshOptions } from '@/core/geometry/tileMesh'
import { planSvg } from '@/core/plan/planSvg'
import { CHIP_SHADE_BUDGET_BYTES, reliefShadeKey, shadeReliefChip, tintReliefChip, type ReliefShade } from '@/core/textures/hillshade'
import { createHeightField } from '@/core/textures/registry'
import type { HeightField } from '@/core/textures/types'
import type { DesignConfig, ExportFormat, MeshData, PieceSpec } from '@/core/types'
import type {
  ChipImage,
  ChipRequest,
  ExportedFile,
  ExportRequest,
  PieceStats,
  PreviewPiece,
  PreviewRequest,
  Progress,
  VolumeRequest,
  WorkerRequest,
  WorkerResultMap,
} from './protocol'

/** Draft cells for filament estimates: volume converges long before the relief looks right. */
export const VOLUME_CELL_MM = 1.5
export const FORMAT_MIME: Record<ExportFormat, string> = { stl: 'model/stl', step: 'model/step' }

export class CancelledError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'CancelledError'
  }
}

export interface HandlerContext {
  isCancelled(): boolean
  progress(p: Progress): void
}

export interface HandlerOutput<K extends WorkerRequest['kind'] = WorkerRequest['kind']> {
  result: WorkerResultMap[K]
  /** Buffers to move (not copy) to the UI thread, deduplicated. */
  transfer: Transferable[]
}

/**
 * Lets queued messages (a cancel) run between pieces: a worker cannot read its inbox while a
 * synchronous loop runs. MessageChannel avoids the 4 ms clamp of nested setTimeout.
 */
function macrotask(): Promise<void> {
  if (typeof MessageChannel === 'undefined') return new Promise((resolve) => setTimeout(resolve, 0))
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel()
    port1.onmessage = () => {
      port1.close()
      resolve()
    }
    port2.postMessage(null)
  })
}

async function checkpoint(ctx: HandlerContext): Promise<void> {
  if (ctx.isCancelled()) throw new CancelledError()
  await macrotask()
  if (ctx.isCancelled()) throw new CancelledError()
}

/** Unique transferable buffers; listing one buffer twice makes postMessage throw. */
function transferables(buffers: (ArrayBufferLike | undefined)[]): Transferable[] {
  const unique = new Set<ArrayBuffer>()
  // SharedArrayBuffers are shared, not transferred.
  for (const b of buffers) if (b instanceof ArrayBuffer && b.byteLength > 0) unique.add(b)
  return [...unique]
}

const meshBuffers = (mesh: MeshData) => [mesh.positions.buffer, mesh.normals?.buffer, mesh.uvs?.buffer, mesh.indices.buffer]

const pieceNoun = (piece: PieceSpec) => (piece.kind === 'full' ? `full tile ${piece.mark}` : `cut ${piece.mark}`)

const slug = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

/** Binary STL headers are 80 ASCII bytes; never start with "solid" or readers take it for ASCII STL. */
const stlHeader = (config: DesignConfig, piece: PieceSpec) =>
  `Tessera ${config.name} ${piece.mark} ${piece.width}x${piece.height} mm`.replace(/[^\x20-\x7e]/g, '?').slice(0, 80)

const partHeader = (config: DesignConfig, spec: AccessorySpec) =>
  `Tessera ${config.name} ${spec.mark} ${spec.label}`.replace(/[^\x20-\x7e]/g, '?').slice(0, 80)

/** "wall clip, standard fit C1" reads badly in a progress line; "C1 wall clip, standard fit" does not. */
const partNoun = (spec: AccessorySpec) => `${spec.mark} ${spec.label.charAt(0).toLowerCase()}${spec.label.slice(1)}`

/**
 * The printed parts an export writes: the ids asked for, else the wall's own parts on a full export (no
 * pick of pieces), else none. `accessories: false` always means none. Ids resolve against the whole
 * catalogue, so the fit test can still be written, but only when it is asked for by name: it is
 * downloaded from its own page, and the wall's zip holds final parts only.
 */
export function exportedAccessories(
  req: Pick<ExportRequest, 'config' | 'plan' | 'pieceIds' | 'accessories' | 'accessoryIds'>,
  all: readonly AccessorySpec[] = accessoryParts(req.config, req.plan),
): AccessorySpec[] {
  if (req.accessories === false) return []
  if (!req.accessoryIds && req.pieceIds) return []
  if (!req.accessoryIds) return all.filter((part) => part.group !== 'fit-test')
  const wanted = new Set(req.accessoryIds)
  return all.filter((p) => wanted.has(p.id))
}

/** One accessory mesh, with the part named when its mesher fails: the zip must not silently lack it. */
function partMesh(config: DesignConfig, spec: AccessorySpec): MeshData {
  try {
    return buildAccessoryMesh(config, spec)
  } catch (error) {
    throw new Error(`${spec.mark} (${spec.label}) could not be built: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}

async function handlePreview(req: PreviewRequest, ctx: HandlerContext): Promise<HandlerOutput<'preview'>> {
  const field = createHeightField(req.config)
  const pieces: PreviewPiece[] = []
  const buffers: (ArrayBufferLike | undefined)[] = []
  for (const [i, piece] of req.pieces.entries()) {
    await checkpoint(ctx)
    ctx.progress({ done: i, total: req.pieces.length, label: `Meshing ${pieceNoun(piece)}` })
    const mesh =
      req.backFeatures === false
        ? buildPieceMesh(req.config, field, piece, { cellMm: req.cellMm }, [])
        : buildPieceMesh(req.config, field, piece, { cellMm: req.cellMm })
    const normalMap = req.normalMapTexelMm > 0 ? bakeNormalMap(req.config, field, piece, req.normalMapTexelMm) : undefined
    pieces.push({ pieceId: piece.id, mesh, normalMap })
    buffers.push(...meshBuffers(mesh), normalMap?.data.buffer)
  }
  return { result: { pieces }, transfer: transferables(buffers) }
}

async function handleExport(req: ExportRequest, ctx: HandlerContext): Promise<HandlerOutput<'export'>> {
  const { config, plan, format, quality } = req
  const wanted = req.pieceIds ? new Set(req.pieceIds) : null
  const pieces = wanted ? plan.pieces.filter((p) => wanted.has(p.id)) : plan.pieces
  // Every part the design needs: the plans and the README describe them all, whichever ones this export writes.
  const allParts = accessoryParts(config, plan)
  const parts = exportedAccessories(req, allParts)
  if (pieces.length === 0 && parts.length === 0) throw new Error('Nothing to export: pick at least one piece.')

  // STEP costs about 14x an STL per triangle, so it gets its own coarser grid plus the adaptive
  // mesher, which turns flat regions into a few large planar faces.
  const step = STEP_QUALITY[quality]
  const meshOptions: PieceMeshOptions =
    format === 'step'
      ? { cellMm: step.cellMm, adaptive: { toleranceMm: step.toleranceMm } }
      : { cellMm: QUALITY_CELL_MM[quality] }
  // A part on its own needs no relief.
  let field: HeightField | null = null
  const formatName = format.toUpperCase()
  const total = (pieces.length + parts.length) * 2 + (req.zip ? 1 : 0)
  let done = 0

  const files: ExportedFile[] = []
  const stats: PieceStats[] = []
  for (const [i, piece] of pieces.entries()) {
    const noun = pieceNoun(piece)
    ctx.progress({ done, total, label: `Meshing ${noun} (${i + 1} of ${pieces.length})` })
    await checkpoint(ctx)
    field ??= createHeightField(config)
    const mesh = buildPieceMesh(config, field, piece, meshOptions)
    done++

    ctx.progress({ done, total, label: `Writing ${formatName}: ${noun} (${i + 1} of ${pieces.length})` })
    await checkpoint(ctx)
    const data =
      format === 'stl'
        ? writeStl(mesh, stlHeader(config, piece))
        : writeStep(mesh, { name: `${config.name} ${piece.mark} ${piece.label}` })
    done++

    files.push({ name: pieceFileName(piece, format), pieceId: piece.id, mime: FORMAT_MIME[format], data })
    stats.push({
      partId: piece.id,
      pieceId: piece.id,
      triangles: mesh.indices.length / 3,
      bytes: data.byteLength,
      volumeMm3: meshVolume(mesh),
    })
  }

  // Printed parts after the tiles: prisms and lofts, so the quality grid has nothing to refine on them.
  for (const [i, spec] of parts.entries()) {
    const noun = partNoun(spec)
    ctx.progress({ done, total, label: `Meshing ${noun} (${i + 1} of ${parts.length})` })
    await checkpoint(ctx)
    const mesh = partMesh(config, spec)
    done++

    ctx.progress({ done, total, label: `Writing ${formatName}: ${noun} (${i + 1} of ${parts.length})` })
    await checkpoint(ctx)
    const data =
      format === 'stl' ? writeStl(mesh, partHeader(config, spec)) : writeStep(mesh, { name: `${config.name} ${spec.mark} ${spec.label}` })
    done++

    files.push({ name: accessoryFileName(spec, format), accessoryId: spec.id, folder: spec.group, mime: FORMAT_MIME[format], data })
    stats.push({
      partId: spec.id,
      accessoryId: spec.id,
      triangles: mesh.indices.length / 3,
      bytes: data.byteLength,
      volumeMm3: meshVolume(mesh),
    })
  }

  let zip: ExportedFile | undefined
  if (req.zip) {
    const encoder = new TextEncoder()
    // Tiles at the root, each part in its group's folder (mount/ for the clips, join/ for the keys), then the
    // setting-out plan and the README. The clips need no plan of their own: each tile places its own. A fit
    // test is never in this zip: its page zips its own, so `parts` here is the wall's.
    const documents = [
      { name: SETTING_OUT_PLAN_FILE, data: encoder.encode(req.planSvg ?? planSvg(config, plan)) },
      { name: README_FILE, data: encoder.encode(buildReadme(config, plan, format, { parts: allParts, zipped: parts })) },
    ]
    ctx.progress({ done, total, label: `Zipping ${files.length + documents.length} files` })
    await checkpoint(ctx)
    const data = zipFiles([
      ...files.map((f) => {
        const spec = f.accessoryId ? parts.find((p) => p.id === f.accessoryId) : undefined
        return { name: spec ? accessoryZipPath(spec, format) : f.name, data: f.data }
      }),
      ...documents,
    ])
    zip = { name: `${slug(config.name) || 'tessera'}-tiles-${format}.zip`, mime: 'application/zip', data }
    done++
  }
  ctx.progress({ done, total, label: 'Done' })

  return {
    result: { files, zip, stats },
    transfer: transferables([...files.map((f) => f.data.buffer), zip?.data.buffer]),
  }
}

async function handleVolumes(req: VolumeRequest, ctx: HandlerContext): Promise<HandlerOutput<'volumes'>> {
  const volumes: Record<string, number> = {}
  if (req.pieces.length > 0) {
    const field = createHeightField(req.config)
    for (const piece of req.pieces) {
      await checkpoint(ctx)
      volumes[piece.id] = meshVolume(buildPieceMesh(req.config, field, piece, { cellMm: VOLUME_CELL_MM }))
    }
  }
  for (const spec of req.accessories ?? []) {
    await checkpoint(ctx)
    // A part that cannot be built yet keeps its approximation in the estimate rather than losing every volume.
    try {
      volumes[spec.id] = meshVolume(buildAccessoryMesh(req.config, spec))
    } catch (error) {
      console.warn(`[volumes] ${spec.id} could not be measured`, error)
    }
  }
  return { result: { volumes }, transfer: [] }
}

/** Least recently used values under a byte budget; a value larger than the whole budget is not kept. */
export class ByteLru<V> {
  /** Map order is recency order: the first entry is the least recently used. */
  private readonly entries = new Map<string, V>()
  private used = 0
  hits = 0
  misses = 0

  constructor(
    readonly maxBytes: number,
    private readonly sizeOf: (value: V) => number,
  ) {}

  get size(): number {
    return this.entries.size
  }

  get bytes(): number {
    return this.used
  }

  get(key: string): V | undefined {
    const value = this.entries.get(key)
    if (value === undefined) {
      this.misses++
      return undefined
    }
    this.hits++
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: string, value: V): void {
    const previous = this.entries.get(key)
    if (previous !== undefined) {
      this.used -= this.sizeOf(previous)
      this.entries.delete(key)
    }
    const bytes = this.sizeOf(value)
    if (bytes > this.maxBytes) return
    this.entries.set(key, value)
    this.used += bytes
    for (const [oldest, old] of this.entries) {
      if (this.used <= this.maxBytes) break
      this.entries.delete(oldest)
      this.used -= this.sizeOf(old)
    }
  }

  clear(): void {
    this.entries.clear()
    this.used = 0
    this.hits = 0
    this.misses = 0
  }
}

/**
 * Colour-independent chip shading, kept per worker so a colour change only re-tints. A 160 px shade
 * is about 614 KB: the picker's 23 reliefs, a schedule's pieces and part of the last shape fit.
 */
export const chipShades = new ByteLru<ReliefShade>(CHIP_SHADE_BUDGET_BYTES, (shade) => shade.sums.byteLength)

async function handleChips(req: ChipRequest, ctx: HandlerContext): Promise<HandlerOutput<'chips'>> {
  const chips: ChipImage[] = []
  for (const item of req.items) {
    await checkpoint(ctx)
    const opts = { sizePx: req.sizePx, crop: item.crop, edges: item.edges }
    const key = reliefShadeKey(item.config, opts)
    let shade = chipShades.get(key)
    if (!shade) {
      shade = shadeReliefChip(item.config, opts)
      // Stored at once, so a batch cancelled part way still leaves its finished shades for the next one.
      chipShades.set(key, shade)
    }
    const image = tintReliefChip(shade, item.config.color)
    chips.push({ key: item.key, width: image.width, height: image.height, data: image.data })
  }
  return { result: { chips }, transfer: transferables(chips.map((c) => c.data.buffer)) }
}

/** Runs one request; throws CancelledError when `ctx.isCancelled()` turns true between pieces. */
export async function handleRequest<R extends WorkerRequest>(req: R, ctx: HandlerContext): Promise<HandlerOutput<R['kind']>> {
  const request: WorkerRequest = req
  let output: HandlerOutput
  switch (request.kind) {
    case 'preview':
      output = await handlePreview(request, ctx)
      break
    case 'export':
      output = await handleExport(request, ctx)
      break
    case 'volumes':
      output = await handleVolumes(request, ctx)
      break
    case 'chips':
      output = await handleChips(request, ctx)
      break
  }
  return output as HandlerOutput<R['kind']>
}
