// The object's live render, and the landing page's only door to three. It is loaded on its own, after
// the first paint, so the 3D stack never sits on the critical path: keep every three, @react-three
// and TileViewport import on this side of the lazy boundary.
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { TileViewport } from '@/three/TileViewport'

export interface HeroCanvasProps {
  config: DesignConfig
  plan: LayoutPlan
  /** Degrees of key-light azimuth: the hand on the object, and the scroll under it, drive this. */
  lightAngle: number
  /** True while the hand drives the light, so the cinematic drift stands down for the duration. */
  paused: boolean
  /** True once the plate has dissolved off the object: the arrival holds at its first frame until then. */
  arrivalReady: boolean
  onPendingChange: (pending: boolean) => void
}

/** --ground, the page itself: the scene background is a three color, so it cannot read a token. The
    object has no board of its own, so its canvas has to disappear into the page it sits on. */
const PAGE_GROUND = '#F2EADC'

export default function HeroCanvas({ config, plan, lightAngle, paused, arrivalReady, onPendingChange }: HeroCanvasProps) {
  return (
    <TileViewport
      config={config}
      plan={plan}
      mode="surface"
      interactive={false}
      // The product photograph: a wider three-quarter view, a harder rake, the wall standing off its
      // own shadow. Opt-in, so every other route keeps the studio framing it has always had.
      presentation="object"
      // No red wash on the cut pieces here. At a strength low enough to read as a photograph it only
      // tints the color (on a green wall it is an olive cast, not a mark), and at one strong enough to
      // read as a mark it is a fault report on a product shot. The geometry says it instead, which is
      // true of all eleven colors: the last column and the last row are narrower than the rest, their
      // relief is cut off mid-pattern, and the arrival rake walks a long shadow across both as they lay.
      lightAngle={lightAngle}
      paused={paused}
      // The wall lays in where it is being looked at: nothing of the arrival is spent under the plate.
      arrivalReady={arrivalReady}
      background={PAGE_GROUND}
      onPendingChange={onPendingChange}
    />
  )
}
