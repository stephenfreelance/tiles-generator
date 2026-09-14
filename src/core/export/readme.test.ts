import { describe, expect, it } from 'vitest'
import { computeLayout } from '../layout'
import { testConfig } from '../geometry/testFields'

// The README names the texture through the registry, which another engineer owns; skip until it lands.
const hasRegistry = Object.keys(import.meta.glob('../textures/registry.ts')).length > 0

const plan = computeLayout({
  surface: { width: 1000, height: 800 },
  tile: { width: 150, height: 150 },
  joint: 2,
  layout: { origin: 'balanced', rowOffset: 0.5 },
})

describe.skipIf(!hasRegistry)('buildReadme', () => {
  it('describes the design, the pieces and how to print them', async () => {
    const { buildReadme } = await import('./readme')
    const config = testConfig({
      name: 'Kitchen splashback',
      joint: 2,
      layout: { origin: 'balanced', rowOffset: 0.5 },
    })
    const readme = buildReadme(config, plan, 'stl')

    expect(readme).toContain('Kitchen splashback')
    expect(readme).toContain('150 x 150 x 4 mm')
    expect(readme).toContain('Running bond')
    expect(readme).toContain('setting-out-plan.svg')
    expect(readme).toContain('Print face up')
    expect(readme).toContain('No supports')
    expect(readme).toContain('0.12 to 0.2 mm')
    expect(readme).toContain('3 perimeters')
    expect(readme).toContain('15%')
    expect(readme).toContain('brim')
    expect(readme).toMatch(/tile adhesive|mounting tape/)
    for (const piece of plan.pieces) expect(readme).toContain(piece.mark)
  })

  it('names the corner the whole tiles are really read from', async () => {
    const { buildReadme } = await import('./readme')
    const layout = { origin: 'corner', rowOffset: 0 } as const
    const cornerPlan = computeLayout({
      surface: { width: 1000, height: 800 },
      tile: { width: 150, height: 150 },
      joint: 0,
      layout,
    })
    // This wall really does cut the bottom and the right, so the whole tiles start at the top-left.
    expect(cornerPlan.pieces.map((p) => p.label)).toEqual(
      expect.arrayContaining(['Bottom edge', 'Right edge', 'Bottom-right corner']),
    )
    const readme = buildReadme(testConfig({ layout }), cornerPlan, 'stl')
    expect(readme).toContain('Started from the top-left corner, cuts on the right and bottom edges')
    expect(readme).toContain('top-left corner, so the cut pieces fall on the right edge and along the bottom')
    // The old sheet sent the installer to the corner where the narrow cuts actually go.
    expect(readme).not.toContain('bottom-left corner')
  })

  it('lists one file line per piece and never uses an em-dash', async () => {
    const { buildReadme } = await import('./readme')
    const { pieceFileName } = await import('./filenames')
    const readme = buildReadme(testConfig(), plan, 'step')
    for (const piece of plan.pieces) expect(readme).toContain(pieceFileName(piece, 'step'))
    expect(readme).not.toContain('—')
  })
})
