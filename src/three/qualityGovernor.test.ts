import { describe, expect, it } from 'vitest'
import { LOOK, type Tier } from './look'
import { QualityGovernor } from './qualityGovernor'

const tuning = LOOK.quality.governor

/** Drives a governor like the frame loop does, applying every change it asks for. */
class Harness {
  readonly governor = new QualityGovernor(tuning)
  now = 1000
  tier: Tier
  readonly changes: Tier[] = []

  constructor(tier: Tier) {
    this.tier = tier
  }

  /** Renders `ms` of back-to-back frames at `frameMs` each, with something moving. */
  run(ms: number, frameMs: number, active = true): this {
    const end = this.now + ms
    while (this.now < end) {
      this.now += frameMs
      this.step(active)
    }
    return this
  }

  step(active = true): void {
    const next = this.governor.frame(this.now, active, this.tier)
    if (next !== null) {
      this.tier = next
      this.changes.push(next)
    }
  }

  /** The loop sleeps: no frame for `ms`, then the tail callback says so. */
  sleep(ms: number, tail = true): this {
    if (tail) this.governor.idle()
    this.now += ms
    return this
  }
}

describe('quality governor', () => {
  it('declines one tier when frames are clearly slow', () => {
    const h = new Harness(2).run(tuning.declineWindows * tuning.windowMs + 1000, 50)
    expect(h.changes).toEqual([1])
  })

  it('keeps the tier through a two-second stall that clears, wherever it falls against the windows', () => {
    for (let offset = 0; offset < tuning.windowMs; offset += 100) {
      const h = new Harness(2).run(10_000 + offset, 1000 / 60).run(2000, 30).run(30_000, 1000 / 60)
      expect({ offset, changes: h.changes }).toEqual({ offset, changes: [] })
    }
  })

  it('reaches tier 0 on a GPU that is slow at every tier, even below the gap threshold', () => {
    const h = new Harness(2).run(60_000, tuning.gapMs * 2)
    expect(h.tier).toBe(0)
    expect(h.changes).toEqual([1, 0])
  })

  it('never counts the sleep between bursts of motion as a slow frame', () => {
    const h = new Harness(2)
    for (let burst = 0; burst < 40; burst++) {
      h.run(300, 16.7).sleep(4000)
      // The tail callback can miss a sleep (another canvas kept the loop running): the gap rule still holds.
      h.run(300, 16.7).sleep(900, false)
    }
    expect(h.changes).toEqual([])
  })

  it('shrugs off shader-compile stalls among fast frames', () => {
    const h = new Harness(2)
    for (let i = 0; i < 20; i++) {
      h.run(700, 16.7)
      h.now += 600
      h.step()
      h.now += 180
      h.step()
    }
    expect(h.changes).toEqual([])
  })

  it('stays on the top tier through long smooth rendering, on 60 Hz and 120 Hz displays alike', () => {
    expect(new Harness(2).run(120_000, 1000 / 60).changes).toEqual([])
    expect(new Harness(2).run(120_000, 1000 / 120).changes).toEqual([])
    // 60 fps on a 120 Hz screen is smooth, not a reason to decline.
    expect(new Harness(2).run(120_000, 1000 / 60).tier).toBe(2)
  })

  it('never inclines again after a decline, so it cannot ping-pong', () => {
    const h = new Harness(1).run(10_000, 1000 / 60)
    expect(h.changes).toEqual([2])
    h.run(tuning.declineWindows * tuning.windowMs + 1000, 60)
    expect(h.changes).toEqual([2, 1])
    h.run(120_000, 1000 / 120)
    expect(h.changes).toEqual([2, 1])
    expect(h.governor.declined).toBe(true)
  })

  it('ignores the frames right after a change', () => {
    const h = new Harness(2).run(tuning.declineWindows * tuning.windowMs + 1000, 60)
    expect(h.changes).toEqual([1])
    // Slow frames inside the cooldown (the recompile) do not push it further down.
    h.run(tuning.cooldownMs - 200, 120)
    expect(h.changes).toEqual([1])
  })

  it('caps the number of changes a viewport makes', () => {
    const governor = new QualityGovernor({ ...tuning, maxChanges: 1 })
    let tier: Tier = 2
    let now = 0
    const changes: Tier[] = []
    for (let i = 0; i < 2000; i++) {
      now += 80
      const next = governor.frame(now, true, tier)
      if (next !== null) {
        tier = next
        changes.push(next)
      }
    }
    expect(changes).toEqual([1])
  })

  it('does not sample while nothing moves', () => {
    const h = new Harness(2).run(20_000, 80, false)
    expect(h.changes).toEqual([])
  })
})
