import { useState } from 'react'
import { LIMITS, MIN_FIXING_THICKNESS, THICKNESS_PRESETS } from '@/core/config'
import { formatLength } from '@/core/units'
import { LengthField } from '@/ui'
import { ChoiceGroup, type Choice } from './ChoiceGroup'
import { ThicknessProfile } from './diagrams'
import { fixingLimitReason, fixingPlateReason } from './edges'
import { FieldGroup } from './FieldGroup'
import styles from './studio.module.scss'
import type { CellProps } from './types'

const CUSTOM = 'custom'

/**
 * Choice 3: how thick the plate under the relief prints. Three drawn profiles instead of a field in
 * tenths of a millimetre, because the only consequences a maker acts on are stiffness and filament.
 * Keys sit in slots and wall clips in pockets on the back, so while either is chosen a plate too thin
 * to hold them is not offered, and the card says why rather than just going grey.
 */
export function ThicknessGroup({ config, update }: CellProps) {
  const thickness = config.tile.thickness
  const preset = THICKNESS_PRESETS.find((candidate) => Math.abs(candidate.value - thickness) < 0.05)
  const [customPinned, setCustomPinned] = useState(!preset)
  const value = customPinned || !preset ? CUSTOM : preset.label

  const fixingReason = fixingPlateReason(config)
  const minThickness = fixingReason ? Math.max(LIMITS.thickness.min, MIN_FIXING_THICKNESS) : LIMITS.thickness.min

  const options: Choice[] = THICKNESS_PRESETS.map((candidate) => {
    const tooThin = candidate.value < minThickness - 0.05
    return {
      value: candidate.label,
      name: `${candidate.label} · ${formatLength(candidate.value)}`,
      note: tooThin && fixingReason ? fixingReason : candidate.hint,
      disabled: tooThin,
      sample: <ThicknessProfile mm={candidate.value} />,
    }
  })
  options.push({ value: CUSTOM, name: 'Custom', note: 'Type a thickness' })

  return (
    <FieldGroup step={3} title="Thickness" now={formatLength(thickness)}>
      <ChoiceGroup
        className={styles.thicknessGrid}
        aria-label="Thickness"
        value={value}
        options={options}
        onChange={(next) => {
          const chosen = THICKNESS_PRESETS.find((candidate) => candidate.label === next)
          if (!chosen) {
            setCustomPinned(true)
            return
          }
          setCustomPinned(false)
          update((design) => ({ ...design, tile: { ...design.tile, thickness: chosen.value } }))
        }}
      />

      {value === CUSTOM && (
        <LengthField
          label="Thickness"
          valueMm={thickness}
          min={minThickness}
          max={LIMITS.thickness.max}
          step={0.2}
          showLimits={false}
          limitReasons={{
            min: fixingReason ? fixingLimitReason(config) : 'thin enough already for a stiff tile',
            max: 'thicker only wastes filament',
          }}
          onChangeMm={(mm, meta) => {
            if (THICKNESS_PRESETS.some((candidate) => Math.abs(candidate.value - mm) < 0.05)) setCustomPinned(false)
            update(
              (design) => ({ ...design, tile: { ...design.tile, thickness: mm } }),
              meta.stepped ? { coalesce: 'tile.thickness' } : undefined,
            )
          }}
        />
      )}
    </FieldGroup>
  )
}
