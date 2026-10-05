// What the uses grid hands every plate so it can lay the visitor's tiles. A context rather than a
// prop, because the tiles sit at a different depth in every room: behind a sofa, inside a shelf's cell.
import { createContext } from 'react'
import type { RoomRect, TileCell } from '../uses'

export interface TileInk {
  /** The visitor's whole tile as a lit relief chip, or null while the worker is still drawing it. */
  chip: string | null
  /** '#RRGGBB': a tile before its picture lands, and the joint's deep tone. */
  color: string
  /** The tiles the studio lays on a surface, by the surface's own rect object from `USES`: a copy finds none. */
  cells: (rect: RoomRect) => readonly TileCell[]
  /** The id of the filter that brings a chip's relief back up at plate scale (UsesGrid defines it). */
  relief: string
}

export const TileInkContext = createContext<TileInk | null>(null)
