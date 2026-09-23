// The numbered steps of a guide from core/fixing/guide.ts: the words come from there, the drawing beside
// each one from the shared fixing drawings. One list renders either guide (fitTestGuide on the fit-test
// page, mountingGuide on the download page), so a step's drawing is chosen in exactly one place and the
// compiler proves no GuideDrawing is left out.
//
// MountingGuide.tsx renders through this component too, hanging its "Run the fit test" link on the 'fit'
// step through `aside`, so the download page and this page number and draw their steps the same way.
import type { ReactNode } from 'react'
import { Wrench } from 'lucide-react'
import { usesClips, usesKeys, usesTabs, type FixingSystem, type GuideDrawing, type GuideStep } from '@/core/fixing/guide'
import {
  ClipWallDiagram,
  FitTestDiagram,
  GlueDiagram,
  KeysDiagram,
  ScrewDiagram,
  StartLineDiagram,
  TabsDiagram,
  TapeDiagram,
  TileBackDiagram,
} from './diagrams'
import styles from './GuideSteps.module.scss'

/**
 * The proportions each drawing is really drawn at, so the well beside a step takes the shape of what it
 * holds. One 4:3 box for all three shapes rendered the 76x100 wall sections at 70 px wide inside a 128 px
 * well, which left the press-on, screws and remove steps three indistinguishable slivers.
 */
const DRAWING_SHAPE: Record<GuideDrawing, 'wide' | 'section' | 'square'> = {
  'fit-test': 'wide',
  'fit-keys': 'wide',
  'fit-clips': 'wide',
  'clips-in': 'square',
  tape: 'wide',
  'start-line': 'wide',
  'press-on': 'section',
  screws: 'section',
  'keys-back': 'square',
  'keys-in': 'wide',
  'keys-as-you-go': 'wide',
  remove: 'section',
  'panel-up': 'section',
  'tabs-in': 'wide',
  'fit-tabs': 'wide',
}

function StepDrawing({ drawing, system }: { drawing: GuideDrawing; system: FixingSystem }) {
  const className = styles.drawingSvg
  switch (drawing) {
    case 'fit-test':
      // A tabbed wall prints no fastener at all, so its test is the coupon pair: the fit is in the tile.
      return usesTabs(system) && !usesKeys(system) && !usesClips(system) ? (
        <TabsDiagram className={className} coupons />
      ) : (
        <FitTestDiagram className={className} keys={usesKeys(system)} clips={usesClips(system)} />
      )
    // The two steps that read one fastener draw that fastener alone, whatever else the test holds.
    case 'fit-keys':
      return <FitTestDiagram className={className} keys clips={false} />
    case 'fit-clips':
      return <FitTestDiagram className={className} keys={false} clips />
    case 'clips-in':
      return <TileBackDiagram className={className} keys={system === 'both'} fitted="clips" lifted />
    case 'tape':
      return <TapeDiagram className={className} />
    case 'start-line':
      return <StartLineDiagram className={className} />
    case 'press-on':
      return <ClipWallDiagram className={className} show="press" />
    case 'screws':
      return <ScrewDiagram className={className} />
    case 'keys-back':
      return <TileBackDiagram className={className} clips={false} />
    case 'keys-in':
    case 'keys-as-you-go':
      return <KeysDiagram className={className} />
    case 'remove':
      return <ClipWallDiagram className={className} show="off" />
    case 'panel-up':
      return <GlueDiagram className={className} />
    // Nothing is printed for a tab, so both tab drawings are of the tiles themselves.
    case 'tabs-in':
      return <TabsDiagram className={className} />
    case 'fit-tabs':
      return <TabsDiagram className={className} coupons />
  }
}

export interface GuideStepsProps {
  steps: readonly GuideStep[]
  /** Which fasteners the guide is about: the 'fit-test' drawing shows only those. */
  system: FixingSystem
  /** What to have to hand beyond the printed parts, when there is anything. */
  needs?: string | null
  /** An extra node under one step's words, such as a link into another page. */
  aside?: (step: GuideStep) => ReactNode
  className?: string
}

/** The steps always sit under the section heading that names the guide, so each one is an h3. */

export function GuideSteps({ steps, system, needs, aside, className }: GuideStepsProps) {
  return (
    <div className={className}>
      {needs && (
        <div className={styles.needs}>
          <Wrench className={styles.needsIcon} aria-hidden="true" />
          <p className={styles.needsLabel}>You will need</p>
          <p className={styles.needsText}>{needs}</p>
        </div>
      )}
      {/* Safari drops the list role from a list without markers; the numbers are the point here. */}
      <ol className={styles.steps} role="list">
        {steps.map((step, index) => (
          <li key={step.key} className={styles.step}>
            {/* The number stands in a rail of its own, joined down the list by a spine, so a reader can
                see at a glance that these are one sequence and not eight separate cards. */}
            <span className={styles.stepNumber} aria-hidden="true">
              {index + 1}
            </span>
            <h3 className={styles.stepTitle}>{step.title}</h3>
            {step.drawing && (
              <div className={styles.drawing} data-shape={DRAWING_SHAPE[step.drawing]}>
                <StepDrawing drawing={step.drawing} system={system} />
              </div>
            )}
            <div className={styles.stepText}>
              {step.body.map((paragraph) => (
                <p key={paragraph} className={styles.stepBody}>
                  {paragraph}
                </p>
              ))}
              {aside?.(step)}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
