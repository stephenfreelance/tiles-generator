import { DEFAULT_CONFIG, LIMITS } from '@/core/config'
import type { JointEdgeProfile } from '@/core/types'
import { SliderField } from '@/ui'
import { ChoiceGroup, type Choice } from './ChoiceGroup'
import { JointEdgeIcon } from './diagrams'
import { Disclosure } from './Disclosure'
import { borderBadge, edgesNow, JOINT_COPY, JOINT_ORDER, type TileModels } from './edges'
import { FieldGroup } from './FieldGroup'
import { PerimeterControls } from './PerimeterControls'
import styles from './studio.module.scss'
import type { CellProps } from './types'

const JOINT_OPTIONS: Choice[] = JOINT_ORDER.map((edge) => ({
  value: edge,
  name: JOINT_COPY[edge].name,
  sample: <JointEdgeIcon edge={edge} />,
}))

/** The slider's own floor: "Square" is the one way to ask for no edge at all. */
const MIN_BEVEL = 0.1

export interface EdgesGroupProps extends CellProps {
  /** Tile files with and without the profile and the keys: what the border costs in files. */
  models: TileModels
}

/**
 * Choice 6: how the wall is finished. The edge between tiles leads, because every wall has one; the
 * border around the whole wall, which most designs leave off, folds behind a lid whose badge says what
 * is set. A look, never a way up (that is step 7), and every default is the plain wall Tessera has
 * always made, so skipping the step is a complete answer.
 */
export function EdgesGroup({ config, update, models }: EdgesGroupProps) {
  const maxBevel = Math.min(LIMITS.bevel.max, Math.min(config.tile.width, config.tile.height) / 8)
  // An edge of no size prints square whatever shape is stored, so that is the card ticked and the line said.
  const joint = config.bevel > 0 ? config.jointEdge : 'square'

  return (
    <FieldGroup step={6} title="Edges" now={edgesNow(config)}>
      <ChoiceGroup
        className={styles.jointGrid}
        aria-label="Edge between tiles"
        value={joint}
        options={JOINT_OPTIONS}
        onChange={(next) =>
          update((design) => ({
            ...design,
            jointEdge: next as JointEdgeProfile,
            // Leaving square with the size dragged to nothing: a shape needs a size, or it prints square again.
            bevel: next !== 'square' && design.bevel < MIN_BEVEL ? DEFAULT_CONFIG.bevel : design.bevel,
          }))
        }
      />
      <p className={styles.edgeHint}>{JOINT_COPY[joint].line}</p>
      {joint !== 'square' && (
        <SliderField
          label="Edge size"
          value={Math.min(config.bevel, maxBevel)}
          defaultValue={DEFAULT_CONFIG.bevel}
          min={MIN_BEVEL}
          max={maxBevel}
          step={0.1}
          unit="mm"
          coalesceKey="bevel"
          help="How far the edge cuts down along each joint. Both tiles get the same cut, so the pattern still lines up."
          onChange={(value, hint) => update((design) => ({ ...design, bevel: value }), hint)}
        />
      )}

      <Disclosure
        label="Border around the wall"
        description="A flat margin, a chamfer, a bullnose, an ogee or a raised frame along the outside of the whole wall."
        badge={borderBadge(config)}
        defaultOpen={config.perimeter.profile !== 'none'}
      >
        <PerimeterControls config={config} update={update} models={models} />
      </Disclosure>
    </FieldGroup>
  )
}
