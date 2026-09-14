// The stage: one wall under a warm lamp, turning, with a new sample laid on it every few seconds.
import { useEffect, useMemo, useState } from 'react'
import { filamentById } from '@/core/filaments'
import { textureById } from '@/core/textures/registry'
import { useLayout } from '@/hooks'
import { TileViewport } from '@/three/TileViewport'
import { heroConfig, HERO_SPECIMENS } from './demo'
import styles from './HeroStage.module.scss'

/** Long enough to look at the relief, short enough that the stage never feels stuck. */
const CYCLE_MS = 7000

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === 'undefined' ? false : (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false),
  )
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const listen = () => setReduced(query.matches)
    query.addEventListener('change', listen)
    return () => query.removeEventListener('change', listen)
  }, [])
  return reduced
}

export function HeroStage() {
  const reduced = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const [held, setHeld] = useState(false)
  const [pending, setPending] = useState(true)

  // The stage turns itself over unless the viewer asked for less motion or picked a sample.
  useEffect(() => {
    if (reduced || held) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setIndex((current) => (current + 1) % HERO_SPECIMENS.length)
    }, CYCLE_MS)
    return () => window.clearInterval(timer)
  }, [reduced, held])

  const specimen = HERO_SPECIMENS[index]
  const config = useMemo(() => heroConfig(specimen), [specimen])
  const plan = useLayout(config)
  const texture = textureById(config.texture.id)
  const filament = filamentById(config.colorId)

  return (
    <div className={styles.stage}>
      <div className={styles.board}>
        <div className={styles.canvas} data-pending={pending || undefined}>
          <TileViewport config={config} plan={plan} mode="surface" interactive={false} onPendingChange={setPending} />
        </div>
        <p className={styles.pill}>
          <span className={styles.pillDot} style={{ background: filament.hex }} aria-hidden="true" />
          <span className={styles.pillText}>
            <span className={styles.pillName}>{texture.name}</span>
            <span className={styles.pillNote}>in {filament.name}</span>
          </span>
        </p>
      </div>
      <div className={styles.picker} role="group" aria-label="Choose a sample">
        {HERO_SPECIMENS.map((entry, entryIndex) => {
          const entryTexture = textureById(entry.textureId)
          const entryFilament = filamentById(entry.colorId)
          return (
            <button
              key={entry.textureId}
              type="button"
              className={styles.pick}
              aria-pressed={entryIndex === index}
              aria-label={`Show ${entryTexture.name} in ${entryFilament.name}`}
              onClick={() => {
                setIndex(entryIndex)
                setHeld(true)
              }}
            >
              <span className={styles.pickSwatch} style={{ background: entryFilament.hex }} aria-hidden="true" />
              {entryTexture.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
