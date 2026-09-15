import type { Tier } from './look'

export interface GovernorTuning {
  /** Active frame time one decision looks at, ms. */
  windowMs: number
  /** Fewest sampled frames a decision needs, so a weak GPU is judged on more than one or two frames. */
  minFrames: number
  /** A frame interval longer than this is a gap (the loop slept, a shader compiled), not a frame, ms. */
  gapMs: number
  /** This many gap-length intervals in a row are frames after all: the GPU really is that slow. */
  slowStreak: number
  /** Frames right after a tier change are ignored this long: recompiles, re-bakes and resizes, ms. */
  cooldownMs: number
  /** Decline one tier when the `declinePercentile` frame is slower than this rate. */
  declineFps: number
  declinePercentile: number
  /** Consecutive slow windows a decline needs, so one stall (another app, a busy tab) costs nothing. */
  declineWindows: number
  /** Incline one tier, before any decline only, when the `inclinePercentile` frame beats this rate. */
  inclineFps: number
  inclinePercentile: number
  /** Consecutive windows of headroom an incline needs. */
  inclineWindows: number
  /** Most tier changes one viewport makes in its lifetime. */
  maxChanges: number
}

const MAX_TIER: Tier = 2

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))
  return sorted[index]
}

/**
 * Picks the quality tier from real frame times. The frameloop is on demand, so only frames rendered
 * back to back while something moves are measured; sleeps, compile stalls and the frames after a
 * change are not. Fixed frame-rate thresholds keep it independent of the display's refresh rate, a
 * decline is never undone within the session, and the number of changes is capped, so it cannot
 * ping-pong between tiers.
 */
export class QualityGovernor {
  private lastFrameAt: number | null = null
  private intervals: number[] = []
  private windowTime = 0
  private longStreak = 0
  private ignoreUntil = Number.NEGATIVE_INFINITY
  private headroomWindows = 0
  private slowWindows = 0
  private changes = 0
  private declinedOnce = false

  constructor(private readonly tuning: GovernorTuning) {}

  get declined(): boolean {
    return this.declinedOnce
  }

  /** The loop went to sleep: the next frame's interval measures the pause, not the frame. */
  idle(): void {
    this.lastFrameAt = null
    this.longStreak = 0
  }

  /** One rendered frame at `now` (ms). Returns the tier to switch to, or null to stay on `tier`. */
  frame(now: number, active: boolean, tier: Tier): Tier | null {
    if (!active) {
      this.idle()
      return null
    }
    const last = this.lastFrameAt
    this.lastFrameAt = now
    if (last === null || now < this.ignoreUntil || this.changes >= this.tuning.maxChanges) return null

    const interval = now - last
    if (interval > this.tuning.gapMs) {
      this.longStreak++
      if (this.longStreak < this.tuning.slowStreak) return null
    } else {
      this.longStreak = 0
    }
    this.intervals.push(interval)
    this.windowTime += interval
    if (this.windowTime < this.tuning.windowMs || this.intervals.length < this.tuning.minFrames) return null

    const sorted = this.intervals.sort((a, b) => a - b)
    const slow = percentile(sorted, this.tuning.declinePercentile) > 1000 / this.tuning.declineFps
    const fast = percentile(sorted, this.tuning.inclinePercentile) <= 1000 / this.tuning.inclineFps
    this.intervals = []
    this.windowTime = 0

    if (slow) {
      this.headroomWindows = 0
      this.slowWindows++
      if (this.slowWindows < this.tuning.declineWindows) return null
      return tier > 0 ? this.change(now, (tier - 1) as Tier, true) : null
    }
    this.slowWindows = 0
    if (fast && !this.declinedOnce && tier < MAX_TIER) {
      this.headroomWindows++
      return this.headroomWindows >= this.tuning.inclineWindows ? this.change(now, (tier + 1) as Tier, false) : null
    }
    this.headroomWindows = 0
    return null
  }

  private change(now: number, next: Tier, decline: boolean): Tier {
    this.changes++
    if (decline) this.declinedOnce = true
    this.ignoreUntil = now + this.tuning.cooldownMs
    this.headroomWindows = 0
    this.slowWindows = 0
    this.idle()
    return next
  }
}
