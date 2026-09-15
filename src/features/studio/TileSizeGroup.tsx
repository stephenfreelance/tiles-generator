import { LIMITS } from '@/core/config'
import { type TileFit } from '@/core/layout'
import { formatLength, formatSize } from '@/core/units'
import { announce, LengthField } from '@/ui'
import { ChoiceGroup, type Choice } from './ChoiceGroup'
import { FieldGroup } from './FieldGroup'
import styles from './studio.module.scss'
import {
  CUSTOM,
  heldRecommendationNote,
  holdsRecommendation,
  RECOMMENDED,
  sameTileSize,
  tileChoicesFor,
  type TileChoiceKind,
} from './tileOptions'
import type { CellProps } from './types'
import type { ChooseTile } from './useStudioUpdate'

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

/** One number for a square, both for a rectangle, so a 137.1 x 162.5 mm tile never reads as 137.1 mm. */
function tileHeading(width: number, height: number): string {
  const same = formatLength(width, 'mm', false) === formatLength(height, 'mm', false)
  return same ? formatLength(width, 'mm') : formatSize(width, height)
}

export interface TileSizeGroupProps extends CellProps {
  /**
   * The choice the design is on. The studio holds it, because its edits carry the tile along to the
   * next recommendation only on Recommended: a size the maker picked or typed is never rewritten.
   */
  choice: TileChoiceKind
  onChoose: ChooseTile
}

/**
 * Choice 2: how big one tile is. The recommendation is computed from the wall the maker just
 * measured, so "no cuts" is true by construction rather than by luck, and it is what loads. The
 * familiar sizes beside it are costed against the same wall, so choosing one is never a guess.
 */
export function TileSizeGroup({ config, choice: current, onChoose }: TileSizeGroupProps) {
  // A size picked by name keeps its own chip even where the wall makes it the recommendation.
  const choices = tileChoicesFor(config, current === 'size' ? config.tile : undefined)

  // On Recommended with no recommendation to show, the tile is held rather than picked: a chip of the
  // same size would claim a choice that the next straight-row layout silently overrides.
  const held = holdsRecommendation(choices, current)
  // Recommended is checked only while the tile follows it: a picked size that happens to match it
  // shows on its own chip, or as Custom when it has none.
  const chosen = choices.find(
    (choice) => sameTileSize(choice.fit, config.tile) && !(current === 'size' && choice.value === RECOMMENDED),
  )
  const value = held ? RECOMMENDED : current === 'custom' || !chosen ? CUSTOM : chosen.value
  const showFields = value === CUSTOM

  const setTile = (width: number, height: number, stepped: boolean) => {
    // A typed size that lands on a preset re-highlights that preset rather than staying "custom".
    const onChip = choices.some((choice) => choice.value !== RECOMMENDED && sameTileSize(choice.fit, { width, height }))
    onChoose(onChip ? 'size' : 'custom', { width, height }, stepped ? { coalesce: 'tile.size' } : undefined)
  }

  const applyPreset = (choice: { value: string; fit: TileFit }) => {
    const { fit } = choice
    onChoose(choice.value === RECOMMENDED ? 'recommended' : 'size', { width: fit.width, height: fit.height })
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
  if (held) {
    options.unshift({
      value: RECOMMENDED,
      name: formatSize(config.tile.width, config.tile.height),
      badge: 'Recommended',
      featured: true,
      note: heldRecommendationNote(config),
    })
  }
  options.push({ value: CUSTOM, name: 'Custom', note: 'Type a size' })

  return (
    <FieldGroup step={2} title="Tile size" now={tileHeading(config.tile.width, config.tile.height)}>
      <ChoiceGroup
        aria-label="Tile size"
        value={value}
        options={options}
        onChange={(next) => {
          const choice = choices.find((candidate) => candidate.value === next)
          if (choice) applyPreset(choice)
          else if (next === RECOMMENDED) onChoose('recommended')
          else onChoose('custom')
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
