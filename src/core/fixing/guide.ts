// "Putting it up": the way from a printed kit to a finished wall, in plain maker words and the design's own
// numbers (counts, lengths, the marks on the parts). The one source of these steps: the download page shows
// them with drawings, the README in the zip numbers them as text and the studio's "You'll do" reads
// mountingSummary, so none of them can tell a maker something different. Pure, so every sentence is tested
// without a DOM.
//
// Two guides live here, both in GuideStep so one component renders either: mountingGuide (the wall) and
// fitTestGuide (running the fit test, which has its own page and its own download). The fit is said in one
// sentence, fitChosenText, which the fit-test page, the wall's step 1 and the studio's Fit row all read.
//
// Marks come from the parts themselves (accessoryParts): F1... the fit test, C1 the wall clips, K1 the keys.
// No strength figures and no timings: nothing here has been measured on a printed part, which is why the fit
// test comes first and is read with the maker's own tape.
import { SETTING_OUT_PLAN_FILE } from '../export/filenames'
import { buildPlanModel, tileAtPoint } from '../plan/planModel'
import type { DesignConfig, FitClass, LayoutPlan } from '../types'
import { formatLength, formatNumber } from '../units'
import { fitClearance } from './accessories'
import { SOCKET_CLEARANCE, type TabPlan } from './tabs'
import type { AccessoryKind, AccessorySpec, JoinPlan, MountPlan } from './types'

/** How the tiles go up: the wall system, the tile-to-tile lock, either, both or neither. */
export type FixingSystem = 'glue' | 'keys' | 'clips' | 'both' | 'tabs' | 'clips-tabs'

/**
 * How the tiles really go up: each system named only once its own plan places it. A base too thin, a joint
 * edge too deep, a joint too wide for a tab or tiles too small for a clip leave the design glued, whatever
 * it asks for. The tabs' plan is required rather than defaulted: a caller that forgot it would describe a
 * locked wall as glued, and the guide, the README, the plan notes and the studio would all repeat it.
 */
export function fixingSystem(
  config: Pick<DesignConfig, 'lock' | 'mount'>,
  mount: Pick<MountPlan, 'clips'>,
  join: Pick<JoinPlan, 'keys'>,
  tab: Pick<TabPlan, 'tabs'>,
): FixingSystem {
  const keys = config.lock === 'keys' && join.keys > 0
  const tabs = config.lock === 'tabs' && tab.tabs > 0
  const clips = config.mount === 'clips' && mount.clips > 0
  if (clips) return keys ? 'both' : tabs ? 'clips-tabs' : 'clips'
  return keys ? 'keys' : tabs ? 'tabs' : 'glue'
}

/** The drawing beside a step, from the shared fixing drawings. */
export type GuideDrawing =
  | 'fit-test'
  | 'fit-keys'
  | 'fit-clips'
  | 'clips-in'
  | 'tape'
  | 'start-line'
  | 'press-on'
  | 'screws'
  | 'keys-back'
  | 'keys-in'
  | 'keys-as-you-go'
  | 'remove'
  | 'panel-up'
  // The tabs: one drawing for setting a tile over its neighbour's tab, one for trying the pair on the coupons.
  | 'tabs-in'
  | 'fit-tabs'

export interface GuideStep {
  /** Stable key for the list. */
  key: string
  title: string
  /** One short paragraph per entry. */
  body: string[]
  drawing: GuideDrawing | null
}

export interface MountingGuide {
  system: FixingSystem
  /** What the section opens with: the whole method in a sentence or two. */
  lede: string
  /** What to have to hand beyond the printed parts; null when nothing is needed but the adhesive. */
  needs: string | null
  /** Numbered steps; empty for a glued wall, which the lede covers. */
  steps: GuideStep[]
}

export interface GuideInput {
  config: DesignConfig
  plan: LayoutPlan
  mount: MountPlan
  join: JoinPlan
  tab: TabPlan
  /** The wall's printed parts (wallParts, or accessoryParts): marks, counts and spares come from these. */
  accessories: readonly AccessorySpec[]
}

/** How the fit test marks each class, and the word for it: the fit picker reads the same names. */
export const FIT_MARKS: Record<FitClass, { name: string; notches: string }> = {
  snug: { name: 'Snug', notches: 'one notch' },
  standard: { name: 'Standard', notches: 'two notches' },
  loose: { name: 'Loose', notches: 'three notches' },
}

const count = (value: number): string => formatNumber(value, 0)

const plural = (value: number, one: string, many = `${one}s`): string => `${count(value)} ${value === 1 ? one : many}`

/** "A", "A and B", "A, B and C". */
export function listText(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * Marks said the short way: a run of three or more of one letter numbered in a row reads as a range
 * ("F1 to F8"), anything else as a list ("F3 and F4").
 */
export function marksText(marks: readonly string[]): string {
  const parsed = marks.map((mark) => /^([A-Z]+)(\d+)$/.exec(mark))
  if (marks.length >= 3 && parsed.every((match) => match !== null)) {
    const [first] = parsed as RegExpExecArray[]
    const run = (parsed as RegExpExecArray[]).every(
      (match, i) => match[1] === first[1] && Number(match[2]) === Number(first[2]) + i,
    )
    if (run) return `${marks[0]} to ${marks[marks.length - 1]}`
  }
  return listText(marks)
}

/** The marks of some parts, in a bracket after their name: " (F1)", " (F1 to F8)"; empty when none are known. */
function marksAfter(parts: readonly (AccessorySpec | undefined)[]): string {
  const known = parts.filter((part): part is AccessorySpec => part !== undefined)
  return known.length > 0 ? ` (${marksText(known.map((part) => part.mark))})` : ''
}

/** The wall's own file of a part kind: the clips in the mount group, the keys in the join group (not the fit test's). */
const wallPart = (accessories: readonly AccessorySpec[], kind: Extract<AccessoryKind, 'clip' | 'key'>) =>
  accessories.find((part) => part.kind === kind && part.group === (kind === 'clip' ? 'mount' : 'join'))

export const usesKeys = (system: FixingSystem): boolean => system === 'keys' || system === 'both'
export const usesClips = (system: FixingSystem): boolean => system === 'clips' || system === 'both' || system === 'clips-tabs'
export const usesTabs = (system: FixingSystem): boolean => system === 'tabs' || system === 'clips-tabs'

/**
 * What the fit is cut into, in print order: "keys and clips", "clips and tiles". The tabs put the tiles on
 * that list, because their socket is cut into the plate rather than into a part printed beside it.
 */
const fittedWord = (system: FixingSystem): string =>
  listText([usesKeys(system) ? 'keys' : '', usesClips(system) ? 'clips' : '', usesTabs(system) ? 'tiles' : ''].filter(Boolean))

/** What the fit test prints in all three fits: the fasteners, and the tabs' socket. */
const testedWord = (system: FixingSystem): string =>
  listText([usesKeys(system) ? 'keys' : '', usesClips(system) ? 'clips' : '', usesTabs(system) ? 'sockets' : ''].filter(Boolean))

/** The marks of some pieces, by id, in plan order. */
const pieceMarks = (plan: LayoutPlan, ids: readonly string[]): string[] =>
  plan.pieces.filter((piece) => ids.includes(piece.id)).map((piece) => piece.mark)

/** "Piece C has" / "Pieces C and D have", for a sentence about some pieces. */
const piecesHave = (marks: readonly string[]): string =>
  marks.length === 1 ? `Piece ${marks[0]} has` : `Pieces ${listText(marks)} have`

/** Clearances are hundredths of a millimetre: finer than the 0.1 mm every other length is said to. */
const fine = (mm: number) => `${formatNumber(mm, 2)} mm`

/** "keys 0.1 mm and clips 0.2 mm": the per-side clearance of everything this wall cuts to the fit. */
function clearanceText(fit: FitClass, system: FixingSystem): string {
  return listText(
    [
      usesKeys(system) ? `keys ${fine(fitClearance(fit, 'key'))}` : '',
      usesClips(system) ? `clips ${fine(fitClearance(fit, 'clip'))}` : '',
      // A socket carries the printer's error on both halves of the pair, so it is cut twice as wide.
      usesTabs(system) ? `sockets ${fine(SOCKET_CLEARANCE[fit])}` : '',
    ].filter(Boolean),
  )
}

/**
 * What the chosen fit means for these files, in one sentence: the class, its notches, the clearance per side
 * and what a new fit remakes. The one place that is said: the fit-test page prints it under its picker, the
 * wall's step 1 opens with it and the studio's Fit row shows it as its note.
 */
export function fitChosenText(config: DesignConfig, system: FixingSystem): string {
  const fit = FIT_MARKS[config.fit]
  // Nothing printed is made to fit into something else, so no clearance is carried anywhere.
  if (system === 'glue') return `Fit is set to ${fit.name}, the fit with ${fit.notches}. This wall prints no keys or clips, so nothing carries it.`
  // With the tabs the clearance is cut into the tile, so the reprint a wrong fit costs is the whole wall of
  // tiles. It is the one exception to the promise the keys and clips keep, and it is said here and nowhere else.
  const remakes = !usesTabs(system)
    ? 'A new fit remakes only those parts, never the tiles.'
    : usesClips(system)
      ? 'A new fit remakes the clips and, because the socket is cut into the tile itself, every tile.'
      : 'The socket is cut into the tile itself, so a new fit remakes every tile.'
  // The subject is the fitted parts, not "your files": this sentence also ends the fit test's own README,
  // where the files in hand are coupons printed at all three fits on purpose.
  return (
    `Your ${fittedWord(system)} are made at ${fit.name}, the fit with ${fit.notches} ` +
    `(clearance per side: ${clearanceText(config.fit, system)}). ${remakes}`
  )
}

/**
 * Step 1: a pointer, never the procedure. The fit test has its own page, its own download and its own steps
 * (fitTestGuide), so the wall's guide says which fit these files were made at and where to try it.
 */
function fitStep(config: DesignConfig, system: FixingSystem): GuideStep {
  const parts = testedWord(system)
  // What a fit you do not like costs: a reprint of the fasteners, or, with the tabs, of the tiles themselves.
  const cost = usesTabs(system)
    ? 'so the fit is settled before a single tile is printed, because the socket is cut into the tile and a fit changed after that means printing the tiles again'
    : `so a fit you do not like costs a reprint of ${parts} and never of a tile`
  return {
    key: 'fit',
    title: usesTabs(system) ? 'Set the fit before you print anything' : 'Set the fit before you print the parts',
    body: [
      fitChosenText(config, system),
      `If you have not tried that fit on this design yet, print the fit test first: it prints the ${parts} in all three ` +
        `fits on small coupons, ${cost}. The fit test ` +
        'has a page of its own, linked from the studio under Putting it up.',
    ],
    drawing: 'fit-test',
  }
}

/**
 * Copies printed beyond what the plan fits: the keys in the join group, the clips in the mount group. The fit
 * test prints keys and clips of its own, which are no spares.
 */
function spares(accessories: readonly AccessorySpec[], kind: 'key' | 'clip', fitted: number): number {
  const group = kind === 'key' ? 'join' : 'mount'
  const printed = accessories.reduce((sum, part) => sum + (part.kind === kind && part.group === group ? part.count : 0), 0)
  return Math.max(0, printed - fitted)
}

/** The tiles that carry clips: every placement but those of the pieces with no pocket. */
function clippedTiles(input: GuideInput): number {
  const off = new Set(input.mount.unmountedPieceIds)
  return input.plan.placements.filter((placement) => !off.has(placement.pieceId)).length
}

function clipsInStep(input: GuideInput): GuideStep {
  const { mount, accessories } = input
  const extra = spares(accessories, 'clip', mount.clips)
  return {
    key: 'clips-in',
    title: 'Click the clips into the tiles',
    body: [
      `Lay each tile face down on a soft cloth and press a clip${marksAfter([wallPart(accessories, 'clip')])} into every ` +
        'pocket on its back, flat side out (the side that lay on the print bed), until it clicks and its stops touch the ' +
        "bottom of the pocket: its back then lies level with the tile's back. " +
        `That is ${plural(mount.clips, 'clip')} for ${plural(clippedTiles(input), 'tile')}${extra > 0 ? `, and ${plural(extra, 'spare')}` : ''}. ` +
        "Each clip's catch keeps it in its pocket, so every tile carries its own clips to the wall.",
    ],
    drawing: 'clips-in',
  }
}

function tapeStep(): GuideStep {
  return {
    key: 'tape',
    title: 'Put tape on the clips',
    body: [
      // The fit test is read with this tape, so the wall gets the clearance the maker chose.
      "Stick a piece of thin double-sided tape (film or carpet tape) on each clip's centre block, cut to the block's " +
        'size, and leave its liner on. Use the tape you tried the fit test with. Keep the tape off the springy arms: ' +
        'they must stay free to flex.',
      "The tape is all there is between the tile and the wall: the tile's back sits a tape's thickness off it. " +
        'Not foam tape: it is too thick and too soft, and the tile would stand off the wall and rock.',
    ],
    drawing: 'tape',
  }
}

/**
 * The start line, and the batten the bottom row stands on. On clips the wall's own flatness is read first,
 * because only the tape sits behind a tile; a glued wall with tabs needs the line and the batten alone, since
 * its rows go up one tile at a time from the left.
 */
function startLineStep(config: DesignConfig, system: FixingSystem): GuideStep {
  const body: string[] = []
  if (usesClips(system)) {
    body.push(
      'Wipe the wall clean and dry where the tiles go, so the tape grips. The tiles sit on the wall with only the tape ' +
        'behind them: lay a long straightedge across it and fill any hollow first.',
    )
  }
  body.push(
    `Draw a level line where the bottom edge of the tiles will be, ${formatLength(config.surface.width)} long, and screw ` +
      'a straight batten to the wall just under it, its top edge on the line (a level worktop does the same). The bottom ' +
      'row stands on it as it goes up; take the batten down once the wall is done.',
  )
  return { key: 'start', title: 'Draw the start line', body, drawing: 'start-line' }
}

function jointText(config: DesignConfig): string {
  return config.joint > 0
    ? `Leave a ${formatLength(config.joint)} joint to each neighbour; spacers of that size help.`
    : 'Hold each tile against its neighbour as you press it on, so the joints close.'
}

/** "You have 104 keys to fit, and 6 spares." The key file prints the spares; the plan counts the fits. */
function keysToFit(join: JoinPlan, accessories: readonly AccessorySpec[]): string {
  if (join.keys <= 0) return ''
  const extra = spares(accessories, 'key', join.keys)
  return ` You have ${plural(join.keys, 'key')} to fit${extra > 0 ? `, and ${plural(extra, 'spare')}` : ''}.`
}

function keysAsYouGoStep(join: JoinPlan, accessories: readonly AccessorySpec[]): GuideStep {
  return {
    key: 'keys-as-you-go',
    title: 'Add the keys as you go',
    body: [
      'Work along each row from left to right. Before a tile goes on, press keys into its slots on the sides that ' +
        "meet a tile not up yet (its right side and its top), so half of each key stands out. The next tile's slots " +
        `go over them as you press it on.${keysToFit(join, accessories)}`,
    ],
    drawing: 'keys-as-you-go',
  }
}

function pressOnStep(config: DesignConfig, system: FixingSystem): GuideStep {
  // Keys go in as each tile goes up, and a tab enters the socket of the tile already up: both fix the order.
  const order = usesKeys(system) || usesTabs(system) ? ', each row from left to right' : ''
  return {
    key: 'press-on',
    title: 'Press the tiles on, bottom row first',
    body: [
      `Set the bottom row on the batten first, placed along it as the tiling plan (${SETTING_OUT_PLAN_FILE}) sets it out, ` +
        `then go on up row by row, following the letters${order}. Peel the liners off a tile's clips, stand the tile on the ` +
        'batten or the row below, lay it flat to the wall and press firmly over each clip: its stops carry the press ' +
        `through the clip, so the tape grips. ${jointText(config)} The clips stay where the tile puts them.` +
        (usesTabs(system) ? ` ${TAB_HOME}` : ''),
      ...(usesTabs(system) ? [TAB_CHECK] : []),
      'Then run a flat hand across the wall: a tile that rocks has a clip not fully home in its pocket, or dirt behind it.',
    ],
    drawing: 'press-on',
  }
}

/** The pieces with no clip pocket: the lock holds them when it reaches them, else a thin glue does. */
function noClipStep(input: GuideInput, system: FixingSystem): GuideStep | null {
  const { plan, mount, join, tab } = input
  const off = mount.unmountedPieceIds
  if (off.length === 0) return null
  // Which pieces the lock leaves out: with keys those keyed to nothing, with tabs those no tab locks.
  const unlocked = system === 'both' ? join.unkeyedPieceIds : usesTabs(system) ? tab.unlockedPieceIds : null
  const loose = new Set(unlocked ?? [])
  const held = unlocked ? pieceMarks(plan, off.filter((id) => !loose.has(id))) : []
  const glued = pieceMarks(plan, unlocked ? off.filter((id) => loose.has(id)) : off)
  const body: string[] = []
  if (held.length > 0) {
    const one = held.length === 1
    // The lock holds in the plane of the wall only; glued into its own recesses, it keeps the piece with its
    // clipped neighbours. A tab sits in the neighbour's socket, so the glue goes in the socket.
    const holds = usesTabs(system)
      ? `the tab in ${one ? 'its socket holds it' : 'each of their sockets holds them'}`
      : `${one ? 'its' : 'their'} keys hold ${one ? 'it' : 'them'}`
    const where = usesTabs(system) ? (one ? 'its socket' : 'their sockets') : `${one ? 'its' : 'their'} key slots`
    body.push(
      `${piecesHave(held)} no room for a clip, but ${holds} in line with ` +
        `the tiles around (not against the wall): put a drop of glue in ${where} as ${one ? 'it goes' : 'they go'} up.`,
    )
  }
  if (glued.length > 0) {
    const one = glued.length === 1
    // A thick bed of adhesive would stand the piece proud of its neighbours, whose backs sit on the wall.
    body.push(
      `${piecesHave(glued)} no room for a clip: glue ${one ? 'it' : 'them'} to the wall when ${one ? 'its' : 'their'} turn ` +
        `comes, with a thin glue or the same tape, so ${one ? 'it sits' : 'they sit'} level with the tiles around ${one ? 'it' : 'them'}.`,
    )
  }
  if (body.length === 0) return null
  return { key: 'no-clip', title: 'Fix the pieces with no clip', body, drawing: null }
}

function screwsStep(system: FixingSystem): GuideStep {
  return {
    key: 'screws',
    title: 'Screw the clips on (optional)',
    body: [
      'The tape puts each clip where its tile needs it. To fix the clips for good, screw them on as well, one tile at a ' +
        'time: each clip is its own drill guide.',
      'Find any cables and pipes with a detector first. Pull a tile straight off: its clips stay on the wall.' +
        (usesTabs(system) ? ` ${TAB_OFF}` : '') +
        ' Drill through ' +
        'the hole in each clip with a 5 mm bit, tap a 5 mm wall plug in through the clip until it is level with the wall, ' +
        "and drive a 3.5 mm countersunk screw into it until its head sits down in the clip's countersink: a head left " +
        'standing proud meets the pocket and keeps the tile from going back on. Then push the tile back on.',
    ],
    drawing: 'screws',
  }
}

function removeStep(system: FixingSystem): GuideStep {
  const keys =
    system === 'both'
      ? ' Its keys stay in it or in the tile next to it, so it still comes off on its own: press any key back into its slot before you refit it.'
      : usesTabs(system)
        ? ` ${TAB_OFF}`
        : ''
  return {
    key: 'remove',
    title: 'To take a tile off',
    body: [
      'Pull it straight off the wall with a firm, even pull. A loop of strong tape on its face, or a suction lifter on a ' +
        `smooth pattern, gives you something to hold. Its clips stay on the wall; push the tile back on to refit it.${keys}`,
      'If a tile ever sits loose, take its clips off the wall (unscrew them first if you screwed them on), click new ones ' +
        'into its pockets, at a snugger fit if need be, and put it up again with fresh tape.',
    ],
    drawing: 'remove',
  }
}

// ---------------------------------------------------------------------------------------------------
// The tabs: the one lock with nothing to print, and the one that cannot be built off the wall

/**
 * How a tab goes home, worded once for the glued and the clipped walls alike. There is no click and no
 * detent: the tab is rigid, and because its socket is open at the tile's back the press onto the wall is the
 * whole engagement.
 */
const TAB_HOME =
  'Each tile goes on after the one to its left: bring it square to the wall with its left edge at the joint, so the tab ' +
  'standing in that joint goes into the socket in its back as the tile lies down.'

/** The only check the pair offers, and the reason a tile at the wrong joint refuses to lie down at all. */
const TAB_CHECK =
  'A tile is home as soon as it lies level with the tiles beside it and the joint closes along its whole length; nothing ' +
  "has to be pressed in after it. The tab's head is wider than the throat of its socket at every depth, so a tile held at " +
  'the wrong joint stands proud instead of lying down, until it is eased along and drops in.'

/**
 * Which way a tabbed wall comes apart, worded once for the step on taking a tile off and for the screws. A
 * tile lifts its own socket off the tab beside it freely, because that socket is open at its back; its own
 * tab, though, sits under the neighbouring socket's bridged ceiling with only the recess above it, so it
 * cannot rise past that ceiling while the tile to its right is still up. So a row comes apart from its
 * right-hand end, which is the order it went up, run backwards.
 */
const TAB_OFF =
  'The socket in its back comes off the tab beside it as the tile goes, but its own tab sits under the socket of the ' +
  'tile to its right, so take that one off first: a row comes off from its right-hand end and goes back on left to ' +
  'right, with nothing to press in either way.'

/** Why the plan's order is the only order: a tab wall is built on the wall, never on a table. */
const TAB_ORDER =
  'A tab wall cannot be laid out face down on a table and lifted on: face down the sockets open away from the table, and ' +
  'a head never passes a throat sideways. The tiles go up one at a time, in the order the plan sets out.'

/** What the tabs promise, and what they do not: the words the keys already use. */
const TABS_LEDE =
  'A tab in the back of each tile goes into the socket of the tile beside it as the tile is pressed on, so the tiles of a ' +
  'row lock edge to edge, in line, with even joints. Nothing is printed for them. The adhesive or the tape holds the ' +
  'tiles to the wall, and nothing locks one row to the next, so each row is its own strip.'

const TABS_NEEDS =
  'Tile adhesive or double-sided mounting tape, a spirit or laser level, and a straight batten for the bottom row to stand on.'

/** Setting a glued wall whose rows lock themselves: one tile at a time, left to right along each row. */
function setTilesStep(config: DesignConfig, plan: LayoutPlan): GuideStep {
  return {
    key: 'tabs-in',
    title: 'Set the tiles, bottom row first and left to right',
    body: [
      `Set the bottom row on the batten first, placed along it as the tiling plan (${SETTING_OUT_PLAN_FILE}) sets it out, ` +
        `then go on up row by row, each row from left to right${plan.exact ? '' : ', fitting the cut pieces as you reach them'}. ` +
        `Spread the adhesive or stick the tape on a tile's back before it goes up. ${TAB_HOME} ${jointText(config)}`,
      TAB_CHECK,
      TAB_ORDER,
    ],
    drawing: 'tabs-in',
  }
}

/** The pieces no tab locks: too narrow for a socket, so their joints are glued (or their own clips hold them). */
function noLockStep(input: GuideInput, system: FixingSystem): GuideStep | null {
  // A piece with no clip is already told to glue itself to the wall (noClipStep), so it is not sent two ways:
  // this step is for the pieces that go up on their own and lock to nothing.
  const noClip = new Set(usesClips(system) ? input.mount.unmountedPieceIds : [])
  const marks = pieceMarks(input.plan, input.tab.unlockedPieceIds.filter((id) => !noClip.has(id)))
  if (marks.length === 0) return null
  const one = marks.length === 1
  const fix = usesClips(system)
    ? `${one ? 'it goes' : 'they go'} up on ${one ? 'its' : 'their'} own clips, level with the tiles around ${one ? 'it' : 'them'}`
    : `glue ${one ? 'it' : 'them'} to the tiles beside ${one ? 'it' : 'them'} as the row goes up`
  return {
    key: 'no-lock',
    title: 'The pieces no tab locks',
    body: [
      `${piecesHave(marks)} no room for a socket, so no tab locks ${one ? 'it' : 'them'} to the ${one ? 'tile' : 'tiles'} ` +
        `beside ${one ? 'it' : 'them'}: ${fix}.`,
    ],
    drawing: null,
  }
}

function keysOnlySteps(input: GuideInput): GuideStep[] {
  const { join, plan } = input
  const press = [
    `Press a key into each pair of slots that meet across a joint, with your thumb, until it seats in both.${keysToFit(join, input.accessories)} ` +
      'For a panel that stays together for good, put a drop of glue in each slot before its key.',
  ]
  const loose = pieceMarks(plan, join.unkeyedPieceIds)
  if (loose.length > 0) {
    press.push(
      `${piecesHave(loose)} no joint long enough for a key: glue ${loose.length === 1 ? 'it' : 'them'} to the tiles beside ${loose.length === 1 ? 'it' : 'them'} as the panel goes up.`,
    )
  }
  return [
    {
      key: 'face-down',
      title: 'Lay the tiles face down',
      body: [
        `On a flat, clean table, lay the tiles face down in the order of the tiling plan (${SETTING_OUT_PLAN_FILE}). ` +
          'Face down, the plan reads mirrored: the left edge of the wall is on your right.',
      ],
      drawing: 'keys-back',
    },
    { key: 'keys-in', title: 'Press in the keys', body: press, drawing: 'keys-in' },
    {
      key: 'panel-up',
      title: 'Put the panel up',
      body: [
        'Draw a level line where the bottom edge of the tiles will be, then glue or tape the keyed tiles to the wall, ' +
          'bottom edge first, on the line. The keys hold the tiles to each other, in line ' +
          'and evenly spaced, but not to the wall: the wall keeps them flat. On a large wall, key the tiles in panels ' +
          'you can lift and put them up one panel at a time.',
      ],
      drawing: 'panel-up',
    },
  ]
}

/**
 * The order a glued wall goes up in, by the rule the tiling plan's notes follow: the whole tiles first from
 * the setting-out point, unless the tile there is a cut (a row that starts on a cut cannot leave its cuts).
 * `file` names the plan's file, as the download and the README do; the studio has no file to name yet.
 */
function glueOrder(config: DesignConfig, plan: LayoutPlan, file = true): string {
  const from = `the setting-out point (SO) on the tiling plan${file ? ` (${SETTING_OUT_PLAN_FILE})` : ''}`
  if (plan.exact) return `Set the tiles from the bottom row up, starting at ${from}.`
  const model = buildPlanModel(config, plan)
  const first = tileAtPoint(model.tiles, model.settingOut.point)
  return first && !first.cut
    ? `Set the whole tiles first, from ${from}, then the cut pieces.`
    : `Set each row from its first piece, from ${from}, fitting the cut pieces as you reach them.`
}

/** The whole guide for this design: the download page's "Putting it up" and the README's mounting steps. */
export function mountingGuide(input: GuideInput): MountingGuide {
  const { config, mount, join, accessories } = input
  const system = fixingSystem(config, mount, join, input.tab)

  if (system === 'glue') {
    return {
      system,
      lede:
        `Tile adhesive or double-sided mounting tape, straight onto the flat backs. ${glueOrder(config, input.plan)} ` +
        'Mounting tape lets the wall come down again; tile adhesive is for good.',
      needs: null,
      steps: [],
    }
  }

  if (system === 'keys') {
    return {
      system,
      lede: 'Keys lock the tiles edge to edge from the back, in line, with even joints. Then the keyed panel goes up with adhesive or tape.',
      needs: 'Tile adhesive or double-sided mounting tape, and a flat table as big as the panel you key.',
      steps: [fitStep(config, system), ...keysOnlySteps(input)],
    }
  }

  if (system === 'tabs') {
    const steps = [fitStep(config, system), startLineStep(config, system), setTilesStep(config, input.plan)]
    const loose = noLockStep(input, system)
    if (loose) steps.push(loose)
    return { system, lede: TABS_LEDE, needs: TABS_NEEDS, steps }
  }

  const steps: GuideStep[] = [fitStep(config, system), clipsInStep(input), tapeStep(), startLineStep(config, system)]
  if (system === 'both') steps.push(keysAsYouGoStep(join, accessories))
  steps.push(pressOnStep(config, system))
  const noClip = noClipStep(input, system)
  if (noClip) steps.push(noClip)
  const loose = noLockStep(input, system)
  if (loose) steps.push(loose)
  steps.push(screwsStep(system), removeStep(system))
  return {
    system,
    lede:
      'Each tile carries its own wall clips: click them into the pockets on its back, put thin double-sided tape on them ' +
      'and press the tile into its place on the wall, with only the tape behind it. The tape holds each clip on the wall ' +
      'where its tile needs it, so there is nothing to measure but the start line. A tile pulls straight off again and ' +
      'leaves its clips behind.' +
      (system === 'both'
        ? ' The keys lock neighbouring tiles edge to edge as you go.'
        : usesTabs(system)
          ? ' The tabs lock neighbouring tiles edge to edge as each one goes on, and a row comes off again from its right-hand end.'
          : ''),
    needs:
      'Thin double-sided tape (film or carpet tape, not foam), a spirit or laser level, a straight batten and a long ' +
      `straightedge. For the optional screws: a drill, a cable and pipe detector, ${plural(mount.clips, 'wall plug')} (5 mm) ` +
      `and ${plural(mount.clips, 'countersunk screw')} (3.5 mm) to suit them.`,
    steps,
  }
}

/**
 * The whole method in at most three short lines, for the studio's "You'll do": the same words as the steps
 * (and the glued lede), never worded anywhere else.
 */
export function mountingSummary(input: GuideInput): string[] {
  const { config, plan, mount, join } = input
  const system = fixingSystem(config, mount, join, input.tab)
  if (system === 'glue') {
    return ['Put tile adhesive or double-sided mounting tape straight onto the flat backs.', glueOrder(config, plan, false)]
  }
  // One line, whatever the zip holds: the fit test is always a page and a download away. With the tabs it
  // also says why it comes first, because the reprint it saves is a wall of tiles.
  const fit = usesTabs(system)
    ? 'Print the fit test and set the fit: the socket is cut into the tile itself.'
    : 'Print the fit test and set the fit.'
  if (system === 'keys') {
    return [
      fit,
      'Lay the tiles face down and press a key into each pair of slots that meet across a joint.',
      'Put the panel up with adhesive or tape, bottom edge first, on a level line.',
    ]
  }
  if (system === 'tabs') {
    return [
      fit,
      'Glue or tape the tiles on, bottom row first and each row from left to right.',
      'Bring each tile square to the wall over the tab of the tile to its left, so the tab goes into the socket in its back.',
    ]
  }
  return [
    fit,
    'Click a clip into each pocket until its stops touch the bottom, and put thin double-sided tape on it.',
    system === 'both'
      ? 'Press the tiles on, bottom row first, with keys in the slots that meet a tile not up yet.'
      : system === 'clips-tabs'
        ? "Press the tiles on, bottom row first and each row from left to right, so each tab goes into its neighbour's socket."
        : 'Press the tiles on, bottom row first: the clips stay where the tile puts them.',
  ]
}

// ---------------------------------------------------------------------------------------------------
// The fit test: its own procedure, for its own page and its own README. Nothing about it is worded in
// mountingGuide any more, which only points here (fitStep).
// ---------------------------------------------------------------------------------------------------

export interface FitTestGuide {
  /** The fixings the test covers, in the wall's own words: the same names fixingSystem gives. */
  system: FixingSystem
  /** What the test is and what it decides, in a sentence or two. */
  lede: string
  /** What to have to hand beyond the printed parts; null when the parts are all it takes. */
  needs: string | null
  /** Numbered steps: print, try the keys, try the clips, set the fit. */
  steps: GuideStep[]
}

export interface FitTestGuideInput {
  /** The design the coupons are cut from: the steps that read it come with the shaped interlock. */
  config: DesignConfig
  /** The fit test's own parts (fitTestFor): its marks come from these, and an empty list has no guide. */
  parts: readonly AccessorySpec[]
  /** How the wall really goes up (fixingSystem); read off `parts` when omitted. */
  system?: FixingSystem
}

/** Which fixings a fit test tries, read off its own parts: the same names fixingSystem gives. */
function testedSystem(parts: readonly AccessorySpec[]): FixingSystem {
  const keys = parts.some((part) => part.kind === 'key')
  const clips = parts.some((part) => part.kind === 'clip')
  // The tabs print no fastener at all: their socket coupons are what says they are under test.
  const tabs = parts.some((part) => part.shape.socket === 1)
  if (clips) return keys ? 'both' : tabs ? 'clips-tabs' : 'clips'
  return keys ? 'keys' : tabs ? 'tabs' : 'glue'
}

/**
 * Running the fit test, start to finish: what to print, how to read the keys and the clips, and setting the
 * fit that came out of it. Null when the design has no fit test to run (fitTestFor is empty), which is every
 * glued wall and every plate too thin for the slots and pockets.
 */
export function fitTestGuide(input: FitTestGuideInput): FitTestGuide | null {
  const { parts } = input
  if (parts.length === 0) return null
  const system = input.system ?? testedSystem(parts)
  const keys = usesKeys(system)
  const clips = usesClips(system)
  const tabs = usesTabs(system)
  const word = testedWord(system)
  // Every part is called by its label: coupons A and B butt like two tiles, so a key is tried across a real joint.
  const coupons = parts.filter((part) => part.kind === 'fit-test')
  const sockets = parts.filter((part) => part.shape.socket === 1)
  const steps: GuideStep[] = [
    {
      key: 'fit-print',
      title: 'Print the fit test',
      body: [
        'Print every part of the fit test in the filament the wall will be printed in, at the settings its row gives: ' +
          (tabs
            ? 'every coupon face up like a tile, first layer included' + (clips ? ', the clips flat and solid' : '')
            : `the coupons face up like a tile, first layer included, the ${word} flat and solid`) +
          '.',
        'The fit only means anything in the filament and at the settings the wall gets: another filament or another ' +
          'first layer prints another size.',
      ],
      drawing: 'fit-test',
    },
  ]
  if (tabs) {
    // Backs down on a board is the wall's own motion turned flat: the socket comes down over the tab, and both
    // backs finishing flat on the board is what "home" looks like on the wall.
    steps.push({
      key: 'fit-tabs',
      title: 'Press each socket coupon down over the tab',
      body: [
        `Lay test coupon A${marksAfter([coupons[0]])} back down on a flat board, then bring each socket coupon` +
          `${marksAfter(sockets)} down over its tab with the joint closed, one at a time: keep the snuggest one that ` +
          'goes together with both backs flat on the board and leaves no play across the joint. One notch is snug, two ' +
          'standard, three loose. If none will go together with the joint closed, the first layer is bulging: turn on ' +
          'elephant-foot compensation.',
        'What you keep here is what the tiles are cut at, so settle it before you print any of them.',
      ],
      drawing: 'fit-tabs',
    })
  }
  if (keys) {
    steps.push({
      key: 'fit-keys',
      title: 'Press a test key across a real joint',
      body: [
        `Lay test coupons A and B${marksAfter(coupons)} face down with their key slots together and the joint closed, then ` +
          'press each test key in across the joint: keep the one that goes in with your thumb and stays. If none will seat ' +
          'with the joint closed, the first layer is bulging: turn on elephant-foot compensation.',
      ],
      drawing: 'fit-keys',
    })
  }
  if (clips) {
    // Stuck down with the tape the wall will get, a test clip stands as it will on the wall: the coupon reads the fit,
    // and the tape must keep the clip on the board as the coupon pulls off, as it will keep it on the wall.
    steps.push({
      key: 'fit-clips',
      title: 'Click a coupon onto each test clip',
      body: [
        `Stick the test clips${marksAfter(parts.filter((part) => part.kind === 'clip'))} flat side down on a smooth board, ` +
          `each with a piece of the tape you will use on the wall, then press ${keys ? 'test coupon A' : 'the test coupon'}` +
          `${marksAfter([coupons[0]])} onto each one in turn and pull it straight off again: keep the snuggest clip that lets ` +
          'the coupon click on, sit flat on the board and not rattle, and that stays on the board as the coupon comes off. ' +
          'If the tape lets go of a clip before the coupon does, take the next looser clip, or a thin tape that grips better.',
      ],
      drawing: 'fit-clips',
    })
  }
  steps.push({
    key: 'fit-set',
    title: 'Set the fit you kept',
    body: [
      `Set Fit to the one you kept: one notch is snug, two standard, three loose. Then download your ${fittedWord(system)} at that fit.`,
    ],
    drawing: null,
  })
  return {
    system,
    lede: tabs
      ? `The tab in each tile and the socket in the next have to go together, and how tight that is depends on your ` +
        `printer. The fit test prints the socket in all three fits on small coupons of this design${clips ? ', and the clips with it' : ''}, ` +
        'so you can set the fit before you print a single tile.'
      : `Printed ${word} have to click into printed slots, and how tight that is depends on your printer. The fit test ` +
        `prints ${keys && clips ? 'both' : 'them'} in all three fits on small coupons of this design, so you can set the ` +
        'fit before you print the parts for the whole wall.',
    // A key is pressed in with a thumb; the clips need the tape, and a pair of coupons needs something flat to
    // finish square on.
    needs: clips
      ? 'The thin double-sided tape you will use on the wall, and a smooth flat board to stick the test clips to (a spare tile, a table top, a piece of board).'
      : tabs
        ? 'A flat, hard surface to press the coupons down on (a table top, a spare tile, a piece of board).'
        : null,
    steps,
  }
}
