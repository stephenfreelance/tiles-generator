import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config'
import { computeLayout } from '../layout'
import type { DesignConfig } from '../types'
import { buildPlanModel } from './planModel'
import { renderPlanSheet, type SheetInfo } from './planSheet'

const design = (over: Partial<DesignConfig> = {}): DesignConfig => ({ ...structuredClone(DEFAULT_CONFIG), ...over })

const info: SheetInfo = {
  title: 'Kitchen <splashback> & "tiles"',
  surface: '1,200 × 600 mm',
  tile: '150 × 150 mm, 4 mm base',
  joint: '2 mm',
  texture: 'Wavy, 2.4 mm relief',
  filament: 'PLA-CF Matcha Green',
  date: '2026-09-11',
}

function sheetFor(config: DesignConfig) {
  const plan = computeLayout({ surface: config.surface, tile: config.tile, joint: config.joint, layout: config.layout })
  return { plan, svg: renderPlanSheet(buildPlanModel(config, plan), info) }
}

/** Minimal XML well-formedness check: balanced tags, quoted unique attributes, escaped ampersands. */
function assertWellFormed(xml: string) {
  expect(xml).not.toMatch(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/)
  const stack: string[] = []
  const token = /<!--[\s\S]*?-->|<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|</g
  let match: RegExpExecArray | null
  let roots = 0
  while ((match = token.exec(xml))) {
    const [whole, closing, name, attrs, selfClosing] = match
    if (whole.startsWith('<!--')) continue
    if (!name) throw new Error(`Stray "<" at ${match.index}: ${xml.slice(match.index, match.index + 40)}`)
    if (closing) {
      const open = stack.pop()
      if (open !== name) throw new Error(`</${name}> closes <${open}> at ${match.index}`)
      continue
    }
    const names = [...(attrs ?? '').matchAll(/([\w:.-]+)=/g)].map((m) => m[1])
    if (new Set(names).size !== names.length) throw new Error(`Duplicate attribute in <${name}${attrs}>`)
    if (stack.length === 0) roots++
    if (!selfClosing) stack.push(name)
  }
  expect(stack).toEqual([])
  expect(roots).toBe(1)
}

describe('renderPlanSheet', () => {
  it('is a well-formed, self-contained SVG with the design escaped', () => {
    const { svg } = sheetFor(design({ surface: { width: 1200, height: 700 }, joint: 2 }))
    assertWellFormed(svg)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('Kitchen &lt;splashback&gt; &amp; &quot;tiles&quot;')
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/)
    expect(svg).not.toContain('\u2014')
  })

  it('draws every tile once, cuts hatched', () => {
    const { plan, svg } = sheetFor(design({ surface: { width: 1000, height: 800 }, layout: { origin: 'balanced', rowOffset: 0.5 } }))
    expect(svg.match(/class="tile /g)).toHaveLength(plan.placements.length)
    expect(svg.match(/class="tile cut"/g)).toHaveLength(plan.partialCount)
    expect(svg.match(/class="tile full"/g) ?? []).toHaveLength(plan.fullCount)
    for (const piece of plan.pieces) expect(svg).toContain(`data-mark="${piece.mark}"`)
  })

  it('stays legible for a 60 by 40 tile wall', () => {
    const { plan, svg } = sheetFor(design({ surface: { width: 9000, height: 6000 }, tile: { width: 150, height: 150, thickness: 4 } }))
    expect(plan.columns).toBeGreaterThanOrEqual(60)
    assertWellFormed(svg)
    expect(svg).toContain('Scale 1:')
    // Crowded chains collapse into "n × 150" instead of 60 overlapping numbers.
    expect(svg).toMatch(/>\d+ × 150</)
    const dimLabels = svg.match(/class="(?:dim|cutdim)"/g) ?? []
    expect(dimLabels.length).toBeLessThan(20)
    expect(svg.length).toBeLessThan(1_500_000)
  })

  it('states the setting-out point and centre lines for a centred layout', () => {
    const { svg } = sheetFor(design({ surface: { width: 1000, height: 800 }, layout: { origin: 'center', rowOffset: 0 } }))
    expect(svg).toContain('>CL<')
    expect(svg).toContain('>SO<')
    expect(svg).toContain('Snap a vertical line at 500 mm')
  })
})
