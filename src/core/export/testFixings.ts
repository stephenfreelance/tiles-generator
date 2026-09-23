// Synthetic fixings for the export tests: a small keyed wall on clips, its clip plan, its printed parts and
// box meshes for them, so the pipeline is tested without depending on the real clip and key builders.
// The parts come in the two named lists the code has (FIXED_FIT_PARTS, FIXED_WALL_PARTS) and the catalogue
// they compose (FIXED_PARTS); guide.test.ts holds all three against the real builders, field for field.
// Beside them a tabbed wall (TABBED_*), which prints nothing for its lock and ends its rows in a cut too
// narrow for a socket, so the "pieces nothing locks" wording has something real to read.
import { DEFAULT_CONFIG } from '../config'
import type { TabPlan } from '../fixing/tabs'
import type { AccessorySpec, ClipSite, JoinPlan, MountPlan } from '../fixing/types'
import { ringFromRect } from '../geometry/polygon'
import { loftSolid } from '../geometry/prism'
import { computeLayout, layoutInputOf } from '../layout'
import type { DesignConfig, LayoutPlan, MeshData } from '../types'

/** 450 x 300 mm of 100 mm tiles on a 4 mm plate: three rows, a 50 mm cut column on the right. */
export const FIXED_CONFIG: DesignConfig = {
  ...structuredClone(DEFAULT_CONFIG),
  name: 'Hall panel',
  surface: { width: 450, height: 300 },
  tile: { width: 100, height: 100, thickness: 4 },
  joint: 0,
  layout: { origin: 'corner', rowOffset: 0 },
  lock: 'keys',
  mount: 'clips',
  fit: 'standard',
}

/** The layout of FIXED_CONFIG, as every test of it computes it. */
export const FIXED_PLAN: LayoutPlan = computeLayout(layoutInputOf(FIXED_CONFIG))

const part = (over: Partial<AccessorySpec> & Pick<AccessorySpec, 'id' | 'kind' | 'mark' | 'label' | 'group'>): AccessorySpec => ({
  count: 1,
  size: { x: 20, y: 10, z: 3 },
  printNote: 'Print flat, 4 walls.',
  shape: {},
  ...over,
})

const COUPON_NOTE = 'Print face up like a tile, with the settings of the tiles, first layer included: 0.2 mm layers, 3 walls, 15 % infill.'
const CLIP_NOTE = 'Print flat on its back as it comes, stops up: 0.2 mm layers, 100 % infill.'
const KEY_NOTE = 'Print flat as it comes, chamfered face up (it goes into the slots first): 0.2 mm layers, 100 % infill.'
/** Each fit class with its clearances (clip, key) and how wide its barbs make a clip and a key, mm. */
const FITS = [
  { fit: 'snug', clip: 0.12, key: 0.05, clipY: 14.7, keyX: 15.9, keyY: 11.9 },
  { fit: 'standard', clip: 0.2, key: 0.1, clipY: 14.54, keyX: 15.8, keyY: 11.8 },
  { fit: 'loose', clip: 0.28, key: 0.15, clipY: 14.38, keyX: 15.7, keyY: 11.7 },
] as const

/**
 * The fit test of this wall (fitTestFor): the coupons, then its clips, then its keys, with the ids, labels
 * and sizes the real builders give this design. It downloads on its own page, never in the wall's zip.
 */
export const FIXED_FIT_PARTS: AccessorySpec[] = [
  part({
    id: 'fit-coupon-c-k',
    kind: 'fit-test',
    mark: 'F1',
    label: 'Test coupon A with a clip pocket and a key slot',
    group: 'fit-test',
    size: { x: 67, y: 23, z: 6.6 },
    printNote: COUPON_NOTE,
  }),
  part({
    id: 'fit-coupon-c-k-mate',
    kind: 'fit-test',
    mark: 'F2',
    label: 'Test coupon B with the facing key slot',
    group: 'fit-test',
    size: { x: 20, y: 23, z: 6.6 },
    printNote: COUPON_NOTE,
  }),
  ...FITS.map((f, i) =>
    part({
      id: `clip-c${f.clip}-m${i + 1}`,
      kind: 'clip',
      mark: `F${3 + i}`,
      label: `Test clip ${i + 1}, ${f.fit}`,
      group: 'fit-test',
      size: { x: 48, y: f.clipY, z: 2.8 },
      printNote: CLIP_NOTE,
    }),
  ),
  ...FITS.map((f, i) =>
    part({
      id: `key-16x12x1.4-c${f.key}-m${i + 1}`,
      kind: 'key',
      mark: `F${6 + i}`,
      label: `Test key ${i + 1}, ${f.fit}`,
      group: 'fit-test',
      size: { x: f.keyX, y: f.keyY, z: 1.4 },
      printNote: KEY_NOTE,
    }),
  ),
]

/** The parts the WALL needs (wallParts): the clips, then the keys. What the download holds. */
export const FIXED_WALL_PARTS: AccessorySpec[] = [
  // 27 clips on the wall plus 5 % spares, rounded up.
  part({ id: 'clip-c0.2', kind: 'clip', mark: 'C1', label: 'Wall clip, standard fit', group: 'mount', count: 29, size: { x: 48, y: 14.54, z: 2.8 }, printNote: CLIP_NOTE }),
  part({ id: 'key-16x12x1.4-c0.1', kind: 'key', mark: 'K1', label: 'Key, 15.8 mm', group: 'join', count: 20, size: { x: 15.8, y: 11.8, z: 1.4 }, printNote: KEY_NOTE }),
]

/** Every printed part in print order (accessoryParts): the fit test first, then the wall's own parts. */
export const FIXED_PARTS: AccessorySpec[] = [...FIXED_FIT_PARTS, ...FIXED_WALL_PARTS]

/** Band inset of a clip from a tile's bottom and top edges with keys cut, mm: what mount.ts gives this design. */
const BAND = 19.5

/**
 * The clips of FIXED_PLAN: two along each whole tile (one per band, at mid-width), one turned up the middle of
 * each 50 mm cut, which is too narrow for a clip along it. Bottom to top, then left to right.
 */
function fixedClipSites(plan: LayoutPlan): ClipSite[] {
  const pieces = new Map(plan.pieces.map((piece) => [piece.id, piece]))
  const sites: ClipSite[] = []
  for (const placement of plan.placements) {
    const piece = pieces.get(placement.pieceId)
    if (!piece) continue
    const local: Omit<ClipSite, 'pieceId'>[] =
      piece.width >= 60
        ? [
            { x: piece.width / 2, y: BAND, axis: 'h' },
            { x: piece.width / 2, y: piece.height - BAND, axis: 'h' },
          ]
        : [{ x: piece.width / 2, y: piece.height / 2, axis: 'v' }]
    for (const site of local) sites.push({ ...site, x: placement.x + site.x, y: placement.y + site.y, pieceId: piece.id })
  }
  return sites.sort((a, b) => a.y - b.y || a.x - b.x)
}

const FIXED_SITES = fixedClipSites(FIXED_PLAN)

/** Every placed tile on clips, none left without: 12 whole tiles with two each and 3 cuts with one, 27 in all. */
export const FIXED_MOUNT: MountPlan = {
  clips: FIXED_SITES.length,
  sites: FIXED_SITES,
  unmountedPieceIds: [],
}

export const FIXED_JOIN: JoinPlan = { keys: 17, sites: [], unkeyedSeams: 1, unkeyedPieceIds: [] }

/** No tab anywhere: what every design but a tabbed one hands the guide, the README and the plan. */
export const NO_TABS: TabPlan = { tabs: 0, joints: 0, unlockedPieceIds: [] }

// ---------------------------------------------------------------------------------------------------
// The tabbed wall

/**
 * 410 x 300 mm of 100 mm tiles on a 4 mm plate, glued: three rows of four whole tiles and a 10 mm cut down
 * the right edge, which is under the 11.7 mm a socket needs. So nine joints lock, three do not, and the
 * three right-edge pieces are locked to nothing: the wall the "pieces nothing locks" wording is written for.
 */
export const TABBED_CONFIG: DesignConfig = {
  ...structuredClone(DEFAULT_CONFIG),
  name: 'Hall panel',
  surface: { width: 410, height: 300 },
  tile: { width: 100, height: 100, thickness: 4 },
  joint: 0,
  layout: { origin: 'corner', rowOffset: 0 },
  lock: 'tabs',
  mount: 'glue',
  fit: 'standard',
}

/** The layout of TABBED_CONFIG: 12 models, A to L, the last three the 10 mm right-edge strips. */
export const TABBED_PLAN: LayoutPlan = computeLayout(layoutInputOf(TABBED_CONFIG))

/** What tabPlan makes of it: 18 tabs over 9 of the 12 row joints, the three 10 mm strips locked to nothing. */
export const TABBED_TAB: TabPlan = {
  tabs: 18,
  joints: 9,
  unlockedPieceIds: ['p-0-0-10-100-b2-t0', 'p-0-0-10-100-b3-t0', 'p-0-0-10-100-b6-t0'],
}

/**
 * The fit test of that wall (fitTestFor): coupon A with the tab, then the socket at all three fits, marked by
 * one, two and three notches. Nothing else, because the tabs print nothing: TABBED_WALL_PARTS is empty.
 */
export const TABBED_FIT_PARTS: AccessorySpec[] = [
  part({
    id: 'fit-coupon-t',
    kind: 'fit-test',
    mark: 'F1',
    label: 'Test coupon A with a tab',
    group: 'fit-test',
    size: { x: 20, y: 20, z: 6.6 },
    printNote: COUPON_NOTE,
  }),
  ...FITS.map((f, i) =>
    part({
      id: `fit-coupon-t-socket-m${i + 1}`,
      kind: 'fit-test',
      mark: `F${2 + i}`,
      label: `Test coupon B${i + 1} with the facing socket, ${f.fit}`,
      group: 'fit-test',
      size: { x: 20, y: 20, z: 6.6 },
      printNote: COUPON_NOTE,
    }),
  ),
]

/** A closed box the size of the part as printed: enough for the writers, the zip and the volumes. */
export function boxMesh(spec: Pick<AccessorySpec, 'size'>): MeshData {
  const ring = ringFromRect(0, 0, spec.size.x, spec.size.y)
  return loftSolid([
    { z: 0, ring },
    { z: spec.size.z, ring },
  ])
}
