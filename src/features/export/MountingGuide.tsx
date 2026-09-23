// "Putting it up": the numbered way from a printed kit to a finished wall, each step drawn with the
// shared fixing drawings and worded with the design's own numbers (core/fixing/guide.ts writes the words,
// the same ones the README in the zip numbers). The steps render through GuideSteps, which the fit-test
// page uses too, so a step's drawing is chosen in exactly one place.
import { useId } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Link } from 'react-router'
import { studioIntent } from '@/app/prefetchStudio'
import type { GuideStep, MountingGuide as Guide } from '@/core/fixing/guide'
import { GlueDiagram } from '@/features/fixing/diagrams'
import { GuideSteps } from '@/features/fixing/GuideSteps'
import { buttonClassName } from '@/ui'
import styles from './MountingGuide.module.scss'

/** The step that says which fit these files were made at: the one with a page of its own to offer. */
const FIT_STEP_KEY = 'fit'

export interface MountingGuideProps {
  guide: Guide
}

/** The way in for a maker who got here without trying the fit: the page itself, not a second telling of it. */
function fitTestLink(step: GuideStep) {
  if (step.key !== FIT_STEP_KEY) return null
  return (
    <div>
      <Link to="/fit-test" className={buttonClassName('secondary', 'sm')}>
        <ClipboardCheck aria-hidden="true" width={16} height={16} />
        Run the fit test
      </Link>
    </div>
  )
}

export function MountingGuide({ guide }: MountingGuideProps) {
  const titleId = useId()
  return (
    <section className={styles.root} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          Putting it up
        </h2>
        {guide.steps.length > 0 && <p className={styles.lede}>{guide.lede}</p>}
      </div>

      {guide.steps.length > 0 ? (
        // The needs strip belongs to the step list, so the fit-test page's guide gets the same one.
        <GuideSteps steps={guide.steps} system={guide.system} needs={guide.needs} aside={fitTestLink} />
      ) : (
        <div className={styles.glue}>
          <div className={styles.drawing}>
            <GlueDiagram className={styles.drawingSvg} />
          </div>
          <div className={styles.glueText}>
            <p className={styles.lede}>{guide.lede}</p>
            <p className={styles.glueNote}>
              Want tiles that pull off one at a time, or locked edge to edge with even joints? Wall clips and keys are
              in the studio, under Putting it up.{' '}
              <Link to="/studio" className={styles.link} {...studioIntent}>
                Open the studio
              </Link>
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
