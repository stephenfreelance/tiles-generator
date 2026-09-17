// The front page runs Tessera instead of describing it: one wall, the visitor's own, photographed in
// the hero and then laid out, cut, rendered, recolored and packed in front of them. Every number below
// is a computeLayout result for that wall, so a reader who counts always finds the page agreeing with
// itself. The hero is a product photograph and the sections under it are the plates of a catalogue.
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useHref, useNavigate } from 'react-router'
import { studioIntent } from '@/app/prefetchStudio'
import { COLOR_PRESETS, parseHex } from '@/core/colors'
import { buildPlanModel, wallCutSides } from '@/core/plan/planModel'
import { PRINTERS } from '@/core/printers'
import { TEXTURES, textureById } from '@/core/textures/registry'
import { formatNumber, formatSize } from '@/core/units'
import { ColorStrip } from '@/features/landing/ColorStrip'
import { cornerDetail } from '@/features/landing/cornerDetail'
import { CutPlanPanel } from '@/features/landing/CutPlanPanel'
import { cutSidesText, fitLine } from '@/features/landing/fitLine'
import { HeroStage } from '@/features/landing/HeroStage'
import { JointProof } from '@/features/landing/JointProof'
import { KitStrip } from '@/features/landing/KitStrip'
import {
  EXAMPLE_WALLS,
  landingConfig,
  LANDING_DESIGN_START,
  LANDING_SPECIMENS,
} from '@/features/landing/landingDesign'
import { LandingMotion } from '@/features/landing/LandingMotion'
import { SpecimenStrip } from '@/features/landing/SpecimenStrip'
import { useLandingDesign } from '@/features/landing/useLandingDesign'
import { WallFields } from '@/features/landing/WallFields'
import { useDesign } from '@/state/designStore'
import { useHistory } from '@/state/historyStore'
import { Button, buttonClassName, Switch } from '@/ui'
import styles from './LandingPage.module.scss'

// Lazy, exactly as KitStrip loads it: the rolling count is below the fold on every viewport, and a
// second static import would drag the whole component into this chunk instead of its own.
const Odometer = lazy(async () => ({ default: (await import('@/features/landing/Odometer')).Odometer }))

/** Whole counts, grouped over a thousand, exactly as the fit line writes them. */
const count = (value: number): string => formatNumber(value, 0)

const plural = (value: number, noun: string): string => `${count(value)} ${noun}${value === 1 ? '' : 's'}`

/** The two documents that travel with every zip, whatever the wall. */
const EXTRA_FILES = 2

/**
 * How long the wall has to hold still before the fit line is announced, milliseconds. A stepper held
 * down fires an arrow every 40 ms or so, and a live region reads every one of them: this is the rest
 * that says the hand has stopped, short enough that a single press still announces at once.
 */
const SETTLE_MS = 500

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

// The printer answer is read off the table rather than typed, so adding a printer cannot make the
// page lie about the range it checks against.
const bedArea = (bed: { width: number; depth: number }) => bed.width * bed.depth
const SMALLEST_BED = PRINTERS.reduce((small, bed) => (bedArea(bed) < bedArea(small) ? bed : small))
const LARGEST_BED = PRINTERS.reduce((large, bed) => (bedArea(bed) > bedArea(large) ? bed : large))

const PLATE_FACTS = [
  'Tiles print face up, flat on the plate.',
  'The relief is a heightfield: no overhangs, so no supports.',
  '0.12 to 0.2 mm layers, 3 walls, 15 % infill.',
  'A brim helps the narrow cuts hold the plate.',
]

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
  if (!hasWorkInProgress) {
    return (
      <Link to={href} className={buttonClassName('primary', 'lg')} {...studioIntent}>
        {sized ? 'Open the wall you just sized' : 'Open this wall in the studio'}
      </Link>
    )
  }
  return (
    <>
      <Link to="/studio" className={buttonClassName('primary', 'lg')} {...studioIntent}>
        {`Continue “${shortName(savedName)}”`}
      </Link>
      <Link to={href} className={styles.quietLink} {...studioIntent}>
        {sized ? 'or open the wall you just sized' : 'or start a new design from this wall'}
      </Link>
    </>
  )
}

interface TallyProps {
  entries: readonly { label: string; value: number }[]
}

/** The wall read as four figures, set big: the catalogue's running head for the plates under it. */
function Tally({ entries }: TallyProps) {
  return (
    <dl className={styles.tally}>
      {entries.map((entry) => (
        // dt before dd, as the grammar of a description list wants it; the grid reads the figure first.
        <div key={entry.label} className={styles.tallyItem}>
          <dt className={styles.tallyLabel}>{entry.label}</dt>
          <dd className={styles.tallyValue}>
            {/* The figure itself is the fallback: a count is a fact before it is an animation. */}
            <Suspense fallback={<span>{entry.value}</span>}>
              <Odometer value={entry.value} />
            </Suspense>
          </dd>
        </div>
      ))}
    </dl>
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
  // The highlight the pointer or the keyboard is passing over, and the one a legend row pinned. The
  // pointer wins while it is on something, so clicking a row holds its piece lit after the hand moves on.
  const [pointedPieceId, setPointedPieceId] = useState<string | null>(null)
  const [pinnedPieceId, setPinnedPieceId] = useState<string | null>(null)
  const activePieceId = pointedPieceId ?? pinnedPieceId
  // The object, the accent and the fit line take every frame of a wheel drag. The 23 samples and the
  // kit chips are worker renders, so they follow the color only once the gesture behind it has settled.
  const [settledColor, setSettledColor] = useState(LANDING_DESIGN_START.color)

  const objectConfig = useMemo(
    () =>
      previewTextureId === null || previewTextureId === state.textureId
        ? config
        : landingConfig({ ...state, textureId: previewTextureId }),
    [config, previewTextureId, state],
  )
  // Identical to config between gestures, so the kit's chips stay the cache hits the corner detail made.
  const settledConfig = useMemo(() => ({ ...config, color: settledColor }), [config, settledColor])

  // The one sentence the hero says about the wall, and the copy of it that reaches assistive tech.
  const fit = fitLine(config, plan)
  const settledFit = useSettled(fit, SETTLE_MS)

  const detail = useMemo(() => cornerDetail(plan), [plan])
  const cutSides = useMemo(() => wallCutSides(buildPlanModel(config, plan)), [config, plan])

  // A color picked further down the page puts a pairing on the object that no key offers, and a typed
  // size matches no example: both read as nothing pressed rather than as the nearest thing.
  const specimenIndex = LANDING_SPECIMENS.findIndex(
    (specimen) => specimen.textureId === state.textureId && specimen.color === state.color,
  )
  const exampleIndex = EXAMPLE_WALLS.findIndex(
    (wall) => wall.widthMm === state.widthMm && wall.heightMm === state.heightMm,
  )

  const fileCount = plan.pieces.length + EXTRA_FILES
  const nudged = state.nudgedMm > 0
  // The wall as the page opened it is nobody's work: only a change to it earns the words "you sized".
  const sized = state.widthMm !== LANDING_DESIGN_START.widthMm || state.heightMm !== LANDING_DESIGN_START.heightMm

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

  const tally = [
    { label: plan.placements.length === 1 ? 'Tile on the wall' : 'Tiles on the wall', value: plan.placements.length },
    { label: 'Whole', value: plan.fullCount },
    { label: 'Cut to fit', value: plan.partialCount },
    { label: plan.pieces.length === 1 ? 'Model to print' : 'Models to print', value: plan.pieces.length },
  ]

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
              print-ready file for each kind. The relief runs on across every joint.
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
            {/* The promise in one line; the question under the download plate answers it in full. */}
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

        <section className={styles.section}>
          <header className={styles.plateHead}>
            <p className={styles.plateNo} aria-hidden="true">
              01
            </p>
            <div className={styles.plateTitle}>
              <h2 className={styles.heading}>Every cut continues the pattern</h2>
              <p className={styles.lede}>
                A tile size rarely divides a wall. Tessera cuts the edge pieces out of the full tile, so a cut piece
                carries exactly the slice of relief it replaces.
              </p>
            </div>
          </header>

          <Tally entries={tally} />

          {/* Where the cuts land. The counts are the stat row's job, so this sentence never repeats one. */}
          <p className={styles.cutLine}>
            {plan.exact
              ? 'Nothing to cut on this wall: the tiles run corner to corner.'
              : `On your wall the cuts fall along ${cutSidesText(cutSides)}.`}
          </p>

          <div className={styles.plates}>
            <CutPlanPanel config={config} plan={plan} activePieceId={activePieceId} onActivePiece={setPointedPieceId} />
            <figure className={styles.plate}>
              <figcaption className={styles.plateCaption}>
                <span className={styles.plateLabel}>The pieces side by side</span>
              </figcaption>
              <div className={styles.plateField}>
                <div className={styles.plateWall}>
                  <JointProof
                    config={config}
                    plan={detail}
                    label={`The corner of your wall as printed pieces: ${plural(detail.placements.length, 'tile')} laid where they go, ${plural(detail.pieces.length, 'model')} between them, with the relief running on across every joint.`}
                    activePieceId={activePieceId}
                    onActivePiece={setPointedPieceId}
                  />
                </div>
              </div>
              {/* The drawing beside this outlines those tiles; this says in words which ones are here. */}
              <p className={styles.plateFoot}>The corner outlined on the plan, as printed pieces.</p>
            </figure>
          </div>

          {/* Every mark, label, size and count is text here, so the cross-highlight is a shortcut and
              never the only way to read either drawing. */}
          <ul className={styles.legend}>
            {plan.pieces.map((piece) => (
              <li key={piece.id}>
                <button
                  type="button"
                  className={styles.legendRow}
                  data-cut={piece.kind !== 'full' || undefined}
                  data-active={piece.id === activePieceId || undefined}
                  aria-pressed={piece.id === pinnedPieceId}
                  onClick={() => setPinnedPieceId((was) => (was === piece.id ? null : piece.id))}
                  onPointerEnter={() => setPointedPieceId(piece.id)}
                  onPointerLeave={() => setPointedPieceId(null)}
                  onFocus={() => setPointedPieceId(piece.id)}
                  onBlur={() => setPointedPieceId(null)}
                >
                  <span className={styles.legendMark}>{piece.mark}</span>
                  <span className={styles.legendLabel}>{piece.label}</span>
                  <span className={styles.legendSize}>{formatSize(piece.width, piece.height)}</span>
                  <span className={styles.legendCount}>×{count(piece.count)}</span>
                </button>
              </li>
            ))}
          </ul>

          {(plan.exact || nudged) && (
            <div className={styles.nudge}>
              {/* The offer and what it did, with no figures in either: the stat row above holds those. */}
              <p className={styles.nudgeNote}>
                {nudged
                  ? 'One centimeter was all it took to put cuts on this wall.'
                  : 'This wall divides exactly. Add a centimeter to the width to watch Tessera make a cut.'}
              </p>
              <Button onClick={() => dispatch({ type: nudged ? 'unnudge' : 'nudge' })}>
                {nudged ? 'Back to an exact fit' : 'Add a centimeter'}
              </Button>
            </div>
          )}
        </section>

        <section className={styles.section}>
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

        <section className={styles.section}>
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

          {/* Two plates: what the zip holds, and the questions it raises. The print settings used to be a
              plate of their own, which cost a phone screen to say what one answer says here. */}
          <div className={styles.deliver}>
            <section className={styles.plate}>
              <div className={styles.plateCaption}>
                <h3 className={styles.plateLabel}>In the zip</h3>
                {/* The only place the page counts the files. */}
                <p className={styles.plateNote}>{plural(fileCount, 'file')}</p>
              </div>
              <div className={styles.plateField}>
                <KitStrip config={settledConfig} plan={plan} />
              </div>
              <p className={styles.plateFoot}>
                STL for any slicer, or STEP if you would rather edit the solid in CAD. Every file is named with its
                label, its size and how many copies to print.
              </p>
            </section>

            <section className={styles.plate}>
              <div className={styles.plateCaption}>
                <h3 className={styles.plateLabel}>Questions</h3>
              </div>
              <div className={styles.faq}>
                <details className={styles.question}>
                  <summary className={styles.questionHead}>Does anything leave my computer?</summary>
                  <p className={styles.answer}>
                    No. Your current design and your saved designs live in this browser&rsquo;s local storage, so
                    clearing this site&rsquo;s data clears them and another browser starts empty.
                  </p>
                </details>
                <details className={styles.question}>
                  <summary className={styles.questionHead}>How do they print?</summary>
                  <ul className={styles.facts}>
                    {PLATE_FACTS.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                  {/* What the files open in. Plain text: Tessera has no logos to show and no endorsement to claim. */}
                  <p className={styles.answer}>
                    They open in Bambu Studio, OrcaSlicer, PrusaSlicer, or anything else that reads STL.
                  </p>
                </details>
                <details className={styles.question}>
                  <summary className={styles.questionHead}>Will the tiles fit my printer?</summary>
                  <p className={styles.answer}>
                    Tessera knows {PRINTERS.length} printers, from a{' '}
                    {formatSize(SMALLEST_BED.width, SMALLEST_BED.depth)} bed up to{' '}
                    {formatSize(LARGEST_BED.width, LARGEST_BED.depth)}. Choose yours in the studio and it warns you
                    before a piece gets too big for it.
                  </p>
                </details>
                <details className={styles.question}>
                  <summary className={styles.questionHead}>Will the colors match my filament?</summary>
                  <p className={styles.answer}>
                    Not necessarily. The {COLOR_PRESETS.length} presets are Tessera&rsquo;s own names and hex values,
                    not a filament catalog, and a screen cannot promise what a spool will look like. Pick the color you
                    want the wall to be, then buy the PLA that comes closest.
                  </p>
                </details>
              </div>
            </section>
          </div>
        </section>

        <section className={styles.close}>
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
