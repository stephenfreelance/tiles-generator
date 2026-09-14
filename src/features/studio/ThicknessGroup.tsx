import { useState } from 'react'
import { LIMITS, THICKNESS_PRESETS } from '@/core/config'
import { formatLength } from '@/core/units'
import { LengthField } from '@/ui'
import { ChoiceGroup, type Choice } from './ChoiceGroup'
import { ThicknessProfile } from './diagrams'
import { FieldGroup } from './FieldGroup'
import styles from './studio.module.scss'
import type { CellProps } from './types'

const CUSTOM = 'custom'

/**
 * Choice 3: how thick the plate under the relief prints. Three drawn profiles instead of a field in
 * tenths of a millimetre, because the only consequences a maker acts on are stiffness and filament.
 */
export function ThicknessGroup({ config, update }: CellProps) {
  const thickness = config.tile.thickness
  const preset = THICKNESS_PRESETS.find((candidate) => Math.abs(candidate.value - thickness) < 0.05)
  const [customPinned, setCustomPinned] = useState(!preset)
  const value = customPinned || !preset ? CUSTOM : preset.label

  const options: Choice[] = THICKNESS_PRESETS.map((candidate) => ({
    value: candidate.label,
    name: `${candidate.label} · ${formatLength(candidate.value)}`,
    note: candidate.hint,
    sample: <ThicknessProfile mm={candidate.value} />,
  }))
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
          min={LIMITS.thickness.min}
          max={LIMITS.thickness.max}
          step={0.2}
          showLimits={false}
          limitReasons={{
            min: 'thin enough already for a stiff tile',
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
