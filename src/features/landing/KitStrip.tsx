// What the zip holds for the wall the visitor sized: one printed chip per model, the two documents
// that travel with them, and the folder itself. Every chip asks for the same (config, crop, sizePx)
// as the corner detail above it, so the section draws four cache hits and costs the worker nothing.
import { lazy, Suspense, useMemo } from 'react'
import { pieceFileName } from '@/core/export/filenames'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { formatSize } from '@/core/units'
import { useTextureChips, type ChipItem } from '@/hooks'
import { PROOF_CHIP_PX } from './chipBudget'
import styles from './KitStrip.module.scss'
import { ZipFolder } from './ZipFolder'

// The roll brings motion's animate() and useTransform() with it, about 7 kB gz of engine that the
// eager landing chunk would otherwise load in front of the hero image for a count far below the fold.
const Odometer = lazy(async () => ({ default: (await import('./Odometer')).Odometer }))

export interface KitStripProps {
  config: DesignConfig
  /** The whole wall's plan, not the corner detail: the zip holds a model for every piece it uses. */
  plan: LayoutPlan
  /** Left at PROOF_CHIP_PX, which is what the corner detail asks for, so every chip is a cache hit. */
  sizePx?: number
}

/** The two files the exporter writes whatever the wall is, with their names from `handleRequest`. */
const DOCUMENTS = [
  { name: 'setting-out-plan.svg', what: 'A tiling plan', detail: 'Where every piece goes, dimensioned' },
  { name: 'README.txt', what: 'A README', detail: 'Sizes, settings and print advice' },
]

export function KitStrip({ config, plan, sizePx = PROOF_CHIP_PX }: KitStripProps) {
  const items = useMemo<ChipItem[]>(
    () => plan.pieces.map((piece) => ({ key: piece.id, config, crop: piece.crop })),
    [plan.pieces, config],
  )
  const chips = useTextureChips(config, items, sizePx)

  // One scale for the whole family: the longest side any piece has fills its square, and every other
  // window is its true fraction of it, so a 100 mm corner reads two thirds of a 150 mm tile.
  const familyLong = useMemo(
    () => plan.pieces.reduce((longest, piece) => Math.max(longest, piece.width, piece.height), 1),
    [plan.pieces],
  )

  // Every name in the zip, in the order the exporter writes them, so the list answers the file count
  // in the panel head rather than a handful of it.
  const fileNames = useMemo(
    () => [...plan.pieces.map((piece) => pieceFileName(piece, 'stl')), ...DOCUMENTS.map((doc) => doc.name)],
    [plan.pieces],
  )

  // Three sheets are all the fan holds, so it takes a spread that says what a zip is: one model and
  // both documents. The first three names would be three near-identical STLs and no document at all.
  const fanNames = useMemo(() => {
    const first = plan.pieces[0]
    const stl = first ? [pieceFileName(first, 'stl')] : []
    return [...stl, ...DOCUMENTS.map((doc) => doc.name)]
  }, [plan.pieces])

  return (
    <div className={styles.kit}>
      <ul className={styles.files}>
        {plan.pieces.map((piece) => {
          const src = chips.get(piece.id)
          // The chip is a square with the piece centered in it, so the image scales by the piece's own
          // long side: that is the fit it was drawn to, whatever size the window around it is.
          const longSide = Math.max(piece.width, piece.height)
          return (
            <li key={piece.id} className={styles.model}>
              <span className={styles.thumb}>
                <span
                  className={styles.piece}
                  style={{
                    width: `${(piece.width / familyLong) * 100}%`,
                    height: `${(piece.height / familyLong) * 100}%`,
                  }}
                >
                  {src ? (
                    <img
                      src={src}
                      alt=""
                      draggable={false}
                      decoding="async"
                      style={{
                        width: `${(longSide / piece.width) * 100}%`,
                        height: `${(longSide / piece.height) * 100}%`,
                      }}
                    />
                  ) : (
                    <span className={styles.pending} />
                  )}
                </span>
              </span>
              <span className={styles.mark} data-cut={piece.kind !== 'full' || undefined}>
                {piece.mark}
              </span>
              <span className={styles.what}>{piece.label}</span>
              <span className={styles.detail}>{formatSize(piece.width, piece.height)}</span>
              <span className={styles.count}>
                ×
                {/* The plain figure until the roll's chunk lands, and for good if it never does. */}
                <Suspense fallback={<span className={styles.still}>{piece.count}</span>}>
                  <Odometer value={piece.count} />
                </Suspense>
              </span>
            </li>
          )
        })}

        {DOCUMENTS.map((doc) => (
          <li key={doc.name} className={styles.document}>
            <span className={styles.what}>{doc.what}</span>
            <span className={styles.detail}>{doc.detail}</span>
          </li>
        ))}
      </ul>

      <div className={styles.zip}>
        <ZipFolder papers={fanNames} label="What the zip holds" />
        {/* The fan carries three of these; this is the whole zip, standing still, for everyone else. */}
        <ul className={styles.names} aria-label="File names">
          {fileNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
