import { createJSONStorage, type StateStorage } from 'zustand/middleware'

/**
 * localStorage that never throws: private windows, blocked site data and quota errors
 * degrade to an in-memory session instead of breaking the app.
 *
 * Writes are coalesced. The design store re-persists the whole config on every slider frame, so a value
 * is banked in memory synchronously (reads stay correct) and reaches disk on a trailing timer.
 */
const memory = new Map<string, string>()

/** Trailing window for a deferred write: long enough to swallow a drag, short enough to survive a crash. */
const WRITE_DELAY_MS = 400

/**
 * Saved designs are explicit user saves and go straight to disk. The live design and the view
 * preferences are rewritten continuously, so they are the ones worth coalescing.
 */
const IMMEDIATE_KEYS = new Set(['tessera.history.v1'])

const pending = new Map<string, string>()
let timer: ReturnType<typeof setTimeout> | null = null

function writeThrough(name: string, value: string): void {
  try {
    window.localStorage.setItem(name, value)
  } catch (error) {
    console.warn(`Tessera could not save "${name}" to localStorage`, error)
  }
}

/** Writes every deferred value now. Safe at any time: there is nothing to do when nothing is waiting. */
export function flushPendingWrites(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  if (pending.size === 0) return
  const writes = [...pending]
  pending.clear()
  for (const [name, value] of writes) writeThrough(name, value)
}

function deferWrite(name: string, value: string): void {
  pending.set(name, value)
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    flushPendingWrites()
  }, WRITE_DELAY_MS)
}

const safeLocalStorage: StateStorage = {
  getItem(name) {
    // Memory holds this session's latest value, including one still waiting for the timer.
    const held = memory.get(name)
    if (held !== undefined) return held
    try {
      return window.localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem(name, value) {
    memory.set(name, value)
    if (IMMEDIATE_KEYS.has(name)) writeThrough(name, value)
    else deferWrite(name, value)
  },
  removeItem(name) {
    memory.delete(name)
    // A queued write would otherwise bring the key back after it was removed.
    pending.delete(name)
    try {
      window.localStorage.removeItem(name)
    } catch {
      // Nothing to clean up when storage is unavailable.
    }
  },
}

// A tab can be hidden, frozen or closed without another timer tick, so bank what is waiting first.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingWrites()
  })
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingWrites)
}

export const persistStorage = createJSONStorage(() => safeLocalStorage)

/** True when a write of this size would likely fail; used to shed thumbnails before saving. */
export function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22)
}

export { safeLocalStorage }
