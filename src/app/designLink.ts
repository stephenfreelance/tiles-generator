// A drawing as a link. The whole design travels as one compact tuple under a single parameter, so a
// maker can send it to whoever owns the wall, or open it on the phone standing next to it with a tape.
import { normalizeConfig } from '@/core/config'
import { sidesFromMask, sidesMask } from '@/core/sides'
import type { DesignConfig } from '@/core/types'

/** The one search parameter that carries a drawing. */
export const DESIGN_PARAM = 'd'

/**
 * Tuple version. Version 4 is version 3 with a lock name in slot 28 where version 3 carried a keys
 * boolean: the tabs are a third value that boolean cannot hold, and a build that predates them must
 * refuse the link rather than read a tabbed wall as a glued one. Version 3 is still read (its boolean
 * becomes a lock through normalizeConfig's own legacy read), version 2 is version 3 without the edges
 * and fixings at all, and version 1 had a retired filament id in the color slot; any other is refused.
 */
const VERSION = '4'
const LOCK_VERSION = '3'
const COLOR_VERSION = '2'
const LEGACY_VERSION = '1'
const FIELD = '|'
const PAIR = '~'
const ITEM = ','
/** Fields before the texture parameters. A shorter tuple is truncated and cannot be trusted. */
const FIELD_COUNT = 20
/** Slot of the texture parameters, the same in every version. */
const PARAMS_SLOT = 20
/** Slots after the parameters, in versions 3 and 4 alike: joint edge, perimeter (6), the lock, mount, fit. */
const EDGE_SLOT = 21
const FIXINGS_FIELD_COUNT = 31

/** Trims float noise (0.30000000000000004) without rounding any real setting away. */
const num = (value: number): string => String(Number(value.toFixed(4)))

const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (text: string): string => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

/** The edges and fixings slots as the loose shape normalizeConfig reads; it clamps and validates every one. */
function edgesFrom(slot: (index: number) => string, version: string): Record<string, unknown> {
  return {
    jointEdge: slot(0),
    perimeter: {
      profile: slot(1),
      sides: sidesFromMask(Number(slot(2)) & 15),
      width: Number(slot(3)),
      drop: Number(slot(4)),
      fade: Number(slot(5)),
      land: slot(6),
    },
    // Version 3 carried a keys boolean here; normalizeConfig's own legacy read turns it into a lock.
    ...(version === VERSION ? { lock: slot(7) } : { joins: slot(7) === '1' }),
    mount: slot(8),
    fit: slot(9),
  }
}

/** The design as a search string, "d=...", without the leading question mark. */
export function toSearch(config: DesignConfig): string {
  const params = Object.entries(config.texture.params)
    .map(([key, value]) => `${encodeURIComponent(key)}${PAIR}${num(value)}`)
    .join(ITEM)
  const tuple = [
    VERSION,
    encodeURIComponent(config.name),
    num(config.surface.width),
    num(config.surface.height),
    config.surfaceUnit,
    num(config.tile.width),
    num(config.tile.height),
    num(config.tile.thickness),
    num(config.joint),
    num(config.bevel),
    config.layout.origin,
    num(config.layout.rowOffset),
    encodeURIComponent(config.texture.id),
    num(config.texture.depth),
    num(config.texture.scale),
    String(config.texture.seed),
    config.texture.invert ? '1' : '0',
    config.texture.rotate ? '1' : '0',
    encodeURIComponent(config.color),
    encodeURIComponent(config.printerId),
    params,
    config.jointEdge,
    config.perimeter.profile,
    String(sidesMask(config.perimeter.sides)),
    num(config.perimeter.width),
    num(config.perimeter.drop),
    num(config.perimeter.fade),
    config.perimeter.land,
    config.lock,
    config.mount,
    config.fit,
  ].join(FIELD)
  return `${DESIGN_PARAM}=${toBase64Url(tuple)}`
}

/**
 * The design a link carries, or null when there is none. Everything read here is a suggestion:
 * normalizeConfig is the gate, so a truncated or hand-edited URL can never produce an invalid design.
 */
export function fromSearch(params: URLSearchParams): DesignConfig | null {
  const raw = params.get(DESIGN_PARAM)
  if (!raw) return null
  try {
    const parts = fromBase64Url(raw).split(FIELD)
    const legacy = parts[0] === LEGACY_VERSION
    const fixings = parts[0] === VERSION || parts[0] === LOCK_VERSION
    if (!fixings && !legacy && parts[0] !== COLOR_VERSION) return null
    if (parts.length < (fixings ? FIXINGS_FIELD_COUNT : FIELD_COUNT)) return null
    const at = (index: number): string => parts[index] ?? ''
    const textureParams: Record<string, number> = {}
    for (const pair of at(PARAMS_SLOT).split(ITEM)) {
      if (!pair) continue
      const [key, value] = pair.split(PAIR)
      const parsed = Number(value)
      if (key && Number.isFinite(parsed)) textureParams[decodeURIComponent(key)] = parsed
    }
    const color = decodeURIComponent(at(18))
    return normalizeConfig({
      version: 1,
      name: decodeURIComponent(at(1)),
      surface: { width: Number(at(2)), height: Number(at(3)) },
      surfaceUnit: at(4),
      tile: { width: Number(at(5)), height: Number(at(6)), thickness: Number(at(7)) },
      joint: Number(at(8)),
      bevel: Number(at(9)),
      layout: { origin: at(10), rowOffset: Number(at(11)) },
      texture: {
        id: decodeURIComponent(at(12)),
        depth: Number(at(13)),
        scale: Number(at(14)),
        params: textureParams,
        seed: Number(at(15)),
        invert: at(16) === '1',
        rotate: at(17) === '1',
      },
      // normalizeConfig maps a version 1 filament id to the hex it stood for.
      ...(legacy ? { colorId: color } : { color }),
      printerId: decodeURIComponent(at(19)),
      // Older links predate the edges and fixings: normalizeConfig gives them today's defaults.
      ...(fixings ? edgesFrom((index) => at(EDGE_SLOT + index), parts[0]) : {}),
    })
  } catch {
    // A link that cannot be read is not a link to a design.
    return null
  }
}
