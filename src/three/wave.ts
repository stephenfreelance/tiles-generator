import * as THREE from 'three'
import type { LayoutOrigin } from '@/core/types'
import { LOOK } from './look'

// The signature re-lay: every tile eases from a small lift, scale and tilt to rest, staggered by its
// distance from the setting-out point, while cut pieces flash red-pencil hatch.

/** Where a tiler starts: the bottom-left corner for a corner origin, the centre lines otherwise. */
export function settingOutPoint(origin: LayoutOrigin, width: number, height: number): { x: number; y: number } {
  return origin === 'corner' ? { x: 0, y: 0 } : { x: width / 2, y: height / 2 }
}

export const easeOutQuart = (t: number): number => 1 - (1 - t) ** 4

export class WaveClock {
  readonly totalMs = LOOK.wave.spreadMs + LOOK.wave.perTileMs
  private startAt: number | null = null
  private previous: WaveClock | null

  constructor(
    readonly origin: { x: number; y: number },
    readonly maxDistance: number,
    /** First appearance: tiles are not drawn until laid, so the wall builds up on the empty sheet. */
    readonly hideUntilLaid: boolean,
    readonly enabled: boolean,
    previous: WaveClock | null,
  ) {
    this.previous = previous
  }

  /** Milliseconds since the wave started; the clock starts on the first rendered frame. */
  elapsed(now: number): number {
    if (this.startAt === null) {
      this.startAt = this.startedAt(now) ?? now
      this.previous = null
    }
    return now - this.startAt
  }

  /** When this wave started, or the running wave it will continue; null before its first frame. Starts nothing. */
  startedAt(now: number): number | null {
    if (this.startAt !== null) return this.startAt
    const prev = this.previous
    // A rebuild landing mid-wave continues that wave instead of restarting it (slider drags).
    const prevStart = prev?.startAt ?? null
    return prev && prevStart !== null && now - prevStart < prev.totalMs ? prevStart : null
  }

  delayFor(cx: number, cy: number): number {
    if (this.maxDistance <= 0) return 0
    return (LOOK.wave.spreadMs * Math.hypot(cx - this.origin.x, cy - this.origin.y)) / this.maxDistance
  }

  /** Settle progress of one tile, 0 (lifted) to 1 (at rest). */
  progress(elapsed: number, delay: number): number {
    return THREE.MathUtils.clamp((elapsed - delay) / LOOK.wave.perTileMs, 0, 1)
  }

  /** Strength of the red-pencil hatch on cut pieces: holds after the wave, then fades out. */
  flash(elapsed: number): number {
    const holdEnd = this.totalMs + LOOK.wave.holdMs
    if (elapsed <= holdEnd) return 1
    return Math.max(0, 1 - (elapsed - holdEnd) / LOOK.wave.fadeMs)
  }

  done(elapsed: number): boolean {
    return elapsed >= this.totalMs + LOOK.wave.holdMs + LOOK.wave.fadeMs
  }
}

/** Whether the tiles play the wave at all: reduced motion and very large walls appear at rest. */
export function waveAnimates(clock: WaveClock, placements: number): boolean {
  return clock.enabled && placements <= LOOK.wave.maxInstances
}

/**
 * Milliseconds until the wave on screen has settled, without starting its clock: every tile at rest,
 * plus the hatch hold and fade when cut pieces flash. A clock that has not started counts from `now`.
 */
export function waveSettleDelay(clock: WaveClock, now: number, options: { animating: boolean; flashes: boolean }): number {
  if (!options.animating) return 0
  const start = clock.startedAt(now) ?? now
  const span = clock.totalMs + (options.flashes ? LOOK.wave.holdMs + LOOK.wave.fadeMs : 0)
  return Math.max(0, start + span - now)
}

/** Hands out the clock for the current geometry, so a re-lay starts once and every piece shares it. */
export class WaveDirector {
  private key: string | null = null
  private clock: WaveClock | null = null

  clockFor(key: string, origin: { x: number; y: number }, maxDistance: number, enabled: boolean): WaveClock {
    if (this.clock && this.key === key) return this.clock
    const previous = this.clock
    // The very first wave lays the tiles onto an empty sheet; later ones lift and settle what is there.
    const clock = new WaveClock(origin, maxDistance, previous === null, enabled, previous)
    this.key = key
    this.clock = clock
    return clock
  }
}

const _position = new THREE.Vector3()
const _axis = new THREE.Vector3()
const _quaternion = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _pivot = new THREE.Matrix4()

/**
 * Instance matrix of a tile settling into place at (x, y): lifted along print z, shrunk about its
 * centre and tilted toward the wave front, easing to a pure translation at progress 1.
 */
export function writeWavePose(
  out: THREE.Matrix4,
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  progress: number,
  liftMm: number,
  waveDirX: number,
  waveDirY: number,
): THREE.Matrix4 {
  if (progress >= 1) return out.makeTranslation(x, y, 0)
  const eased = easeOutQuart(progress)
  const remaining = 1 - eased
  _position.set(x + halfWidth, y + halfHeight, liftMm * remaining)
  _axis.set(-waveDirY, waveDirX, 0)
  if (_axis.lengthSq() < 1e-8) _axis.set(1, 0, 0)
  _axis.normalize()
  _quaternion.setFromAxisAngle(_axis, THREE.MathUtils.degToRad(LOOK.wave.tiltDeg) * remaining)
  const s = LOOK.wave.scaleFrom + (1 - LOOK.wave.scaleFrom) * eased
  _scale.set(s, s, s)
  out.compose(_position, _quaternion, _scale)
  return out.multiply(_pivot.makeTranslation(-halfWidth, -halfHeight, 0))
}

/** Lift of the wave for a tile size. */
export function waveLift(tileWidth: number, tileHeight: number): number {
  return Math.min(LOOK.wave.liftMaxMm, Math.min(tileWidth, tileHeight) * LOOK.wave.liftFraction)
}
