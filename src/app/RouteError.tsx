import { useEffect } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { buttonClassName } from '@/ui'
import { track } from './analytics'
import styles from './AppShell.module.scss'
import { useAccentTheme } from './useAccentTheme'

/** Where a route lands when its screen throws: plain words and a way back to the wall. */
export function RouteError() {
  const error = useRouteError()
  // This sheet replaces AppShell, so it paints the accent itself when a cold load fails.
  useAccentTheme()
  // Counted without its message, which can carry anything the failure met.
  useEffect(() => track('error-screen', { once: true }), [])
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'The screen stopped before it could load.'

  return (
    <div className={styles.app}>
      <div className={styles.errorSheet}>
        <p className={styles.errorLabel}>Something went wrong</p>
        <h1 className={styles.errorHeading}>This screen could not be loaded</h1>
        <p className={styles.errorBody}>{detail}</p>
        <Link to="/studio" className={buttonClassName('secondary', 'md', styles.errorAction)}>
          Back to the studio
        </Link>
      </div>
    </div>
  )
}
