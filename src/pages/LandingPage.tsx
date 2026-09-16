// The front page runs Tessera instead of describing it: one wall, the visitor's own, sized in the
// hero and then laid out, cut, rendered, recolored and packed in front of them. Every number below is
// a computeLayout result for that wall, so a reader who counts always finds the page agreeing with itself.
import { useCallback, useMemo, useState } from 'react'
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

/** Whole counts, grouped over a thousand, exactly as the fit line writes them. */
const count = (value: number): string => formatNumber(value, 0)

const plural = (value: number, noun: string): string => `${count(value)} ${noun}${value === 1 ? '' : 's'}`

/** The two documents that travel with every zip, whatever the wall. */
const EXTRA_FILES = 2

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
  'Tessera checks every piece against your printer bed before you print.',
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

export function LandingPage() {
  const navigate = useNavigate()
  const { state, config, plan, color, dispatch, studioHref, hasWorkInProgress } = useLandingDesign()
  const savedCount = useHistory((store) => store.entries.length)
  // Read once at mount, as the hook reads hasWorkInProgress: the page names the saved design without
  // ever subscribing to a design it must not touch.
  const [savedName] = useState(() => useDesign.getState().config.name)
  // A real file in public/, so it leaves the router and has to carry the build's base.
  const noticesHref = useHref('/THIRD-PARTY-NOTICES.txt')

  // A rest on a hero key lays that relief on the board without committing it, so it never reaches the
  // samples, the kit or the studio link: only the board reads this.
  const [previewTextureId, setPreviewTextureId] = useState<string | null>(null)
  const [showJoints, setShowJoints] = useState(false)
  // The highlight the pointer or the keyboard is passing over, and the one a legend row pinned. The
  // pointer wins while it is on something, so clicking a row holds its piece lit after the hand moves on.
  const [pointedPieceId, setPointedPieceId] = useState<string | null>(null)
  const [pinnedPieceId, setPinnedPieceId] = useState<string | null>(null)
  const activePieceId = pointedPieceId ?? pinnedPieceId
  // The board, the accent and the fit line take every frame of a wheel drag. The 23 samples and the kit
  // chips are worker renders, so they follow the color only once the gesture behind it has settled.
  const [settledColor, setSettledColor] = useState(LANDING_DESIGN_START.color)

  const boardConfig = useMemo(
    () =>
      previewTextureId === null || previewTextureId === state.textureId
        ? config
        : landingConfig({ ...state, textureId: previewTextureId }),
    [config, previewTextureId, state],
  )
  // Identical to config between gestures, so the kit's chips stay the cache hits the corner detail made.
  const settledConfig = useMemo(() => ({ ...config, color: settledColor }), [config, settledColor])

  const detail = useMemo(() => cornerDetail(plan), [plan])
  const cutSides = useMemo(() => wallCutSides(buildPlanModel(config, plan)), [config, plan])

  // A color picked further down the page puts a pairing on the board that no key offers, and a typed
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

  return (
    <LandingMotion>
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <h1 className={styles.headline}>Design 3D-printed tiles that fit your wall exactly</h1>
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

          {/* The fields follow the actions in the DOM as they follow them down the left column, so no
              focus order crosses the board to get from one to the other; the areas do the placing. */}
          <div className={styles.heroWall}>
            <WallFields
              widthMm={state.widthMm}
              heightMm={state.heightMm}
              onWall={setWall}
              onExample={setExample}
              exampleIndex={exampleIndex}
            />
            {/* Shown and announced: hiding the answer in a live region only is backwards for scanning. */}
            <p className={styles.fit} aria-live="polite">
              {fitLine(config, plan)}
            </p>
            <p className={styles.fact}>
              No account. Nothing uploaded. The layout, the 3D view and the files are all made in this browser.
            </p>
          </div>

          <div className={styles.heroBoard}>
            <HeroStage
              config={boardConfig}
              plan={plan}
              specimenIndex={specimenIndex}
              onPickSpecimen={pickSpecimen}
              onPreviewTexture={setPreviewTextureId}
            />
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h2 className={styles.heading}>Every cut continues the pattern</h2>
            <p className={styles.lede}>
              A tile size rarely divides a wall. Tessera cuts the edge pieces out of the full tile, so a cut piece
              carries exactly the slice of relief it replaces. Set it against its neighbor and the pattern keeps going.
            </p>
            <p className={styles.cutLine}>
              {plan.exact
                ? `Nothing to cut on this wall: ${plural(plan.placements.length, 'whole tile')}, corner to corner.`
                : `On your wall the cuts fall along ${cutSidesText(cutSides)}: ${plural(plan.partialCount, 'piece')}.`}
            </p>
          </header>

          <div className={styles.proof}>
            <CutPlanPanel config={config} plan={plan} activePieceId={activePieceId} onActivePiece={setPointedPieceId} />
            <figure className={styles.panel}>
              <figcaption className={styles.panelTitle}>
                The pieces side by side
                <span className={styles.panelNote}>{plural(plan.pieces.length, 'model')}</span>
              </figcaption>
              {/* The drawing outlines those tiles; this says in words which ones are standing here. */}
              <p className={styles.note}>The corner outlined on the plan, as printed pieces.</p>
              <div className={styles.proofBody}>
                <div className={styles.proofWall}>
                  <JointProof
                    config={config}
                    plan={detail}
                    label={`The corner of your wall as printed pieces: ${plural(detail.placements.length, 'tile')} laid where they go, ${plural(detail.pieces.length, 'model')} between them, with the relief running on across every joint.`}
                    activePieceId={activePieceId}
                    onActivePiece={setPointedPieceId}
                  />
                </div>
              </div>
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
              <p className={styles.nudgeNote}>
                {nudged
                  ? `One centimeter turned ${plural(plan.fullCount, 'whole tile')} into a wall with cuts.`
                  : 'This wall divides exactly: every tile is whole, one model to print. Add a centimeter to the width to watch Tessera make a cut.'}
              </p>
              <Button onClick={() => dispatch({ type: nudged ? 'unnudge' : 'nudge' })}>
                {nudged ? 'Back to an exact fit' : 'Add a centimeter'}
              </Button>
            </div>
          )}
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h2 className={styles.heading}>{TEXTURES.length} patterns, all seamless</h2>
            <p className={styles.lede}>
              Every pattern repeats a whole number of times across a tile, so it meets itself at every joint whatever
              size you print.
            </p>
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
          <header className={styles.sectionHead}>
            <h2 className={styles.heading}>What you download</h2>
            <p className={styles.lede}>
              One model per unique piece, never one per tile. Your wall is {plural(plan.placements.length, 'tile')}{' '}
              printed from {plural(plan.pieces.length, 'model')}, so the zip holds {plural(fileCount, 'file')}.
            </p>
          </header>

          <div className={styles.deliver}>
            <section className={styles.panel}>
              <h3 className={styles.panelTitle}>
                In the zip
                <span className={styles.panelNote}>{plural(fileCount, 'file')}</span>
              </h3>
              <KitStrip config={settledConfig} plan={plan} />
              <p className={styles.note}>
                STL for any slicer, or STEP if you would rather edit the solid in CAD. Every file is named with its
                label, its size and how many copies to print.
              </p>
            </section>

            <section className={styles.panel}>
              <h3 className={styles.panelTitle}>On the plate</h3>
              <ul className={styles.facts}>
                {PLATE_FACTS.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
              {/* What the files open in. Plain text: Tessera has no logos to show and no endorsement to claim. */}
              <p className={styles.compat}>
                Opens in Bambu Studio, OrcaSlicer, PrusaSlicer, or anything else that reads STL.
              </p>
            </section>
          </div>

          <div className={styles.faq}>
            <details className={styles.question}>
              <summary className={styles.questionHead}>Does anything leave my computer?</summary>
              <p className={styles.answer}>
                No. Your current design and your saved designs live in this browser&rsquo;s local storage, so clearing
                this site&rsquo;s data clears them and another browser starts empty.
              </p>
            </details>
            <details className={styles.question}>
              <summary className={styles.questionHead}>Will the tiles fit my printer?</summary>
              <p className={styles.answer}>
                Tessera knows {PRINTERS.length} printers, from a {formatSize(SMALLEST_BED.width, SMALLEST_BED.depth)}{' '}
                bed up to {formatSize(LARGEST_BED.width, LARGEST_BED.depth)}. Choose yours in the studio and it warns
                you before a piece gets too big for it.
              </p>
            </details>
            <details className={styles.question}>
              <summary className={styles.questionHead}>Will the colors match my filament?</summary>
              <p className={styles.answer}>
                Not necessarily. The {COLOR_PRESETS.length} presets are Tessera&rsquo;s own names and hex values, not a
                filament catalog, and a screen cannot promise what a spool will look like. Pick the color you want the
                wall to be, then buy the PLA that comes closest.
              </p>
            </details>
          </div>
        </section>

        <section className={styles.close}>
          <h2 className={styles.closeHeading}>
            Measure the wall. <span className={styles.closeTail}>Tessera works out the rest.</span>
          </h2>
          <OpenActions href={studioHref()} hasWorkInProgress={hasWorkInProgress} savedName={savedName} sized={sized} />
        </section>

        <footer className={styles.footer}>
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
