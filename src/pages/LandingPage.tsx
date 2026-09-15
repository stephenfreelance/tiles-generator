// The front page: the wall on a lit stage, then the proof that every cut continues the pattern.
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { studioIntent } from '@/app/prefetchStudio'
import { COLOR_PRESETS } from '@/core/colors'
import { buildPlanModel } from '@/core/plan/planModel'
import { TEXTURES, textureById } from '@/core/textures/registry'
import { formatSize } from '@/core/units'
import { ColorStrip } from '@/features/landing/ColorStrip'
import { CUT_DEMO, demoPlan, WALL_DEMO } from '@/features/landing/demo'
import { HeroStage } from '@/features/landing/HeroStage'
import { JointProof } from '@/features/landing/JointProof'
import { PlanFragment } from '@/features/landing/PlanFragment'
import { SpecimenStrip } from '@/features/landing/SpecimenStrip'
import { useHeroShow } from '@/features/landing/useHeroShow'
import { useDesign } from '@/state/designStore'
import { buttonClassName } from '@/ui'
import styles from './LandingPage.module.scss'

export function LandingPage() {
  const navigate = useNavigate()
  const config = useDesign((state) => state.config)
  const loadDesign = useDesign((state) => state.load)
  const show = useHeroShow()
  // The samples wear the color on show; only the color changes as the board turns, so a cached shade is re-tinted.
  const specimenBase = useMemo(() => ({ ...config, color: show.color }), [config, show.color])

  const cutPlan = useMemo(() => demoPlan(CUT_DEMO), [])
  const cutModel = useMemo(() => buildPlanModel(CUT_DEMO, cutPlan), [cutPlan])
  const wallPlan = useMemo(() => demoPlan(WALL_DEMO), [])
  const wallFiles = wallPlan.pieces.length + 2
  const lastMark = cutPlan.pieces[cutPlan.pieces.length - 1]?.mark ?? 'A'

  function startWithTexture(textureId: string) {
    const texture = textureById(textureId)
    // The studio opens in the color the page was showing, so it matches the sample that was picked.
    loadDesign({
      ...config,
      color: show.color,
      texture: {
        ...config.texture,
        id: texture.id,
        depth: texture.defaults.depth,
        scale: texture.defaults.scale,
        params: {},
      },
    })
    navigate('/studio')
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <h1 className={styles.headline}>Design 3D-printed tiles that fit your wall exactly</h1>
          <p className={styles.support}>
            Enter your wall and tile size, pick a relief and a color, and download print-ready STL or STEP files for
            your slicer: one per unique piece, edge cuts included, with the pattern running on across every joint.
          </p>
          <div className={styles.heroActions}>
            <Link to="/studio" className={buttonClassName('primary', 'lg')} {...studioIntent}>
              Start designing
            </Link>
            <Link to="/history" className={buttonClassName('secondary', 'lg')}>
              See your saved designs
            </Link>
          </div>
          <p className={styles.heroNote}>
            No account, nothing uploaded: the layout, the 3D view and the files are all made in this browser.
          </p>
        </div>
        <HeroStage index={show.index} color={show.color} onPickSample={show.pickSample} />
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2 className={styles.heading}>Every cut continues the pattern</h2>
          <p className={styles.lede}>
            A tile size rarely divides a wall. The pieces at the edges are cut from the full tile, so piece B carries
            exactly the slice of relief it replaces: lay it against its neighbour and the pattern keeps going. The
            tiling plan shows where every piece goes.
          </p>
        </header>
        <div className={styles.proof}>
          <figure className={styles.panel}>
            <figcaption className={styles.panelTitle}>
              Where the cuts fall
              <span className={styles.panelNote}> {formatSize(CUT_DEMO.surface.width, CUT_DEMO.surface.height)}</span>
            </figcaption>
            <div className={styles.planBody}>
              <PlanFragment
                model={cutModel}
                label={`Tiling plan of a ${formatSize(CUT_DEMO.surface.width, CUT_DEMO.surface.height)} wall: ${cutPlan.fullCount} whole tiles and ${cutPlan.partialCount} cut pieces labelled A to ${lastMark}, dimensioned along the bottom.`}
              />
            </div>
          </figure>
          <figure className={styles.panel}>
            <figcaption className={styles.panelTitle}>
              The pieces side by side
              <span className={styles.panelNote}> {cutPlan.pieces.length} models</span>
            </figcaption>
            <div className={styles.proofBody}>
              <JointProof
                config={CUT_DEMO}
                plan={cutPlan}
                label="The printed pieces laid in their wall positions: the relief runs on across the joints between the whole tile and the cuts."
              />
            </div>
          </figure>
        </div>
        <ul className={styles.legend}>
          {cutPlan.pieces.map((piece) => (
            <li key={piece.id} className={styles.legendRow} data-cut={piece.kind !== 'full' || undefined}>
              <span className={styles.legendMark}>{piece.mark}</span>
              <span className={styles.legendLabel}>{piece.label}</span>
              <span className={styles.legendSize}>{formatSize(piece.width, piece.height)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2 className={styles.heading}>{TEXTURES.length} patterns, all seamless</h2>
          <p className={styles.lede}>
            Every pattern repeats a whole number of times across a tile, so it meets itself at each joint whatever size
            you print. Pick one and the studio opens with it, in the color shown here.
          </p>
        </header>
        <SpecimenStrip base={specimenBase} onPick={startWithTexture} />

        <div>
          <h3 className={styles.subheading}>Color</h3>
          <p className={styles.note}>
            Start from one of these {COLOR_PRESETS.length} colors: pick one and the wall, the patterns and this page take
            it on, and the studio opens in it. In the studio you can pick any other on the color wheel or with a hex code,
            and the 3D preview shows your wall in it before you print a single tile.
          </p>
        </div>
        <ColorStrip color={show.color} onPick={show.pickColor} />
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2 className={styles.heading}>What you download</h2>
          <p className={styles.lede}>
            One model per unique piece, never one per tile. A{' '}
            {formatSize(WALL_DEMO.surface.width, WALL_DEMO.surface.height)} wall of{' '}
            {formatSize(WALL_DEMO.tile.width, WALL_DEMO.tile.height)} tiles takes {wallPlan.placements.length} tiles
            printed from {wallPlan.pieces.length} {wallPlan.pieces.length === 1 ? 'model' : 'models'}.
          </p>
        </header>
        <div className={styles.deliver}>
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>
              In the zip
              <span className={styles.panelNote}> {wallFiles} files</span>
            </h3>
            <ul className={styles.files}>
              {wallPlan.pieces.map((piece) => (
                <li key={piece.id}>
                  <span className={styles.fileWhat}>{piece.label}</span>
                  <span className={styles.fileCount}>{piece.count} to print</span>
                </li>
              ))}
              <li>
                <span className={styles.fileWhat}>A tiling plan</span>
                <span className={styles.fileCount}>Where every piece goes, dimensioned</span>
              </li>
              <li>
                <span className={styles.fileWhat}>A README</span>
                <span className={styles.fileCount}>Sizes, settings and print advice</span>
              </li>
            </ul>
            <p className={styles.note}>
              STL for any slicer, or STEP if you would rather edit the solid in CAD. Each file is named with its label,
              its size and how many copies to print.
            </p>
          </section>
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>On the plate</h3>
            <ul className={styles.facts}>
              <li>Tiles print face up, flat on the plate.</li>
              <li>The relief is a heightfield: no overhangs, so no supports.</li>
              <li>0.12 to 0.2 mm layers, 3 walls, 15 % infill.</li>
              <li>A brim helps the narrow cuts hold the plate.</li>
              <li>Tessera checks every piece against your printer bed before you print.</li>
            </ul>
          </section>
        </div>

        <div className={styles.close}>
          <h2 className={styles.closeHeading}>Measure the wall. Tessera works out the rest.</h2>
          <Link to="/studio" className={buttonClassName('primary', 'lg')} {...studioIntent}>
            Start designing
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>
          Tessera lays out, renders and writes every file in your browser. Nothing is uploaded; your current design and
          your saved designs live in this browser&rsquo;s local storage.
        </p>
        <p className={styles.footerLinks}>
          <Link to="/studio">Studio</Link>
          <Link to="/download">Download</Link>
          <Link to="/history">Saved designs</Link>
        </p>
      </footer>
    </div>
  )
}
