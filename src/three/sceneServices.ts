import { createContext, useContext, useSyncExternalStore } from 'react'
import { LOOK } from './look'
import { QualityGovernor } from './qualityGovernor'

/**
 * Per-viewport state that several components share and that outlives a remount of the scene: what is
 * currently moving (the quality governor can only measure real frames, and the frameloop is on demand),
 * the governor's own verdicts, and whether the cached shadow map needs a re-render (camera moves reuse
 * it, scene changes do not).
 */
export class MotionTracker {
  private lastActiveAt = Number.NEGATIVE_INFINITY

  bump(now: number): void {
    this.lastActiveAt = now
  }

  isActive(now: number, windowMs: number): boolean {
    return now - this.lastActiveAt < windowMs
  }
}

export class ShadowController {
  private frames = 0

  /** Ask for the shadow map to be re-rendered on the next frames. */
  mark(frames = 2): void {
    this.frames = Math.max(this.frames, frames)
  }

  /** Called before anything renders: the map only re-renders while marked dirty. */
  apply(setAutoUpdate: (on: boolean) => void): void {
    if (!LOOK.key.cacheShadowMap) return
    if (this.frames > 0) {
      this.frames--
      setAutoUpdate(true)
    } else {
      setAutoUpdate(false)
    }
  }
}

export class SceneServices {
  readonly motion = new MotionTracker()
  readonly shadows = new ShadowController()
  readonly quality = new QualityGovernor(LOOK.quality.governor)
}

export const ServicesContext = createContext<SceneServices | null>(null)

export function useSceneServices(): SceneServices {
  const services = useContext(ServicesContext)
  if (!services) throw new Error('The 3D scene must be rendered inside a ServicesContext provider')
  return services
}

const reducedMotionQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

function subscribeReducedMotion(onChange: () => void): () => void {
  reducedMotionQuery?.addEventListener('change', onChange)
  return () => reducedMotionQuery?.removeEventListener('change', onChange)
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => reducedMotionQuery?.matches ?? false,
    () => false,
  )
}
