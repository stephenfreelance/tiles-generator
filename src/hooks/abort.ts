/** Cancellations (AbortSignal, superseded previews) are not failures and must not reach the UI as errors. */
export const isAbortError = (error: unknown): boolean =>
  (error instanceof DOMException || error instanceof Error) && error.name === 'AbortError'

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))
