import { filamentById } from '../filaments'
import { textureById } from '../textures/registry'
import type { DesignConfig, LayoutPlan } from '../types'
import { formatLength, formatSize } from '../units'
import { buildPlanModel } from './planModel'
import { renderPlanSheet, type SheetInfo } from './planSheet'

export interface PlanSvgOptions {
  /** Sheet title; defaults to the design name. */
  title?: string
  /** Date printed in the title block; defaults to today (pass one for reproducible output). */
  date?: Date
}

/** yyyy-mm-dd in local time: the date the installer printed the sheet. */
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function planSheetInfo(config: DesignConfig, opts: PlanSvgOptions = {}): SheetInfo {
  const texture = textureById(config.texture.id)
  const filament = filamentById(config.colorId)
  return {
    title: opts.title ?? config.name,
    surface: formatSize(config.surface.width, config.surface.height),
    tile: `${formatSize(config.tile.width, config.tile.height)}, ${formatLength(config.tile.thickness)} base`,
    joint: config.joint > 0 ? formatLength(config.joint) : 'Butt joint (0 mm)',
    texture: `${texture.name}, ${formatLength(config.texture.depth)} relief`,
    filament: `${filament.line} ${filament.name}`,
    date: isoDay(opts.date ?? new Date()),
  }
}

/** Self-contained, print-ready A3 setting-out sheet for the zip (and for "Save plan"). */
export function planSvg(config: DesignConfig, plan: LayoutPlan, opts: PlanSvgOptions = {}): string {
  return renderPlanSheet(buildPlanModel(config, plan), planSheetInfo(config, opts))
}
