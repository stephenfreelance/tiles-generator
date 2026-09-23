import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '../config'
import { ringBounds, ringsTouch } from '../geometry/polygon'
import { computeLayout, layoutInputOf } from '../layout'
import { hasSide } from '../sides'
import type { DesignConfig } from '../types'
import { pieceFeatures } from './features'
import { keyPockets } from './joins'
import { clipPockets } from './mount'
import { tabFeatures, tabGeometry, TAB_SIDE } from './tabs'
import type { BackFeature } from './types'

// Everything the mesher builds into the back of a piece comes through pieceFeatures, so it has to be the
// union of the systems in play, stable per piece, and never let one feature run into another. Only the tab
// stands outside the piece; everything else is cut into it.

const design = (over: Partial<DesignConfig>): DesignConfig => normalizeConfig({ ...DEFAULT_CONFIG, ...over })

const WALLS: Partial<DesignConfig>[] = [
  {},
  { surface: { width: 1000, height: 700 } },
  { surface: { width: 1250, height: 640 }, tile: { width: 100, height: 100, thickness: 4 }, layout: { origin: 'corner', rowOffset: 0.5 } },
  { surface: { width: 1330, height: 910 }, joint: 3, layout: { origin: 'balanced', rowOffset: 0.3333 } },
  { surface: { width: 900, height: 900 }, tile: { width: 300, height: 250, thickness: 6 } },
  { surface: { width: 410, height: 330 }, tile: { width: 40, height: 40, thickness: 4 } },
]

const FIXINGS: Partial<DesignConfig>[] = [
  { lock: 'keys' },
  { lock: 'tabs' },
  { mount: 'clips' },
  { lock: 'keys', mount: 'clips' },
  { lock: 'tabs', mount: 'clips' },
]

/** The outermost outline of a pocket: its mouth at the bottom face. */
const mouthOf = (f: BackFeature) => f.levels[0].ring

describe('pieceFeatures', () => {
  it('cuts nothing into a default design', () => {
    for (const piece of computeLayout(layoutInputOf(DEFAULT_CONFIG)).pieces) {
      expect(pieceFeatures(DEFAULT_CONFIG, piece)).toEqual([])
    }
  })

  it('is the lock, whichever it is, followed by the clip pockets', () => {
    for (const wall of WALLS) {
      for (const fixing of FIXINGS) {
        const config = design({ ...wall, ...fixing })
        for (const piece of computeLayout(layoutInputOf(config)).pieces) {
          const tabbed = { ...piece, edges: { ...piece.edges, tabs: 1 << TAB_SIDE } }
          expect(pieceFeatures(config, tabbed)).toEqual([
            ...keyPockets(config, tabbed),
            ...tabFeatures(config, tabbed),
            ...clipPockets(config, tabbed),
          ])
          // Keys and tabs are alternatives, so no piece ever carries both.
          const roles = new Set(pieceFeatures(config, tabbed).map((f) => f.role))
          expect(roles.has('key-pocket') && roles.has('join-socket'), piece.id).toBe(false)
        }
      }
    }
  })

  it('cuts the pair only where the tabs are really on, and the tab only where the layout asked', () => {
    const config = design({ lock: 'tabs' })
    const g = tabGeometry(config)
    expect(g).not.toBeNull()
    for (const piece of computeLayout(layoutInputOf(config)).pieces) {
      const roles = (tabs: number) => pieceFeatures(config, { ...piece, edges: { ...piece.edges, tabs } }).map((f) => f.role)
      // Masked off, a piece still carries its socket wherever one fits: an empty socket harms nothing.
      expect(roles(0).every((role) => role === 'join-socket')).toBe(true)
      // The mask is the layout's answer, but a tab side lying on the wall's own edge is never cut whatever
      // it says: there is no tile out there to reach into.
      const edge = hasSide(piece.edges.boundary, TAB_SIDE)
      expect(roles(1 << TAB_SIDE).some((role) => role === 'join-tab'), piece.id).toBe(!edge)
    }
  })

  it('keeps every pocket of a piece apart from every other, inside the piece', () => {
    for (const wall of WALLS) {
      for (const fixing of FIXINGS) {
        const config = design({ ...wall, ...fixing })
        for (const piece of computeLayout(layoutInputOf(config)).pieces) {
          const tabbed = { ...piece, edges: { ...piece.edges, tabs: 1 << TAB_SIDE } }
          const features = pieceFeatures(config, tabbed)
          const reach = tabGeometry(config)?.reach ?? 0
          for (const f of features) {
            const b = ringBounds(mouthOf(f))
            expect(b.minX).toBeGreaterThanOrEqual(0)
            expect(b.minY).toBeGreaterThanOrEqual(0)
            // A tab stands out past its own side line and nothing else does; its span along the side and its
            // height stay inside the piece all the same.
            expect(b.maxX).toBeLessThanOrEqual(f.outward ? piece.width + reach : piece.width)
            if (f.outward) expect(b.minX).toBeCloseTo(piece.width, 9)
            expect(b.maxY).toBeLessThanOrEqual(piece.height)
            // Deeper than the plate would open the top.
            expect(f.levels.at(-1)?.z1 ?? 0).toBeLessThan(config.tile.thickness)
          }
          for (let i = 0; i < features.length; i++) {
            for (let k = i + 1; k < features.length; k++) {
              const touch = ringsTouch(mouthOf(features[i]), mouthOf(features[k]))
              expect(touch, `${tabbed.id}: ${features[i].role} ${i} and ${features[k].role} ${k}`).toBe(false)
              // Nested outlines do not touch either: one pocket inside another is just as wrong.
              const a = ringBounds(mouthOf(features[i]))
              const b = ringBounds(mouthOf(features[k]))
              const apart = a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY
              if (!apart) expect(false, `${tabbed.id}: features ${i} and ${k} overlap`).toBe(true)
            }
          }
        }
      }
    }
  })

  it('gives two placements of one piece id the same pockets', () => {
    const config = design({ lock: 'keys', mount: 'clips', surface: { width: 1000, height: 700 } })
    const plan = computeLayout(layoutInputOf(config))
    for (const piece of plan.pieces) {
      expect(pieceFeatures(config, { ...piece, crop: { ...piece.crop }, edges: structuredClone(piece.edges) })).toEqual(
        pieceFeatures(config, piece),
      )
    }
  })
})
