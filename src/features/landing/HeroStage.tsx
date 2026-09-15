// The stage: one wall under a warm lamp, turning, with a new sample laid on it every few seconds.
import { useMemo, useState } from 'react'
import { colorName } from '@/core/colors'
import { textureById } from '@/core/textures/registry'
import { useLayout } from '@/hooks'
import { TileViewport } from '@/three/TileViewport'
import { heroConfig, HERO_SPECIMENS } from './demo'
import { isSampleShown } from './heroShow'
import styles from './HeroStage.module.scss'

export interface HeroStageProps {
  /** Which of HERO_SPECIMENS is on the board. */
  index: number
  /** '#RRGGBB' the board shows the relief in: the sample's own, or a color picked further down the page. */
  color: string
  onPickSample: (index: number) => void
}

export function HeroStage({ index, color, onPickSample }: HeroStageProps) {
  const [pending, setPending] = useState(true)

  const { textureId } = HERO_SPECIMENS[index]
  const config = useMemo(() => heroConfig({ textureId, color }), [textureId, color])
  const plan = useLayout(config)
  const texture = textureById(config.texture.id)

  return (
    <div className={styles.stage}>
      <div className={styles.board}>
        <div className={styles.canvas} data-pending={pending || undefined}>
          <TileViewport config={config} plan={plan} mode="surface" interactive={false} onPendingChange={setPending} />
        </div>
        <p className={styles.pill}>
          <span className={styles.pillDot} style={{ background: config.color }} aria-hidden="true" />
          <span className={styles.pillText}>
            <span className={styles.pillName}>{texture.name}</span>
            <span className={styles.pillNote}>in {colorName(config.color)}</span>
          </span>
        </p>
      </div>
      <div className={styles.picker} role="group" aria-label="Choose a sample">
        {HERO_SPECIMENS.map((entry, entryIndex) => {
          const entryTexture = textureById(entry.textureId)
          return (
            <button
              key={entry.textureId}
              type="button"
              className={styles.pick}
              // A color picked further down puts a pairing on the board that no key offers, so none reads as pressed.
              aria-pressed={isSampleShown(entryIndex, index, color)}
              aria-label={`Show ${entryTexture.name} in ${colorName(entry.color)}`}
              onClick={() => onPickSample(entryIndex)}
            >
              <span className={styles.pickSwatch} style={{ background: entry.color }} aria-hidden="true" />
              {entryTexture.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
