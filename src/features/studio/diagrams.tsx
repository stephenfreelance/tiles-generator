// Setting-out choices drawn rather than described: small plans in currentColor, so they ink
// themselves white when their segment is chosen.

import type { JointEdgeProfile, LayoutOrigin, PerimeterProfile, RowOffset } from '@/core/types'

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

/** Two smooth bumps of relief, valleys at y = 9 and peaks at y = 5, ending in a valley at x = 10. */
const RELIEF = 'M2 18V9C3 9 3 5 4 5C5 5 5 9 6 9C7 9 7 5 8 5C9 5 9 9 10 9'

/** The same relief carried on for three more bumps, to the valley at x = 22. */
const RELIEF_ON = `${RELIEF}C11 9 11 5 12 5C13 5 13 9 14 9C15 9 15 5 16 5C17 5 17 9 18 9C19 9 19 5 20 5C21 5 21 9 22 9`

/**
 * The edge of the wall in section, relief on the left and the edge on the right (the profiles of
 * core/geometry/profiles.ts, with the relief smoothed so it reads as a pattern rather than spikes).
 * Each profile shows its default: margin and frame flatten the relief into a land at the valleys;
 * chamfer, bullnose and ogee cut it, so the curve shaves the peaks under it and leaves a valley open.
 * The crossings are solved numerically, so the outline is always the lower of relief and curve. The
 * bullnose is drawn at radius 8 around (20, 13): a tighter one barely touched the peak at x = 24.
 */
const PERIMETER_PATHS: Record<PerimeterProfile, string> = {
  none: `${RELIEF_ON}C23 9 23 5 24 5C25 5 25 9 26 9C27 9 27 5 28 5V18Z`,
  margin: `${RELIEF}H28V18Z`,
  chamfer: `${RELIEF_ON}C22.54 9 22.79 7.84 23.06 6.76L28 11V18Z`,
  bullnose: `${RELIEF_ON}C22.73 9 22.92 6.9 23.36 5.74A8 8 0 0 1 24.92 6.69C25.2 7.78 25.45 9 26 9C26.24 9 26.42 8.78 26.57 8.43A8 8 0 0 1 28 13V18Z`,
  ogee: `${RELIEF_ON}C22.64 9 22.87 7.39 23.21 6.21A4 3 0 0 1 24 8A4 3 0 0 0 28 11V18Z`,
  frame: `${RELIEF}H16L22 3H27L28 4V18Z`,
}

export function PerimeterProfileIcon({ profile }: { profile: PerimeterProfile }) {
  return (
    <svg viewBox="1 1 28 18" width="72" height="46" aria-hidden="true">
      <path
        d={PERIMETER_PATHS[profile]}
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Two tiles meeting, the gap between them drawn wider than it prints. The view is cropped to the joint
 * and drawn at twice the scale, because the edge shape is the whole point and it is only millimetres.
 */
const JOINT_PATHS: Record<JointEdgeProfile, string> = {
  square: 'M0 18V6H15V18Z M17 18V6H32V18Z',
  chamfer: 'M0 18V6H13L15 8V18Z M17 18V8L19 6H32V18Z',
  round: 'M0 18V6H12A3 3 0 0 1 15 9V18Z M17 18V9A3 3 0 0 1 20 6H32V18Z',
  pillow: 'M0 18V6H9Q15 6 15 10V18Z M17 18V10Q17 6 23 6H32V18Z',
}

export function JointEdgeIcon({ edge }: { edge: JointEdgeProfile }) {
  return (
    <svg viewBox="4 4.5 24 14" width="48" height="28" aria-hidden="true">
      <path
        d={JOINT_PATHS[edge]}
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}
