// Ported from React Bits (github.com/DavidHDev/react-bits), component "PixelSwap".
// Copyright (c) 2026 David Haz. MIT + Commons Clause License Condition v1.0: permission is granted to
// use, copy, modify, merge, publish and distribute this software as part of an application, provided
// this notice is kept. Selling, sublicensing or redistributing the components themselves, including as
// a ported version, is not granted.
//
// Only the idea travelled. PixelSwap orders a clone farm of up to 220 nodes by their distance from a
// corner (its PATTERNS 'diagonal' and 'left-to-right'); here the same ordering runs on the real tiles,
// measured from the corner a tiler sets out from, so a reveal or a recolor lands the way a wall is laid.

/**
 * The corner a corner-origin layout is set out from: the wall is read from the top-left, so that is
 * where the first whole tile goes and where the cuts run away from. Surface coordinates, y up.
 */
export function cornerSettingOut(model: { width: number; height: number }): { x: number; y: number } {
  return { x: 0, y: model.height }
}

/**
 * 0 at the setting-out point, 1 at the far corner. Normalized Manhattan distance, measured to the
 * tile's own nearest corner, so the piece set first is exactly 0 and equal diagonals share a delay:
 * multiplied into a transition-delay it reads as one wave crossing the wall.
 * Unit-free: pass surface mm, or grid cells with `model` counted in cells, as long as all three agree.
 */
export function layDelay(
  tile: { x: number; y: number; w: number; h: number },
  model: { width: number; height: number },
  origin: { x: number; y: number },
): number {
  const span = model.width + model.height
  if (!(span > 0)) return 0
  const nearX = Math.min(Math.max(origin.x, tile.x), tile.x + tile.w)
  const nearY = Math.min(Math.max(origin.y, tile.y), tile.y + tile.h)
  const distance = Math.abs(nearX - origin.x) + Math.abs(nearY - origin.y)
  // A tile outside the model (a fragment measured against the whole wall) would otherwise run past 1.
  return Math.min(1, Math.max(0, distance / span))
}
