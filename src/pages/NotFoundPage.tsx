// A page that is not part of Tessera.
import { Link, useLocation } from 'react-router'
import { buttonClassName, EmptyState } from '@/ui'
import styles from './NotFoundPage.module.scss'

const lostTileDrawing = (
  <svg viewBox="0 0 132 96" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <rect x="16" y="16" width="44" height="30" rx="8" strokeOpacity="0.8" />
    <rect x="72" y="16" width="44" height="30" rx="8" strokeOpacity="0.35" strokeDasharray="5 5" />
    <rect x="16" y="54" width="44" height="30" rx="8" strokeOpacity="0.35" strokeDasharray="5 5" />
    <rect x="72" y="54" width="44" height="30" rx="8" strokeOpacity="0.8" />
  </svg>
)

export function NotFoundPage() {
  const { pathname } = useLocation()

  return (
    <div className={styles.page}>
      <EmptyState
        illustration={lostTileDrawing}
        heading="We could not find that page"
        action={
          <div className={styles.actions}>
            <Link to="/studio" className={buttonClassName('primary', 'lg')}>
              Open the studio
            </Link>
            <Link to="/" className={buttonClassName('secondary', 'lg')}>
              Back to the front page
            </Link>
          </div>
        }
      >
        There is nothing at <span className={styles.path}>{pathname}</span>. The studio, your files and your saved
        designs are all still where you left them.
      </EmptyState>
    </div>
  )
}
