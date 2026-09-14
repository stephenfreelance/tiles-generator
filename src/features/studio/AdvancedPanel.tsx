import { Dices } from 'lucide-react'
import { DEFAULT_CONFIG, LIMITS } from '@/core/config'
import { piecesPerPlate, PRINTERS, printerById } from '@/core/printers'
import { textureById } from '@/core/textures/registry'
import type { LayoutOrigin, RowOffset } from '@/core/types'
import { formatSize } from '@/core/units'
import {
  Button,
  IconButton,
  SectionRule,
  Segmented,
  Select,
  SliderField,
  Switch,
  TitleBlockRow,
} from '@/ui'
import { advancedChanges, resetGroup, totalChanges, type AdvancedGroupId } from './advanced'
import { OffsetDiagram, OriginDiagram } from './diagrams'
import { Disclosure } from './Disclosure'
import styles from './studio.module.scss'
import type { CellProps } from './types'

const MAX_SEED = 999_999

const ORIGIN_OPTIONS = [
  {
    value: 'corner' as LayoutOrigin,
    label: 'From the corner',
    description: 'Whole tiles start at the top left; the cuts land at the right and the bottom.',
    icon: <OriginDiagram origin="corner" />,
  },
  {
    value: 'center' as LayoutOrigin,
    label: 'Centred',
    description: 'The grid is centred, so opposite edges are cut the same.',
    icon: <OriginDiagram origin="center" />,
  },
  {
    value: 'balanced' as LayoutOrigin,
    label: 'Even edges',
    description: 'The widest edge pieces the wall allows, which is what tilers do to avoid slivers.',
    icon: <OriginDiagram origin="balanced" />,
  },
]

const OFFSET_OPTIONS = [
  { value: 0 as RowOffset, label: 'Straight', icon: <OffsetDiagram offset={0} /> },
  { value: 0.5 as RowOffset, label: 'Half brick', icon: <OffsetDiagram offset={0.5} /> },
  { value: 0.3333 as RowOffset, label: 'Third brick', icon: <OffsetDiagram offset={0.3333} /> },
]

const BRANDS = [...new Set(PRINTERS.map((printer) => printer.brand))]

const PRINTER_GROUPS = BRANDS.map((brand) => ({
  label: brand,
  options: PRINTERS.filter((printer) => printer.brand === brand).map((printer) => ({
    value: printer.id,
    label: printer.name,
    detail: `${printer.width} × ${printer.depth} mm`,
  })),
}))

const clampTo = (value: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, value))

/**
 * Everything the other 95% never touch, one level deep and labelled with its own contents. The
 * changed count on the lid is what stops a design quietly drifting from the defaults with no way
 * for its maker to find out where.
 */
export function AdvancedPanel({ config, update }: CellProps) {
  const changes = advancedChanges(config)
  const total = totalChanges(changes)
  const texture = textureById(config.texture.id)
  const printer = printerById(config.printerId)
  const perPlate = piecesPerPlate(config.tile.width, config.tile.height, printer)
  const maxBevel = Math.min(LIMITS.bevel.max, Math.min(config.tile.width, config.tile.height) / 8)
  const depthMin = Math.max(LIMITS.depth.min, texture.depthRange[0])
  const depthMax = Math.min(LIMITS.depth.max, texture.depthRange[1])
  const scaleMin = Math.max(LIMITS.scale.min, texture.scaleRange[0])
  const scaleMax = Math.min(LIMITS.scale.max, texture.scaleRange[1])

  const reset = (group: AdvancedGroupId) => update((design) => resetGroup(group, design))

  const resetAction = (group: AdvancedGroupId) =>
    changes[group] > 0 ? (
      <Button variant="ghost" size="sm" onClick={() => reset(group)}>
        Reset
      </Button>
    ) : undefined

  return (
    <Disclosure
      label="Advanced"
      description="Gaps, edges, layout, pattern detail and printer"
      // Saying "all standard" is as load-bearing as the changed count: a folded panel must never be
      // able to leave a design quietly away from its defaults with no sign on the lid.
      badge={total > 0 ? `${total} changed` : 'All standard'}
    >
      <div className={styles.advGroup}>
        <SectionRule label="Gaps and edges" aside={resetAction('gaps')} />
        <SliderField
          label="Gap between tiles"
          value={config.joint}
          defaultValue={DEFAULT_CONFIG.joint}
          min={LIMITS.joint.min}
          max={LIMITS.joint.max}
          step={0.5}
          unit="mm"
          coalesceKey="joint"
          help="The gap you leave between tiles for grout or glue. The relief still lines up across it."
          onChange={(value, hint) => update((design) => ({ ...design, joint: value }), hint)}
        />
        <SliderField
          label="Softened edge"
          value={config.bevel}
          defaultValue={DEFAULT_CONFIG.bevel}
          min={LIMITS.bevel.min}
          max={maxBevel}
          step={0.1}
          unit="mm"
          coalesceKey="bevel"
          help="A 45° cut around the top of every tile. It catches the light along each gap and forgives a millimetre of misalignment."
          onChange={(value, hint) => update((design) => ({ ...design, bevel: value }), hint)}
        />
      </div>

      <div className={styles.advGroup}>
        <SectionRule label="How the tiles line up" aside={resetAction('grid')} />
        <Segmented
          layout="tiles"
          label="Where the first tile goes"
          value={config.layout.origin}
          options={ORIGIN_OPTIONS}
          onChange={(origin) => update((design) => ({ ...design, layout: { ...design.layout, origin } }))}
        />
        <Segmented
          size="sm"
          label="Brick pattern"
          value={config.layout.rowOffset}
          options={OFFSET_OPTIONS}
          onChange={(rowOffset) => update((design) => ({ ...design, layout: { ...design.layout, rowOffset } }))}
        />
      </div>

      <div className={styles.advGroup}>
        <SectionRule label="Pattern detail" aside={resetAction('pattern')} />
        {scaleMax > scaleMin && (
          <SliderField
            label="Pattern size"
            value={clampTo(config.texture.scale, [scaleMin, scaleMax])}
            defaultValue={texture.defaults.scale}
            min={scaleMin}
            max={scaleMax}
            step={1}
            unit="mm"
            coalesceKey="texture.scale"
            help="How big one repeat of the pattern is. Tessera rounds it to a whole number of repeats per tile so the relief meets itself at every gap."
            onChange={(value, hint) =>
              update((design) => ({ ...design, texture: { ...design.texture, scale: value } }), hint)
            }
          />
        )}
        {depthMax > depthMin && (
          <SliderField
            label="Depth"
            value={clampTo(config.texture.depth, [depthMin, depthMax])}
            defaultValue={texture.defaults.depth}
            min={depthMin}
            max={depthMax}
            step={0.1}
            unit="mm"
            coalesceKey="texture.depth"
            help="How far the relief stands above the plate. Deeper reads from further away and uses more filament."
            onChange={(value, hint) =>
              update((design) => ({ ...design, texture: { ...design.texture, depth: value } }), hint)
            }
          />
        )}
        {texture.params.map((param) => (
          <SliderField
            key={param.key}
            label={param.label}
            value={
              typeof config.texture.params[param.key] === 'number' ? config.texture.params[param.key] : param.default
            }
            defaultValue={param.default}
            min={param.min}
            max={param.max}
            step={param.step}
            unit={param.unit}
            coalesceKey={`texture.${param.key}`}
            hint={param.hint}
            onChange={(value, hint) =>
              update(
                (design) => ({
                  ...design,
                  texture: { ...design.texture, params: { ...design.texture.params, [param.key]: value } },
                }),
                hint,
              )
            }
          />
        ))}
        {texture.seeded && (
          <div className={styles.tools}>
            <IconButton
              size="sm"
              variant="outline"
              icon={<Dices />}
              aria-label="Shuffle the pattern"
              onClick={() =>
                update((design) => ({
                  ...design,
                  texture: { ...design.texture, seed: Math.floor(Math.random() * MAX_SEED) },
                }))
              }
            />
            <span className={styles.hint}>Shuffle for another draw of the same pattern.</span>
          </div>
        )}
        <div className={styles.toggles}>
          <Switch
            label="Invert the relief"
            description="Peaks become hollows."
            checked={config.texture.invert}
            onCheckedChange={(invert) => update((design) => ({ ...design, texture: { ...design.texture, invert } }))}
          />
          {texture.directional && (
            <Switch
              label="Quarter turn"
              description="Runs the pattern across the tile instead of along it."
              checked={config.texture.rotate}
              onCheckedChange={(rotate) => update((design) => ({ ...design, texture: { ...design.texture, rotate } }))}
            />
          )}
        </div>
      </div>

      <div className={styles.advGroup}>
        <SectionRule label="Printer" aside={resetAction('printer')} />
        <Select
          label="Printer"
          value={config.printerId}
          groups={PRINTER_GROUPS}
          onValueChange={(printerId) => update((design) => ({ ...design, printerId }))}
        />
        <TitleBlockRow label="Bed">{formatSize(printer.width, printer.depth)}</TitleBlockRow>
        <TitleBlockRow label="Your tile" tone={perPlate > 0 ? 'default' : 'cut'}>
          {perPlate > 0 ? `${perPlate} per plate` : 'Too big for this bed'}
        </TitleBlockRow>
      </div>
    </Disclosure>
  )
}
