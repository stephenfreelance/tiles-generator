import { useState } from 'react'
import { LIMITS } from '@/core/config'
import { type TileFit } from '@/core/layout'
import { printerById } from '@/core/printers'
import { formatLength, formatSize } from '@/core/units'
import { announce, LengthField } from '@/ui'
import { ChoiceGroup, type Choice } from './ChoiceGroup'
import { FieldGroup } from './FieldGroup'
import styles from './studio.module.scss'
import { CUSTOM, RECOMMENDED, sameTileSize, tileChoices } from './tileOptions'
import type { CellProps } from './types'

const TILE_LIMITS = {
  min: 'the smallest tile worth printing',
  max: 'the largest tile Tessera makes',
}

/** What the size does to the wall, which is the question the millimetres raise. */
function consequence(fit: TileFit): string {
  // A running bond does not fill a regular grid, so the count comes from the placements themselves.
  if (fit.exact) return `${fit.tiles} ${fit.tiles === 1 ? 'tile' : 'tiles'}, no cuts`
  return `${fit.whole} whole ${fit.whole === 1 ? 'tile' : 'tiles'}, ${fit.cuts} cut ${fit.cuts === 1 ? 'piece' : 'pieces'}`
}

/**
 * Choice 2: how big one tile is. The recommendation is computed from the wall the maker just
 * measured, so "no cuts" is true by construction rather than by luck, and it is what loads. The
 * familiar sizes beside it are costed against the same wall, so choosing one is never a guess.
 */
export function TileSizeGroup({ config, update }: CellProps) {
  const bed = printerById(config.printerId)
  // The layout matters to the promise: a size that leaves no cuts from the corner can still cut
  // every edge once the grid is centred or the rows are shifted, so the presets are counted against
  // the layout this design actually uses.
  const choices = tileChoices(config.surface, config.joint, {
    min: LIMITS.tile.min,
    max: LIMITS.tile.max,
    bed,
    layout: config.layout,
  })

  const chosen = choices.find((choice) => sameTileSize(choice.fit, config.tile))
  // Choosing Custom sticks: a wall size changed afterwards recomputes the recommendation and offers
  // it, but never silently rewrites a number the maker typed.
  const [customPinned, setCustomPinned] = useState(chosen === undefined)
  const value = customPinned || !chosen ? CUSTOM : chosen.value
  const showFields = value === CUSTOM

  const setTile = (width: number, height: number, stepped: boolean) => {
    // A typed size that lands on a preset re-highlights that preset rather than staying "custom".
    if (choices.some((choice) => sameTileSize(choice.fit, { width, height }))) setCustomPinned(false)
    update(
      (design) => ({ ...design, tile: { ...design.tile, width, height } }),
      stepped ? { coalesce: 'tile.size' } : undefined,
    )
  }

  const applyPreset = (fit: TileFit) => {
    setCustomPinned(false)
    update((design) => ({ ...design, tile: { ...design.tile, width: fit.width, height: fit.height } }))
    announce(`Tile ${formatSize(fit.width, fit.height)}: ${consequence(fit)}.`)
  }

  const options: Choice[] = choices.map((choice) => {
    const recommended = choice.value === RECOMMENDED
    return {
      value: choice.value,
      // The recommendation leads with the size itself and wears the word as a badge, so the card
      // says what it is before it says who chose it.
      name: recommended ? (choice.figure ?? choice.name) : choice.name,
      figure: recommended ? undefined : choice.figure,
      badge: recommended ? 'Recommended' : undefined,
      featured: recommended,
      // On a custom size the recommendation is the quiet nudge: the wall changed, here is what fits it.
      note: recommended && value === CUSTOM ? `Now ${consequence(choice.fit)}` : consequence(choice.fit),
      tone: choice.fit.exact ? 'ok' : 'default',
    }
  })
  options.push({ value: CUSTOM, name: 'Custom', note: 'Type a size' })

  return (
    <FieldGroup step={2} title="Tile size" now={formatLength(config.tile.width, 'mm')}>
      <ChoiceGroup
        aria-label="Tile size"
        value={value}
        options={options}
        onChange={(next) => {
          const choice = choices.find((candidate) => candidate.value === next)
          if (choice) applyPreset(choice.fit)
          else setCustomPinned(true)
        }}
      />

      {showFields && (
        <div className={styles.grid2}>
          <LengthField
            label="Tile width"
            valueMm={config.tile.width}
            min={LIMITS.tile.min}
            max={LIMITS.tile.max}
            step={1}
            showLimits={false}
            limitReasons={TILE_LIMITS}
            onChangeMm={(mm, meta) => setTile(mm, config.tile.height, meta.stepped)}
          />
          <LengthField
            label="Tile height"
            valueMm={config.tile.height}
            min={LIMITS.tile.min}
            max={LIMITS.tile.max}
            step={1}
            showLimits={false}
            limitReasons={TILE_LIMITS}
            onChangeMm={(mm, meta) => setTile(config.tile.width, mm, meta.stepped)}
          />
        </div>
      )}
    </FieldGroup>
  )
}
