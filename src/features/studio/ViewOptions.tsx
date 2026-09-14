import { SlidersHorizontal } from 'lucide-react'
import { Popover } from 'radix-ui'
import { SliderField, Switch } from '@/ui'
import styles from './studio.module.scss'

const DIAL_SIZE = 96
const DIAL_RADIUS = 36

/** Where the raking light stands, drawn as a compass over the tile. */
function LightDial({ angle }: { angle: number }) {
  const centre = DIAL_SIZE / 2
  const radians = (angle * Math.PI) / 180
  const x = centre + DIAL_RADIUS * Math.cos(radians)
  const y = centre - DIAL_RADIUS * Math.sin(radians)
  const shadow = 9

  return (
    <svg
      className={styles.dial}
      viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
      width={DIAL_SIZE}
      height={DIAL_SIZE}
      aria-hidden="true"
    >
      <circle className={styles.dialRing} cx={centre} cy={centre} r={DIAL_RADIUS} />
      {Array.from({ length: 12 }, (_, index) => {
        const tick = (index * Math.PI) / 6
        const inner = DIAL_RADIUS - (index % 3 === 0 ? 6 : 3)
        return (
          <line
            key={index}
            className={styles.dialTick}
            x1={centre + inner * Math.cos(tick)}
            y1={centre - inner * Math.sin(tick)}
            x2={centre + DIAL_RADIUS * Math.cos(tick)}
            y2={centre - DIAL_RADIUS * Math.sin(tick)}
          />
        )
      })}
      <rect
        className={styles.dialShadow}
        x={centre - 11 - Math.cos(radians) * shadow}
        y={centre - 11 + Math.sin(radians) * shadow}
        width="22"
        height="22"
      />
      <rect className={styles.dialTile} x={centre - 11} y={centre - 11} width="22" height="22" />
      <line className={styles.dialRay} x1={x} y1={y} x2={centre} y2={centre} />
      <circle className={styles.dialSun} cx={x} cy={y} r="5" />
    </svg>
  )
}

export interface ViewOptionsProps {
  lightAngle: number
  defaultAngle: number
  showDimensions: boolean
  showLayerLines: boolean
  onChange: (patch: { lightAngle?: number; showDimensions?: boolean; showLayerLines?: boolean }) => void
}

/**
 * The three instruments that change how the wall is drawn rather than what it is, folded into one
 * slip: six buttons floating over the render competed with the render.
 */
export function ViewOptions({ lightAngle, defaultAngle, showDimensions, showLayerLines, onChange }: ViewOptionsProps) {
  return (
    <Popover.Root>
      <Popover.Trigger className={styles.viewTrigger} aria-label="View options">
        <SlidersHorizontal aria-hidden="true" />
        <span aria-hidden="true">View</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.viewPopover}
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label="View options"
        >
          <p className={styles.viewTitle}>View</p>
          <div className={styles.toggles}>
            <Switch
              label="Measurements"
              description="Sizes drawn on the model."
              checked={showDimensions}
              onCheckedChange={(next) => onChange({ showDimensions: next })}
            />
            <Switch
              label="Layer lines"
              description="How the print will be striped."
              checked={showLayerLines}
              onCheckedChange={(next) => onChange({ showLayerLines: next })}
            />
          </div>
          <LightDial angle={lightAngle} />
          <SliderField
            label="Light angle"
            value={lightAngle}
            defaultValue={defaultAngle}
            min={0}
            max={355}
            step={5}
            unit="°"
            decimals={0}
            onChange={(next) => onChange({ lightAngle: next })}
            hint="A low, side-on light rakes across the relief and shows every ridge."
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
