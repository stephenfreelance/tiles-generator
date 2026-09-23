import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Box, ClipboardCheck, Eye, Info, Lightbulb, ListOrdered, Printer, ShoppingBasket, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { accessoryParts } from '@/core/fixing/accessories'
import type { FitClass, LayoutPlan, LockKind, MountKind } from '@/core/types'
import { ClipsCard, GlueCard, KeysCard, SideBySideCard, TabsCard } from '@/features/fixing/diagrams'
import { TileBackFigure } from '@/features/fixing/TileBackFigure'
import { useDesign } from '@/state/designStore'
import { peekAfterChoice, peekAndShowView } from '@/state/viewPeek'
import { announce, Button, buttonClassName, Segmented } from '@/ui'
import { ChoiceGroup, type Choice } from './ChoiceGroup'
import { Disclosure } from './Disclosure'
import { FIT_NAMES, FIT_ORDER, plateRaisedFrom, withFixings, type TileModels } from './edges'
import { EdgeRule, FieldGroup } from './FieldGroup'
import { explainMounting, JOIN_CARDS, SIDE_BY_SIDE, WALL_CARDS, type MountingCard } from './mountingCopy'
import styles from './studio.module.scss'
import { backHasPockets } from './tileBack'
import type { CellProps } from './types'

const WALL_SAMPLES: Record<string, ReactNode> = { glue: <GlueCard />, clips: <ClipsCard /> }
const JOIN_SAMPLES: Record<string, ReactNode> = { [SIDE_BY_SIDE]: <SideBySideCard />, keys: <KeysCard />, tabs: <TabsCard /> }

const toChoices = (cards: readonly MountingCard[], samples: Record<string, ReactNode>): Choice[] =>
  cards.map((card) => ({ value: card.value, name: card.name, figure: card.figure, note: card.note, sample: samples[card.value] }))

const WALL_OPTIONS = toChoices(WALL_CARDS, WALL_SAMPLES)
const JOIN_OPTIONS = toChoices(JOIN_CARDS, JOIN_SAMPLES)

const FIT_OPTIONS = FIT_ORDER.map((fit) => ({ value: fit, label: FIT_NAMES[fit] }))

/** One row of the well: a named eyebrow with its own mark, and what it says across the whole width. */
function Row({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.changesRow}>
      <dt className={styles.changesLabel}>
        {icon}
        {label}
      </dt>
      <dd className={styles.changesValue}>{children}</dd>
    </div>
  )
}

function Lines({ lines, ordered = false }: { lines: readonly string[]; ordered?: boolean }) {
  const items = lines.map((line) => <li key={line}>{line}</li>)
  return ordered ? <ol className={styles.changesList}>{items}</ol> : <ul className={styles.changesList}>{items}</ul>
}

export interface MountingGroupProps extends CellProps {
  plan: LayoutPlan
  /** Tile files with and without the tile-to-tile lock: what that lock costs in files. */
  models: TileModels
}

/**
 * Choice 7: how the wall goes up. Two questions answered with drawn cards (on the wall, tile to tile) and
 * under them the "What changes" well, read off the plans, so choosing keys or clips shows at once what it
 * cuts into the tiles, what it prints and what to buy. What contradicts the card just clicked, and what
 * this step changed in another one, are flagged at the top of the well; the way up and the trade-offs,
 * both read once, fold behind one lid.
 */
export function MountingGroup({ config, update, plan, models }: MountingGroupProps) {
  // The plate a keys or clips choice raised is read off the undo history, so undo and redo keep the note true.
  const previous = useDesign((s) => s.past.at(-1))
  const raisedFrom = plateRaisedFrom(previous, config)
  const accessories = useMemo(() => accessoryParts(config, plan), [config, plan])
  const explained = useMemo(
    () => explainMounting(config, plan, accessories, models, raisedFrom),
    [config, plan, accessories, models, raisedFrom],
  )

  // A card choice is said once the design it made is laid out: the summary is that design's, not this one's.
  const speak = useRef(false)
  useEffect(() => {
    if (!speak.current) return
    speak.current = false
    // After the page's own count of the files (its effect runs after this one): the choice's summary is the one heard.
    const timer = setTimeout(() => announce(explained.spoken), 0)
    return () => clearTimeout(timer)
  }, [explained])

  const choose = (patch: { mount?: MountKind; lock?: LockKind }, places: boolean) => {
    const next = withFixings(config, patch)
    speak.current = true
    update((design) => withFixings(design, patch))
    // Only a choice that cuts something into tile A turns the view over: glue and side by side have no back to show.
    if (places && backHasPockets(next, plan)) peekAfterChoice()
  }

  const { back, fit } = explained

  return (
    <FieldGroup step={7} title="Putting it up" now={explained.now}>
      <div className={styles.edgeSection}>
        <EdgeRule id="studio-mount-wall">On the wall</EdgeRule>
        <ChoiceGroup
          className={styles.mountList}
          aria-labelledby="studio-mount-wall"
          value={config.mount}
          options={WALL_OPTIONS}
          onChange={(value) => choose({ mount: value as MountKind }, value === 'clips')}
        />
      </div>

      <div className={styles.edgeSection}>
        <EdgeRule id="studio-mount-join">Tile to tile</EdgeRule>
        <ChoiceGroup
          className={styles.mountList}
          aria-labelledby="studio-mount-join"
          value={config.lock === 'none' ? SIDE_BY_SIDE : config.lock}
          options={JOIN_OPTIONS}
          onChange={(value) =>
            choose({ lock: value === SIDE_BY_SIDE ? 'none' : (value as LockKind) }, value !== SIDE_BY_SIDE)
          }
        />
      </div>

      <section className={styles.changes} aria-labelledby="studio-mount-changes">
        <h3 id="studio-mount-changes" className={styles.changesTitle}>
          What changes
        </h3>
        {/* The two lines a maker has to read now: the choice the wall placed nothing for, and the step it rewrote. */}
        {explained.warning && (
          <p className={styles.changesFlag} data-warn="">
            <TriangleAlert aria-hidden="true" width={16} height={16} />
            {explained.warning}
          </p>
        )}
        {explained.alsoChanged && (
          <p className={styles.changesFlag}>
            <Info aria-hidden="true" width={16} height={16} />
            {explained.alsoChanged}
          </p>
        )}
        <dl className={styles.changesRows}>
          {back && (
            <Row label="On your tiles" icon={<Box aria-hidden="true" width={14} height={14} />}>
              {/* A flat back draws an empty rectangle: the sentence says it, so nothing is drawn at all. */}
              {back.peek ? (
                <div className={styles.changesBack}>
                  <div className={styles.changesFigure}>
                    <TileBackFigure config={config} piece={back.piece} />
                  </div>
                  <div className={styles.changesBackText}>
                    <p className={styles.changesCaption}>{back.caption}</p>
                    <Button variant="secondary" size="sm" leadingIcon={<Eye />} onClick={peekAndShowView}>
                      {back.peek}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className={styles.changesNote}>{back.caption}</p>
              )}
            </Row>
          )}
          <Row label="You'll print" icon={<Printer aria-hidden="true" width={14} height={14} />}>
            <Lines lines={explained.print} />
          </Row>
          <Row label="You'll need" icon={<ShoppingBasket aria-hidden="true" width={14} height={14} />}>
            <Lines lines={explained.need} />
          </Row>
        </dl>

        <Disclosure className={styles.changesLid} label="How it goes up" badge={`${explained.steps.length} steps`}>
          <dl className={styles.changesRows}>
            <Row label="You'll do" icon={<ListOrdered aria-hidden="true" width={14} height={14} />}>
              <Lines lines={explained.steps} ordered />
            </Row>
            <Row label="Good to know" icon={<Lightbulb aria-hidden="true" width={14} height={14} />}>
              <Lines lines={explained.know} />
            </Row>
          </dl>
        </Disclosure>

        {fit && (
          <div className={styles.changesFit}>
            <div className={styles.changesFitRow}>
              <span className={styles.changesLabel}>
                <SlidersHorizontal aria-hidden="true" width={14} height={14} />
                Fit
              </span>
              <Segmented
                aria-label={fit.label}
                size="sm"
                value={config.fit}
                options={FIT_OPTIONS}
                onChange={(value: FitClass) => update((design) => ({ ...design, fit: value }))}
              />
              {/* The fit is a design field, set here; the page is where a maker finds out which fit to set. */}
              <Link to="/fit-test" className={buttonClassName('secondary', 'sm')}>
                <ClipboardCheck aria-hidden="true" width={16} height={16} />
                Run the fit test
              </Link>
            </div>
            <p className={styles.changesNote}>{fit.note}</p>
          </div>
        )}
      </section>
    </FieldGroup>
  )
}
