// Four printed pieces laid in their real positions: the relief runs straight across every joint.
import { useMemo } from 'react'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { useTextureChips, type ChipItem } from '@/hooks'
import styles from './JointProof.module.scss'

const CHIP_PX = 320

export interface JointProofProps {
  config: DesignConfig
  plan: LayoutPlan
  label: string
}

export function JointProof({ config, plan, label }: JointProofProps) {
  const items = useMemo<ChipItem[]>(
    () => plan.pieces.map((piece) => ({ key: piece.id, config, crop: piece.crop })),
    [plan.pieces, config],
  )
  const chips = useTextureChips(config, items, CHIP_PX)
  const pieceById = useMemo(() => new Map(plan.pieces.map((piece) => [piece.id, piece])), [plan.pieces])

  // Column and row tracks follow the real millimetres, so the pieces meet exactly as they will on the wall.
  const columns = [...new Set(plan.placements.map((placement) => placement.x))].sort((a, b) => a - b)
  const rows = [...new Set(plan.placements.map((placement) => placement.y))].sort((a, b) => b - a)
  const widthAt = (x: number) => pieceById.get(plan.placements.find((p) => p.x === x)?.pieceId ?? '')?.width ?? 1
  const heightAt = (y: number) => pieceById.get(plan.placements.find((p) => p.y === y)?.pieceId ?? '')?.height ?? 1
  const columnWidths = columns.map(widthAt)
  const rowHeights = rows.map(heightAt)
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0)
  const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0)

  return (
    <div
      className={styles.wall}
      role="img"
      aria-label={label}
      style={{
        gridTemplateColumns: columnWidths.map((width) => `${width}fr`).join(' '),
        gridTemplateRows: rowHeights.map((height) => `${height}fr`).join(' '),
        // The samples are positioned inside their cells, so the wall carries the surface proportions itself.
        aspectRatio: `${totalWidth} / ${totalHeight}`,
      }}
    >
      {plan.placements.map((placement) => {
        const piece = pieceById.get(placement.pieceId)
        if (!piece) return null
        const src = chips.get(piece.id)
        // Chips are square with the piece centred in them, so scale by the long side to butt them exactly.
        const longSide = Math.max(piece.width, piece.height)
        return (
          <div
            key={`${placement.x}-${placement.y}`}
            className={styles.cell}
            data-cut={piece.kind !== 'full' || undefined}
            style={{ gridColumn: columns.indexOf(placement.x) + 1, gridRow: rows.indexOf(placement.y) + 1 }}
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
            {piece.kind !== 'full' && (
              <span className={styles.mark} aria-hidden="true">
                {piece.mark}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
