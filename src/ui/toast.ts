// Store-free notifications: a module-level list read by <Toaster/> through useSyncExternalStore,
// plus screen-reader-only announcements that work without any component mounted.

export type ToastTone = 'info' | 'success' | 'warn' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  tone?: ToastTone
  action?: ToastAction
  /** Milliseconds before the slip leaves on its own; 0 keeps it until dismissed. */
  duration?: number
}

export interface ToastRecord {
  id: number
  message: string
  tone: ToastTone
  action?: ToastAction
  duration: number
  /** Restarts the timer when the same message is raised again. */
  shownAt: number
  leaving: boolean
}

const DEFAULT_DURATION: Record<ToastTone, number> = { info: 5000, success: 5000, warn: 8000, error: 10000 }
/** Slips carrying an action stay long enough to reach the button. */
const ACTION_MIN_DURATION = 8000
const MAX_VISIBLE = 4
/** Matches the slip's exit transition in Toaster.module.scss. */
export const TOAST_EXIT_MS = 220

let toasts: readonly ToastRecord[] = []
let nextId = 1
const listeners = new Set<() => void>()

function publish(next: readonly ToastRecord[]) {
  toasts = next
  for (const listener of listeners) listener()
}

/** Pins a paper slip bottom-right. Returns its id for `dismissToast`. */
export function toast(message: string, options: ToastOptions = {}): number {
  const tone = options.tone ?? 'info'
  const repeat = toasts.find((t) => !t.leaving && t.message === message && t.tone === tone)
  if (repeat) {
    publish(toasts.map((t) => (t === repeat ? { ...t, action: options.action ?? t.action, shownAt: Date.now() } : t)))
    return repeat.id
  }
  const baseDuration = DEFAULT_DURATION[tone]
  const record: ToastRecord = {
    id: nextId++,
    message,
    tone,
    action: options.action,
    duration: options.duration ?? (options.action ? Math.max(baseDuration, ACTION_MIN_DURATION) : baseDuration),
    shownAt: Date.now(),
    leaving: false,
  }
  const next = [...toasts, record]
  publish(next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next)
  return record.id
}

export function dismissToast(id: number): void {
  const target = toasts.find((t) => t.id === id)
  if (!target || target.leaving) return
  publish(toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
  setTimeout(() => publish(toasts.filter((t) => t.id !== id)), TOAST_EXIT_MS)
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getToasts(): readonly ToastRecord[] {
  return toasts
}

const liveRegions: Partial<Record<'polite' | 'assertive', HTMLElement>> = {}

function liveRegion(politeness: 'polite' | 'assertive'): HTMLElement {
  const existing = liveRegions[politeness]
  if (existing?.isConnected) return existing
  const region = document.createElement('div')
  region.setAttribute('aria-live', politeness)
  region.setAttribute('aria-atomic', 'true')
  region.dataset.tesseraAnnouncer = politeness
  region.style.cssText =
    'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0'
  document.body.append(region)
  liveRegions[politeness] = region
  return region
}

/** Speaks a message to screen readers only ("Layout updated: 40 full tiles, 8 cuts"). */
export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  if (typeof document === 'undefined') return
  const region = liveRegion(politeness)
  region.textContent = ''
  // Clearing first and writing a beat later makes screen readers repeat an identical message.
  setTimeout(() => {
    region.textContent = message
  }, 60)
}
