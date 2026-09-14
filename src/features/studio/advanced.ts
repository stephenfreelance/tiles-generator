// What sits away from what Tessera would have chosen, so a folded panel can still say so on its lid.
// Without this a maker whose design stopped matching the defaults has no way to find out why.

import { DEFAULT_CONFIG } from '@/core/config'
import { textureById } from '@/core/textures/registry'
import type { DesignConfig } from '@/core/types'

export type AdvancedGroupId = 'gaps' | 'grid' | 'pattern' | 'printer'

export type AdvancedChanges = Record<AdvancedGroupId, number>

const countTrue = (...flags: boolean[]) => flags.filter(Boolean).length

/** Relief depth is in tenths of a millimetre, pattern size in whole ones. */
const differs = (a: number, b: number, epsilon = 0.005) => Math.abs(a - b) > epsilon

export function advancedChanges(config: DesignConfig): AdvancedChanges {
  const texture = textureById(config.texture.id)
  const defaults = DEFAULT_CONFIG
  const movedParams = texture.params.filter((param) => {
    const value = config.texture.params[param.key]
    return typeof value === 'number' && differs(value, param.default, param.step / 1000)
  }).length

  return {
    gaps: countTrue(differs(config.joint, defaults.joint), differs(config.bevel, defaults.bevel)),
    grid: countTrue(
      config.layout.origin !== defaults.layout.origin,
      config.layout.rowOffset !== defaults.layout.rowOffset,
    ),
    pattern:
      countTrue(
        differs(config.texture.scale, texture.defaults.scale, 0.05),
        differs(config.texture.depth, texture.defaults.depth),
        config.texture.invert,
        config.texture.rotate,
        config.texture.seed !== defaults.texture.seed,
      ) + movedParams,
    printer: countTrue(config.printerId !== defaults.printerId),
  }
}

export const totalChanges = (changes: AdvancedChanges): number =>
  changes.gaps + changes.grid + changes.pattern + changes.printer

/** Puts one group back to what Tessera would have chosen, and leaves every other group alone. */
export function resetGroup(group: AdvancedGroupId, design: DesignConfig): DesignConfig {
  const defaults = DEFAULT_CONFIG
  switch (group) {
    case 'gaps':
      return { ...design, joint: defaults.joint, bevel: defaults.bevel }
    case 'grid':
      return { ...design, layout: { ...defaults.layout } }
    case 'pattern': {
      const texture = textureById(design.texture.id)
      return {
        ...design,
        texture: {
          ...design.texture,
          scale: texture.defaults.scale,
          depth: texture.defaults.depth,
          params: {},
          seed: defaults.texture.seed,
          invert: false,
          rotate: false,
        },
      }
    }
    case 'printer':
      return { ...design, printerId: defaults.printerId }
  }
}
