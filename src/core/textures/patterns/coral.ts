// T-04 coral: brain-coral grooves wander and split over a reef, pitted with polyps. Everything is
// periodic, so the reef grows straight through a tile joint.
//
// A face-up print turns every gentle rise into rings of wide stair treads, so the reef is not a smooth
// noise. Its grooves come from phasor noise (Tricard et al. 2019): a sum of short wave packets whose
// phase draws evenly spaced stripes that bend with the packets' direction and fork where two directions
// meet, which is how a brain coral grows. The phase only says where a wall runs; each wall is then cut
// to one section in millimetres: a flat ridge top, a straight steep wall, a flat valley floor, joined
// by short rounds. The flats print as clean skins, the walls as fine even lines.

import { fbm2, hashCell } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, clamp, clamp01, mix, MIN_SOFT_MM, TAU } from './common'

/** Groove spacing (one ridge and one valley) as a share of the feature size. */
const PITCH = 0.45
/** Widest a wall gets, as a share of the spacing within these bounds in mm: steep at any depth. */
const WALL = 0.2
const WALL_MIN_MM = 0.9
const WALL_MAX_MM = 2.4
/**
 * Half a wall takes at most this share of the way to the middle of the narrower band beside it, so
 * where the grooves crowd a ridge keeps a flat top (and a valley a flat floor) and its walls steepen,
 * rather than rolling over into a rounded crest that prints as a long flat tread edged by a line.
 */
const WALL_ROOM = 0.4
/** Rounding at the foot and the top of every wall, mm. */
const ROUND_MM = 0.35
/**
 * Wave packet radius, in spacings, for brain coral and for the crust: a long packet carries a groove a
 * long way, a short one lets its neighbours break it into cracks. Detail scales it between the two
 * factors after, so the grooves fork and turn more often as it rises.
 */
const PACKET = 1.25
const PACKET_CRUST = 1
const PACKET_DETAIL: readonly [number, number] = [1.15, 0.82]
/** How far a packet's direction strays from the flow, radians, for brain coral and for the crust. */
const STRAY = 0.12 * Math.PI
const STRAY_CRUST = 0.4 * Math.PI
/** Share of each spacing that is ridge: half for brain coral, mostly plate for the crust. */
const RIDGE = 0.5
const RIDGE_CRUST = 0.7
/** Weight of the plane wave under the packets, against a packet's 1 at its centre. */
const BACKGROUND = 0.03
/** Packets per lattice cell: with the radius above, about six overlap anywhere, so the phase rarely fails. */
const PACKETS_PER_CELL = 2
/** Polyp pit depth as a share of the relief (a millimetre at the default depth, five layers)... */
const PIT = 0.38
/** ...and deeper for a wider pit, per mm of radius, so its cone never flattens into rings of steps. */
const PIT_PER_MM = 0.25
/** Narrowest pit, mm radius: a smaller hole closes up in the print. */
const PIT_MIN_MM = 0.6
/** Rounding at the pit's tip and rim, mm: no crease, and no floor wide enough to print as a disc. */
const PIT_ROUND_MM = 0.35
/** Flat kept between a pit's rim and the top of the nearest wall, mm. */
const PIT_MARGIN_MM = 0.5
/** Scatter of the pits about their lattice points, as a share of a cell. */
const PIT_JITTER = 0.85

/**
 * A cone of the given radius, 1 at its axis and 0 at its rim, with tip and rim rounded over `round`
 * by parabolic fillets tangent to the straight flank.
 */
function cone(d: number, radius: number, round: number): number {
  if (d >= radius) return 0
  const slope = 1 / (radius - round)
  if (d > radius - round) {
    const e = radius - d
    return (slope * e * e) / (2 * round)
  }
  if (d < round) return 1 - (slope * d * d) / (2 * round)
  return slope * (radius - round / 2 - d)
}

/**
 * A wall across a signed distance (mm, positive on the ridge): 0 below -half, 1 above +half, straight
 * between, with both ends rounded over `round` so the flats meet the wall without a crease.
 */
function wall(sd: number, half: number, round: number): number {
  if (sd >= half) return 1
  if (sd <= -half) return 0
  const slope = 1 / (2 * half - round)
  const e = half - Math.abs(sd)
  const low = e < round ? (slope * e * e) / (2 * round) : slope * (e - round / 2)
  return sd > 0 ? 1 - low : low
}

export const coral: TextureDef = {
  id: 'coral',
  mark: 'T-04',
  name: 'Coral',
  category: 'essential',
  blurb: 'A living reef: brain-coral grooves wander and split, pitted with polyps.',
  defaults: { depth: 2.6, scale: 20 },
  scaleRange: [6, 50],
  depthRange: [1, 5],
  params: [
    {
      key: 'labyrinth',
      label: 'Brain coral',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.8,
      hint: 'From a rough crust of plates and tangled cracks (0) to the long, evenly spaced grooves of brain coral (1).',
    },
    {
      key: 'warp',
      label: 'Flow',
      min: 0,
      max: 1.5,
      step: 0.05,
      default: 0.85,
      hint: 'How much the grooves meander. Higher values look grown rather than drawn.',
    },
    {
      key: 'polyps',
      label: 'Polyps',
      min: 0,
      max: 0.45,
      step: 0.01,
      default: 0.18,
      hint: 'Size of the little cone-shaped pits along the ridges; each one shrinks to fit its ridge.',
    },
    {
      key: 'detail',
      label: 'Detail',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.45,
      hint: 'How often the grooves turn: low sweeps in long curves, high twists and forks more.',
    },
  ],
  directional: false,
  seeded: true,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, repeatsY, seed } = ctx
    const [periodX, periodY] = ctx.periodMm
    const mmPerCell = cellMmX(ctx)
    const { warp, labyrinth, detail } = ctx.params
    const spacing = PITCH * mmPerCell
    const wallHalf = clamp(WALL * spacing, WALL_MIN_MM, WALL_MAX_MM) / 2
    const ridgePhase = Math.PI * mix(RIDGE_CRUST, RIDGE, labyrinth)
    // Phase from a wall to the middle of the narrower band beside it.
    const roomPhase = Math.min(ridgePhase, Math.PI - ridgePhase)

    // The packet lattice: a whole number of cells per period on each axis keeps the reef periodic.
    const packet = mix(PACKET_CRUST, PACKET, labyrinth) * mix(PACKET_DETAIL[0], PACKET_DETAIL[1], detail)
    const gx = Math.max(1, Math.round(periodX / (packet * spacing)))
    const gy = Math.max(1, Math.round(periodY / (packet * spacing)))
    const cellX = periodX / gx
    const cellY = periodY / gy
    // Packets reach one cell, so the 3 x 3 block around a sample holds every packet that touches it.
    const radius = Math.min(cellX, cellY)
    const invR2 = 1 / (radius * radius)
    const k = TAU / spacing

    // Each packet's direction follows a slow flow over the tile, which is what makes the grooves
    // meander together; `detail` weighs in faster turns of the flow and `labyrinth` sets how far a
    // packet strays from it.
    const lx = Math.max(1, Math.round(repeatsX / 2))
    const ly = Math.max(1, Math.round(repeatsY / 2))
    const gain = mix(0.1, 0.9, detail)
    const base = (hashCell(1, 2, seed) / 4294967296) * TAU
    const stray = mix(STRAY_CRUST, STRAY, labyrinth)
    const count = gx * gy * PACKETS_PER_CELL
    const px = new Float64Array(count)
    const py = new Float64Array(count)
    const kx = new Float64Array(count)
    const ky = new Float64Array(count)
    const phase = new Float64Array(count)
    for (let cy = 0; cy < gy; cy++) {
      for (let cx = 0; cx < gx; cx++) {
        for (let j = 0; j < PACKETS_PER_CELL; j++) {
          const i = (cy * gx + cx) * PACKETS_PER_CELL + j
          const h1 = hashCell(cx * PACKETS_PER_CELL + j, cy, seed + 911)
          const h2 = hashCell(cx * PACKETS_PER_CELL + j, cy, seed + 1733)
          px[i] = (cx + (h1 & 0xffff) / 65536) * cellX
          py[i] = (cy + (h1 >>> 16) / 65536) * cellY
          const flow = fbm2((px[i] / periodX) * lx, (py[i] / periodY) * ly, lx, ly, 3, seed + 77, gain)
          const angle = base + warp * Math.PI * flow + stray * (2 * ((h2 & 0xffff) / 65536) - 1)
          kx[i] = k * Math.cos(angle)
          ky[i] = k * Math.sin(angle)
          phase[i] = ((h2 >>> 16) / 65536) * TAU
        }
      }
    }

    // A faint plane wave under the packets, a whole number of cycles across the period on each axis: it
    // decides the phase in the rare spot no packet reaches, which would otherwise have none.
    const bgKx = (TAU * Math.round((k * Math.cos(base) * periodX) / TAU)) / periodX
    const bgKy = (TAU * Math.round((k * Math.sin(base) * periodY) / TAU)) / periodY

    // What `measure` found at the last point: the signed distance to the nearest wall (mm, positive
    // on a ridge), that wall's half-width there, and the phase with its gradient.
    let sd = 0
    let half = wallHalf
    let phi = 0
    let phiX = 0
    let phiY = 0
    const measure = (x: number, y: number): void => {
      const ix = Math.floor(x / cellX)
      const iy = Math.floor(y / cellY)
      // The phasor and its gradient, summed packet by packet over the plane wave.
      const bgPsi = bgKx * x + bgKy * y
      const bgC = BACKGROUND * Math.cos(bgPsi)
      const bgS = BACKGROUND * Math.sin(bgPsi)
      let re = bgC
      let im = bgS
      let reX = -bgKx * bgS
      let reY = -bgKy * bgS
      let imX = bgKx * bgC
      let imY = bgKy * bgC
      for (let dy = -1; dy <= 1; dy++) {
        const cy = iy + dy
        const wy = ((cy % gy) + gy) % gy
        const offY = (cy - wy) * cellY
        for (let dx = -1; dx <= 1; dx++) {
          const cx = ix + dx
          const wx = ((cx % gx) + gx) % gx
          const offX = (cx - wx) * cellX
          const first = (wy * gx + wx) * PACKETS_PER_CELL
          for (let i = first; i < first + PACKETS_PER_CELL; i++) {
            const ex = x - px[i] - offX
            const ey = y - py[i] - offY
            const q = (ex * ex + ey * ey) * invR2
            if (q >= 1) continue
            const fall = 1 - q
            const w = fall * fall
            const wGrad = -4 * fall * invR2
            const psi = kx[i] * ex + ky[i] * ey + phase[i]
            const c = Math.cos(psi)
            const s = Math.sin(psi)
            re += w * c
            im += w * s
            reX += wGrad * ex * c - w * kx[i] * s
            reY += wGrad * ey * c - w * ky[i] * s
            imX += wGrad * ex * s + w * kx[i] * c
            imY += wGrad * ey * s + w * ky[i] * c
          }
        }
      }
      const mag2 = re * re + im * im
      if (mag2 < 1e-12) {
        // The waves cancel exactly, at a single point: the middle of a wall is the neutral answer.
        sd = 0
        half = wallHalf
        phi = ridgePhase
        phiX = 0
        phiY = 0
        return
      }
      // The phase gradient, rad/mm: a phase difference over it is a distance in mm.
      phiX = (re * imX - im * reX) / mag2
      phiY = (re * imY - im * reY) / mag2
      phi = Math.atan2(im, re)
      const grad = Math.max(Math.hypot(phiX, phiY), 1e-9)
      sd = (ridgePhase - Math.abs(phi)) / grad
      half = Math.max(Math.min(wallHalf, (WALL_ROOM * roomPhase) / grad), MIN_SOFT_MM / 2)
    }

    // Polyps sit on a finer lattice than the grooves (3x is the research's figure), one pit per cell at
    // most. Each pit walks from its lattice point to the middle of the nearest ridge, where it has the
    // most room, and is sized there to fit the flat top: a pit that crossed a wall would notch it, and
    // one on a valley floor would only be a smaller valley.
    const wx = repeatsX * 3
    const wy = repeatsY * 3
    const pitCellX = periodX / wx
    const pitCellY = periodY / wy
    const pitCell = Math.min(pitCellX, pitCellY)
    const maxPit = ctx.params.polyps > 0 ? Math.max(ctx.params.polyps * (mmPerCell / 3), PIT_MIN_MM) : 0
    const candX = new Float64Array(wx * wy)
    const candY = new Float64Array(wx * wy)
    const candR = new Float64Array(wx * wy)
    // How far any pit landed from its own cell, in cells: how far apart two that meet can start.
    let drift = 0
    if (maxPit > 0) {
      for (let cy = 0; cy < wy; cy++) {
        for (let cx = 0; cx < wx; cx++) {
          const i = cy * wx + cx
          const h = hashCell(cx, cy, seed + 313)
          const homeX = (cx + 0.5) * pitCellX
          const homeY = (cy + 0.5) * pitCellY
          let x = homeX + ((h & 0xffff) / 65536 - 0.5) * PIT_JITTER * pitCellX
          let y = homeY + ((h >>> 16) / 65536 - 0.5) * PIT_JITTER * pitCellY
          // Newton steps towards zero phase, the middle of a ridge, each kept under half a spacing.
          for (let step = 0; step < 3; step++) {
            measure(x, y)
            const g2 = Math.max(phiX * phiX + phiY * phiY, 1e-12)
            const move = Math.min(1, (0.5 * spacing) / (Math.abs(phi) / Math.sqrt(g2) + 1e-12))
            x -= ((phi * phiX) / g2) * move
            y -= ((phi * phiY) / g2) * move
          }
          measure(x, y)
          // Room on the flat top from the pit's centre to where the wall starts down, less a margin
          // that keeps a ring of flat round the pit.
          const r = Math.min(maxPit, sd - half - PIT_MARGIN_MM)
          if (r < PIT_MIN_MM) continue
          candX[i] = x
          candY[i] = y
          candR[i] = r
          drift = Math.max(drift, Math.ceil((Math.max(Math.abs(x - homeX), Math.abs(y - homeY)) + r) / pitCell))
        }
      }
      // Two pits that walked to the same stretch of ridge: the first keeps its place.
      for (let i = 0; i < wx * wy; i++) {
        if (candR[i] <= 0) continue
        const cx = i % wx
        const cy = (i - cx) / wx
        for (let dy = -2 * drift; dy <= 2 * drift && candR[i] > 0; dy++) {
          for (let dx = -2 * drift; dx <= 2 * drift; dx++) {
            const ox = cx + dx
            const oy = cy + dy
            const wxo = ((ox % wx) + wx) % wx
            const wyo = ((oy % wy) + wy) % wy
            const j = wyo * wx + wxo
            if (j >= i || candR[j] <= 0) continue
            const ex = candX[i] - candX[j] - (ox - wxo) * pitCellX
            const ey = candY[i] - candY[j] - (oy - wyo) * pitCellY
            if (Math.hypot(ex, ey) < candR[i] + candR[j] + PIT_MARGIN_MM) {
              candR[i] = 0
              break
            }
          }
        }
      }
    }
    // The pits filed by the cell they landed in, wrapped into the period: a pit is narrower than a
    // cell, so a sample only has to look in the 3 x 3 cells around its own.
    const pitStart = new Int32Array(wx * wy + 1)
    const landed = new Int32Array(wx * wy)
    for (let i = 0; i < wx * wy; i++) {
      if (candR[i] <= 0) continue
      candX[i] -= Math.floor(candX[i] / periodX) * periodX
      candY[i] -= Math.floor(candY[i] / periodY) * periodY
      landed[i] = Math.min(wy - 1, Math.floor(candY[i] / pitCellY)) * wx + Math.min(wx - 1, Math.floor(candX[i] / pitCellX))
      pitStart[landed[i] + 1]++
    }
    for (let c = 0; c < wx * wy; c++) pitStart[c + 1] += pitStart[c]
    const pits = pitStart[wx * wy]
    const pitX = new Float64Array(pits)
    const pitY = new Float64Array(pits)
    const pitR = new Float64Array(pits)
    const pitDepth = new Float64Array(pits)
    const fill = pitStart.slice(0, wx * wy)
    for (let i = 0; i < wx * wy; i++) {
      if (candR[i] <= 0) continue
      const k = fill[landed[i]]++
      pitX[k] = candX[i]
      pitY[k] = candY[i]
      pitR[k] = candR[i]
      pitDepth[k] = Math.min(0.7, Math.max(PIT, PIT_PER_MM * candR[i]))
    }
    const reach = Math.max(1, Math.ceil(maxPit / pitCell))

    return (u, v) => {
      const x = (u - Math.floor(u)) * periodX
      const y = (v - Math.floor(v)) * periodY
      measure(x, y)
      let h = wall(sd, half, Math.min(ROUND_MM, half * 0.5))
      if (pits > 0 && h > 0) {
        const ix = Math.floor(x / pitCellX)
        const iy = Math.floor(y / pitCellY)
        for (let dy = -reach; dy <= reach; dy++) {
          const cy = iy + dy
          const wyc = ((cy % wy) + wy) % wy
          const offY = (cy - wyc) * pitCellY
          for (let dx = -reach; dx <= reach; dx++) {
            const cx = ix + dx
            const wxc = ((cx % wx) + wx) % wx
            const offX = (cx - wxc) * pitCellX
            const cell = wyc * wx + wxc
            for (let k = pitStart[cell]; k < pitStart[cell + 1]; k++) {
              const r = pitR[k]
              const ex = x - pitX[k] - offX
              const ey = y - pitY[k] - offY
              if (ex * ex + ey * ey >= r * r) continue
              h *= 1 - pitDepth[k] * cone(Math.sqrt(ex * ex + ey * ey), r, Math.min(PIT_ROUND_MM, r * 0.3))
            }
          }
        }
      }
      return clamp01(h)
    }
  },
}
