/** The modifier this machine writes on its key caps. */
export const MOD_KEY = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac') ? 'Cmd' : 'Ctrl'

/** True when the keystroke belongs to a text field, so page shortcuts must keep out of it. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
