import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useDesign } from '@/state/designStore'
import { DESIGN_PARAM, fromSearch } from './designLink'

/**
 * A drawing arriving in the address bar wins over whatever this browser last held, then the parameter
 * is dropped so the bar shows the plain route again and the back button is left alone.
 */
export function useDesignFromLink(): void {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(search)
    if (!params.has(DESIGN_PARAM)) return
    const shared = fromSearch(params)
    if (shared) useDesign.getState().load(shared)
    navigate(pathname, { replace: true })
  }, [pathname, search, navigate])
}
