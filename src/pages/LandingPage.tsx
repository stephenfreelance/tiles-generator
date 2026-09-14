// The front page: the wall on a lit stage, then the proof that every cut continues the pattern.
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { studioIntent } from '@/app/prefetchStudio'
import { buildPlanModel } from '@/core/plan/planModel'
import { TEXTURES, textureById } from '@/core/textures/registry'
import { formatSize } from '@/core/units'
import { CUT_DEMO, demoPlan, WALL_DEMO } from '@/features/landing/demo'
import { FilamentStrip } from '@/features/landing/FilamentStrip'
import { HeroStage } from '@/features/landing/HeroStage'
import { JointProof } from '@/features/landing/JointProof'
import { PlanFragment } from '@/features/landing/PlanFragment'
import { SpecimenStrip } from '@/features/landing/SpecimenStrip'
import { useDesign } from '@/state/designStore'
import { buttonClassName } from '@/ui'
import styles from './LandingPage.module.scss'

export function LandingPage() {
  const navigate = useNavigate()
  const config = useDesign((state) => state.config)
  const loadDesign = useDesign((state) => state.load)

  const cutPlan = useMemo(() => demoPlan(CUT_DEMO), [])
  const cutModel = useMemo(() => buildPlanModel(CUT_DEMO, cutPlan), [cutPlan])
  const wallPlan = useMemo(() => demoPlan(WALL_DEMO), [])
  const wallFiles = wallPlan.pieces.length + 2
  const lastMark = cutPlan.pieces[cutPlan.pieces.length - 1]?.mark ?? 'A'

  function startWithTexture(textureId: string) {
    const texture = textureById(textureId)
    loadDesign({
      ...config,
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
          <h1 className={styles.headline}>Tiles that fit your wall exactly and join without a seam</h1>
          <p className={styles.support}>
            Give Tessera the wall and the tile size. It lays out the grid, cuts the edge pieces from the same relief so
            the pattern runs on across every joint, and hands you a printable model for each unique piece.
          </p>
          <div className={styles.heroActions}>
            <Link to="/studio" className={buttonClassName('primary', 'lg')} {...studioIntent}>
              Start designing
            </Link>
            <Link to="/history" className={buttonClassName('secondary', 'md')}>
              See your saved designs
            </Link>
          </div>
          <p className={styles.heroNote}>
            No account, nothing uploaded: the layout, the 3D view and the files are all made in this browser.
          </p>
        </div>
        <HeroStage />
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
            you print. Pick one and the studio opens with it.
          </p>
        </header>
        <SpecimenStrip base={config} onPick={startWithTexture} />

        <div>
          <h3 className={styles.subheading}>Filament</h3>
          <p className={styles.note}>
            The preview renders in a real spool colour and finish, from matte through silk to marble and wood, so what
            you choose here is what you can buy.
          </p>
        </div>
        <FilamentStrip />
        <p className={styles.fineprint}>
          Colour names and hex values are the manufacturer&rsquo;s published values. Tessera is not affiliated with
          Bambu Lab.
        </p>
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
