// Motion for the landing page alone: mounted inside LandingPage, never in AppShell, so /studio,
// /download and /history download none of it.
import { LazyMotion, MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'

/** The page's one easing curve, so every landing animation decelerates the same way. */
// It lives beside the provider that applies it as the tree default; the alternative, the features module,
// would pull domAnimation into the eager graph for every file that reads the curve.
// eslint-disable-next-line react-refresh/only-export-components
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]

// A separate chunk: the first paint pays for m and LazyMotion, the features arrive with the animations.
const loadFeatures = () => import('./motionFeatures').then((mod) => mod.default)

// ?still=1 asks for end states instead of a race: the shots harness appends it to the eight standard
// captures and leaves it off for `npm run shots -- --motion`, which is the run that has to photograph
// the animations. Keying this off navigator.webdriver instead would take that choice away from it.
// Guarded, because this module is evaluated wherever the page is imported, not only in a browser.
const still = typeof location !== 'undefined' && new URLSearchParams(location.search).has('still')

export function LandingMotion({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" skipAnimations={still} transition={{ ease: EASE_OUT }}>
      {/* strict, so a stray motion.* throws in development instead of shipping the full bundle; domAnimation,
          not domMax, because nothing on this page uses layout, layoutId or drag. */}
      <LazyMotion strict features={loadFeatures}>
        {children}
      </LazyMotion>
    </MotionConfig>
  )
}
