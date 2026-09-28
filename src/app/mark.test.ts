import { describe, expect, it } from 'vitest'
import { markTones } from '@/core/accent'
import { DEFAULT_COLOR } from '@/core/colors'
import { faviconSvg, MARK_PIECES, MARK_VIEWBOX } from './mark'

// The app project carries no node types, so fs is reached through the runtime, as tokens.test.ts does.
interface NodeRuntime {
  process: { getBuiltinModule(id: 'node:fs'): { readFileSync(path: URL, encoding: 'utf8'): string } }
}
const fs = (globalThis as unknown as NodeRuntime).process.getBuiltinModule('node:fs')

describe('the mark', () => {
  it('is public/favicon.svg for the default tile, so the first paint matches what the app draws', () => {
    const file = fs.readFileSync(new URL('../../public/favicon.svg', import.meta.url), 'utf8')
    expect(file).toBe(faviconSvg(DEFAULT_COLOR))
  })

  it('draws one whole tile and three cut pieces', () => {
    expect(MARK_PIECES.map((piece) => piece.tone)).toEqual(['whole', 'cut', 'cut', 'cut'])
  })

  it('paints the tab icon in the tile color it is given', () => {
    const tones = markTones('#00A19B')
    const svg = faviconSvg('#00A19B')
    expect(svg).toContain(`fill="${tones.whole}"`)
    expect(svg).toContain(`fill="${tones.cut}"`)
  })

  it('crops the bar mark to the pieces, with no plate around them', () => {
    const [x, y, w, h] = MARK_VIEWBOX.split(' ').map(Number)
    expect(x + w).toBe(32 - x)
    expect(y + h).toBe(32 - y)
  })
})
