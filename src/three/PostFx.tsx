import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { LOOK, type Tier } from './look'

export interface PostFxProps {
  tier: Tier
  /** Relief depth in mm: the ambient occlusion radius follows the geometry, not the wall size. */
  reliefMm: number
}

/**
 * Ambient occlusion, Khronos Neutral tone mapping (the composer forces the renderer to NoToneMapping
 * while it is mounted) and SMAA. No bloom: the matte look never lit it, so no tier pays for the pass.
 * The lowest tier drops the composer entirely.
 */
export function PostFx({ tier, reliefMm }: PostFxProps) {
  if (tier === 0) return null
  const aoRadius = THREE.MathUtils.clamp(reliefMm * LOOK.ao.radiusPerReliefMm, LOOK.ao.minRadiusMm, LOOK.ao.maxRadiusMm)
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO
        aoRadius={aoRadius}
        distanceFalloff={LOOK.ao.distanceFalloff}
        intensity={LOOK.ao.intensity}
        quality={LOOK.ao.quality[tier]}
        halfRes={tier < 2}
        color={LOOK.ao.color}
      />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <SMAA />
    </EffectComposer>
  )
}
