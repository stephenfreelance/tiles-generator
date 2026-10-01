// What the sample plates' own zip holds: one STL per plate at the root, then a README with each plate's map.
// Put together on the main thread, like the fit test's zip, from files the worker has already written: the
// worker's own zip adds a wall's plan and a README about tiles this download does not hold, and protocol.ts
// is a contract. The zipping itself is zipAsync's, off the main thread.
import { README_FILE, sizeText, slug } from '@/core/export/filenames'
import { PRINT_SETTINGS } from '@/core/printSettings'
import { textureById } from '@/core/textures/registry'
import type { DesignConfig } from '@/core/types'
import { JOINT_COPY } from '@/features/studio/edges'
import { NAMED_RELIEFS, type PlacedSample, type SamplePlates } from './samplePlates'

export interface ZipEntry {
  name: string
  data: Uint8Array
}

const bedText = (plates: Pick<SamplePlates, 'bed'>) => `${sizeText(plates.bed.width)}x${sizeText(plates.bed.depth)}`

export function plateFileName(plate: number, count: number): string {
  return `sample-plate-${plate + 1}-of-${count}.stl`
}

/** "Coral", "Coral and Zellige", "Wavy, Coral and Zellige". */
const andList = (names: readonly string[]) =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

const reliefNames = (plates: Pick<SamplePlates, 'reliefs'>) => plates.reliefs.map((id) => textureById(id).name)

/**
 * Named like the wall's own zip and the fit test's, with what it holds and the plate size, so the kinds and two
 * printers' zips never collide: "kitchen-sample-plates-256x256.zip" for every relief, "kitchen-wavy-samples-180x180.zip"
 * for one relief (the maker's own or another), "kitchen-5-relief-samples-256x256.zip" for any other pick.
 */
export function samplePlatesZipName(config: Pick<DesignConfig, 'name'>, plates: Pick<SamplePlates, 'bed' | 'pick' | 'reliefs'>): string {
  const names = reliefNames(plates)
  const what =
    plates.pick === 'every' ? 'sample-plates' : names.length === 1 ? `${slug(names[0])}-samples` : `${names.length}-relief-samples`
  return `${slug(config.name) || 'tessera'}-${what}-${bedText(plates)}.zip`
}

/** The 80-byte header of a plate's STL. */
export function plateHeader(config: Pick<DesignConfig, 'name'>, plates: Pick<SamplePlates, 'bed' | 'plates'>, plate: number): string {
  return `Tessera ${config.name} sample plate ${plate + 1} of ${plates.plates.length}, ${bedText(plates)} mm`
}

const WIDTH = 88

/** The file is plain ASCII, so the multiplication sign the page uses is written as an x here. */
const ascii = (text: string) => text.replaceAll('×', 'x')

/** Words wrapped to the file's width, the first line after `lead`, the rest under `indent`. */
function wrapped(text: string, lead: string, indent = ' '.repeat(lead.length)): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of ascii(text).split(' ')) {
    if (line && `${line} ${word}`.length > WIDTH - indent.length) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines.map((part, i) => `${i === 0 ? lead : indent}${part}`)
}

/** The plate seen from above, front at the bottom: each place by its number, an empty place as a dash. */
function plateMap(plates: SamplePlates, samples: readonly PlacedSample[]): string[] {
  const { columns, rows } = plates.grid
  // Two digits at least, so a map of one plate lines up like a map of three.
  const width = Math.max(2, String(plates.samples.length).length) + 2
  const lines: string[] = []
  for (let row = 0; row < rows; row++) {
    let line = ' '
    for (let column = 0; column < columns; column++) {
      const sample = samples.find((s) => s.row === row && s.column === column)
      line += (sample ? String(sample.number) : '-').padStart(width)
    }
    lines.push(line)
  }
  return lines
}

/**
 * What the zip is, how to print it, and each plate's map with every sample named under it. A sample carries
 * no mark of its own, so the map is its label: the README says so before the first plate.
 */
export function samplePlatesReadme(config: DesignConfig, plates: SamplePlates, printer: string): string {
  const count = plates.plates.length
  const joint = JOINT_COPY[config.bevel > 0 ? config.jointEdge : 'square'].name.toLowerCase()
  const relief = textureById(config.texture.id).name
  const names = reliefNames(plates)
  const laid = `laid out on ${count === 1 ? 'a plate' : `${count} plates`} of ${sizeText(plates.bed.width)} x ${sizeText(plates.bed.depth)} mm (${printer})`
  const tile = `your ${sizeText(config.tile.width)} x ${sizeText(config.tile.height)} mm tile, on your ${sizeText(config.tile.thickness)} mm base with ${joint} joints`
  const title =
    plates.pick === 'every' ? 'sample plates' : names.length === 1 ? `${names[0]} samples` : `samples of ${names.length} reliefs`
  let intro: string
  if (plates.pick === 'every') {
    intro = `Small squares of your own tile in every relief, ${laid}, so each relief can be held in the hand before a wall of tiles is printed. Every sample is cut from ${tile}: only what its name says is changed.`
  } else if (plates.pick === 'yours') {
    intro = `Small squares of your own tile in your ${relief} relief, exactly as you set it, ${laid}, so it can be held in the hand before a wall of tiles is printed. Every sample is cut from ${tile}, and nothing about it is changed.`
  } else if (names.length === 1) {
    intro = `Small squares of your own tile in the ${names[0]} relief, at its own depth and feature size, ${laid}, so it can be held in the hand before a wall of tiles is printed. Every sample is cut from ${tile}: only its relief is changed.`
  } else {
    // A few reliefs are named here; more are named under the plates, where each has its number.
    const which = names.length <= NAMED_RELIEFS ? andList(names) : `the ${names.length} reliefs you picked`
    const own = plates.reliefs.includes(textureById(config.texture.id).id)
      ? ` Your ${relief} relief is exactly as you set it; every other one is at its own depth and feature size.`
      : ''
    intro = `Small squares of your own tile in ${which}, ${laid}, so each relief can be held in the hand before a wall of tiles is printed. Every sample is cut from ${tile}: only what its name says is changed.${own}`
  }
  const lines = [`TESSERA / ${config.name} / ${title}`, '']
  lines.push(...wrapped(intro, '  '), '')

  lines.push('FILES, at the root of this zip')
  const nameWidth = plateFileName(count - 1, count).length + 3
  for (const [plate, samples] of plates.plates.entries()) {
    lines.push(`  ${plateFileName(plate, count).padEnd(nameWidth)}Plate ${plate + 1}: ${samples.length} ${samples.length === 1 ? 'sample' : 'samples'}`)
  }
  lines.push(`  ${README_FILE.padEnd(nameWidth)}This file`, '')

  lines.push('PRINTING')
  lines.push(
    ...wrapped('Open a plate file in your slicer. Its samples are already laid out on the plate, so print it as it comes: face up, no supports.', '  1. '),
    ...wrapped(
      `Slice it as you will slice the tiles (${PRINT_SETTINGS.summary}), in the filament you mean to use: a sample printed any other way tells you about a different print.`,
      '  2. ',
    ),
    ...wrapped(
      'Nothing is printed on a sample: its number is its place on the plate. Keep the map below beside you as they come off, and write each number on its back.',
      '  3. ',
    ),
  )
  if (plates.samples.some((sample) => sample.kind === 'joint')) {
    lines.push(...wrapped('A joint sample is two strips: butt them together, relief up, to see the joint as the wall shows it.', '  4. '))
  }
  lines.push('')

  for (const [plate, samples] of plates.plates.entries()) {
    lines.push(`PLATE ${plate + 1} OF ${count} (seen from above, the front of the plate at the bottom)`, '')
    lines.push(...plateMap(plates, samples), '')
    for (const sample of samples) {
      lines.push(...wrapped(sample.title, `  ${String(sample.number).padStart(3)}  `))
      lines.push(...wrapped(sample.note, '       '))
    }
    lines.push('')
  }
  return lines.join('\n')
}

/** Every plate at the root, then README.txt. */
export function samplePlatesFiles(
  config: DesignConfig,
  plates: SamplePlates,
  plateFiles: readonly Uint8Array[],
  printer: string,
): ZipEntry[] {
  const count = plates.plates.length
  if (plateFiles.length !== count) throw new Error(`Expected ${count} plate files, got ${plateFiles.length}.`)
  return [
    ...plateFiles.map((file, plate) => ({ name: plateFileName(plate, count), data: file })),
    { name: README_FILE, data: new TextEncoder().encode(samplePlatesReadme(config, plates, printer)) },
  ]
}
