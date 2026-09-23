// Renders a PlanModel as a print-ready A3 drafting sheet (SVG string, units = paper mm).
// Kept free of the texture registry so it stays testable on its own; planSvg adds the lookups.
import {
  chainLabels,
  dimText,
  isLettered,
  tileAtPoint,
  type ChainLabel,
  type DimensionChain,
  type PlanModel,
  type PlanTile,
} from './planModel'

/** Title-block values, already formatted by the caller. */
export interface SheetInfo {
  title: string
  surface: string
  tile: string
  joint: string
  texture: string
  color: string
  date: string
}

const SHEET = '#ECEAE4'
const INK = '#2A2826'
const RED = '#C8412F'
const CHALK = '#3C64A8'
const PENCIL = '#8C877F'
const FONT = 'Archivo, Arial, sans-serif'

// A3 landscape; the right column holds the legend, notes and title block.
const SHEET_W = 420
const SHEET_H = 297
const FRAME = 10
const COLUMN_W = 112
const COLUMN_X = SHEET_W - FRAME - COLUMN_W

/** Standard drafting scales (1:n); the sheet uses the largest one that fits. */
const SCALES = [1, 2, 2.5, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000]

/** Average Archivo advance per character as a fraction of the font size (digits are ~0.56). */
const CHAR_EM = 0.58

const CHAIN_FONT = 2.1
const CHAIN_STEP = 7
const CHAIN_FIRST = 9

/** Fixed-point coordinate without trailing zeros, keeps the file small. */
const n = (v: number) => {
  const s = v.toFixed(2)
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** Greedy word wrap for a column `width` paper mm wide. */
function wrap(text: string, size: number, width: number): string[] {
  const maxChars = Math.max(8, Math.floor(width / (size * CHAR_EM)))
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (!line) line = word
    else if ((line + ' ' + word).length <= maxChars) line += ' ' + word
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

function ellipsize(text: string, size: number, width: number): string {
  const maxChars = Math.floor(width / (size * CHAR_EM))
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
}

/** Names the piece that really sits on the SO point: in a running bond that is often a cut. */
function soNote(model: PlanModel): string {
  const { point } = model.settingOut
  const at = `${dimText(point.x)} across and ${dimText(point.y)} up`
  const first = tileAtPoint(model.tiles, point)
  if (!first) return `SO marks the setting-out point, at ${at}.`
  return `SO marks the setting-out point, at ${at}: the bottom-left corner of ${first.cut ? 'cut piece' : 'whole tile'} ${first.mark}.`
}

/** Title-block field label: wide, uppercase, small caps feel. */
const fieldLabel = (x: number, y: number, text: string) =>
  `<text x="${n(x)}" y="${n(y)}" class="lbl">${esc(text.toUpperCase())}</text>`

export function renderPlanSheet(model: PlanModel, info: SheetInfo): string {
  const out: string[] = []
  const columnsCount = model.chains.columns.length
  const leftReserve = CHAIN_FIRST + CHAIN_STEP + 10
  const bottomReserve = CHAIN_FIRST + CHAIN_STEP * columnsCount + 18
  const topReserve = 12
  const rightReserve = 10
  const availW = COLUMN_X - FRAME - leftReserve - rightReserve
  const availH = SHEET_H - 2 * FRAME - topReserve - bottomReserve
  const needed = Math.max(model.width / availW, model.height / availH)
  const denom = SCALES.find((s) => s >= needed) ?? Math.ceil(needed)
  const pw = model.width / denom
  const ph = model.height / denom
  const ox = FRAME + leftReserve + (availW - pw) / 2
  const oy = FRAME + topReserve + (availH - ph) / 2
  const X = (x: number) => ox + x / denom
  const Y = (y: number) => oy + ph - y / denom

  // Marks: every piece but the base tile carries its letter, too small a letter is left to the legend.
  const marks: { t: PlanTile; size: number }[] = []
  for (const t of model.tiles) {
    if (!isLettered(model, t)) continue
    const short = Math.min(t.w, t.h) / denom
    const size = Math.min(3.2, short * 0.6, (t.w / denom) / (t.mark.length * CHAR_EM + 0.2))
    // Below ~1 mm a letter prints as a smudge; the legend still lists the piece.
    if (size >= 1) marks.push({ t, size })
  }
  // Only a sheet that letters a whole border version needs its ink rule: a default sheet stays as it was.
  const wholeMarks = marks.some(({ t }) => !t.cut)

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}mm" height="${SHEET_H}mm" viewBox="0 0 ${SHEET_W} ${SHEET_H}" font-family="${FONT}">`,
    `<title>${esc(info.title)}: setting-out plan</title>`,
    '<defs>',
    `<pattern id="hatch" patternUnits="userSpaceOnUse" width="1.2" height="1.2" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="1.2" stroke="${RED}" stroke-width="0.18"/></pattern>`,
    '<style>',
    `text{font-family:${FONT};fill:${INK};font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}`,
    `.lbl{font-size:1.7px;font-weight:600;letter-spacing:.1px;font-stretch:125%;fill:#57534D}`,
    `.dim{font-size:${CHAIN_FONT}px}`,
    `.cutdim{font-size:${CHAIN_FONT}px;fill:${RED}}`,
    `.mark{font-weight:700;fill:${RED};paint-order:stroke;stroke:${SHEET};stroke-width:.5px;stroke-linejoin:round}`,
    // A whole tile that is a border version keeps its outline and gets its letter in ink.
    ...(wholeMarks ? [`.mark.whole{fill:${INK}}`] : []),
    '</style>',
    '</defs>',
    `<rect width="${SHEET_W}" height="${SHEET_H}" fill="${SHEET}"/>`,
    `<rect x="${FRAME}" y="${FRAME}" width="${SHEET_W - 2 * FRAME}" height="${SHEET_H - 2 * FRAME}" fill="none" stroke="${INK}" stroke-width="0.7"/>`,
    `<line x1="${COLUMN_X}" y1="${FRAME}" x2="${COLUMN_X}" y2="${SHEET_H - FRAME}" stroke="${INK}" stroke-width="0.35"/>`,
  )

  // Tiles: full ones outlined, cuts hatched in red pencil; every piece but the base tile carries its mark.
  out.push(`<g fill="none" stroke="${INK}" stroke-width="0.18">`)
  for (const t of model.tiles) {
    if (t.cut) continue
    out.push(
      `<rect class="tile full" data-mark="${esc(t.mark)}" x="${n(X(t.x))}" y="${n(Y(t.y + t.h))}" width="${n(t.w / denom)}" height="${n(t.h / denom)}"/>`,
    )
  }
  out.push('</g>', `<g fill="url(#hatch)" stroke="${RED}" stroke-width="0.25">`)
  for (const t of model.tiles) {
    if (!t.cut) continue
    out.push(
      `<rect class="tile cut" data-mark="${esc(t.mark)}" x="${n(X(t.x))}" y="${n(Y(t.y + t.h))}" width="${n(t.w / denom)}" height="${n(t.h / denom)}"/>`,
    )
  }
  out.push('</g>', '<g text-anchor="middle">')
  for (const { t, size } of marks) {
    out.push(
      `<text class="${t.cut ? 'mark' : 'mark whole'}" x="${n(X(t.x + t.w / 2))}" y="${n(Y(t.y + t.h / 2) + size * 0.36)}" font-size="${n(size)}">${esc(t.mark)}</text>`,
    )
  }
  out.push('</g>')

  // Surface outline on top so the wall edge reads as the heaviest line.
  out.push(
    `<rect x="${n(X(0))}" y="${n(Y(model.height))}" width="${n(pw)}" height="${n(ph)}" fill="none" stroke="${INK}" stroke-width="0.5"/>`,
  )

  // Centre lines and setting-out point in chalk blue, like the installer's chalk line.
  const { settingOut } = model
  if (settingOut.centreLines.x !== null) {
    const x = X(settingOut.centreLines.x)
    out.push(
      `<line x1="${n(x)}" y1="${n(Y(model.height) - 5)}" x2="${n(x)}" y2="${n(Y(0) + 3)}" stroke="${CHALK}" stroke-width="0.25" stroke-dasharray="6 1.2 1 1.2"/>`,
      `<text x="${n(x)}" y="${n(Y(model.height) - 6)}" text-anchor="middle" font-size="2" font-weight="600" fill="${CHALK}" style="fill:${CHALK}">CL</text>`,
    )
  }
  if (settingOut.centreLines.y !== null) {
    const y = Y(settingOut.centreLines.y)
    out.push(
      `<line x1="${n(X(0) - 3)}" y1="${n(y)}" x2="${n(X(model.width) + 5)}" y2="${n(y)}" stroke="${CHALK}" stroke-width="0.25" stroke-dasharray="6 1.2 1 1.2"/>`,
      `<text x="${n(X(model.width) + 6)}" y="${n(y + 0.7)}" font-size="2" font-weight="600" style="fill:${CHALK}">CL</text>`,
    )
  }
  {
    const sx = X(settingOut.point.x)
    const sy = Y(settingOut.point.y)
    out.push(
      `<g stroke="${CHALK}" stroke-width="0.3" fill="none"><circle cx="${n(sx)}" cy="${n(sy)}" r="1.3"/><line x1="${n(sx - 2.2)}" y1="${n(sy)}" x2="${n(sx + 2.2)}" y2="${n(sy)}"/><line x1="${n(sx)}" y1="${n(sy - 2.2)}" x2="${n(sx)}" y2="${n(sy + 2.2)}"/></g>`,
      `<text x="${n(sx + 1.8)}" y="${n(sy - 1.6)}" font-size="1.9" font-weight="700" style="fill:${CHALK}">SO</text>`,
    )
  }

  // Bottom chains: one per bond row, then the overall width.
  const bottomBase = Y(0)
  model.chains.columns.forEach((chain, i) => {
    const cy = bottomBase + CHAIN_FIRST + CHAIN_STEP * i
    out.push(horizontalChain(chain, cy, X, denom, i === 0 ? bottomBase + 1.5 : null))
    if (columnsCount > 1) {
      out.push(`<text x="${n(X(model.width) + 3)}" y="${n(cy + 0.6)}" class="lbl">${esc(chain.title.toUpperCase())}</text>`)
    }
  })
  const overallY = bottomBase + CHAIN_FIRST + CHAIN_STEP * columnsCount
  out.push(overallHorizontal(model.width, overallY, X, bottomBase + 1.5))

  // Left chains: rows, then the overall height.
  const leftBase = X(0)
  out.push(verticalChain(model.chains.rows, leftBase - CHAIN_FIRST, Y, denom, leftBase - 1.5))
  out.push(overallVertical(model.height, leftBase - CHAIN_FIRST - CHAIN_STEP, Y, leftBase - 1.5))

  // Drawing title under the view, as on a sheet of drawings.
  const titleY = overallY + 9
  out.push(
    `<text x="${n(X(0))}" y="${n(titleY)}" font-size="3.2" font-weight="700">1</text>`,
    `<text x="${n(X(0) + 5)}" y="${n(titleY)}" font-size="3.2" font-weight="600" style="font-stretch:125%">SETTING-OUT PLAN</text>`,
    `<line x1="${n(X(0))}" y1="${n(titleY + 1.2)}" x2="${n(X(0) + 60)}" y2="${n(titleY + 1.2)}" stroke="${INK}" stroke-width="0.35"/>`,
    `<text x="${n(X(0) + 5)}" y="${n(titleY + 4.4)}" font-size="2.2" style="fill:#57534D">Scale 1:${dimText(denom)} on A3. Dimensions in mm.</text>`,
  )

  out.push(rightColumn(model, info, denom))
  out.push('</svg>')
  return out.join('\n')
}

/** Positions (paper mm) of every chain boundary, merging those closer than a tick's width. */
function tickPositions(chain: DimensionChain, toPaper: (v: number) => number): number[] {
  const raw = [0, ...chain.items.map((i) => i.end)].map(toPaper)
  const ticks: number[] = []
  for (const p of raw) if (!ticks.length || Math.abs(p - ticks[ticks.length - 1]) > 0.35) ticks.push(p)
  return ticks
}

function labelsFor(chain: DimensionChain, denom: number): ChainLabel[] {
  // A label needs its text plus a little air on the paper; chainLabels works in surface mm.
  return chainLabels(chain, 1.2 * denom, CHAIN_FONT * CHAR_EM * denom)
}

function horizontalChain(
  chain: DimensionChain,
  cy: number,
  X: (x: number) => number,
  denom: number,
  extensionFrom: number | null,
): string {
  const out: string[] = []
  const ticks = tickPositions(chain, X)
  const first = ticks[0]
  const last = ticks[ticks.length - 1]
  out.push(`<g stroke="${INK}" fill="none">`)
  out.push(`<line x1="${n(first - 1.5)}" y1="${n(cy)}" x2="${n(last + 1.5)}" y2="${n(cy)}" stroke-width="0.18"/>`)
  for (const x of ticks) {
    const y0 = extensionFrom ?? cy - 2
    out.push(`<line x1="${n(x)}" y1="${n(y0)}" x2="${n(x)}" y2="${n(cy + 1.5)}" stroke="${PENCIL}" stroke-width="0.1"/>`)
    out.push(`<line x1="${n(x - 0.7)}" y1="${n(cy + 0.7)}" x2="${n(x + 0.7)}" y2="${n(cy - 0.7)}" stroke-width="0.35"/>`)
  }
  out.push('</g>')
  let offsetFlip = false
  for (const label of labelsFor(chain, denom)) {
    const x = X(label.center)
    let y = cy - 0.8
    // Labels wider than their span alternate below the line so neighbours do not collide.
    if (!label.fits) {
      y = offsetFlip ? cy - 0.8 : cy + 2.9
      offsetFlip = !offsetFlip
    }
    out.push(
      `<text x="${n(x)}" y="${n(y)}" text-anchor="middle" class="${label.cut ? 'cutdim' : 'dim'}">${esc(label.text)}</text>`,
    )
  }
  return out.join('')
}

function verticalChain(
  chain: DimensionChain,
  cx: number,
  Y: (y: number) => number,
  denom: number,
  extensionFrom: number,
): string {
  const out: string[] = []
  const ticks = tickPositions(chain, Y)
  const top = Math.min(...ticks)
  const bottom = Math.max(...ticks)
  out.push(`<g stroke="${INK}" fill="none">`)
  out.push(`<line x1="${n(cx)}" y1="${n(top - 1.5)}" x2="${n(cx)}" y2="${n(bottom + 1.5)}" stroke-width="0.18"/>`)
  for (const y of ticks) {
    out.push(`<line x1="${n(extensionFrom)}" y1="${n(y)}" x2="${n(cx - 1.5)}" y2="${n(y)}" stroke="${PENCIL}" stroke-width="0.1"/>`)
    out.push(`<line x1="${n(cx - 0.7)}" y1="${n(y + 0.7)}" x2="${n(cx + 0.7)}" y2="${n(y - 0.7)}" stroke-width="0.35"/>`)
  }
  out.push('</g>')
  let offsetFlip = false
  for (const label of labelsFor(chain, denom)) {
    const y = Y(label.center)
    let x = cx - 0.8
    if (!label.fits) {
      x = offsetFlip ? cx - 0.8 : cx + 2.9
      offsetFlip = !offsetFlip
    }
    out.push(
      `<text transform="translate(${n(x)} ${n(y)}) rotate(-90)" text-anchor="middle" class="${label.cut ? 'cutdim' : 'dim'}">${esc(label.text)}</text>`,
    )
  }
  return out.join('')
}

function overallHorizontal(width: number, cy: number, X: (x: number) => number, extensionFrom: number): string {
  const x0 = X(0)
  const x1 = X(width)
  return [
    `<g stroke="${INK}" fill="none">`,
    `<line x1="${n(x0)}" y1="${n(extensionFrom)}" x2="${n(x0)}" y2="${n(cy + 1.5)}" stroke="${PENCIL}" stroke-width="0.1"/>`,
    `<line x1="${n(x1)}" y1="${n(extensionFrom)}" x2="${n(x1)}" y2="${n(cy + 1.5)}" stroke="${PENCIL}" stroke-width="0.1"/>`,
    `<line x1="${n(x0 - 1.5)}" y1="${n(cy)}" x2="${n(x1 + 1.5)}" y2="${n(cy)}" stroke-width="0.25"/>`,
    `<line x1="${n(x0 - 0.8)}" y1="${n(cy + 0.8)}" x2="${n(x0 + 0.8)}" y2="${n(cy - 0.8)}" stroke-width="0.45"/>`,
    `<line x1="${n(x1 - 0.8)}" y1="${n(cy + 0.8)}" x2="${n(x1 + 0.8)}" y2="${n(cy - 0.8)}" stroke-width="0.45"/>`,
    '</g>',
    `<text x="${n((x0 + x1) / 2)}" y="${n(cy - 0.9)}" text-anchor="middle" font-size="2.5" font-weight="700">${dimText(width)}</text>`,
  ].join('')
}

function overallVertical(height: number, cx: number, Y: (y: number) => number, extensionFrom: number): string {
  const y0 = Y(0)
  const y1 = Y(height)
  return [
    `<g stroke="${INK}" fill="none">`,
    `<line x1="${n(extensionFrom)}" y1="${n(y0)}" x2="${n(cx - 1.5)}" y2="${n(y0)}" stroke="${PENCIL}" stroke-width="0.1"/>`,
    `<line x1="${n(extensionFrom)}" y1="${n(y1)}" x2="${n(cx - 1.5)}" y2="${n(y1)}" stroke="${PENCIL}" stroke-width="0.1"/>`,
    `<line x1="${n(cx)}" y1="${n(y1 - 1.5)}" x2="${n(cx)}" y2="${n(y0 + 1.5)}" stroke-width="0.25"/>`,
    `<line x1="${n(cx - 0.8)}" y1="${n(y0 + 0.8)}" x2="${n(cx + 0.8)}" y2="${n(y0 - 0.8)}" stroke-width="0.45"/>`,
    `<line x1="${n(cx - 0.8)}" y1="${n(y1 + 0.8)}" x2="${n(cx + 0.8)}" y2="${n(y1 - 0.8)}" stroke-width="0.45"/>`,
    '</g>',
    `<text transform="translate(${n(cx - 0.9)} ${n((y0 + y1) / 2)}) rotate(-90)" text-anchor="middle" font-size="2.5" font-weight="700">${dimText(height)}</text>`,
  ].join('')
}

const TITLE_BLOCK_H = 64
const ROW_H = 5.2

function rightColumn(model: PlanModel, info: SheetInfo, denom: number): string {
  const out: string[] = []
  const x0 = COLUMN_X
  const inner = x0 + 4
  const width = COLUMN_W - 8
  const titleTop = SHEET_H - FRAME - TITLE_BLOCK_H
  let y = FRAME + 7

  // Marks legend: the schedule the installer and the files share.
  out.push(`<text x="${n(inner)}" y="${n(y)}" font-size="3" font-weight="700" style="font-stretch:125%">MARKS</text>`)
  y += 5
  const colMark = inner
  const colPiece = inner + 11
  const colSize = inner + width - 13
  const colQty = inner + width
  out.push(
    fieldLabel(colMark, y, 'Mark'),
    fieldLabel(colPiece, y, 'Piece'),
    `<text x="${n(colSize)}" y="${n(y)}" class="lbl" text-anchor="end">SIZE MM</text>`,
    `<text x="${n(colQty)}" y="${n(y)}" class="lbl" text-anchor="end">QTY</text>`,
    `<line x1="${n(inner)}" y1="${n(y + 1.4)}" x2="${n(colQty)}" y2="${n(y + 1.4)}" stroke="${INK}" stroke-width="0.25"/>`,
  )
  y += 1.4

  // Keep room for the totals row and at least six lines of notes above the title block.
  const legendBottom = titleTop - 44
  const maxRows = Math.max(1, Math.floor((legendBottom - y - ROW_H) / ROW_H))
  const rows = model.legend.length > maxRows ? model.legend.slice(0, maxRows - 1) : model.legend
  for (const row of rows) {
    const top = y
    const base = top + ROW_H * 0.68
    const cut = row.kind !== 'full'
    out.push(
      `<rect x="${n(colMark)}" y="${n(top + 1)}" width="3.2" height="3.2" fill="${cut ? 'url(#hatch)' : 'none'}" stroke="${cut ? RED : INK}" stroke-width="0.25"/>`,
      `<text x="${n(colMark + 4.4)}" y="${n(base)}" font-size="2.6" font-weight="700"${cut ? ` style="fill:${RED}"` : ''}>${esc(row.mark)}</text>`,
      `<text x="${n(colPiece)}" y="${n(base)}" font-size="2.3">${esc(ellipsize(row.label, 2.3, colSize - colPiece - 17))}</text>`,
      `<text x="${n(colSize)}" y="${n(base)}" font-size="2.3" text-anchor="end">${dimText(row.width)} × ${dimText(row.height)}</text>`,
      `<text x="${n(colQty)}" y="${n(base)}" font-size="2.3" text-anchor="end" font-weight="600">${row.count}</text>`,
      `<line x1="${n(inner)}" y1="${n(top + ROW_H)}" x2="${n(colQty)}" y2="${n(top + ROW_H)}" stroke="${INK}" stroke-opacity="0.2" stroke-width="0.15"/>`,
    )
    y += ROW_H
  }
  if (rows.length < model.legend.length) {
    const hidden = model.legend.slice(rows.length)
    const count = hidden.reduce((s, r) => s + r.count, 0)
    out.push(
      `<text x="${n(colPiece)}" y="${n(y + ROW_H * 0.68)}" font-size="2.3" style="fill:#57534D">${hidden.length} more models (${esc(hidden[0].mark)} to ${esc(hidden[hidden.length - 1].mark)}), see README</text>`,
      `<text x="${n(colQty)}" y="${n(y + ROW_H * 0.68)}" font-size="2.3" text-anchor="end" font-weight="600">${count}</text>`,
    )
    y += ROW_H
  }
  const total = model.fullCount + model.cutCount
  out.push(
    `<line x1="${n(inner)}" y1="${n(y)}" x2="${n(colQty)}" y2="${n(y)}" stroke="${INK}" stroke-width="0.25"/>`,
    `<text x="${n(colPiece)}" y="${n(y + ROW_H * 0.7)}" font-size="2.3" font-weight="700">Total (${model.fullCount} full, ${model.cutCount} ${model.cutCount === 1 ? 'cut' : 'cuts'})</text>`,
    `<text x="${n(colQty)}" y="${n(y + ROW_H * 0.7)}" font-size="2.3" text-anchor="end" font-weight="700">${total}</text>`,
  )
  y += ROW_H + 7

  // Notes: how to set out, then what the hatching means.
  out.push(`<text x="${n(inner)}" y="${n(y)}" font-size="3" font-weight="700" style="font-stretch:125%">NOTES</text>`)
  y += 4.6
  const notes = [
    ...model.settingOut.notes,
    soNote(model),
    model.joint > 0 ? `Joints ${dimText(model.joint)} mm throughout.` : 'Butt joints: tiles touch.',
    'Hatched pieces are printed cuts: the letter matches the file name. No cutting on site.',
    ...(model.legend.some((row) => row.kind === 'full' && isLettered(model, row))
      ? ['Lettered whole tiles are border versions, printed for their place on the edge: match the letter.']
      : []),
  ]
  const noteSize = 2.1
  const lineH = 2.9
  outer: for (const note of notes) {
    const lines = wrap(note, noteSize, width - 4)
    for (let i = 0; i < lines.length; i++) {
      if (y > titleTop - 3) break outer
      out.push(`<text x="${n(inner + (i === 0 ? 0 : 3))}" y="${n(y)}" font-size="${noteSize}">${i === 0 ? '- ' : ''}${esc(lines[i])}</text>`)
      y += lineH
    }
    y += 0.8
  }

  // Title block: a ruled grid of labelled fields, design name largest.
  const tb = titleTop
  const right = SHEET_W - FRAME
  const half = x0 + COLUMN_W / 2
  const r1 = tb + 16
  const r2 = r1 + 12
  const r3 = r2 + 12
  const r4 = r3 + 12
  out.push(
    `<g stroke="${INK}" fill="none">`,
    `<line x1="${x0}" y1="${n(tb)}" x2="${right}" y2="${n(tb)}" stroke-width="0.5"/>`,
    `<line x1="${x0}" y1="${n(r1)}" x2="${right}" y2="${n(r1)}" stroke-width="0.2"/>`,
    `<line x1="${x0}" y1="${n(r2)}" x2="${right}" y2="${n(r2)}" stroke-width="0.2"/>`,
    `<line x1="${x0}" y1="${n(r3)}" x2="${right}" y2="${n(r3)}" stroke-width="0.2"/>`,
    `<line x1="${x0}" y1="${n(r4)}" x2="${right}" y2="${n(r4)}" stroke-width="0.2"/>`,
    `<line x1="${n(half)}" y1="${n(r1)}" x2="${n(half)}" y2="${n(SHEET_H - FRAME)}" stroke-width="0.2"/>`,
    '</g>',
  )
  const cell = (x: number, top: number, label: string, value: string, cellWidth: number) =>
    fieldLabel(x + 2.5, top + 3.6, label) +
    `<text x="${n(x + 2.5)}" y="${n(top + 8.6)}" font-size="2.6">${esc(ellipsize(value, 2.6, cellWidth - 5))}</text>`
  out.push(
    fieldLabel(x0 + 2.5, tb + 4, 'Design'),
    `<text x="${n(x0 + 2.5)}" y="${n(tb + 11.5)}" font-size="4.6" font-weight="700">${esc(ellipsize(info.title, 4.6, COLUMN_W - 5))}</text>`,
    cell(x0, r1, 'Surface', info.surface, COLUMN_W / 2),
    cell(half, r1, 'Tile', info.tile, COLUMN_W / 2),
    cell(x0, r2, 'Texture', info.texture, COLUMN_W / 2),
    cell(half, r2, 'Color', info.color, COLUMN_W / 2),
    cell(x0, r3, 'Joint', info.joint, COLUMN_W / 2),
    cell(half, r3, 'Scale', `1:${dimText(denom)} on A3`, COLUMN_W / 2),
    cell(x0, r4, 'Date', info.date, COLUMN_W / 2),
    cell(half, r4, 'Drawn with', 'Tessera', COLUMN_W / 2),
  )
  return out.join('\n')
}
