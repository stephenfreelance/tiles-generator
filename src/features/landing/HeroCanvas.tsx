// The board's live render, and the landing page's only door to three. It is loaded on its own, after
// the first paint, so the 3D stack never sits on the critical path: keep every three, @react-three
// and TileViewport import on this side of the lazy boundary.
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { TileViewport } from '@/three/TileViewport'

export interface HeroCanvasProps {
  config: DesignConfig
  plan: LayoutPlan
  /** Degrees of key-light azimuth: the hand on the board drives this. */
  lightAngle: number
  /** True while the hand drives the light, so the cinematic orbit stands down for the duration. */
  paused: boolean
  onPendingChange: (pending: boolean) => void
}

/** --panel-2, the board's own surface: the scene background is a three color, so it cannot read a token. */
const BOARD_BACKGROUND = '#EFE7D8'

export default function HeroCanvas({ config, plan, lightAngle, paused, onPendingChange }: HeroCanvasProps) {
  return (
    <TileViewport
      config={config}
      plan={plan}
      mode="surface"
      interactive={false}
      lightAngle={lightAngle}
      paused={paused}
      background={BOARD_BACKGROUND}
      onPendingChange={onPendingChange}
    />
  )
}
