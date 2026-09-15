import { describe, expect, it } from 'vitest'
import { COLOR_PRESETS } from '@/core/colors'
import { HERO_SPECIMENS } from './demo'
import { HERO_SHOW_START, heroShowStep, isSampleShown, shownColor, type HeroShow } from './heroShow'

const DESIGN = '#EE6F9A'

describe('hero show', () => {
  it('starts on the first sample, turning, in its own color whatever the design wears', () => {
    expect(HERO_SHOW_START).toEqual({ index: 0, held: false })
    expect(shownColor(HERO_SHOW_START, DESIGN)).toBe(HERO_SPECIMENS[0].color)
  })

  it('advances through every sample and wraps, the color following the board', () => {
    let state = HERO_SHOW_START
    for (let step = 1; step <= HERO_SPECIMENS.length; step++) {
      state = heroShowStep(state, { type: 'advance' })
      const index = step % HERO_SPECIMENS.length
      expect(state.index).toBe(index)
      expect(shownColor(state, DESIGN)).toBe(HERO_SPECIMENS[index].color)
    }
  })

  it('holds a picked sample and stops the cycle', () => {
    const state = heroShowStep(HERO_SHOW_START, { type: 'sample', index: 3 })
    expect(state).toEqual({ index: 3, held: true })
    expect(heroShowStep(state, { type: 'advance' })).toBe(state)
  })

  it('keeps the sample on the board when a color is picked, and stops the cycle', () => {
    const state = heroShowStep({ ...HERO_SHOW_START, index: 2 }, { type: 'pick' })
    expect(state).toEqual({ index: 2, held: true })
    expect(heroShowStep(state, { type: 'advance' })).toBe(state)
  })

  it('reads a held show from the design, so an undone pick moves the page back with it', () => {
    const held: HeroShow = { index: 1, held: true }
    expect(shownColor(held, '#7B4FD0')).toBe('#7B4FD0')
    expect(shownColor(held, DESIGN)).toBe(DESIGN)
  })

  it('presses a sample key only while the board shows that relief in its own color', () => {
    const { color } = HERO_SPECIMENS[1]
    expect(isSampleShown(1, 1, color)).toBe(true)
    expect(isSampleShown(0, 1, color)).toBe(false)
    const other = COLOR_PRESETS.find((preset) => preset.hex !== color)?.hex ?? DESIGN
    expect(isSampleShown(1, 1, other)).toBe(false)
  })

  it('ignores a sample that does not exist', () => {
    expect(heroShowStep(HERO_SHOW_START, { type: 'sample', index: HERO_SPECIMENS.length })).toBe(HERO_SHOW_START)
    expect(heroShowStep(HERO_SHOW_START, { type: 'sample', index: -1 })).toBe(HERO_SHOW_START)
    expect(heroShowStep(HERO_SHOW_START, { type: 'sample', index: 1.5 })).toBe(HERO_SHOW_START)
  })
})
