import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { normalizeConfig, sameConfig } from '@/core/config'
import type { DesignConfig } from '@/core/types'
import { isQuotaError, persistStorage } from './storage'

/** localStorage holds ~5 MB; thumbnails are small WebP data URLs, so a few dozen entries fit easily. */
const MAX_ENTRIES = 40
const STORAGE_KEY = 'tessera.history.v1'
const STORAGE_VERSION = 1

export interface HistoryEntry {
  id: string
  config: DesignConfig
  createdAt: number
  updatedAt: number
  /** Small WebP data URL of the 3D preview, if one could be captured. */
  thumbnail?: string
  /** True once the design went through "Validate & get files". */
  validated: boolean
}

interface HistoryState {
  entries: HistoryEntry[]
  /**
   * Saves a design. An entry with the same config is refreshed instead of duplicated, so
   * validating twice or saving an unchanged design does not grow the list.
   */
  save: (config: DesignConfig, options?: { thumbnail?: string; validated?: boolean }) => HistoryEntry
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  clear: () => void
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** Past this a stored stamp is not a date at all: `new Date(t).toISOString()` throws on it. */
const MAX_TIME = 8.64e15

/** A stored timestamp the register can render, or null when it has to be repaired. */
function readTime(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_TIME) return value
  // A hand-edited store may hold an ISO string, which is still a date worth keeping.
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_TIME ? parsed : null
}

/**
 * One stored row, repaired. Everything the register draws is coerced here, because a single bad
 * field used to throw while rendering and take every saved design down with it.
 */
function reviveEntry(raw: unknown, now: number): HistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const stored = raw as Record<string, unknown>
  if (typeof stored.id !== 'string' || !stored.id) return null
  const updatedAt = readTime(stored.updatedAt) ?? readTime(stored.createdAt) ?? now
  return {
    id: stored.id,
    config: normalizeConfig(stored.config),
    createdAt: readTime(stored.createdAt) ?? updatedAt,
    updatedAt,
    // Only a data: image can be drawn without a network call, and this app makes none.
    thumbnail:
      typeof stored.thumbnail === 'string' && stored.thumbnail.startsWith('data:image/') ? stored.thumbnail : undefined,
    validated: !!stored.validated,
  }
}

/** Everything readable in the stored list, newest first and capped like a list built by save(). */
function reviveEntries(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return []
  const now = Date.now()
  const seen = new Set<string>()
  const entries: HistoryEntry[] = []
  for (const item of raw) {
    const entry = reviveEntry(item, now)
    // Two rows sharing an id would be renamed and deleted together, so only the first survives.
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    entries.push(entry)
  }
  // The cap belongs on the way in too: an over-full store otherwise reads "50 of 40 designs" and
  // then loses eleven drawings at once on the next save.
  entries.sort((a, b) => b.updatedAt - a.updatedAt)
  // Retired filament ids that share a hex load as one config, and save() refreshes only the first
  // match, so the newest row absorbs its duplicates here (before the cap, so they take no slots).
  const merged: HistoryEntry[] = []
  for (const entry of entries) {
    const kept = merged.find((e) => sameConfig(e.config, entry.config))
    if (!kept) {
      merged.push(entry)
      continue
    }
    kept.thumbnail ??= entry.thumbnail
    kept.validated ||= entry.validated
    kept.createdAt = Math.min(kept.createdAt, entry.createdAt)
  }
  return merged.slice(0, MAX_ENTRIES)
}

type WriteOutcome = 'ok' | 'full' | 'unavailable'

/**
 * persist() writes through a wrapper that swallows quota errors, so mirror the write here to learn
 * whether it actually landed. The payload is byte-identical to the one persist writes straight after.
 */
function tryPersist(entries: HistoryEntry[]): WriteOutcome {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { entries }, version: STORAGE_VERSION }))
    return 'ok'
  } catch (error) {
    // No storage at all (private window, blocked site data) is not something shedding can fix.
    return isQuotaError(error) ? 'full' : 'unavailable'
  }
}

/** Drops the least valuable thing left: the oldest thumbnail first, then the oldest drawing. Null when only `keepId` is left. */
function shed(entries: HistoryEntry[], keepId: string): HistoryEntry[] | null {
  const withThumbnail = entries.findLastIndex((e) => e.thumbnail !== undefined)
  if (withThumbnail !== -1) {
    const next = entries.slice()
    next[withThumbnail] = { ...next[withThumbnail], thumbnail: undefined }
    return next
  }
  const oldest = entries.findLastIndex((e) => e.id !== keepId)
  return oldest === -1 ? null : entries.filter((_, i) => i !== oldest)
}

export const useHistory = create<HistoryState>()(
  persist(
    (set, get) => ({
      entries: [],

      save(config, options = {}) {
        const now = Date.now()
        const existing = get().entries.find((e) => sameConfig(e.config, config))
        const entry: HistoryEntry = existing
          ? {
              ...existing,
              updatedAt: now,
              thumbnail: options.thumbnail ?? existing.thumbnail,
              validated: existing.validated || !!options.validated,
            }
          : {
              id: newId(),
              config: structuredClone(config),
              createdAt: now,
              updatedAt: now,
              thumbnail: options.thumbnail,
              validated: !!options.validated,
            }
        const others = get().entries.filter((e) => e.id !== entry.id)
        let entries = [entry, ...others].slice(0, MAX_ENTRIES)
        // A full store must lose thumbnails and then old drawings: the UI promises the design is kept,
        // so a save that silently did not land would be a lie.
        while (tryPersist(entries) === 'full') {
          const reduced = shed(entries, entry.id)
          if (!reduced) break
          entries = reduced
        }
        set({ entries })
        return entries.find((e) => e.id === entry.id) ?? entry
      },

      rename(id, name) {
        const trimmed = name.trim().slice(0, 80)
        if (!trimmed) return
        set({
          entries: get().entries.map((e) =>
            e.id === id ? { ...e, config: { ...e.config, name: trimmed }, updatedAt: Date.now() } : e,
          ),
        })
      },

      remove(id) {
        set({ entries: get().entries.filter((e) => e.id !== id) })
      },

      clear() {
        set({ entries: [] })
      },
    }),
    {
      name: STORAGE_KEY,
      storage: persistStorage,
      version: STORAGE_VERSION,
      partialize: (state) => ({ entries: state.entries }),
      merge: (persisted, current) => ({
        ...current,
        entries: reviveEntries((persisted as { entries?: unknown } | undefined)?.entries),
      }),
    },
  ),
)
