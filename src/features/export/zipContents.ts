// What the one zip holds, said by what each file is for rather than by its name, and how many files
// that is. Pure, so the count the button promises and the lines under it are tested together: the wall's
// printed parts (the wall clips, the keys) count like any tile, each group named with the folder it unzips
// into. The fit test is not one of them: it has its own page and its own zip, so no line of this list can
// name it (the type says so).
import { accessoryZipPath } from '@/core/export/filenames'
import { fixingSystem } from '@/core/fixing/guide'
import type { TabPlan } from '@/core/fixing/tabs'
import type { AccessoryKind, AccessorySpec, JoinPlan, MountPlan } from '@/core/fixing/types'
import type { DesignConfig, ExportFormat, LayoutPlan } from '@/core/types'
import { formatNumber } from '@/core/units'

/** The groups this download can hold: every group but the fit test's. */
export type WallGroup = Exclude<AccessorySpec['group'], 'fit-test'>

export type ZipLineKind = 'tiles' | WallGroup | 'plan' | 'readme'

export interface ZipLine {
  kind: ZipLineKind
  text: string
}

export interface ZipContents {
  /** Every file in the zip: tile models, printed parts, the plan and the README. */
  files: number
  lines: ZipLine[]
}

/** The parts' groups in the order the download page lists them, and what each is called there. */
export const ACCESSORY_GROUPS: readonly { group: WallGroup; title: string }[] = [
  { group: 'mount', title: 'Wall clips' },
  { group: 'join', title: 'Keys' },
]

const plural = (count: number, one: string, many = `${one}s`): string => `${formatNumber(count, 0)} ${count === 1 ? one : many}`

/** The documents that always come along: the tiling plan and the README. */
const DOCUMENTS = 2

/** Copies to print of every part of one kind, over all its files. */
function copies(parts: readonly AccessorySpec[], kind: AccessoryKind): number {
  return parts.reduce((sum, part) => sum + (part.kind === kind ? part.count : 0), 0)
}

/**
 * "29 wall clips (27 to fit, 2 spares)": copies printed, then how many the plan fits. The studio and the guide
 * count the fitted ones, so a printed count said bare would read as a different number for the same part.
 */
function printedText(printed: number, fitted: number, noun: string): string {
  const spares = printed - fitted
  if (fitted <= 0 || spares <= 0) return plural(printed, noun)
  return `${plural(printed, noun)} (${formatNumber(fitted, 0)} to fit, ${plural(spares, 'spare')})`
}

/** " in mount/": the folder the exporter puts a group's files in, read off its own path so the two agree. */
function folderText(parts: readonly AccessorySpec[], format: ExportFormat): string {
  const path = parts.length > 0 ? accessoryZipPath(parts[0], format) : ''
  const slash = path.lastIndexOf('/')
  return slash > 0 ? ` in ${path.slice(0, slash + 1)}` : ''
}

/** "29 wall clips (27 to fit, 2 spares), from one file in mount/", or "12 keys between the tiles, from one file in join/". */
function fittedText(parts: readonly AccessorySpec[], kind: 'clip' | 'key', fitted: number, format: ExportFormat): string {
  const printed = copies(parts, kind)
  const files = (parts.length === 1 ? 'one file' : plural(parts.length, 'file')) + folderText(parts, format)
  const noun = kind === 'clip' ? 'wall clip' : 'key'
  if (printed <= 0) return `${kind === 'clip' ? 'Wall clips' : 'Keys between the tiles'}, ${files}`
  if (printed > fitted && fitted > 0) return `${printedText(printed, fitted, noun)}, from ${files}`
  return `${plural(printed, noun)}${kind === 'clip' ? '' : ' between the tiles'}, from ${files}`
}

export function zipContents(
  config: Pick<DesignConfig, 'mount' | 'lock'>,
  plan: Pick<LayoutPlan, 'pieces' | 'placements'>,
  mount: Pick<MountPlan, 'clips'>,
  join: Pick<JoinPlan, 'keys'>,
  tab: Pick<TabPlan, 'tabs'>,
  accessories: readonly AccessorySpec[],
  format: ExportFormat,
): ZipContents {
  const models = plan.pieces.length
  const tiles = plan.placements.length
  const kind = format.toUpperCase()
  const lines: ZipLine[] = [
    {
      kind: 'tiles',
      text:
        models === 1
          ? `1 tile model (${kind}), print ${plural(tiles, 'copy', 'copies')}`
          : `${plural(models, 'tile model')} (${kind}), ${plural(tiles, 'tile')} in all`,
    },
  ]

  for (const { group } of ACCESSORY_GROUPS) {
    const parts = accessories.filter((part) => part.group === group)
    if (parts.length === 0) continue
    const text = group === 'mount' ? fittedText(parts, 'clip', mount.clips, format) : fittedText(parts, 'key', join.keys, format)
    lines.push({ kind: group, text })
  }

  lines.push({ kind: 'plan', text: 'A tiling plan (SVG), shows where every piece goes' })
  // The README carries the steps for putting the wall up whenever the plans place keys or clips, as the guide does.
  const fixings = fixingSystem(config, mount, join, tab) !== 'glue'
  lines.push({
    kind: 'readme',
    text: fixings ? 'A README, your settings, printing advice and how to put it up' : 'A README, your settings and printing advice',
  })

  return { files: models + accessories.length + DOCUMENTS, lines }
}

/**
 * The heading over the parts list, naming only the groups this design prints: "Keys", "Wall clips",
 * "Keys and wall clips".
 */
export function partsTitle(accessories: readonly Pick<AccessorySpec, 'group'>[]): string {
  const has = (group: AccessorySpec['group']) => accessories.some((part) => part.group === group)
  const names = [has('join') && 'keys', has('mount') && 'wall clips'].filter((name): name is string => typeof name === 'string')
  const list = names.length <= 1 ? (names[0] ?? 'printed parts') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return list.charAt(0).toUpperCase() + list.slice(1)
}
