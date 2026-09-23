import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import type { DesignConfig } from '@/core/types'
import { advancedChanges, resetGroup, totalChanges } from './advanced'

const design = (patch: Partial<DesignConfig>): DesignConfig => ({ ...DEFAULT_CONFIG, ...patch })

describe('advancedChanges', () => {
  it('reads a new design as all standard', () => {
    expect(totalChanges(advancedChanges(DEFAULT_CONFIG))).toBe(0)
  })

  it('counts the gap under Gaps', () => {
    expect(advancedChanges(design({ joint: 2 })).gaps).toBe(1)
  })

  it('leaves the joint edge to step 6 and the fixings to step 7, which are always open', () => {
    const edged = design({ bevel: 1.2, jointEdge: 'pillow', lock: 'keys', mount: 'clips', fit: 'loose' })
    expect(totalChanges(advancedChanges(edged))).toBe(0)
  })
})

describe('resetGroup', () => {
  it('puts the gap back and leaves the joint edge where the maker set it', () => {
    const edited = design({ joint: 3, bevel: 1.2, jointEdge: 'round' })
    const reset = resetGroup('gaps', edited)
    expect(reset.joint).toBe(DEFAULT_CONFIG.joint)
    expect(reset.bevel).toBe(1.2)
    expect(reset.jointEdge).toBe('round')
  })
})
