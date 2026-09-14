import { useId, type ReactNode } from 'react'
import { cx } from './cx'
import styles from './Drawing.module.scss'

type Corner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
const CORNERS: Corner[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']

export interface ViewFrameProps {
  /** Step number in the circle, matching the numbered steps beside it. */
  number: number | string
  /** What the view shows: "Where each tile goes". */
  title: string
  children: ReactNode
  /** Controls resting on the view (the view switch, the reset). */
  corners?: Partial<Record<Corner, ReactNode>>
  /** Extra content at the right end of the title line. */
  titleAside?: ReactNode
  /** Drops the caption where the view needs no naming, keeping it as the view's accessible name
   *  (aria-labelledby resolves against hidden text). */
  titleHidden?: boolean
  id?: string
  className?: string
  bodyClassName?: string
}

/** A framed view of the wall, with its name beneath. */
export function ViewFrame({
  number,
  title,
  children,
  corners,
  titleAside,
  titleHidden,
  id,
  className,
  bodyClassName,
}: ViewFrameProps) {
  const autoId = useId()
  const titleId = `${id ?? `view${autoId}`}-title`
  return (
    <figure
      id={id}
      className={cx(styles.view, className)}
      aria-labelledby={titleId}
      data-title-hidden={titleHidden || undefined}
    >
      <div className={cx(styles.viewBody, bodyClassName)}>
        {children}
        {CORNERS.map((corner) =>
          corners?.[corner] ? (
            <div key={corner} className={cx(styles.corner, styles[corner])}>
              {corners[corner]}
            </div>
          ) : null,
        )}
      </div>
      <figcaption className={styles.viewTitle}>
        <span id={titleId} className={styles.viewTitleText}>
          <span className={styles.viewNumber}>{number}</span>
          <span className={styles.viewName}>{title}</span>
        </span>
        {titleAside && <span className={styles.viewAside}>{titleAside}</span>}
      </figcaption>
    </figure>
  )
}
