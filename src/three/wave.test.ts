import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { LOOK } from './look'
import { settingOutPoint, WaveClock, waveAnimates, waveLift, waveSettleDelay, writeWavePose } from './wave'

describe('re-lay wave', () => {
  it('starts from the corner for a corner origin and from the centre otherwise', () => {
    expect(settingOutPoint('corner', 1200, 600)).toEqual({ x: 0, y: 0 })
    expect(settingOutPoint('balanced', 1200, 600)).toEqual({ x: 600, y: 300 })
  })

  it('staggers tiles by distance and finishes within the authored duration', () => {
    const clock = new WaveClock({ x: 0, y: 0 }, 1000, false, true, null)
    const t = clock.elapsed(1000)
    expect(t).toBe(0)
    expect(clock.delayFor(0, 0)).toBe(0)
    expect(clock.delayFor(1000, 0)).toBe(LOOK.wave.spreadMs)
    expect(clock.progress(clock.totalMs, clock.delayFor(1000, 0))).toBe(1)
    expect(clock.totalMs).toBeGreaterThanOrEqual(700)
    expect(clock.totalMs).toBeLessThanOrEqual(1100)
  })

  it('continues a running wave when a rebuild lands mid-wave', () => {
    const first = new WaveClock({ x: 0, y: 0 }, 1000, true, true, null)
    first.elapsed(1000)
    const second = new WaveClock({ x: 0, y: 0 }, 1000, false, true, first)
    expect(second.elapsed(1300)).toBe(300)
  })

  it('reads when a wave started without starting it', () => {
    const first = new WaveClock({ x: 0, y: 0 }, 1000, true, true, null)
    expect(first.startedAt(1000)).toBeNull()
    expect(first.startedAt(1000)).toBeNull()
    first.elapsed(1000)
    expect(first.startedAt(5000)).toBe(1000)
    const second = new WaveClock({ x: 0, y: 0 }, 1000, false, true, first)
    // Peeking must not consume the hand-over: the first frame still continues the running wave.
    expect(second.startedAt(1300)).toBe(1000)
    expect(second.startedAt(1300)).toBe(1000)
    expect(second.elapsed(1400)).toBe(400)
    const late = new WaveClock({ x: 0, y: 0 }, 1000, false, true, second)
    expect(late.startedAt(1000 + late.totalMs + 1)).toBeNull()
  })

  it('knows how long a capture has to wait for the wave to settle', () => {
    const settled = { animating: true, flashes: false }
    const flashing = { animating: true, flashes: true }
    const clock = new WaveClock({ x: 0, y: 0 }, 1000, false, true, null)
    // Not started yet: the whole wave is still ahead, and asking does not start it.
    expect(waveSettleDelay(clock, 500, settled)).toBe(clock.totalMs)
    expect(clock.startedAt(500)).toBeNull()
    clock.elapsed(1000)
    expect(waveSettleDelay(clock, 1200, settled)).toBe(clock.totalMs - 200)
    expect(waveSettleDelay(clock, 1200, flashing)).toBe(clock.totalMs + LOOK.wave.holdMs + LOOK.wave.fadeMs - 200)
    expect(waveSettleDelay(clock, 1000 + clock.totalMs, settled)).toBe(0)
    expect(waveSettleDelay(clock, 1000 + clock.totalMs, flashing)).toBeGreaterThan(0)
    expect(clock.done(clock.totalMs + LOOK.wave.holdMs + LOOK.wave.fadeMs)).toBe(true)
    expect(waveSettleDelay(clock, 1000 + clock.totalMs + LOOK.wave.holdMs + LOOK.wave.fadeMs, flashing)).toBe(0)
    // Reduced motion, or a wall too large to animate: nothing to wait for.
    expect(waveSettleDelay(clock, 1200, { animating: false, flashes: true })).toBe(0)
    const still = new WaveClock({ x: 0, y: 0 }, 1000, false, false, null)
    expect(waveAnimates(still, 10)).toBe(false)
    expect(waveAnimates(clock, LOOK.wave.maxInstances)).toBe(true)
    expect(waveAnimates(clock, LOOK.wave.maxInstances + 1)).toBe(false)
  })

  it('fades the cut hatch after holding it', () => {
    const clock = new WaveClock({ x: 0, y: 0 }, 1000, false, true, null)
    expect(clock.flash(clock.totalMs)).toBe(1)
    expect(clock.flash(clock.totalMs + LOOK.wave.holdMs + LOOK.wave.fadeMs)).toBe(0)
    expect(clock.done(clock.totalMs + LOOK.wave.holdMs + LOOK.wave.fadeMs)).toBe(true)
  })

  it('rests as a pure translation and lifts while settling', () => {
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    writeWavePose(m, 150, 300, 75, 75, 1, 30, 1, 0)
    p.setFromMatrixPosition(m)
    expect(p.toArray()).toEqual([150, 300, 0])
    writeWavePose(m, 150, 300, 75, 75, 0, 30, 1, 0)
    const centre = new THREE.Vector3(75, 75, 0).applyMatrix4(m)
    expect(centre.z).toBeCloseTo(30, 5)
    expect(waveLift(150, 150)).toBeLessThanOrEqual(LOOK.wave.liftMaxMm)
  })
})
