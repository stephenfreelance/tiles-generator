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
}

/**
 * The drafting sheet is the backdrop: a shadow catcher over the sheet-coloured background, a soft warm
 * light pool behind the tiles, and the mortar bed that shows through the joints. Lives in the stage
 * group, so it is the wall behind the tiles or the ground they lie on.
 */
export function Backdrop({ width, height, grout, lightAngle }: BackdropProps) {
  const span = Math.max(width, height)
  const pool = useMemo(() => acquirePoolTexture(), [])
  useEffect(() => () => pool.release(), [pool])

  const azimuth = THREE.MathUtils.degToRad(lightAngle)
  const shift = span * LOOK.backdrop.poolShift

  return (
    <group>
      {LOOK.backdrop.poolIntensity > 0 && (
        <mesh
          position={[Math.cos(azimuth) * shift, Math.sin(azimuth) * shift, -0.05]}
          renderOrder={0}
          layers={BACKDROP_LAYER}
        >
          <planeGeometry args={[span * LOOK.backdrop.poolScale, span * LOOK.backdrop.poolScale]} />
          <meshBasicMaterial
            map={pool.texture}
            color={LOOK.backdrop.poolColor}
            transparent
            opacity={LOOK.backdrop.poolIntensity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
      {/* Depth is written so screen-space AO darkens the sheet where a tile meets it. */}
      <mesh position={[0, 0, -0.02]} receiveShadow renderOrder={1} layers={BACKDROP_LAYER}>
        <planeGeometry args={[span * LOOK.backdrop.catcherScale, span * LOOK.backdrop.catcherScale]} />
        <shadowMaterial transparent opacity={LOOK.backdrop.shadowOpacity} color={LOOK.backdrop.shadowColor} />
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
