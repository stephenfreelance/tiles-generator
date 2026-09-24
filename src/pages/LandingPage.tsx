// The front page runs Tessera instead of describing it: one wall, the visitor's own, photographed in
// the hero and then rendered, recolored and packed in front of them. Every number the page gives is a
// computeLayout result for that wall, so a reader who counts always finds it agreeing with itself; the
// one exception is section 01, which explains the cuts on a fixed wall that always has some. The hero
// is a product photograph and the sections under it are the plates of a catalogue: how it cuts, the
// patterns, the download and how the tiles go up, then the questions and the close.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useHref, useNavigate } from 'react-router'
import { track } from '@/app/analytics'
import { studioIntent } from '@/app/prefetchStudio'
import { parseHex } from '@/core/colors'
import { TEXTURES, textureById } from '@/core/textures/registry'
import { formatNumber } from '@/core/units'
import { ColorStrip } from '@/features/landing/ColorStrip'
import { cornerDetail } from '@/features/landing/cornerDetail'
import { CutSteps } from '@/features/landing/CutConcept'
import { fitLine } from '@/features/landing/fitLine'
import { FixingSystems } from '@/features/landing/FixingSystems'
import { HeroStage } from '@/features/landing/HeroStage'
import { JointProof } from '@/features/landing/JointProof'
import { zipFileNames } from '@/features/landing/kit'
import { KitStrip } from '@/features/landing/KitStrip'
import {
  conceptConfig,
  EXAMPLE_WALLS,
  landingConfig,
  LANDING_DESIGN_START,
  LANDING_SPECIMENS,
} from '@/features/landing/landingDesign'
import { LandingMotion } from '@/features/landing/LandingMotion'
import { Questions } from '@/features/landing/Questions'
import { SpecimenStrip } from '@/features/landing/SpecimenStrip'
import { useLandingDesign } from '@/features/landing/useLandingDesign'
import { WallFields } from '@/features/landing/WallFields'
import { useLayout } from '@/hooks'
import { useDesign } from '@/state/designStore'
import { useHistory } from '@/state/historyStore'
import { buttonClassName, Switch } from '@/ui'
import { cx } from '@/ui/cx'
import styles from './LandingPage.module.scss'

/** Whole counts, grouped over a thousand, exactly as the fit line writes them. */
const count = (value: number): string => formatNumber(value, 0)

const plural = (value: number, noun: string): string => `${count(value)} ${noun}${value === 1 ? '' : 's'}`

/**
 * How long the wall has to hold still before the fit line is announced, milliseconds. A stepper held
 * down fires an arrow every 40 ms or so, and a live region reads every one of them: this is the rest
 * that says the hand has stopped, short enough that a single press still announces at once.
 */
const SETTLE_MS = 500

/** How far up the window a band's top edge has to come before the lamp over it is raised. */
const REACH_FRACTION = 0.88

/**
 * True from the moment a band has been reached, and true forever after. The light it raises and the
 * plates it lays in are both decoration over content that is already on the page (the plates start
 * lower and fainter, never hidden), so the worst a missed trigger can do is leave a lamp off, and
 * reduced motion never asks the question at all.
 *
 * Measured against the window on arrival and on every scroll until it fires: a jump (a restored scroll
 * position, find-in-page, the skip link) can carry a band past an IntersectionObserver without one
 * callback, so the observer here only says that something moved and the rect is what answers. The top
 * edge alone is read, never the bottom, so a band that was scrolled straight past counts as reached
 * rather than waiting to be scrolled back to.
 */
function useReached<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [reached, setReached] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (reached || !element) return
    const check = () => {
      if (element.getBoundingClientRect().top < window.innerHeight * REACH_FRACTION) setReached(true)
    }
    check()
    const observer = new IntersectionObserver(check)
    observer.observe(element)
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check, { passive: true })
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [reached])

  return [ref, reached] as const
}

/** The value once it has stopped changing for `delayMs`: the trailing edge of a burst, never the whole burst. */
function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return settled
}

/** A design name is the maker's own words, up to 80 of them: a button shows enough to recognize it by. */
const NAME_CAP = 32
const shortName = (name: string): string =>
  name.length > NAME_CAP ? `${name.slice(0, NAME_CAP - 1).trimEnd()}…` : name

interface OpenActionsProps {
  /** The wall this page has built, as "/studio?d=...". Router-relative: Link adds the base. */
  href: string
  /** True when this browser already holds a design of its own. */
  hasWorkInProgress: boolean
  /** What that design is called, so "continue" says what it would open. */
  savedName: string
  /** True once the visitor has actually changed the wall: nothing else makes "just sized" honest. */
  sized: boolean
}

/**
 * The invitation, written twice on the page from one rule: a browser with work in it keeps that work
 * as the primary action (this page has no business overwriting a design it did not make), and neither
 * label claims a wall the visitor has not sized yet.
 */
function OpenActions({ href, hasWorkInProgress, savedName, sized }: OpenActionsProps) {
  const start = () => track('home-start')
  if (!hasWorkInProgress) {
    return (
      <Link to={href} className={buttonClassName('primary', 'lg')} onClick={start} {...studioIntent}>
        {sized ? 'Open the wall you just sized' : 'Open this wall in the studio'}
      </Link>
    )
  }
  return (
    <>
      <Link to="/studio" className={buttonClassName('primary', 'lg')} onClick={() => track('home-continue')} {...studioIntent}>
        {`Continue “${shortName(savedName)}”`}
      </Link>
      <Link to={href} className={styles.quietLink} onClick={start} {...studioIntent}>
        {sized ? 'or open the wall you just sized' : 'or start a new design from this wall'}
      </Link>
    </>
  )
}

export function LandingPage() {
  const navigate = useNavigate()
  const { state, config, plan, color, dispatch, studioHref, hasWorkInProgress } = useLandingDesign()
  const savedCount = useHistory((store) => store.entries.length)
  // Read once at mount, as the hook reads hasWorkInProgress: the page names the saved design without
  // ever subscribing to a design it must not touch.
  const [savedName] = useState(() => useDesign.getState().config.name)
  // A real file in public/, so it leaves the router and has to carry the build's base.
  const noticesHref = useHref('/THIRD-PARTY-NOTICES.txt')

  // A rest on a hero key lays that relief on the object without committing it, so it never reaches the
  // samples, the kit or the studio link: only the object reads this.
  const [previewTextureId, setPreviewTextureId] = useState<string | null>(null)
  const [showJoints, setShowJoints] = useState(false)
  // The object, the accent and the fit line take every frame of a wheel drag. The 23 samples and the
  // kit chips are worker renders, so they follow the color only once the gesture behind it has settled.
  const [settledColor, setSettledColor] = useState(LANDING_DESIGN_START.color)
  // One per band, so each turns its own light on as it is read rather than the page lighting at once.
  const [cutsRef, cutsLit] = useReached<HTMLElement>()
  const [patternsRef, patternsLit] = useReached<HTMLElement>()
  const [deliverRef, deliverLit] = useReached<HTMLElement>()
  const [fixingRef, fixingLit] = useReached<HTMLElement>()
  const [questionsRef, questionsLit] = useReached<HTMLElement>()
  const [closeRef, closeLit] = useReached<HTMLElement>()

  const objectConfig = useMemo(
    () =>
      previewTextureId === null || previewTextureId === state.textureId
        ? config
        : landingConfig({ ...state, textureId: previewTextureId }),
    [config, previewTextureId, state],
  )
  // Identical to config between gestures, so the kit's chips stay the cache hits the hero wall made.
  const settledConfig = useMemo(() => ({ ...config, color: settledColor }), [config, settledColor])
  // Section 01's wall: always the starting one, in the visitor's relief and settled color. Untouched,
  // it is the very design above, so its corner costs the worker nothing.
  const concept = useMemo(
    () => conceptConfig({ ...LANDING_DESIGN_START, textureId: state.textureId, color: settledColor }),
    [state.textureId, settledColor],
  )
  const conceptPlan = useLayout(concept)
  const detail = useMemo(() => cornerDetail(conceptPlan), [conceptPlan])

  // The one sentence the hero says about the wall, and the copy of it that reaches assistive tech.
  const fit = fitLine(config, plan)
  const settledFit = useSettled(fit, SETTLE_MS)

  // A color picked further down the page puts a pairing on the object that no key offers, and a typed
  // size matches no example: both read as nothing pressed rather than as the nearest thing.
  const specimenIndex = LANDING_SPECIMENS.findIndex(
    (specimen) => specimen.textureId === state.textureId && specimen.color === state.color,
  )
  const exampleIndex = EXAMPLE_WALLS.findIndex(
    (wall) => wall.widthMm === state.widthMm && wall.heightMm === state.heightMm,
  )

  const fileCount = zipFileNames(plan).length
  // The wall as the page opened it is nobody's work: only a change to it earns the words "you sized".
  const sized = state.widthMm !== LANDING_DESIGN_START.widthMm || state.heightMm !== LANDING_DESIGN_START.heightMm
  useEffect(() => {
    if (sized) track('home-sized', { once: true })
  }, [sized])

  const setWall = useCallback((next: { widthMm?: number; heightMm?: number }) => dispatch({ type: 'wall', ...next }), [dispatch])
  const setExample = useCallback((index: number) => dispatch({ type: 'example', index }), [dispatch])
  const pickSpecimen = useCallback(
    (index: number) => {
      dispatch({ type: 'specimen', index })
      // A key is a relief and a color in one press, and a press has nothing left to settle.
      if (Number.isInteger(index) && index >= 0 && index < LANDING_SPECIMENS.length) {
        setSettledColor(LANDING_SPECIMENS[index].color)
      }
    },
    [dispatch],
  )
  const pickColor = useCallback((hex: string) => dispatch({ type: 'color', hex }), [dispatch])
  // Guarded exactly as the reducer guards a color: anything unreadable leaves the settled one alone.
  const settleColor = useCallback((hex: string) => {
    const parsed = parseHex(hex)
    if (parsed !== null) setSettledColor(parsed)
  }, [])

  // Browsing a pattern opens the studio with it, on this wall and in this color, through the link the
  // page already builds. Nothing is written to the maker's own design on the way.
  const openTexture = useCallback(
    (textureId: string) => {
      const texture = textureById(textureId)
      track('home-texture')
      navigate(
        studioHref({
          texture: {
            ...config.texture,
            id: texture.id,
            depth: texture.defaults.depth,
            scale: texture.defaults.scale,
            params: {},
          },
        }),
      )
    },
    [config.texture, navigate, studioHref],
  )

  // The studio link under section 01 follows the same rule as the invitation: a browser with a design
  // of its own opens that design, and only a fresh one starts from the wall sized here.
  const studioLink = hasWorkInProgress ? '/studio' : studioHref()

  return (
    <LandingMotion>
      <div className={styles.page}>
        <section className={styles.hero}>
          {/* The words come first in the DOM, as they come first on the page: the object is placed by
              the grid and never stands between the headline and the controls in the tab order. */}
          <div className={styles.heroLede}>
            {/* The product's own promise, word for word, because this string is also the tab title and
                the share card's: fit, never coverage. "Design" leads on its own beat, so the rest stays
                one phrase and never breaks inside "3D-printed" in the narrow column the object leaves. */}
            <h1 className={styles.headline}>
              Design <span className={styles.headlineTail}>3D-printed tiles that fit your wall exactly</span>
            </h1>
            <p className={styles.support}>
              Give Tessera your wall and it works out the tiling: the whole tiles, the cut pieces at the edges, and one
              print-ready file for each kind.
            </p>
            <div className={styles.heroActions}>
              <OpenActions href={studioHref()} hasWorkInProgress={hasWorkInProgress} savedName={savedName} sized={sized} />
              {/* A first-time visitor is never sent to an empty register. */}
              {savedCount > 0 && (
                <Link to="/history" className={buttonClassName('secondary', 'lg')}>
                  See your saved designs ({count(savedCount)})
                </Link>
              )}
            </div>
          </div>

          {/* The caption to the photograph: the measurements it was taken at, and what they came to. */}
          <div className={styles.heroCaption}>
            <WallFields
              widthMm={state.widthMm}
              heightMm={state.heightMm}
              onWall={setWall}
              onExample={setExample}
              exampleIndex={exampleIndex}
            />
            {/* One sentence, written twice. The copy on the page changes on the keystroke, because the
                answer to what was just typed cannot lag behind it. The copy in the accessibility tree
                waits for the hand to come off the stepper, so holding an arrow queues one announcement
                instead of forty. Only the second is exposed, so nothing is read out twice. */}
            <p className={styles.fit} aria-hidden="true">
              {fit}
            </p>
            <p className="visually-hidden" aria-live="polite">
              {settledFit}
            </p>
            {/* The promise in one line; the Questions band answers it in full. */}
            <p className={styles.fact}>No account, nothing uploaded: it all happens in this browser.</p>
          </div>

          <div className={styles.heroObject}>
            <HeroStage
              config={objectConfig}
              plan={plan}
              specimenIndex={specimenIndex}
              onPickSpecimen={pickSpecimen}
              onPreviewTexture={setPreviewTextureId}
            />
          </div>
        </section>

        <section className={styles.section} ref={cutsRef} data-lit={cutsLit ? '' : undefined}>
          <header className={styles.plateHead}>
            <p className={styles.plateNo} aria-hidden="true">
              01
            </p>
            <div className={styles.plateTitle}>
              <h2 className={styles.heading}>Every cut continues the pattern</h2>
              <p className={styles.lede}>
                Walls are rarely a whole number of tiles. Tessera fills yours with whole tiles, then cuts the pieces that
                finish each edge out of a whole tile, so the relief carries straight on across every joint.
              </p>
            </div>
          </header>

          <CutSteps />

          {/* One proof, on a wall that always has cuts, in the visitor's own relief and color. The plan
              of their own wall is the studio's job, so the page points there instead of drawing it. */}
          <div className={styles.proof}>
            <figure className={styles.proofFigure}>
              <div className={styles.plateWall}>
                <JointProof
                  config={concept}
                  plan={detail}
                  label={`The corner of a wall as ${plural(detail.placements.length, 'printed piece')}, ${count(detail.partialCount)} of them cut, laid where they go, with the relief running on across every joint.`}
                />
              </div>
              <figcaption className={styles.plateFoot}>
                The corner of a wall as {plural(detail.placements.length, 'printed piece')}: {count(detail.partialCount)}{' '}
                of them cut, and one pattern running through all of them.
              </figcaption>
            </figure>
            <div className={styles.studioNote}>
              <p className={styles.studioText}>
                Size your own wall in the studio and it draws the whole plan: every piece lettered, its size, how many to
                print and where to start.
              </p>
              <Link to={studioLink} className={buttonClassName('secondary', 'md')} {...studioIntent}>
                Open the studio
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.section} ref={patternsRef} data-lit={patternsLit ? '' : undefined}>
          <header className={styles.plateHead}>
            <p className={styles.plateNo} aria-hidden="true">
              02
            </p>
            <div className={styles.plateTitle}>
              <h2 className={styles.heading}>{TEXTURES.length} patterns, all seamless</h2>
              <p className={styles.lede}>
                Every pattern repeats a whole number of times across a tile, so it meets itself at every joint whatever
                size you print.
              </p>
            </div>
          </header>

          <Switch
            className={styles.joints}
            label="Show the tile joints"
            description="Draws each sample as four tiles, so you can watch the relief cross the joints."
            checked={showJoints}
            onCheckedChange={setShowJoints}
          />
          <SpecimenStrip base={settledConfig} showJoints={showJoints} onPick={openTexture} />

          <div className={styles.colorHead}>
            <h3 className={styles.subheading}>Color</h3>
            <p className={styles.note}>Pick a color and the wall, the samples and this page take it on.</p>
          </div>
          {/* The hook's own color, not config's: the pressed swatch and the accent land in the same paint. */}
          <ColorStrip color={color} onPick={pickColor} onPickEnd={settleColor} />
        </section>

        <section className={styles.section} ref={deliverRef} data-lit={deliverLit ? '' : undefined}>
          <header className={styles.plateHead}>
            <p className={styles.plateNo} aria-hidden="true">
              03
            </p>
            <div className={styles.plateTitle}>
              <h2 className={styles.heading}>What you download</h2>
              {/* The argument, not the arithmetic: the plate below is the one place the files are counted. */}
              <p className={styles.lede}>
                One model per unique piece, never one per tile: a wider wall means more copies, not more models.
              </p>
            </div>
          </header>

          {/* One plate, the width of the page: the parts on the bench, each with the file it prints from. */}
          <section className={styles.plate}>
            <div className={styles.plateCaption}>
              <h3 className={styles.plateLabel}>In the zip</h3>
              {/* The only place the page counts the files. */}
              <p className={styles.plateNote}>{plural(fileCount, 'file')}</p>
            </div>
            <KitStrip config={settledConfig} plan={plan} />
            <div className={styles.kitFoot}>
              <p>
                STL for any slicer, or STEP to edit the solid in CAD. Every file is named with its label, its size and
                how many copies to print.
              </p>
              <p>
                Choose keys or wall clips in the studio and the zip also holds their parts. The fit test is not in it:
                it prints from a page of its own, before you commit to a wall's worth.
              </p>
            </div>
          </section>
        </section>

        <section className={styles.section} ref={fixingRef} data-lit={fixingLit ? '' : undefined}>
          <header className={styles.plateHead}>
            <p className={styles.plateNo} aria-hidden="true">
              04
            </p>
            <div className={styles.plateTitle}>
              <h2 className={styles.heading}>Glue it, lock it, or clip it on</h2>
              <p className={styles.lede}>
                Printed tiles go up like any others, with tile adhesive or mounting tape. Three optional systems, built
                into the same files, go further: two lock the tiles to each other, one holds them to the wall, and a lock
                works with the clips.
              </p>
            </div>
          </header>

          <FixingSystems />
        </section>

        {/* The questions the whole page raises, in a band of their own: no number, because they are not
            a step in how a wall is made. */}
        <section className={styles.section} ref={questionsRef} data-lit={questionsLit ? '' : undefined}>
          <header className={cx(styles.plateHead, styles.plateHeadBare)}>
            <div className={styles.plateTitle}>
              <h2 className={styles.heading}>Questions</h2>
            </div>
          </header>
          <Questions />
        </section>

        <section className={styles.close} ref={closeRef} data-lit={closeLit ? '' : undefined}>
          <h2 className={styles.closeHeading}>
            Measure the wall. <span className={styles.closeTail}>Tessera works out the rest.</span>
          </h2>
          <OpenActions href={studioHref()} hasWorkInProgress={hasWorkInProgress} savedName={savedName} sized={sized} />
        </section>

        {/* The page's one contentinfo landmark. The role is written out because this footer is inside
            the shell's <main>, where a <footer> element carries no landmark role of its own, and the
            shell has no footer of its own for it to duplicate. */}
        <footer className={styles.footer} role="contentinfo">
          <p className={styles.footerLinks}>
            <Link to="/studio">Studio</Link>
            <Link to="/download">Download</Link>
            <Link to="/history">Saved designs</Link>
            {/* Leaves the router: a plain file served beside the app, under whatever base it was built for. */}
            <a href={noticesHref}>Third-party notices</a>
          </p>
        </footer>
      </div>
    </LandingMotion>
  )
}
