import { describe, expect, it } from 'vitest'
import type { MeshData, PieceSpec } from '@/core/types'
import { buildGeometry, buildNormalMap, meshExtent, meshMatchesPiece } from './geometry'

const TILE = { width: 150, height: 150 }

const piece: PieceSpec = {
  id: 'p-0-0-42.5-150',
  mark: 'B',
  kind: 'edge',
  label: 'Right edge',
  crop: { x0: 0, y0: 0, x1: 42.5, y1: 150 },
  width: 42.5,
  height: 150,
  count: 4,
  edges: { boundary: 0, tabs: 0, profiled: {} },
}

/** A slab of the piece's footprint: four top corners, two triangles, no UVs or normals. */
function slab(width: number, height: number, top = 4): MeshData {
  return {
    positions: new Float32Array([0, 0, top, width, 0, top, width, height, top, 0, height, top]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    topIndexCount: 6,
  }
}

describe('meshMatchesPiece', () => {
  it('accepts the mesh of its own piece and rejects one built for another tile size', () => {
    expect(meshMatchesPiece(slab(piece.width, piece.height), piece)).toBe(true)
    expect(meshMatchesPiece(slab(150, 150), piece)).toBe(false)
    expect(meshExtent(slab(piece.width, piece.height)).maxZ).toBe(4)
  })

  // A tab meshes past the piece's right side. Without this the guard refuses every tabbed mesh and the
  // studio draws nothing at all, which no gate would catch: the view just goes empty.
  it('expects a tabbed piece to mesh exactly its tab wider, and every other piece not to', () => {
    const GROW = 8
    const tabbed: PieceSpec = { ...piece, edges: { ...piece.edges, tabs: 2 } }
    expect(meshMatchesPiece(slab(piece.width + GROW, piece.height), tabbed, undefined, GROW)).toBe(true)
    // The same mesh on a piece the layout gave no tab is the wrong solid for it.
    expect(meshMatchesPiece(slab(piece.width + GROW, piece.height), piece, undefined, GROW)).toBe(false)
    // And a tabbed piece's own plain mesh is the one from before the tabs were cut.
    expect(meshMatchesPiece(slab(piece.width, piece.height), tabbed, undefined, GROW)).toBe(false)
  })

  it('still catches a tile size that moved by less than a tab reaches', () => {
    const GROW = 8
    const tabbed: PieceSpec = { ...piece, edges: { ...piece.edges, tabs: 2 } }
    // 4 mm narrower than it should be, which is well inside the allowance a generous ceiling would give.
    expect(meshMatchesPiece(slab(piece.width + GROW - 4, piece.height), tabbed, undefined, GROW)).toBe(false)
    expect(meshMatchesPiece(slab(piece.width + GROW, piece.height - 4), tabbed, undefined, GROW)).toBe(false)
    // The 0.06 mm tolerance is all the slack there is, on either side of the printed width.
    expect(meshMatchesPiece(slab(piece.width + GROW + 0.05, piece.height), tabbed, undefined, GROW)).toBe(true)
    expect(meshMatchesPiece(slab(piece.width + GROW + 0.07, piece.height), tabbed, undefined, GROW)).toBe(false)
  })
})

describe('buildGeometry', () => {
  it('splits the top surface and the walls into two material groups', () => {
    const mesh: MeshData = {
      positions: new Float32Array([...slab(piece.width, piece.height).positions, 0, 0, 0, piece.width, 0, 0, piece.width, piece.height, 0]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6]),
      topIndexCount: 6,
    }
    const geometry = buildGeometry(mesh, piece, TILE)
    expect(geometry.groups).toEqual([
      { start: 0, count: 6, materialIndex: 0 },
      { start: 6, count: 3, materialIndex: 1 },
    ])
    expect(geometry.getAttribute('normal')).toBeDefined()
  })

  it('falls back to pattern-space UVs over the full tile', () => {
    const geometry = buildGeometry(slab(piece.width, piece.height), piece, TILE)
    const uv = geometry.getAttribute('uv')
    expect(uv.getX(0)).toBeCloseTo(0, 6)
    expect(uv.getX(1)).toBeCloseTo(piece.width / TILE.width, 6)
    expect(uv.getY(2)).toBeCloseTo(1, 6)
  })
})

describe('buildNormalMap', () => {
  it('maps the piece slice of the tile UVs onto the baked map', () => {
    const cut: PieceSpec = { ...piece, crop: { x0: 107.5, y0: 0, x1: 150, y1: 150 } }
    const texture = buildNormalMap({ width: 4, height: 4, data: new Uint8Array(4 * 4 * 4) }, cut, TILE)
    expect(texture.repeat.x).toBeCloseTo(TILE.width / cut.width, 6)
    expect(texture.offset.x).toBeCloseTo(-cut.crop.x0 / cut.width, 6)
    // The piece's own UV range must land on 0..1 of the baked map.
    expect(texture.repeat.x * (cut.crop.x0 / TILE.width) + texture.offset.x).toBeCloseTo(0, 6)
    expect(texture.repeat.x * (cut.crop.x1 / TILE.width) + texture.offset.x).toBeCloseTo(1, 6)
  })
})
