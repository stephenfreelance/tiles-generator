// Setting-out choices drawn rather than described: small plans in currentColor, so they ink
// themselves white when their segment is chosen.

import type { LayoutOrigin, RowOffset } from '@/core/types'

const CUT_OPACITY = 0.45

/** A 40 × 28 plan of the same wall, laid out three ways: where the cuts land is the whole story. */
export function OriginDiagram({ origin }: { origin: LayoutOrigin }) {
  const full = { fill: 'none', stroke: 'currentColor', strokeWidth: 1 }
  const cut = { fill: 'currentColor', fillOpacity: CUT_OPACITY, stroke: 'currentColor', strokeWidth: 1 }
  return (
    <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true">
      <rect x="0.5" y="0.5" width="39" height="27" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {origin === 'corner' && (
        <g>
          {[0, 1, 2].map((col) =>
            [0, 1].map((row) => <rect key={`${col}-${row}`} {...full} x={1 + col * 12} y={1 + row * 12} width="11" height="11" />),
          )}
          {[0, 1].map((row) => (
            <rect key={`r${row}`} {...cut} x={37} y={1 + row * 12} width="2" height="11" />
          ))}
          {[0, 1, 2].map((col) => (
            <rect key={`c${col}`} {...cut} x={1 + col * 12} y={25} width="11" height="2" />
          ))}
          <rect {...cut} x={37} y={25} width="2" height="2" />
        </g>
      )}
      {origin === 'center' && (
        <g>
          {[0, 1, 2].map((col) =>
            [0, 1].map((row) => <rect key={`${col}-${row}`} {...full} x={2.5 + col * 12} y={2 + row * 12} width="11" height="11" />),
          )}
          <rect {...cut} x={1} y={2} width="1.5" height="23" />
          <rect {...cut} x={38.5} y={2} width="0.5" height="23" />
          <rect {...cut} x={2.5} y={1} width="35" height="1" />
          <rect {...cut} x={2.5} y={26} width="35" height="1" />
        </g>
      )}
      {origin === 'balanced' && (
        <g>
          {[0, 1].map((col) =>
            [0, 1].map((row) => <rect key={`${col}-${row}`} {...full} x={7.5 + col * 12} y={4 + row * 10} width="11" height="9" />),
          )}
          <rect {...cut} x={1} y={4} width="6" height="19" />
          <rect {...cut} x={32} y={4} width="6" height="19" />
          <rect {...cut} x={7.5} y={1} width="23.5" height="2.5" />
          <rect {...cut} x={7.5} y={24} width="23.5" height="3" />
        </g>
      )}
    </svg>
  )
}

/** A tile seen edge on: the relief, and the solid plate under it drawn at its real proportion. */
export function ThicknessProfile({ mm }: { mm: number }) {
  const plate = Math.max(2.5, Math.min(9, mm * 1.5))
  const top = 16 - plate
  return (
    <svg viewBox="0 0 34 18" width="34" height="18" aria-hidden="true">
      <path
        d={`M1 ${top} q3 -4 6 0 t6 0 t6 0 t6 0 t6 0`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <rect
        x="1"
        y={top}
        width="32"
        height={plate}
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  )
}

/** How each row shifts against the one below it. */
export function OffsetDiagram({ offset }: { offset: RowOffset }) {
  const shift = offset === 0 ? 0 : offset === 0.5 ? 8 : 5.33
  const rows = [0, 1, 2]
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      {rows.map((row) => {
        const start = ((row * shift) % 16) - 16
        return (
          <g key={row}>
            {[0, 1, 2].map((col) => (
              <rect
                key={col}
                x={start + col * 16 + 0.5}
                y={row * 5 + 0.75}
                width="15"
                height="4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
