// The drawing's revision letter, read off the register rather than stored: every time a changed
// design is validated it is filed under the same title, which is exactly what a revision counts.
import { useHistory } from '@/state/historyStore'

/** Revision letters skip I and O so they never read as 1 and 0, as the sheet's grid references do. */
const REVISION_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

/** Letter for the nth issue (1 -> A). An undrawn revision is a dash, as it is on paper. */
export function revisionLetter(issues: number): string {
  if (issues <= 0) return '-'
  return REVISION_LETTERS[Math.min(issues, REVISION_LETTERS.length) - 1]
}

/** What the REV cell says, and the sentence that explains what it counted. */
export function revisionNote(issues: number): string {
  if (issues <= 0) return 'Not issued yet. Validate the drawing and the register files it as revision A.'
  const times = issues === 1 ? 'once' : `${issues} times`
  return `Revision ${revisionLetter(issues)}: this drawing has been validated ${times}. Every validated change files the next letter.`
}

export interface DrawingRevision {
  letter: string
  issues: number
  note: string
}

/** The revision of the drawing filed under `name`: one issue per validated entry in the register. */
export function useDrawingRevision(name: string): DrawingRevision {
  const issues = useHistory((state) => state.entries.filter((e) => e.validated && e.config.name === name).length)
  return { letter: revisionLetter(issues), issues, note: revisionNote(issues) }
}
