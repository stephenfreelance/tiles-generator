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

  it('names the color by preset, or as custom, with its hex and nothing about materials', async () => {
    const { buildReadme } = await import('./readme')
    const preset = buildReadme(testConfig({ color: '#C0582F' }), plan, 'stl')
    expect(preset).toMatch(/Color +Terracotta \(#C0582F\)/)
    const custom = buildReadme(testConfig({ color: '#12AB34' }), plan, 'stl')
    expect(custom).toMatch(/Color +Custom \(#12AB34\)/)
    for (const word of ['FILAMENT', 'Line', 'Matte', 'Silk', 'PETG']) expect(custom).not.toContain(word)
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
    const readme = buildReadme(testConfig({ layout, surface: { width: 1000, height: 800 } }), cornerPlan, 'stl')
    expect(readme).toContain('Set out from the left edge, cuts on the right and bottom edges')
    // Step 2 measures the same set-out point the plan and the studio draw, above the bottom strip.
    expect(readme.replace(/\s+/g, ' ')).toContain('measure 50 mm up from the bottom edge at the left and draw a level line')
    expect(readme).not.toContain('top-left')
    // The old sheet sent the installer to the corner where the narrow cuts actually go.
    expect(readme).not.toContain('bottom-left corner')
  })

  it('names every cut edge of a running bond, and does not leave its cuts for last', async () => {
    const { buildReadme } = await import('./readme')
    const layout = { origin: 'corner', rowOffset: 0.3333 } as const
    const surface = { width: 1250, height: 640 }
    const tile = { width: 100, height: 100, thickness: 4 }
    const bondPlan = computeLayout({ surface, tile, joint: 0, layout })
    const readme = buildReadme(testConfig({ surface, tile, joint: 0, layout }), bondPlan, 'stl')
    expect(readme).toContain('cuts on the right, bottom and left edges')
    expect(readme.replace(/\s+/g, ' ')).toContain('Lay each row from its first piece')
    expect(readme).not.toContain('Lay the full tiles first')
  })

  it('lists one file line per piece and never uses an em-dash', async () => {
    const { buildReadme } = await import('./readme')
    const { pieceFileName } = await import('./filenames')
    const readme = buildReadme(testConfig(), plan, 'step')
    for (const piece of plan.pieces) expect(readme).toContain(pieceFileName(piece, 'step'))
    expect(readme).not.toContain('—')
  })
})
