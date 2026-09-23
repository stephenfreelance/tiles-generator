import { LIMITS, PERIMETER_PROFILES } from '@/core/config'
import type { PerimeterProfile, PerimeterSettings } from '@/core/types'
import { Segmented, SliderField, Switch, type SliderChangeHint } from '@/ui'
import { ChoiceGroup, type Choice } from './ChoiceGroup'
import { PerimeterProfileIcon } from './diagrams'
import {
  anySide,
  autoFade,
  autoFadeText,
  cutDropNote,
  dropHelp,
  effectiveLand,
  LAND_COPY,
  landOrder,
  PERIMETER_COPY,
  PERIMETER_ORDER,
  profileFilesLine,
  type TileModels,
  withPerimeterProfile,
} from './edges'
import { EdgeRule } from './FieldGroup'
import { SidePicker } from './SidePicker'
import styles from './studio.module.scss'
import type { CellProps } from './types'

// One card a line, each carrying its own sentence: six profiles differ in the last millimetres of their
// drawing, so a grid of small icons told a maker nothing the words did not have to repeat anyway.
const PROFILE_OPTIONS: Choice[] = PERIMETER_ORDER.map((profile) => ({
  value: profile,
  name: PERIMETER_COPY[profile].name,
  note: PERIMETER_COPY[profile].line,
  sample: <PerimeterProfileIcon profile={profile} />,
}))

/** Half-millimetre steps, as the fade slider moves. */
const toHalf = (mm: number) => Math.round(mm * 2) / 2

export interface PerimeterControlsProps extends CellProps {
  /** Tile models with and without the profile and the keys: the one cost a border adds. */
  models: TileModels
}

/**
 * The border around the wall: a finish along the edge of the whole surface. Choosing a profile is the
 * whole decision for most makers, so the cards come first and everything that tunes it appears in place
 * only once there is a profile to tune.
 */
export function PerimeterControls({ config, update, models }: PerimeterControlsProps) {
  const { perimeter } = config
  const profile = perimeter.profile
  const shaped = profile !== 'none'
  const defaults = PERIMETER_PROFILES[shaped ? profile : 'margin']
  const depth = config.texture.depth
  const auto = autoFade(depth)
  const land = effectiveLand(perimeter)
  const landOptions = landOrder(profile).map((value) => ({ value, label: LAND_COPY[value].name }))

  const setPerimeter = (patch: Partial<PerimeterSettings>, hint?: SliderChangeHint) =>
    update((design) => ({ ...design, perimeter: { ...design.perimeter, ...patch } }), hint)

  const choose = (next: string) => update((design) => withPerimeterProfile(design, next as PerimeterProfile))

  return (
    <div className={styles.edgeBlock}>
      <ChoiceGroup
        className={styles.profileList}
        layout="stack"
        aria-label="Profile around the wall"
        value={profile}
        options={PROFILE_OPTIONS}
        onChange={choose}
      />

      {shaped && (
        <>
          <div className={styles.perimeterSides}>
            <SidePicker
              sides={perimeter.sides}
              onChange={(side, on) =>
                update((design) => ({
                  ...design,
                  perimeter: { ...design.perimeter, sides: { ...design.perimeter.sides, [side]: on } },
                }))
              }
            />
            {/* The picker's own tinted bands already show which tiles change: only the cost is worth words. */}
            <p className={styles.edgeFact}>
              {anySide(perimeter.sides) ? profileFilesLine(models, config) : 'No side is ticked, so the wall keeps a plain edge.'}
            </p>
          </div>

          <SliderField
            label="Width"
            value={perimeter.width}
            defaultValue={defaults.width}
            min={defaults.widthRange[0]}
            max={defaults.widthRange[1]}
            step={0.5}
            unit="mm"
            coalesceKey="perimeter.width"
            help="How far in from the edge of the wall the shaped band reaches."
            onChange={(width, hint) => setPerimeter({ width }, hint)}
          />
          {defaults.dropRange[1] > defaults.dropRange[0] && (
            <SliderField
              label={profile === 'frame' ? 'Height' : 'Drop'}
              value={perimeter.drop}
              defaultValue={defaults.drop}
              min={defaults.dropRange[0]}
              max={defaults.dropRange[1]}
              step={0.1}
              unit="mm"
              coalesceKey="perimeter.drop"
              help={dropHelp(perimeter, depth)}
              hint={cutDropNote(config)}
              onChange={(drop, hint) => setPerimeter({ drop }, hint)}
            />
          )}

          {depth > 0 && (
            <div className={styles.edgeSection} role="group" aria-labelledby="studio-edges-land">
              <EdgeRule id="studio-edges-land">Where it meets the pattern</EdgeRule>
              <div className={styles.edgeRow}>
                <span className={styles.edgeRowText}>
                  <span className={styles.edgeRowLabel}>Pattern at the edge</span>
                  <span className={styles.edgeRowHint}>{LAND_COPY[land].line}</span>
                </span>
                <Segmented
                  size="sm"
                  aria-label="Pattern at the edge"
                  value={land}
                  options={landOptions}
                  onChange={(next) => setPerimeter({ land: next })}
                />
              </div>

              {/* A cut trims the pattern as it stands, so there is nothing to fade. */}
              {land !== 'cut' && (
                <>
                  <Switch
                    label="Automatic fade"
                    description={perimeter.fade === 0 ? autoFadeText(depth) : 'Set how far the pattern takes to flatten out.'}
                    checked={perimeter.fade === 0}
                    onCheckedChange={(on) => setPerimeter({ fade: on ? 0 : toHalf(auto) })}
                  />
                  {perimeter.fade > 0 && (
                    <SliderField
                      label="Fade"
                      value={perimeter.fade}
                      defaultValue={toHalf(auto)}
                      min={1}
                      max={LIMITS.fade.max}
                      step={0.5}
                      unit="mm"
                      coalesceKey="perimeter.fade"
                      help="The band over which the relief flattens out before the edge begins."
                      onChange={(fade, hint) => setPerimeter({ fade }, hint)}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
