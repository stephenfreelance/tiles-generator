// The specimen board: every relief in the catalog, rendered as a lit sample you can start from.
import { useMemo } from 'react'
import { TEXTURES } from '@/core/textures/registry'
import type { DesignConfig } from '@/core/types'
import { useTextureChips, type ChipItem } from '@/hooks'
import { Tooltip } from '@/ui'
import styles from './SpecimenStrip.module.scss'

const CHIP_PX = 176

export interface SpecimenStripProps {
  /** The design the samples are rendered in: its tile size, depth range and color. */
  base: DesignConfig
  onPick: (textureId: string) => void
}

export function SpecimenStrip({ base, onPick }: SpecimenStripProps) {
  const items = useMemo<ChipItem[]>(
    () =>
      TEXTURES.map((texture) => ({
        key: texture.id,
        config: {
          ...base,
          texture: {
            ...base.texture,
            id: texture.id,
            depth: texture.defaults.depth,
            scale: texture.defaults.scale,
            params: {},
          },
        },
      })),
    [base],
  )
  const chips = useTextureChips(base, items, CHIP_PX)

  return (
    <ul className={styles.strip}>
      {TEXTURES.map((texture) => {
        const src = chips.get(texture.id)
        return (
          <li key={texture.id}>
            <Tooltip content={texture.blurb} side="bottom">
              <button
                type="button"
                className={styles.specimen}
                aria-label={`Start a drawing with ${texture.name}`}
                onClick={() => onPick(texture.id)}
              >
                <span className={styles.sample}>
                  {src ? (
                    <img src={src} alt="" draggable={false} decoding="async" />
                  ) : (
                    <span className={styles.pending} aria-hidden="true" />
                  )}
                </span>
                <span className={styles.caption}>
                  <span className={styles.name}>{texture.name}</span>
                </span>
              </button>
            </Tooltip>
          </li>
        )
      })}
    </ul>
  )
}
