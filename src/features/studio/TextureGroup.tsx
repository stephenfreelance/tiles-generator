import { useMemo } from 'react'
import { DEFAULT_CONFIG } from '@/core/config'
import { TEXTURES, textureById } from '@/core/textures/registry'
import { useTextureChips, type ChipItem } from '@/hooks'
import { TextureChipGrid } from '@/ui'
import { FieldGroup } from './FieldGroup'
import styles from './studio.module.scss'
import type { CellProps } from './types'

/** Chip pixels: comfortably over the drawn size, so the relief stays crisp on a dense screen. */
const CHIP_PX = 160

/**
 * Choice 4: the relief. The lit samples are the most beautiful thing on the screen and the reason
 * anyone is here, so they are shown as a wall of relief with no captions between them; the chosen
 * one is named in the heading. Every knob that shapes a pattern is in Advanced.
 */
export function TextureGroup({ config, update }: CellProps) {
  const chosen = textureById(config.texture.id)
  const { colorId } = config
  const { width: tileWidth, height: tileHeight } = config.tile

  // Catalogue specimens: each relief at its own depth and scale, so editing the design never
  // re-renders all the chips. Only the filament and the tile shape, which frame them, carry over.
  const chipItems = useMemo<ChipItem[]>(
    () =>
      TEXTURES.map((candidate) => ({
        key: candidate.id,
        config: {
          ...DEFAULT_CONFIG,
          colorId,
          tile: { ...DEFAULT_CONFIG.tile, width: tileWidth, height: tileHeight },
          texture: {
            ...DEFAULT_CONFIG.texture,
            id: candidate.id,
            params: {},
            scale: candidate.defaults.scale,
            depth: candidate.defaults.depth,
          },
        },
      })),
    [colorId, tileWidth, tileHeight],
  )
  const chips = useTextureChips(config, chipItems, CHIP_PX)

  return (
    <FieldGroup step={4} title="Texture" now={chosen.name}>
      <TextureChipGrid
        className={styles.textureGrid}
        aria-label="Relief samples"
        value={chosen.id}
        items={TEXTURES.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          src: chips.get(candidate.id) ?? null,
          description: candidate.blurb,
        }))}
        onChange={(id) => {
          const next = textureById(id)
          // The chip is rendered at the pattern's own depth and scale, so picking it gives exactly
          // what it showed: the render is the promise, down to this.
          update((design) => ({
            ...design,
            texture: {
              ...design.texture,
              id,
              params: {},
              scale: next.defaults.scale,
              depth: next.defaults.depth,
            },
          }))
        }}
      />
    </FieldGroup>
  )
}
