// Section 04: how the printed tiles go up. Four plates, one per way of fixing them, each drawn with
// the shared fixing drawings so this page, the studio and the download guide show the same key and
// the same clip. Every verb here is what the geometry does: keys lock tiles edge to edge in the plane
// of the wall and never to it, a tile clicks onto its clips and pulls straight off them, and nothing
// hooks, slides or lifts. Keys go into slots and clips into pockets, the words the studio and the guide
// use. No strength figures and no timings: Tessera has measured none.
import type { CSSProperties, ReactNode } from 'react'
import { ClipWallDiagram, GlueDiagram, KeysDiagram, TabsDiagram } from '@/features/fixing/diagrams'
import styles from './FixingSystems.module.scss'

interface System {
  title: string
  /** Whether a design starts with it: the one standard way, or a choice under Putting it up in the studio. */
  tag: 'Standard' | 'Optional'
  drawing: ReactNode
  text: string
  /** What it adds to the print queue. */
  prints: string
}

const SYSTEMS: readonly System[] = [
  {
    title: 'Glue or tape',
    tag: 'Standard',
    drawing: <GlueDiagram />,
    text: 'Every tile has a flat back, so it goes up like any other tile: with tile adhesive, or with double-sided mounting tape.',
    prints: 'Prints: the tiles, and nothing else.',
  },
  {
    title: 'Keys between tiles',
    tag: 'Optional',
    drawing: <KeysDiagram />,
    text: 'Small printed keys press into slots on the back and lock each tile to its neighbours edge to edge, in the plane of the wall: in line, with even joints. The wall, or the clips, keep the faces flat. A drop of glue in each slot makes the panel permanent.',
    prints: 'Prints: one key model, counted for your wall.',
  },
  {
    title: 'Tabs between tiles',
    tag: 'Optional',
    drawing: <TabsDiagram />,
    text: 'The tiles themselves change shape instead: a tab in the back of each one stands in the joint and goes into the socket of the tile beside it as the tile is pressed on, locking the row edge to edge, in line, with even joints. Nothing is printed for them, and the front of the tile does not change. Each row is its own strip, and a row comes off again from its right-hand end.',
    prints: 'Prints: nothing extra, but the fit is cut into the tiles.',
  },
  {
    title: 'Wall clips',
    tag: 'Optional',
    drawing: <ClipWallDiagram />,
    text: 'Printed clips click into pockets in the back of each tile. Put a piece of thin double-sided tape on each and press the tile into its place, with only the tape behind it: the tile sets its own clips on the wall, so nothing needs measuring but a level start line. To swap a tile, pull it straight off: its clips stay on the wall, and it clicks back on.',
    prints: 'Prints: one clip model, counted for your wall.',
  },
]

export function FixingSystems() {
  return (
    <div className={styles.systems}>
      <ul className={styles.plates}>
        {SYSTEMS.map((system, index) => (
          <li key={system.title} className={styles.plate} style={{ '--i': index } as CSSProperties}>
            <div className={styles.caption}>
              <h3 className={styles.title}>{system.title}</h3>
              <p className={styles.tag} data-standard={system.tag === 'Standard' || undefined}>
                {system.tag}
              </p>
            </div>
            <div className={styles.figure}>{system.drawing}</div>
            <p className={styles.text}>{system.text}</p>
            <p className={styles.prints}>{system.prints}</p>
          </li>
        ))}
      </ul>

      {/* Under all four, what is true of the optional three together. */}
      <div className={styles.notes}>
        <p className={styles.note}>
          <strong className={styles.lead}>A lock and the clips work together.</strong> The clip pockets sit clear of the
          key slots and of the sockets, and a lock between tiles never holds a tile to the wall, so a keyed tile on clips
          still comes off on its own and a tabbed one comes off once the tile to its right is off.
        </p>
        <p className={styles.note}>
          <strong className={styles.lead}>Choose them in the studio</strong>, under Putting it up, and the download adds
          whatever they print and a step-by-step guide to putting the wall up. The fit test that finds how tight the
          keys, clips and sockets should sit has a page of its own.
        </p>
      </div>
    </div>
  )
}
