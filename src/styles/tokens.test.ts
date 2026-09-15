import { describe, expect, it } from 'vitest'
import { accentPalette, accentVariables } from '@/core/accent'
import { DEFAULT_COLOR } from '@/core/colors'

// The stylesheet paints before useAccentTheme runs, so its defaults must be the script's own answer
// for a default design, or the accent visibly jumps on load.

// Vitest empties stylesheet imports (even ?raw), and the app project carries no node types, so fs is
// reached through the runtime and typed here for the one call this test makes.
interface NodeRuntime {
  process: { getBuiltinModule(id: 'node:fs'): { readFileSync(path: URL, encoding: 'utf8'): string } }
}
const fs = (globalThis as unknown as NodeRuntime).process.getBuiltinModule('node:fs')
const tokens = fs.readFileSync(new URL('./_tokens.scss', import.meta.url), 'utf8')

function rootValue(name: string): string | undefined {
  const match = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(tokens)
  return match?.[1].trim()
}

describe('_tokens.scss accent defaults', () => {
  it('equal accentPalette(DEFAULT_COLOR)', () => {
    const variables = accentVariables(accentPalette(DEFAULT_COLOR))
    expect(Object.keys(variables)).toHaveLength(5)
    for (const [name, value] of Object.entries(variables)) {
      expect(rootValue(name)?.toUpperCase(), name).toBe(value.toUpperCase())
    }
  })

  it('keeps --filament on DEFAULT_COLOR', () => {
    expect(rootValue('--filament')?.toUpperCase()).toBe(DEFAULT_COLOR)
  })
})
