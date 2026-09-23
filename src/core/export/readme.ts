import { colorName } from '../colors'
import { accessoryParts } from '../fixing/accessories'
import { tabLimits } from '../fixing/capability'
import { fitChosenText, fitTestGuide, mountingGuide, usesClips, usesTabs, type GuideStep, type MountingGuide } from '../fixing/guide'
import { joinPlan } from '../fixing/joins'
import { mountPlan } from '../fixing/mount'
import { tabPlan, type TabPlan } from '../fixing/tabs'
import type { AccessoryKind, AccessorySpec, JoinPlan, MountPlan } from '../fixing/types'
import { effectiveBevel } from '../geometry/heightfield'
import { resolveJointEdge, resolvePerimeter, type ResolvedPerimeter } from '../geometry/profiles'
import { buildPlanModel, tileAtPoint, wallCutSides, type PlanModel } from '../plan/planModel'
import { ELEPHANT_FOOT_NOTE } from '../printSettings'
import { SIDE_NAMES, hasSide } from '../sides'
import { resolveParams, textureById } from '../textures/registry'
import type { DesignConfig, ExportFormat, LayoutPlan, PerimeterProfile } from '../types'
import { formatNumber } from '../units'
import { accessoryFileName, accessoryZipPath, pieceFileName, sizeText } from './filenames'

const ORIGIN_TEXT: Record<DesignConfig['layout']['origin'], string> = {
  corner: 'Set out from the left edge',
  center: 'Centred on the surface',
  balanced: 'Balanced, shifted to keep the edge cuts as wide as possible',
}

/** The wall edges that really take cuts, as the studio's plan names them. */
function cutsText(model: PlanModel): string {
  if (model.exact) return 'no cuts'
  const sides = wallCutSides(model)
  if (sides.length === 0) return 'cuts at the edges'
  if (sides.length === 4) return 'cuts on every edge'
  const list = sides.length === 1 ? sides[0] : `${sides.slice(0, -1).join(', ')} and ${sides.at(-1)}`
  return `cuts on the ${list} ${sides.length === 1 ? 'edge' : 'edges'}`
}

/** Joins words that must not part at a line break; wrapped() prints it as a plain space. */
const NO_BREAK = '\u00a0'

/** A length's number and its unit stay on one line: "5 mm" never wraps as "5" and "mm". */
const keepUnits = (text: string): string => text.replace(/(\d) mm\b/g, `$1${NO_BREAK}mm`)

/** Words wrapped to `width` columns less the indent, the first line after `lead`, the rest under it. */
function wrapped(text: string, lead: string, indent: string, width = 88): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && `${line} ${word}`.length > width - indent.length) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines.map((text, i) => `${i === 0 ? lead : indent}${text.replaceAll(NO_BREAK, ' ')}`)
}

/** One numbered step, wrapped under its number the way the rest of the file is set. */
function step(number: number, text: string, width = 88): string[] {
  return wrapped(text, `  ${number}. `, '     ', width)
}

/** A paragraph, indented two spaces like every other line of the file. */
const paragraph = (text: string): string[] => wrapped(text, '  ', '  ')

/** A labelled line whose text wraps under itself, like the SURFACE fields. */
const field = (label: string, text: string): string[] => wrapped(text, pad(label), ' '.repeat(18))

/** Where to start, from the same setting-out point the plan and the studio draw. */
function setOutStep(config: DesignConfig, model: PlanModel): string {
  const { point } = model.settingOut
  const cuts = model.exact ? '' : ` The ${cutsText(model).replace(/^cuts/, 'cut pieces fall')}.`
  if (config.layout.origin === 'corner') {
    if (point.y > 0.01) {
      return `Mark the setting-out point, shown as SO on the plan: measure ${sizeText(point.y)} mm up from the bottom edge at the left and draw a level line. The first full-height row sits on it.${cuts}`
    }
    return `Start in the bottom-left corner, at the setting-out point marked SO on the plan.${cuts}`
  }
  const why = config.layout.origin === 'center' ? ' The cuts are shared between opposite edges.' : ' The grid is shifted to keep the edge cuts as wide as possible.'
  return `Snap the setting-out lines shown on the plan and work outwards from the point marked SO.${why}`
}

const OFFSET_TEXT: Record<string, string> = {
  '0': 'Straight rows (stack bond)',
  '0.5': 'Running bond, every other row shifted by half a tile',
  '0.3333': 'Running bond, every row shifted by a third of a tile',
}

const pad = (label: string) => `  ${label.padEnd(16)}`

/** A table cell padded to its column, and never run into the next one by a long border label. */
const cell = (text: string, width: number) => (text.length < width ? text.padEnd(width) : `${text} `)

/**
 * A table row: its mark, its label padded to `width`, then the rest. A label too long for its column
 * takes a line of its own and the rest of the row goes under it, in its columns.
 */
function labelledRow(mark: string, label: string, width: number, rest: string): string[] {
  const lead = `  ${mark.padEnd(6)}`
  if (label.length < width) return [`${lead}${label.padEnd(width)}${rest}`]
  return [`${lead}${label}`, `${' '.repeat(lead.length + width)}${rest}`]
}

/** "a, b and c". */
const listText = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

const mm = (value: number) => `${sizeText(value)} mm`

/** The fixings the README describes: the design's printed parts, those in this zip, and the plans that place them. */
export interface ReadmeFixings {
  /** Every printed part the design needs (accessoryParts when omitted): the guide names marks and counts from these. */
  parts?: readonly AccessorySpec[]
  /** The parts this zip holds, listed with their files (all of `parts` when omitted). */
  zipped?: readonly AccessorySpec[]
  mount?: MountPlan
  join?: JoinPlan
  tab?: TabPlan
}

const PERIMETER_NAMES: Record<Exclude<PerimeterProfile, 'none'>, string> = {
  margin: 'Flat margin',
  chamfer: 'Chamfered edge',
  bullnose: 'Rounded edge (bullnose)',
  ogee: 'Ogee edge',
  frame: 'Raised frame',
}

/** Heading per kind of printed part, in the order the PRINTING notes list them. */
const KIND_NAMES: [Exclude<AccessoryKind, 'fit-test'>, string][] = [
  ['clip', 'Wall clips'],
  ['key', 'Keys'],
]

/** The edge between tiles in words, from the size the mesher really cuts. */
function jointEdgeText(config: DesignConfig): string {
  const edge = resolveJointEdge(config)
  const where = 'on every side where two tiles meet'
  if (edge.profile === 'square' || !(edge.size > 0)) return 'Square: the tiles meet with sharp edges, no bevel.'
  if (edge.profile === 'chamfer') return `${mm(edge.size)} chamfer ${where}.`
  if (edge.profile === 'round') return `Rounded, ${mm(edge.size)}, ${where}.`
  return `Pillowed: a soft roll ${mm(edge.size)} deep and ${mm(edge.run)} wide ${where}.`
}

/** The surface sides a profile runs along, in reading order: "the top, right and left edges". */
function sidesText(mask: number): string {
  const order = [2, 1, 0, 3] as const
  const names = order.filter((side) => hasSide(mask, side)).map((side) => SIDE_NAMES[side])
  return names.length === 4 ? 'all four edges of the surface' : `the ${listText(names)} ${names.length === 1 ? 'edge' : 'edges'} of the surface`
}

/** The perimeter profile in words, with the numbers the geometry really applied. */
function perimeterText(config: DesignConfig, e: ResolvedPerimeter): string[] {
  const shape =
    e.profile === 'margin'
      ? `a flat band ${mm(e.w)} wide`
      : e.profile === 'frame'
        ? `${mm(e.w)} wide, ${e.h > 0 ? `standing ${mm(e.h)} above` : 'level with'} the relief peaks`
        : `${mm(e.w)} wide, dropping ${mm(e.h)} to the rim`
  const out = [`${PERIMETER_NAMES[e.profile]} along ${sidesText(e.sides)}: ${shape}.`]
  if (e.cut && config.texture.depth > 0) {
    out.push('It cuts through the relief from its peaks down and only takes material away: the valleys stay open right to the rim, never filled.')
  } else if (e.F > 0) {
    const level = config.perimeter.land === 'peaks' ? 'peaks' : 'valleys'
    out.push(`The relief fades out over ${mm(e.F)} into a flat band level with its ${level} before the profile starts.`)
  }
  if (e.profile === 'frame') out.push(`Border pieces stand ${mm(e.Zf)} tall, frame included.`)
  if (e.reason === 'plate') out.push('It was lowered to leave the rim enough base plate: a thicker base (Sturdy) gives it room.')
  else if (e.reason === 'surface') out.push('It was narrowed to fit the surface.')
  out.push('Only the pieces along those edges change: they are models of their own, lettered on the plan.')
  return out
}

function edgesSection(config: DesignConfig): string[] {
  const perimeter = resolvePerimeter(config)
  if (config.jointEdge === 'chamfer' && !perimeter) return []
  const lines = ['EDGES', ...field('Between tiles', jointEdgeText(config))]
  if (perimeter) lines.push(...field('Around the wall', perimeterText(config, perimeter).join(' ')))
  lines.push('')
  return lines
}

/** A part's size to the tenth of a millimetre, as the download page shows it. */
const tenth = (mm: number) => String(Number(mm.toFixed(1)))

/** Bounding box as printed: "246 x 38 x 6 mm". */
const partSize = (spec: AccessorySpec) => `${tenth(spec.size.x)} x ${tenth(spec.size.y)} x ${tenth(spec.size.z)} mm`

/**
 * The printed parts, each with its size, count and file, in columns as wide as this design's parts need.
 * `flat` names the file alone, for a zip that holds nothing but parts (the fit test's own).
 */
function partsTable(zipped: readonly AccessorySpec[], format: ExportFormat, flat = false): string[] {
  const labelWidth = Math.min(34, Math.max(26, ...zipped.map((part) => part.label.length + 2)))
  const sizeWidth = Math.max(16, ...zipped.map((part) => partSize(part).length + 2))
  const lines = [`  Mark  ${'Part'.padEnd(labelWidth)}${'Size'.padEnd(sizeWidth)}Copies  File`]
  for (const part of zipped) {
    const rest = `${partSize(part).padEnd(sizeWidth)}${String(part.count).padEnd(8)}${flat ? accessoryFileName(part, format) : accessoryZipPath(part, format)}`
    lines.push(...labelledRow(part.mark, part.label, labelWidth, rest))
  }
  return lines
}

const marksOf = (plan: LayoutPlan, ids: readonly string[]) => plan.pieces.filter((p) => ids.includes(p.id)).map((p) => p.mark)

/** The guide's numbered steps, as the file sets them: a step's title leads its text. */
function guideSteps(guide: { steps: readonly GuideStep[] }): string[] {
  const lines = ['  Steps']
  guide.steps.forEach((s, i) => lines.push(...step(i + 1, keepUnits(`${s.title}. ${s.body.join(' ')}`))))
  return lines
}

/** The heading of the mounting section of a wall on clips, which the other sections point to. */
const CLIPS_HEADING = 'MOUNTING ON WALL CLIPS'

/** What the keys are and how many: how to fit them is in the steps of the mounting section. */
function keysSection(
  config: DesignConfig,
  plan: LayoutPlan,
  format: ExportFormat,
  parts: readonly AccessorySpec[],
  zipped: readonly AccessorySpec[],
  join: JoinPlan,
  unclipped: readonly string[],
  guide: MountingGuide,
): string[] {
  if (config.lock !== 'keys') return []
  const keyParts = parts.filter((p) => p.kind === 'key' && p.group === 'join')
  const printed = keyParts.reduce((sum, p) => sum + p.count, 0)
  const lines = ['KEYS BETWEEN TILES']
  if (join.keys === 0) {
    // On clips the tiles still go up one by one; otherwise the wall is glued.
    const glue = guide.system === 'clips' ? '' : ' Glue them as below.'
    lines.push(...paragraph(`No key fits this design: its joints are too short or its base too thin for the slots, so the tiles are not keyed.${glue}`), '')
    return lines
  }
  const file = keyParts[0] && zipped.includes(keyParts[0]) ? ` (${accessoryZipPath(keyParts[0], format)})` : ''
  const between = join.keys === 1 ? '1 key goes' : `${join.keys} keys go`
  const printedText = keyParts[0] ? ` Print the key file${file} ${printed} times${printed > join.keys ? ', spares included' : ''}.` : ''
  lines.push(
    ...paragraph(keepUnits(`Each tile has bow-tie shaped slots in the back of its inner edges: ${between} between them.${printedText}`)),
    ...paragraph(
      // Only keys alone make a panel to carry; on clips each tile goes up on its own.
      'The keys lock neighbouring tiles edge to edge in the plane of the wall: in line, with even joints. ' +
        (guide.system === 'both'
          ? 'They do not hold anything to the wall: the clips do, and the wall keeps the tiles flat.'
          : 'They do not hold anything to the wall, and the wall is what keeps the tiles flat, so carry a keyed panel flat, supported under its whole face.'),
    ),
    ...paragraph(
      guide.system === 'both'
        ? `They go in as the tiles go up: see the steps under ${CLIPS_HEADING}.`
        : 'How to fit them: see the steps under MOUNTING WITH KEYS.',
    ),
  )
  // On clips a piece keyed to nothing still goes up on its own clips; one with neither is in the steps.
  const both = guide.system === 'both'
  const noClip = new Set(unclipped)
  const loose = marksOf(plan, both ? join.unkeyedPieceIds.filter((id) => !noClip.has(id)) : join.unkeyedPieceIds)
  if (loose.length > 0) {
    const one = loose.length === 1
    const fix = both ? `${one ? 'it goes' : 'they go'} up on ${one ? 'its' : 'their'} clips alone` : `glue ${one ? 'it' : 'them'} to the tiles beside ${one ? 'it' : 'them'}`
    lines.push(...paragraph(`${one ? `Piece ${loose[0]} has` : `Pieces ${listText(loose)} have`} no joint long enough for a key: ${fix}.`))
  }
  lines.push('')
  return lines
}

/** The heading of the mounting section of a wall glued up with tabs. */
const TABS_HEADING = 'MOUNTING WITH TABS'

/**
 * What the tabs are, how much of the wall they lock, and what is printed for them: nothing. How to set the
 * tiles is in the steps of the mounting section, worded there and only there.
 */
function tabsSection(config: DesignConfig, plan: LayoutPlan, tab: TabPlan, unclipped: readonly string[], guide: MountingGuide): string[] {
  if (config.lock !== 'tabs') return []
  const lines = ['TABS BETWEEN TILES']
  if (tab.tabs === 0) {
    // On clips the tiles still go up one by one; otherwise the wall is glued.
    const glue = usesClips(guide.system) ? '' : ' Glue them as below.'
    lines.push(
      ...paragraph(
        `No tab fits this design: its joints are too wide, its pieces too narrow or its base too thin for the sockets, so the tiles are not locked to each other.${glue}`,
      ),
      '',
    )
    return lines
  }
  const projection = tabLimits(config)?.projection ?? 0
  const between = tab.joints === 1 ? '1 joint between tiles is' : `${tab.joints} joints between tiles are`
  lines.push(
    ...paragraph(
      keepUnits(
        `Each tile has a tab in the back of its right edge and the socket that tab goes into in the back of its left: ` +
          `${between} held shut by them. Nothing is printed for them: a tab goes into its socket as its tile is ` +
          `pressed on.`,
      ),
    ),
    ...paragraph(
      'The tabs lock neighbouring tiles edge to edge in the plane of the wall: in line, with even joints. ' +
        (usesClips(guide.system)
          ? 'They do not hold anything to the wall: the clips do, and the wall keeps the tiles flat.'
          : 'They do not hold anything to the wall: the adhesive or the tape does, and the wall keeps the tiles flat.') +
        ' Nothing locks one row to the next, so each row is its own strip.',
    ),
    ...paragraph(`How the tiles go up: see the steps under ${usesClips(guide.system) ? CLIPS_HEADING : TABS_HEADING}.`),
    ...paragraph(
      keepUnits(
        `Each tile's file is ${mm(projection)} wider than the tile, because its tab stands out past its right side: ` +
          `leave that much between tiles on the plate. Every other size here is the tile's own.`,
      ),
    ),
  )
  // On clips a piece no tab locks still goes up on its own clips; one with neither is in the steps.
  const onClips = usesClips(guide.system)
  const noClip = new Set(unclipped)
  const loose = marksOf(plan, onClips ? tab.unlockedPieceIds.filter((id) => !noClip.has(id)) : tab.unlockedPieceIds)
  if (loose.length > 0) {
    const one = loose.length === 1
    const fix = onClips
      ? `${one ? 'it goes' : 'they go'} up on ${one ? 'its' : 'their'} clips alone`
      : `glue ${one ? 'it' : 'them'} to the tiles beside ${one ? 'it' : 'them'}`
    lines.push(...paragraph(`${one ? `Piece ${loose[0]} has` : `Pieces ${listText(loose)} have`} no room for a socket, so no tab locks ${one ? 'it' : 'them'}: ${fix}.`))
  }
  lines.push('')
  return lines
}

/**
 * A wall that goes up on keys, clips or tabs: the guide's lede, what to have to hand, then its steps numbered
 * word for word as the download page shows them.
 */
function fixedMountingSection(heading: string, guide: MountingGuide): string[] {
  const lines = [heading, ...paragraph(keepUnits(guide.lede)), '']
  if (guide.needs) lines.push(...field('You will need', keepUnits(guide.needs)), '')
  lines.push(...guideSteps(guide), '')
  return lines
}

export function buildReadme(config: DesignConfig, plan: LayoutPlan, format: ExportFormat, fixings: ReadmeFixings = {}): string {
  const parts = fixings.parts ?? accessoryParts(config, plan)
  const zipped = fixings.zipped ?? parts
  const mount = fixings.mount ?? mountPlan(config, plan)
  const join = fixings.join ?? joinPlan(config, plan)
  const tab = fixings.tab ?? tabPlan(config, plan)
  // The same steps the download page shows, worded from the same plans.
  const guide = mountingGuide({ config, plan, mount, join, tab, accessories: parts })
  const onClips = usesClips(guide.system)
  const edges = edgesSection(config)
  const texture = textureById(config.texture.id)
  const params = resolveParams(texture, config.texture.params)
  const area = (config.surface.width * config.surface.height) / 1e6
  const model = buildPlanModel(config, plan)
  const firstPiece = tileAtPoint(model.tiles, model.settingOut.point)
  const lines: string[] = []

  lines.push(`TESSERA / ${config.name}`)
  lines.push('Decorative relief tiles, generated as printable models.')
  lines.push('')

  lines.push('SURFACE')
  lines.push(`${pad('Size')}${sizeText(config.surface.width)} x ${sizeText(config.surface.height)} mm (${formatNumber(area, 2)} m2)`)
  lines.push(`${pad('Tile')}${sizeText(config.tile.width)} x ${sizeText(config.tile.height)} x ${sizeText(config.tile.thickness)} mm`)
  lines.push(`${pad('Color')}${colorName(config.color)} (${config.color})`)
  lines.push(`${pad('Joint')}${sizeText(config.joint)} mm between tiles`)
  // The chamfer the mesher actually cuts: never more than half the base plate. Any other edge has its own section.
  if (edges.length === 0) lines.push(`${pad('Bevel')}${sizeText(effectiveBevel(config))} mm chamfer on every tile edge`)
  lines.push(`${pad('Layout')}${ORIGIN_TEXT[config.layout.origin]}, ${cutsText(model)}`)
  lines.push(`${pad('Rows')}${OFFSET_TEXT[String(config.layout.rowOffset)] ?? OFFSET_TEXT['0']}`)
  lines.push(`${pad('Tiles')}${plan.fullCount} full, ${plan.partialCount} cut, ${plan.columns} columns x ${plan.rows} rows`)
  lines.push('')

  lines.push('TEXTURE')
  lines.push(`${pad('Pattern')}${texture.name} (${texture.mark})`)
  lines.push(`${pad('Relief depth')}${sizeText(config.texture.depth)} mm above the base plate`)
  lines.push(`${pad('Feature size')}${sizeText(config.texture.scale)} mm`)
  for (const param of texture.params) {
    const value = params[param.key]
    if (value === undefined) continue
    lines.push(`${pad(param.label)}${formatNumber(value, 2)}${param.unit ? ` ${param.unit}` : ''}`)
  }
  if (texture.seeded) lines.push(`${pad('Seed')}${config.texture.seed}`)
  if (config.texture.invert) lines.push(`${pad('Inverted')}Peaks and valleys swapped`)
  if (texture.directional && config.texture.rotate) lines.push(`${pad('Rotated')}Quarter turn`)
  lines.push('')
  lines.push(...edges)

  lines.push(`MODELS (${format.toUpperCase()})`)
  lines.push('  Mark  Piece                     Size            Copies  File')
  for (const piece of plan.pieces) {
    const size = `${sizeText(piece.width)} x ${sizeText(piece.height)} mm`
    lines.push(...labelledRow(piece.mark, piece.label, 26, `${cell(size, 16)}${String(piece.count).padEnd(8)}${pieceFileName(piece, format)}`))
  }
  lines.push('')
  if (zipped.length > 0) {
    lines.push('  Printed parts, each in its folder:')
    lines.push(...partsTable(zipped, format))
    lines.push('')
  }
  lines.push('  setting-out-plan.svg    Where every piece goes, with its mark and size.')
  lines.push('  README.txt              This file.')
  lines.push('')

  lines.push('LAYING OUT')
  lines.push('  1. Open setting-out-plan.svg. It shows the surface seen from the front, with each')
  lines.push('     tile position marked A, B, C and so on, and the cut pieces dimensioned.')
  // Clips set the wall out from the start line and keys from the panel's bottom edge, each taking the tiles
  // in its own order. Only a glued wall starts from the plan's setting-out point and its fitting order.
  lines.push(
    ...step(
      2,
      onClips
        ? `With wall clips the start line sets the wall out, not the setting-out point (SO) the plan marks for glue: draw it level where the bottom edge of the surface will be and follow ${CLIPS_HEADING} below.`
        : guide.system === 'keys'
          ? "With keys the panel's bottom edge sets the wall out, not the setting-out point (SO) the plan marks for glue: draw a level line where the bottom edge of the surface will be and put the panel up with its bottom edge on it."
          : setOutStep(config, model),
    ),
  )
  // A row that starts on a cut (a running bond) cannot leave its cuts for last.
  const order = onClips
    ? `Press the tiles on row by row from the bottom up, each row from its first piece, fitting the cut pieces as you reach them, in the order ${CLIPS_HEADING} gives.`
    : guide.system === 'keys'
      ? 'The keys set the order: key every piece to its neighbours face down, cut pieces included, and put the panel up bottom edge first, as MOUNTING WITH KEYS says below.'
      : guide.system === 'tabs'
        ? `The tabs set the order: work from the bottom row up, each row strictly from left to right, so every tile goes on after the one to its left, as ${TABS_HEADING} says below.`
        : firstPiece?.cut || plan.fullCount === 0
          ? 'Lay each row from its first piece, working from the bottom up and fitting the cut pieces as you reach them.'
          : 'Lay the full tiles first, working from the bottom up, then fill the edges with the cut pieces.'
  lines.push(
    ...step(
      3,
      `${order} Every cut piece carries the slice of pattern it replaces, so the relief runs continuously across the joints when each piece sits on its mark.`,
    ),
  )
  if (config.joint > 0) {
    lines.push(`  4. Keep a ${sizeText(config.joint)} mm joint between tiles; spacers of that size help.`)
  }
  lines.push('')

  lines.push('PRINTING')
  lines.push('  Print face up, relief upwards, flat on the plate. No supports are needed:')
  lines.push('  the relief has no overhangs.')
  lines.push('  Layer height    0.12 to 0.2 mm. Thinner layers show more of the relief.')
  lines.push(`  Walls           3 perimeters, so the ${edges.length === 0 ? 'chamfered ' : ''}edges stay crisp.`)
  lines.push('  Infill          15%, gyroid or grid.')
  lines.push('  Brim            Add a brim for the small cut pieces; they have little bed contact.')
  lines.push('  Filament        Any PLA in the color listed under SURFACE.')
  // The printed box is wider than the tile, which the bed check and the plate count already read.
  if (usesTabs(guide.system)) {
    lines.push(...field('Tabs', keepUnits(`The tabs stand ${mm(tabLimits(config)?.projection ?? 0)} past one side of each tile: leave that much between tiles on the plate.`)))
  }
  // Keys press tiles edge to edge and clips click into pockets at the back, both where the first layer's bulge sits.
  if (guide.system !== 'glue') lines.push(...field('Elephant foot', ELEPHANT_FOOT_NOTE))
  if (zipped.length > 0) {
    lines.push('')
    // The fit test is not in this zip: step 1 of the mounting section says where it is.
    lines.push(...paragraph('Printed parts: set the fit first (step 1 below), then print them.'))
    for (const [kind, name] of KIND_NAMES) {
      // A kind's own advice, from a wall part when there is one (the fit test prints the same way).
      const note = (zipped.find((p) => p.kind === kind && p.group !== 'fit-test') ?? zipped.find((p) => p.kind === kind))?.printNote
      if (note) lines.push(...field(name, note))
    }
    // Keys sit behind the joints: an open joint shows them.
    if (parts.some((p) => p.kind === 'key' && p.group === 'join') && config.joint > 0) lines.push(...field('', 'Print the keys in the tile color: an open joint shows them.'))
  }
  lines.push('')

  lines.push(...keysSection(config, plan, format, parts, zipped, join, mount.unmountedPieceIds, guide))
  lines.push(...tabsSection(config, plan, tab, mount.unmountedPieceIds, guide))

  if (onClips) {
    lines.push(...fixedMountingSection(CLIPS_HEADING, guide))
  } else if (guide.system === 'keys') {
    lines.push(...fixedMountingSection('MOUNTING WITH KEYS', guide))
  } else if (guide.system === 'tabs') {
    lines.push(...fixedMountingSection(TABS_HEADING, guide))
  } else {
    lines.push('MOUNTING')
    lines.push('  Glue the tiles with tile adhesive, or with double-sided mounting tape for a')
    lines.push('  removable finish. Check each piece against the plan before the adhesive sets.')
    lines.push('')
  }

  return `${lines.join('\n')}`
}

/**
 * The README of the fit test's own zip: what it is, what to have to hand, its parts at the root of the zip,
 * then fitTestGuide's steps numbered word for word and the fit these files were made at. Every sentence
 * comes from the guide, so the page and this file cannot tell a maker two different things.
 */
export function buildFitTestReadme(config: DesignConfig, parts: readonly AccessorySpec[], format: ExportFormat): string {
  const guide = fitTestGuide({ config, parts })
  const lines = [`TESSERA / ${config.name} / fit test`]
  if (!guide) {
    // Nothing this design prints has to fit into anything, so there is nothing to try.
    lines.push('', ...paragraph('This design has no fit test: its tiles go up with glue or tape, and nothing it prints is made to fit into something else.'), '')
    return lines.join('\n')
  }
  lines.push('', ...paragraph(keepUnits(guide.lede)), '')
  if (guide.needs) lines.push(...field('You will need', keepUnits(guide.needs)), '')
  lines.push('  Parts, all at the root of this zip:')
  lines.push(...partsTable(parts, format, true))
  lines.push('')
  lines.push(...guideSteps(guide))
  lines.push('')
  lines.push(...paragraph(keepUnits(fitChosenText(config, guide.system))))
  lines.push('')
  return lines.join('\n')
}
