// The questions a visitor brings to the whole page rather than to one section of it: privacy, printing,
// printers, color and taking a wall down. Native details, so every answer is in the page for find-in-
// page and a screen reader before anyone opens it. Every figure is read off the tables it describes.
import type { ReactNode } from 'react'
import { COLOR_PRESETS } from '@/core/colors'
import { PRINTERS } from '@/core/printers'
import { formatSize } from '@/core/units'
import styles from './Questions.module.scss'

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

function Question({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className={styles.question}>
      <summary className={styles.head}>{question}</summary>
      {children}
    </details>
  )
}

/**
 * Two columns on a desk, one on a phone. Two lists rather than one grid: an answer opening in a grid
 * row would push its neighbour's rule down with it, and the two columns would stop lining up.
 */
export function Questions() {
  return (
    <div className={styles.columns}>
      <div className={styles.column}>
        <Question question="Does anything leave my computer?">
          <p className={styles.answer}>
            No. Your current design and your saved designs live in this browser&rsquo;s local storage, so clearing this
            site&rsquo;s data clears them and another browser starts empty.
          </p>
        </Question>
        <Question question="How do they print?">
          <ul className={styles.facts}>
            {PLATE_FACTS.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
          {/* What the files open in. Plain text: Tessera has no logos to show and no endorsement to claim. */}
          <p className={styles.answer}>They open in Bambu Studio, OrcaSlicer, PrusaSlicer, or anything else that reads STL.</p>
        </Question>
        <Question question="Will the tiles fit my printer?">
          <p className={styles.answer}>
            Tessera knows {PRINTERS.length} printers, from a {formatSize(SMALLEST_BED.width, SMALLEST_BED.depth)} bed up
            to {formatSize(LARGEST_BED.width, LARGEST_BED.depth)}. Choose yours in the studio and it warns you before a
            piece gets too big for it.
          </p>
        </Question>
      </div>
      <div className={styles.column}>
        <Question question="Will the colors match my filament?">
          <p className={styles.answer}>
            Not necessarily. The {COLOR_PRESETS.length} presets are Tessera&rsquo;s own names and hex values, not a
            filament catalog, and a screen cannot promise what a spool will look like. Pick the color you want the wall
            to be, then buy the PLA that comes closest.
          </p>
        </Question>
        <Question question="Can I take the tiles down again?">
          <p className={styles.answer}>
            On wall clips, yes: pull a tile straight off and it leaves its clips on the wall, then push it back on until
            it clicks. Any tile comes off that way, on its own, and goes back onto the same clips. Tiles on tile
            adhesive are there for good, and mounting tape does not always come away cleanly. Keys only lock tiles to
            each other, so they do not change the answer; tabs do, a little, because a tile's own tab sits under the
            socket of the tile to its right, so a row comes off from that end.
          </p>
        </Question>
        <Question question="Do I need the keys, the tabs or the clips?">
          <p className={styles.answer}>
            No. Every one is off until you choose it in the studio. Without them every tile has a flat back for tile
            adhesive or mounting tape, and nothing extra goes in the zip.
          </p>
        </Question>
      </div>
    </div>
  )
}
