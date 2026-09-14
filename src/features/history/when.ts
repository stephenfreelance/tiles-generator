// When a drawing was last saved, in the register's own words.

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const dayFormat = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
const exactFormat = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function relativeWhen(timestamp: number, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - timestamp)
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) {
    const minutes = Math.round(elapsed / MINUTE)
    return `${minutes} min ago`
  }
  if (elapsed < DAY) {
    const hours = Math.round(elapsed / HOUR)
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  }
  if (elapsed < 2 * DAY) return 'yesterday'
  if (elapsed < 7 * DAY) return `${Math.round(elapsed / DAY)} days ago`
  return dayFormat.format(timestamp)
}

/** The full stamp, for the title attribute and screen readers. */
export const exactWhen = (timestamp: number): string => exactFormat.format(timestamp)
