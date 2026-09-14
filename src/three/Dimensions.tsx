import { Html, Line } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { formatLength, formatNumber } from '@/core/units'
import type { LengthUnit } from '@/core/types'
import { inverseNeutralToneMap } from './colorMath'
import { LOOK } from './look'
import { dimensionOffsetMm, OVERLAY_LAYER, type ViewMode } from './stage'
import styles from './Dimensions.module.scss'

type Point = [number, number, number]

const _projected = new THREE.Vector3()

/** Rounded to whole pixels: a label pinned to the model must not shimmer while the camera moves. */
function crispPosition(el: THREE.Object3D, camera: THREE.Camera, size: { width: number; height: number }): number[] {
  _projected.setFromMatrixPosition(el.matrixWorld).project(camera)
  return [Math.round((_projected.x * 0.5 + 0.5) * size.width), Math.round((-_projected.y * 0.5 + 0.5) * size.height)]
}

function tick(at: Point, alongX: number, alongY: number, alongZ: number, length: number): [Point, Point] {
  return [
    [at[0] - alongX * length, at[1] - alongY * length, at[2] - alongZ * length],
    [at[0] + alongX * length, at[1] + alongY * length, at[2] + alongZ * length],
  ]
}

export interface DimensionsProps {
  mode: ViewMode
  /** Shown rectangle, mm; its bottom-left corner is this group's origin. */
  width: number
  height: number
  /** Base plate and relief of one tile, mm (tile mode only). */
  thickness: number
  relief: number
  /** Unit the surface is edited in. */
  unit: LengthUnit
}

interface Label {
  key: string
  position: Point
  value: string
  unit: string
}

/**
 * Leader-line annotations pinned to the model, drawn like a setting-out plan: graphite hairlines with
 * architectural ticks, and labels that knock out the line behind them.
 */
export function Dimensions({ mode, width, height, thickness, relief, unit }: DimensionsProps) {
  const groupRef = useRef<THREE.Group>(null)

  const { segments, labels } = useMemo(() => {
    const tileMode = mode === 'tile'
    const offset = dimensionOffsetMm(mode, width, height)
    const tickLength = offset * LOOK.dims.tickFraction
    const gap = offset * LOOK.dims.gapFraction
    const over = offset * LOOK.dims.overshootFraction
    const z = 0.3
    const points: Point[] = []
    const push = (a: Point, b: Point) => {
      points.push(a, b)
    }

    // Width, below the model.
    const wy = -offset
    push([0, wy, z], [width, wy, z])
    push([0, -gap, z], [0, wy - over, z])
    push([width, -gap, z], [width, wy - over, z])
    push(...tick([0, wy, z], 1, 1, 0, tickLength))
    push(...tick([width, wy, z], 1, 1, 0, tickLength))

    // Height, to the left of the model.
    const hx = -offset
    push([hx, 0, z], [hx, height, z])
    push([-gap, 0, z], [hx - over, 0, z])
    push([-gap, height, z], [hx - over, height, z])
    push(...tick([hx, 0, z], 1, 1, 0, tickLength))
    push(...tick([hx, height, z], 1, 1, 0, tickLength))

    const total = thickness + relief
    if (tileMode) {
      // Thickness and relief, standing off the right-hand front corner.
      const tx = width + offset
      push([tx, 0, 0], [tx, 0, total])
      push([width + gap, 0, 0], [tx + over, 0, 0])
      push([width + gap, 0, total], [tx + over, 0, total])
      push(...tick([tx, 0, 0], 1, 0, 1, tickLength))
      push(...tick([tx, 0, total], 1, 0, 1, tickLength))
    }

    const labelList: Label[] = tileMode
      ? [
          { key: 'w', position: [width / 2, wy, z], value: formatNumber(width, 1), unit: 'mm' },
          { key: 'h', position: [hx, height / 2, z], value: formatNumber(height, 1), unit: 'mm' },
          {
            key: 't',
            position: [width + offset, 0, total / 2],
            value: `${formatNumber(thickness, 1)} + ${formatNumber(relief, 1)}`,
            unit: 'mm',
          },
        ]
      : [
          { key: 'w', position: [width / 2, wy, z], value: formatLength(width, unit, false), unit },
          { key: 'h', position: [hx, height / 2, z], value: formatLength(height, unit, false), unit },
        ]
    return { segments: points, labels: labelList }
  }, [mode, width, height, thickness, relief, unit])

  // Annotations stay out of the contact-shadow and shadow passes.
  useEffect(() => {
    groupRef.current?.traverse((object) => object.layers.set(OVERLAY_LAYER))
  }, [segments])

  const inkColor = useMemo(() => {
    const ink = new THREE.Color(LOOK.dims.color)
    const [r, g, b] = inverseNeutralToneMap([ink.r, ink.g, ink.b])
    return new THREE.Color(r, g, b)
  }, [])

  return (
    <group ref={groupRef}>
      <Line
        points={segments}
        segments
        color={inkColor}
        lineWidth={LOOK.dims.lineWidthPx}
        depthWrite={false}
        toneMapped={false}
      />
      {labels.map((label) => (
        <Html
          key={label.key}
          position={label.position}
          center
          calculatePosition={crispPosition}
          zIndexRange={[3, 0]}
          pointerEvents="none"
          wrapperClass={styles.wrapper}
        >
          <span className={styles.tag}>
            <span className={styles.value}>{label.value}</span>
            <span className={styles.unit}>{label.unit}</span>
          </span>
        </Html>
      ))}
    </group>
  )
}
