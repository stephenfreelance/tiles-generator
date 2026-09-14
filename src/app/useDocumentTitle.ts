import { useEffect } from 'react'

/** Names the browser tab after the drawing on screen. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title
  }, [title])
}
