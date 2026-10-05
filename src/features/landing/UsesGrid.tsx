// The uses, as a grid of six plates: one room per use, each framed close on the surface a maker could
// tile and laid in the visitor's own relief and colour. The plates are links: each opens the studio on its
// surface, named and sized. Three across on a desk, two on a tablet, one on a phone, from one list.
import { useEffect, useId, useMemo, useRef, type ComponentType, type RefObject } from 'react'
import { Link } from 'react-router'
import { trackChoice } from '@/app/analytics'
import { studioIntent } from '@/app/prefetchStudio'
import type { CropRect, DesignConfig } from '@/core/types'
import { useTextureChips, type ChipItem } from '@/hooks'
import { PROOF_CHIP_PX } from './chipBudget'
import { BedRoom } from './rooms/BedRoom'
import { DiningRoom } from './rooms/DiningRoom'
import { KitchenRoom } from './rooms/KitchenRoom'
import { LivingRoom } from './rooms/LivingRoom'
import { RoomBoundary } from './rooms/roomKit'
import { StudyRoom } from './rooms/StudyRoom'
import { TvRoom } from './rooms/TvRoom'
import { TileInkContext, type TileInk } from './rooms/tileInk'
import {
  captionDetail,
  roomLabel,
  studioDesign,
  tileCells,
  USES,
  type HomeUseId,
  type RoomRect,
  type TileCell,
} from './uses'
import styles from './UsesGrid.module.scss'

/** Each use's room, in the order the grid reads. */
const SCENES: Record<HomeUseId, ComponentType> = {
  splashback: KitchenRoom,
  sideboard: DiningRoom,
  'feature-wall': LivingRoom,
  headboard: BedRoom,
  'shelf-doors': StudyRoom,
  'tv-wall': TvRoom,
}

/** The one chip every plate lays: the visitor's whole tile, at the size the hero and the kit already hold. */
const TILE_KEY = 'use-tile'

/** The arrow after each plate's size: where the plate goes when it is pressed. */
function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className={styles.arrow} aria-hidden="true" focusable="false">
      <path d="M2.5 8 H12.5 M8.5 3.5 L13 8 L8.5 12.5" />
    </svg>
  )
}

/**
 * The relief at plate scale. A tile here is a fifth of the size the hero shows it at, and shrinking the
 * chip averages its light and shade away until every relief reads as the same flat grid. An unsharp mask
 * gives the relief back: it raises each tile's light and shade about their own local average, so the
 * tile keeps its colour (the average) and regains its pattern. Radius in room millimetres, about a third
 * of a feature.
 */
const RELIEF = { radius: 18, amount: 1.2 } as const

/** How far up the window a plate's top edge has to come before its tiles are laid: the page's own reach. */
const REACH_FRACTION = 0.88
/** Plates reached together are laid left to right, this long from one side of the window to the other. */
const ACROSS_MS = 360

/**
 * Lays each plate's tiles once that plate is in view, never before and never twice. Six plates in one
 * column on a phone run three screens tall, so one trigger for the grid would lay the lower plates out of
 * sight. Measured as the page measures its plates: the rect on every scroll until it fires, because a
 * jump (a restored position, find-in-page) can carry a plate past an observer without one callback.
 * Written straight onto the plate, so a scroll never commits React state.
 */
function usePlateReach(plates: RefObject<(HTMLLIElement | null)[]>) {
  useEffect(() => {
    const pending = new Set(
      (plates.current ?? []).filter((plate): plate is HTMLLIElement => plate !== null && plate.dataset.laid === undefined),
    )
    const observer = new IntersectionObserver(check)

    function check() {
      for (const plate of pending) {
        const box = plate.getBoundingClientRect()
        if (box.top >= window.innerHeight * REACH_FRACTION) continue
        const across = Math.min(1, Math.max(0, box.left / Math.max(1, window.innerWidth)))
        plate.style.setProperty('--room-delay', `${Math.round(across * ACROSS_MS)}ms`)
        plate.dataset.laid = ''
        pending.delete(plate)
      }
      if (!pending.size) stop()
    }

    function stop() {
      observer.disconnect()
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }

    for (const plate of pending) observer.observe(plate)
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check, { passive: true })
    check()
    return stop
  }, [plates])
}

export interface UsesGridProps {
  /** The visitor's design, colour settled: the plates are worker renders, like the kit's chips. */
  config: DesignConfig
  /** "/studio?d=..." for the visitor's design with an override. Router-relative: Link adds the base. */
  studioHref: (override?: Partial<DesignConfig>) => string
}

export function UsesGrid({ config, studioHref }: UsesGridProps) {
  const relief = useId()
  const plateRefs = useRef<(HTMLLIElement | null)[]>([])
  usePlateReach(plateRefs)
  const { width, height } = config.tile
  const { joint } = config
  const { origin, rowOffset } = config.layout
  // The whole tile's crop, exactly as the hero's plan names it, so this chip is the one it already holds.
  const crop = useMemo<CropRect>(() => ({ x0: 0, y0: 0, x1: width, y1: height }), [width, height])
  const items = useMemo<ChipItem[]>(() => [{ key: TILE_KEY, config, crop }], [config, crop])
  const chips = useTextureChips(config, items, PROOF_CHIP_PX)
  const chip = chips.get(TILE_KEY) ?? null

  // Every surface's tiles, laid once per tile and layout: a new wall, relief or colour moves none of them.
  const cells = useMemo(() => {
    const design = { tile: { width, height }, joint, layout: { origin, rowOffset } }
    const byRect = new Map<RoomRect, TileCell[]>()
    for (const use of USES) for (const rect of use.places) byRect.set(rect, tileCells(rect, design))
    return byRect
  }, [width, height, joint, origin, rowOffset])

  const ink = useMemo<TileInk>(
    () => ({ chip, color: config.color, cells: (rect) => cells.get(rect) ?? [], relief }),
    [chip, config.color, cells, relief],
  )

  return (
    <TileInkContext value={ink}>
      {/* Defined once for every plate: a filter is found by id anywhere in the document. */}
      <svg className={styles.defs} aria-hidden="true" focusable="false">
        <filter id={relief} colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation={RELIEF.radius} result="average" />
          <feComposite in="SourceGraphic" in2="average" operator="arithmetic" k2={1 + RELIEF.amount} k3={-RELIEF.amount} />
        </filter>
      </svg>
      <ul className={styles.grid}>
        {USES.map((use, index) => {
          const Scene = SCENES[use.id]
          return (
            <li
              key={use.id}
              ref={(plate) => {
                plateRefs.current[index] = plate
              }}
              className={styles.item}
              data-use={use.id}
            >
              <Link
                to={studioHref(studioDesign(use))}
                className={styles.link}
                aria-label={roomLabel(use)}
                onClick={() => trackChoice('home-use', use.id)}
                {...studioIntent}
              >
                <span className={styles.picture}>
                  <span className={styles.print}>
                    <RoomBoundary>
                      <Scene />
                    </RoomBoundary>
                  </span>
                </span>
                <span className={styles.caption}>
                  <span className={styles.name}>{use.name}</span>
                  <span className={styles.detail}>
                    {captionDetail(use)}
                    <Arrow />
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </TileInkContext>
  )
}
