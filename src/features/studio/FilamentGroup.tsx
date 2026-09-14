import { useState } from 'react'
import { FILAMENT_LINES, FILAMENTS, filamentById, FINISH_LABEL, type Filament } from '@/core/filaments'
import { Button, Dialog, SwatchGrid, TabPanel, Tabs } from '@/ui'
import { FieldGroup } from './FieldGroup'
import styles from './studio.module.scss'
import type { CellProps } from './types'

const ESSENTIALS = 'essentials'
const POPULAR = FILAMENTS.filter((filament) => filament.popular)
/** As many as fit two comfortable rows; past that it is a catalogue, not a choice. */
const ROW_SIZE = 16

const TABS = [
  { value: ESSENTIALS, label: 'Popular', count: POPULAR.length },
  ...FILAMENT_LINES.map((line) => ({
    value: line,
    label: line,
    count: FILAMENTS.filter((filament) => filament.line === line).length,
  })),
]

/**
 * The short row: popular spools, one per colour rather than one per product, and always including
 * the chosen one so the selected chip is never off-screen.
 */
function shortRow(chosen: Filament): Filament[] {
  const seen = new Set<string>([chosen.hex])
  const row: Filament[] = [chosen]
  for (const filament of POPULAR) {
    if (row.length >= ROW_SIZE) break
    if (seen.has(filament.hex)) continue
    seen.add(filament.hex)
    row.push(filament)
  }
  return row
}

/** Choice 5: the spool it prints in, which is also the colour the whole screen takes on. */
export function FilamentGroup({ config, update }: CellProps) {
  const filament = filamentById(config.colorId)
  const [open, setOpen] = useState(false)
  const [line, setLine] = useState(() => (filament.popular ? ESSENTIALS : filament.line))
  const items = line === ESSENTIALS ? POPULAR : FILAMENTS.filter((candidate) => candidate.line === line)

  const choose = (colorId: string) => update((design) => ({ ...design, colorId }))

  return (
    <FieldGroup step={5} title="Filament">
      <div className={styles.filamentChosen}>
        <span className={styles.filamentSwatch} style={{ background: filament.hex }} aria-hidden="true" />
        <span className={styles.filamentText}>
          <span className={styles.filamentName}>{filament.name}</span>
          <span className={styles.filamentMeta}>
            {filament.line} · {filament.hex.toUpperCase()}
          </span>
        </span>
        <span className={styles.filamentFinish}>{FINISH_LABEL[filament.finish]}</span>
      </div>

      <SwatchGrid
        className={styles.filamentRow}
        aria-label="Popular colors"
        items={shortRow(filament)}
        value={config.colorId}
        onChange={choose}
      />

      <Button variant="ghost" size="sm" className={styles.filamentMore} onClick={() => setOpen(true)}>
        All colors ({FILAMENTS.length})
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Filament colors"
        description="Real Bambu Lab spools. Hex codes are the manufacturer's published values, so the render matches what you buy."
      >
        <Tabs aria-label="Filament lines" value={line} onValueChange={setLine} items={TABS}>
          <TabPanel value={line}>
            <SwatchGrid
              aria-label={`${line === ESSENTIALS ? 'Popular' : line} colors`}
              items={items}
              value={config.colorId}
              onChange={choose}
            />
          </TabPanel>
        </Tabs>
      </Dialog>
    </FieldGroup>
  )
}
