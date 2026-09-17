import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { LOOK } from './look'
import { acquirePoolTexture } from './proceduralTextures'
import { BACKDROP_LAYER } from './stage'

export interface BackdropProps {
  /** Size of the shown rectangle, mm. */
  width: number
  height: number
  /** Mortar bed shows through open joints. */
  grout: boolean
  lightAngle: number
  /** The tile backs stand this far in front of the shadow catcher, mm. 0: today's backdrop, exactly. */
  standoffMm?: number
  /** Shadow strength on the catcher. Omitted: LOOK.backdrop.shadowOpacity. */
  shadowOpacity?: number
  /** Strength and size of the warm light pool. Omitted: LOOK.backdrop's own. */
  poolIntensity?: number
  poolScale?: number
}

/**
 * The drafting sheet is the backdrop: a shadow catcher over the sheet-coloured background, a soft warm
 * light pool behind the tiles, and the mortar bed that shows through the joints. Lives in the stage
 * group, so it is the wall behind the tiles or the ground they lie on.
 */
export function Backdrop({ width, height, grout, lightAngle, standoffMm = 0, shadowOpacity, poolIntensity, poolScale }: BackdropProps) {
  const span = Math.max(width, height)
  // Catcher and light pool drop back together, so the object keeps one shadow, thrown further.
  const back = Math.max(0, standoffMm)
  const pool = useMemo(() => acquirePoolTexture(), [])
  useEffect(() => () => pool.release(), [pool])

  const pooled = poolIntensity ?? LOOK.backdrop.poolIntensity
  const poolSpan = span * (poolScale ?? LOOK.backdrop.poolScale)

  const azimuth = THREE.MathUtils.degToRad(lightAngle)
  const shift = span * LOOK.backdrop.poolShift

  return (
    <group>
      {pooled > 0 && (
        <mesh
          position={[Math.cos(azimuth) * shift, Math.sin(azimuth) * shift, -0.05 - back]}
          renderOrder={0}
          layers={BACKDROP_LAYER}
        >
          <planeGeometry args={[poolSpan, poolSpan]} />
          <meshBasicMaterial
            map={pool.texture}
            color={LOOK.backdrop.poolColor}
            transparent
            opacity={pooled}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
      {/* Depth is written so screen-space AO darkens the sheet where a tile meets it. */}
      <mesh position={[0, 0, -0.02 - back]} receiveShadow renderOrder={1} layers={BACKDROP_LAYER}>
        <planeGeometry args={[span * LOOK.backdrop.catcherScale, span * LOOK.backdrop.catcherScale]} />
        <shadowMaterial transparent opacity={shadowOpacity ?? LOOK.backdrop.shadowOpacity} color={LOOK.backdrop.shadowColor} />
      </mesh>
      {grout && (
        <mesh position={[0, 0, -0.01]} receiveShadow>
          <planeGeometry args={[width, height]} />
          <meshStandardMaterial color={LOOK.backdrop.groutColor} roughness={LOOK.backdrop.groutRoughness} metalness={0} />
        </mesh>
      )}
    </group>
  )
}
