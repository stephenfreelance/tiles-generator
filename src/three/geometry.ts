import * as THREE from 'three'
import type { MeshData, PieceSpec } from '@/core/types'
import type { BakedNormalMap, PreviewPiece } from '@/workers/protocol'

export interface MeshExtent {
  minX: number
  maxX: number
  minY: number
  maxY: number
  maxZ: number
}

const extents = new WeakMap<MeshData, MeshExtent>()

/** Bounding box of a worker mesh (cached per mesh). */
export function meshExtent(mesh: MeshData): MeshExtent {
  const cached = extents.get(mesh)
  if (cached) return cached
  const p = mesh.positions
  const e: MeshExtent = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, maxZ: 0 }
  for (let i = 0; i + 2 < p.length; i += 3) {
    if (p[i] < e.minX) e.minX = p[i]
    if (p[i] > e.maxX) e.maxX = p[i]
    if (p[i + 1] < e.minY) e.minY = p[i + 1]
    if (p[i + 1] > e.maxY) e.maxY = p[i + 1]
    if (p[i + 2] > e.maxZ) e.maxZ = p[i + 2]
  }
  extents.set(mesh, e)
  return e
}

/**
 * True when a mesh has the footprint of `piece`. While the worker rebuilds, the previous meshes stay on
 * screen; this keeps an old full tile from being drawn at a new tile pitch.
 */
export function meshMatchesPiece(mesh: MeshData, piece: Pick<PieceSpec, 'width' | 'height'>, toleranceMm = 0.06): boolean {
  if (mesh.positions.length < 9) return false
  const e = meshExtent(mesh)
  return Math.abs(e.maxX - e.minX - piece.width) <= toleranceMm && Math.abs(e.maxY - e.minY - piece.height) <= toleranceMm
}

/** Two material groups: 0 = top surface (first `topIndexCount` indices), 1 = walls and bottom. */
export function buildGeometry(mesh: MeshData, piece: Pick<PieceSpec, 'crop'>, tile: { width: number; height: number }): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const vertexCount = mesh.positions.length / 3
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
  const hasNormals = mesh.normals !== undefined && mesh.normals.length === mesh.positions.length
  if (hasNormals) geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals as Float32Array, 3))
  if (mesh.uvs && mesh.uvs.length === vertexCount * 2) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2))
  } else {
    // Pattern-space UVs over the full tile, as the contract specifies (the normal map needs them).
    const uvs = new Float32Array(vertexCount * 2)
    for (let i = 0; i < vertexCount; i++) {
      uvs[i * 2] = (piece.crop.x0 + mesh.positions[i * 3]) / tile.width
      uvs[i * 2 + 1] = (piece.crop.y0 + mesh.positions[i * 3 + 1]) / tile.height
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  }
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
  if (!hasNormals) geometry.computeVertexNormals()
  const total = mesh.indices.length
  const top = Math.max(0, Math.min(total, mesh.topIndexCount - (mesh.topIndexCount % 3)))
  geometry.addGroup(0, top, 0)
  if (total > top) geometry.addGroup(top, total - top, 1)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * Object-space normal map of a piece's top surface. The mesh UVs are pattern coordinates over the full
 * tile, the baked map covers the piece only, so the texture transform maps one onto the other.
 */
export function buildNormalMap(map: BakedNormalMap, piece: Pick<PieceSpec, 'crop' | 'width' | 'height'>, tile: { width: number; height: number }): THREE.DataTexture {
  const texture = new THREE.DataTexture(map.data, map.width, map.height, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.colorSpace = THREE.NoColorSpace
  texture.anisotropy = 8
  texture.repeat.set(tile.width / piece.width, tile.height / piece.height)
  texture.offset.set(-piece.crop.x0 / piece.width, -piece.crop.y0 / piece.height)
  texture.needsUpdate = true
  return texture
}

export interface PieceAssets {
  pieceId: string
  geometry: THREE.BufferGeometry
  normalMap: THREE.DataTexture | null
  /** Highest point of the mesh, mm. */
  top: number
}

/** GPU-side assets for every preview piece that matches its plan piece. */
export function buildPieceAssets(
  preview: ReadonlyMap<string, PreviewPiece>,
  pieces: readonly PieceSpec[],
  tile: { width: number; height: number },
): Map<string, PieceAssets> {
  const assets = new Map<string, PieceAssets>()
  for (const piece of pieces) {
    const entry = preview.get(piece.id)
    if (!entry || !meshMatchesPiece(entry.mesh, piece)) continue
    assets.set(piece.id, {
      pieceId: piece.id,
      geometry: buildGeometry(entry.mesh, piece, tile),
      normalMap: entry.normalMap ? buildNormalMap(entry.normalMap, piece, tile) : null,
      top: meshExtent(entry.mesh).maxZ,
    })
  }
  return assets
}

export function disposePieceAssets(assets: ReadonlyMap<string, PieceAssets>): void {
  for (const a of assets.values()) {
    a.geometry.dispose()
    a.normalMap?.dispose()
  }
}
