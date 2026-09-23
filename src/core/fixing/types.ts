// Contracts of the fixings: what is cut into or added to the back of a tile, the printed parts that go in it
// (keys between tiles, clips on the wall), and the plans that count and place those parts.
// Pure data: shared by the mesher, the worker, the plan drawings and the UI.
import type { Side } from '../types'

/** A closed 2D ring in piece-local mm, [x0, y0, x1, y1, ...], counter-clockwise seen from above (+z). */
export type Ring = Float64Array

/**
 * One slab of a pocket, from z0 up to z1 (mm above the tile's bottom face). `ring` is the cavity outline
 * at z0; `ringTop`, when present, is its outline at z1 with the same vertex count (a loft: a mouth
 * chamfer or a 45° lead-in), otherwise the walls are vertical.
 */
export interface BackFeatureLevel {
  ring: Ring
  ringTop?: Ring
  z0: number
  z1: number
}

/**
 * Something the mesher builds into the back of a tile: by default a cavity cut into it, open at the bottom
 * face (z = 0), and with `outward` set material standing out past one side instead. Levels stack from z = 0
 * upward with no gap; where one level's top outline differs from the next level's bottom outline, one
 * contains the other (they may share stretches of outline but never cross) and the ring between them is a
 * flat face. A cavity's last level ends in a flat ceiling, which keeps 0.8 mm of plastic under the top
 * (MIN_SKIN_MM in geometry/solid.ts).
 *
 * `side` null: a pocket fully inside the footprint, at least 0.8 mm (MIN_WALL_MM) from every side.
 * `side` set: a notch that also opens onto that side, at least 0.8 mm from the other three. Its rings run
 * along the side line with exactly one edge lying on it (two consecutive vertices on the line); that edge
 * is the opening, not a wall. A notch never widens along its side going up (no undercut in the side wall).
 * Features never touch each other.
 */
export interface BackFeature {
  /** 'fit-mark': the one to three notches that tell one fit-test coupon from another; never on a tile. */
  role: 'key-pocket' | 'clip-pocket' | 'join-tab' | 'join-socket' | 'fit-mark'
  side: Side | null
  /**
   * `true`: the levels are solid material ADDED beyond `side`'s line, not a cavity cut into the footprint.
   * That is the join tab, which stands in the joint and reaches into the socket of the tile beside it.
   *
   * What the caller hands over. A `side` is required, and the ring's opening edge is the tab's root, lying
   * on that side line; every other vertex stands strictly beyond the line, within the side's span and at
   * least MIN_WALL_MM from either corner, so the side wall has room to step over the tab and back down.
   * The ring is wound counter-clockwise around the material it adds, which runs its root edge the opposite
   * way along the side from a cavity's opening: that sign is the whole difference between the two, and a
   * ring wound the other way is refused rather than meshed. A tab narrows along its side going up, never
   * widens, exactly as a notch does.
   *
   * What the mesher guarantees. Seen from the side wall a tab and a notch of the same span and height are
   * the same planar polygon (over a tab's span the side plane lies inside the solid, so it carries no wall
   * below the tab's top), so the wall steps over a tab as it steps over a notch; the bottom face detours
   * around the outside of a tab where it cuts into the piece for a notch; the tab's walls, ledges and top
   * face outward and up, so the solid stays closed, 2-manifold and positively oriented with the tab's own
   * volume added; and the top surface, the grid, the joint edge and the perimeter profile are untouched, so
   * the tile is unchanged from the front.
   *
   * What it cannot check, seeing one piece at a time: that the tile beside this one really has the socket
   * to take the tab, that the tab is thinner than that socket is deep, and that it stays far enough below
   * the rim to be hidden in the joint. Those belong to the fixings layer, as keyNotchDepth does. The one
   * floor the mesher holds is what it can see from here: a tab's top stays MIN_SKIN_MM below the lowest rim
   * sample over its own span, so it never stands level with the face of its own tile.
   */
  outward?: boolean
  levels: BackFeatureLevel[]
}

export type AccessoryKind = 'clip' | 'key' | 'fit-test'

/** One printed part that is not a tile. Like a piece, one spec is one file, printed `count` times. */
export interface AccessorySpec {
  /** Stable id that encodes the part's geometry (a clip's or a key's size and clearance). Never collides with a piece id. */
  id: string
  kind: AccessoryKind
  /** Mark on the plans and in the file name: a letter and a number ("C1" a clip, "K1" a key, "F1" the fit test). */
  mark: string
  /** Human label, e.g. "Wall clip". */
  label: string
  count: number
  /** Bounding box as printed (x, y on the bed, z up), mm. */
  size: { x: number; y: number; z: number }
  /** One line of print advice: orientation, walls, infill. */
  printNote: string
  /** Folder in the zip: 'mount' holds the clips, 'join' the keys. */
  group: 'mount' | 'join' | 'fit-test'
  /** Numbers the part's own mesher reads (sizes, clearance, marks); owned by core/fixing. */
  shape: Record<string, number | number[]>
}

/** One clip on the wall: the centre of its pocket on one placed tile, surface coordinates, mm. */
export interface ClipSite {
  x: number
  y: number
  /** 'h': the clip lies along the wall, its catch up and down; 'v': turned a quarter turn, for a narrow piece. */
  axis: 'h' | 'v'
  pieceId: string
}

export interface MountPlan {
  /** Clips on the wall, one per pocket, over every placed tile. 0 when the design is glued. */
  clips: number
  /** Where each goes, bottom to top then left to right: the plans draw them. */
  sites: ClipSite[]
  /** Pieces with no clip pocket (too small or too narrow for one): keyed to a neighbour or glued. */
  unmountedPieceIds: string[]
}

/** Where a key goes, at the centre of the key, surface coordinates, mm. */
export interface KeySite {
  x: number
  y: number
  /** 'vertical': the key bridges a vertical joint (tiles side by side); 'horizontal': one between rows. */
  seam: 'vertical' | 'horizontal'
}

export interface JoinPlan {
  /** Keys to print and press in. 0 when joins are off. */
  keys: number
  sites: KeySite[]
  /** Neighbouring pairs with no key between them (the shared side is too short): glued instead. */
  unkeyedSeams: number
  /** Pieces keyed to no neighbour at all: those are the ones that must be glued. */
  unkeyedPieceIds: string[]
}
