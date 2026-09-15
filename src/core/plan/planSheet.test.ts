import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config'
import { computeLayout } from '../layout'
import type { DesignConfig } from '../types'
import { buildPlanModel } from './planModel'
import { renderPlanSheet, type SheetInfo } from './planSheet'
import { planSheetInfo } from './planSvg'

const design = (over: Partial<DesignConfig> = {}): DesignConfig => ({ ...structuredClone(DEFAULT_CONFIG), ...over })

const info: SheetInfo = {
  title: 'Kitchen <splashback> & "tiles"',
  surface: '1,200 × 600 mm',
  tile: '150 × 150 mm, 4 mm base',
  joint: '2 mm',
  texture: 'Wavy, 2.4 mm relief',
  color: 'Green (#5C9748)',
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

  it('names the color in the title block, by preset or as custom, with its hex', () => {
    expect(planSheetInfo(design({ color: '#C0582F' })).color).toBe('Terracotta (#C0582F)')
    expect(planSheetInfo(design({ color: '#12AB34' })).color).toBe('Custom (#12AB34)')
    const { svg } = sheetFor(design())
    expect(svg).toContain('Green (#5C9748)')
    expect(svg).not.toMatch(/filament/i)
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

  it('names the cut piece that really sits on the SO point of a running bond', () => {
    const tile = { width: 100, height: 100, thickness: 4 }
    const { svg } = sheetFor(design({ surface: { width: 1250, height: 640 }, tile, joint: 0, layout: { origin: 'corner', rowOffset: 0.3333 } }))
    // Notes wrap across text lines, so they are read as the words a person sees.
    const words = svg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(words).toMatch(/the bottom-left corner of cut piece [A-Z]+\./)
    expect(words).not.toContain('the corner of a full tile')
  })
})
