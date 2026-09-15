import { useFrame, useThree } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { PieceSpec, Placement } from '@/core/types'
import type { PieceAssets } from './geometry'
import { LOOK } from './look'
import type { TileMaterialSet } from './materials'
import { hatchDirection, type Stage } from './stage'
import { ensureTint, layInstances } from './instanceLayout'
import { useSceneServices } from './sceneServices'
import { waveAnimates, waveLift, writeWavePose, type WaveClock } from './wave'

export type HighlightState = 'none' | 'on' | 'off'

const _matrix = new THREE.Matrix4()
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)

/** One damping step toward `target`, snapped over the last thousandth so it comes to rest exactly. */
function settle(value: number, target: number, lambda: number, dt: number): number {
  const next = THREE.MathUtils.damp(value, target, lambda, dt)
  return Math.abs(next - target) <= 1e-3 ? target : next
}

interface PieceInstancesProps {
  asset: PieceAssets
  piece: PieceSpec
  /** Bottom-left corners of every placement of this piece, as x, y pairs in surface mm. */
  positions: Float32Array
  materials: TileMaterialSet
  wave: WaveClock
  highlight: HighlightState
  /** Wash every cut piece in red pencil: the view is being pointed at or is focused. */
  revealCuts: boolean
  animate: boolean
  /** prefers-reduced-motion: tints arrive at once instead of fading. */
  reduced: boolean
}

function PieceInstances({ asset, piece, positions, materials, wave, highlight, revealCuts, animate, reduced }: PieceInstancesProps) {
  const count = positions.length / 2
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const tintRef = useRef<THREE.InstancedBufferAttribute | null>(null)
  // `written` is the tint the GPU already holds; -1 means nothing has been uploaded yet. `laidOn` is the
  // mesh object the resting translations were written to.
  const stateRef = useRef<{
    wash: number
    dim: number
    cut: number
    written: { red: number; hatch: number; dim: number }
    waveDone: boolean
    laidOn: THREE.InstancedMesh | null
  }>({ wash: 0, dim: 0, cut: 0, written: { red: -1, hatch: -1, dim: -1 }, waveDone: false, laidOn: null })
  const invalidate = useThree((state) => state.invalidate)
  const services = useSceneServices()

  const materialList = useMemo(() => [materials.top(asset.normalMap), materials.walls], [materials, asset.normalMap])

  // Stagger and tilt direction per instance, measured from the setting-out point.
  const schedule = useMemo(() => {
    const delays = new Float32Array(count)
    const directions = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      const cx = positions[i * 2] + piece.width / 2
      const cy = positions[i * 2 + 1] + piece.height / 2
      delays[i] = wave.delayFor(cx, cy)
      const dx = cx - wave.origin.x
      const dy = cy - wave.origin.y
      const length = Math.hypot(dx, dy) || 1
      directions[i * 2] = dx / length
      directions[i * 2 + 1] = dy / length
    }
    return { delays, directions }
  }, [count, positions, piece.width, piece.height, wave])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    tintRef.current = ensureTint(mesh.geometry, count)
    layInstances(mesh, positions)
    // The cut wash follows the pointer, not the geometry, so a rebuild must not blink it off.
    stateRef.current = { wash: 0, dim: 0, cut: stateRef.current.cut, written: { red: -1, hatch: -1, dim: -1 }, waveDone: !animate, laidOn: mesh }
    services.shadows.mark(3)
    invalidate()
    return () => {
      // Leave tsTint on the geometry: it is disposed on the same tick and frees every attribute it
      // still owns, while an attribute removed first orphans its GPU buffer in WebGLAttributes.
      tintRef.current = null
    }
  }, [count, positions, asset.geometry, animate, invalidate, services])

  const lift = waveLift(piece.width, piece.height)
  const isCut = piece.kind !== 'full'

  // The frameloop is on demand, so a tint that arrives between frames (a pointer on the view, a hover
  // on the plan) has to ask for one, or nothing is ever drawn with it.
  useEffect(() => {
    invalidate()
  }, [revealCuts, highlight, reduced, invalidate])

  // Materials are a property, not a constructor argument, so a tier change swaps them on the
  // same mesh; the cached shadow map still re-renders once, since casting can change with the material.
  useEffect(() => {
    services.shadows.mark()
    invalidate()
  }, [materialList, services, invalidate])

  useFrame((frameState, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const now = performance.now()
    const state = stateRef.current
    if (state.laidOn !== mesh) {
      // A mesh rebuilt without the layout effect running starts with every instance at the origin: lay it
      // again before it draws, keeping the tint and highlight state as they are.
      tintRef.current = ensureTint(mesh.geometry, count)
      layInstances(mesh, positions)
      state.written = { red: -1, hatch: -1, dim: -1 }
      state.laidOn = mesh
      frameState.gl.shadowMap.needsUpdate = true
      services.shadows.mark(3)
      invalidate()
    }
    const tint = tintRef.current
    if (!tint) return
    const elapsed = animate ? wave.elapsed(now) : Number.POSITIVE_INFINITY
    const movingTiles = animate && !state.waveDone

    const washTarget = highlight === 'on' ? LOOK.highlight.wash : 0
    const dimTarget = highlight === 'off' ? LOOK.highlight.dim : 0
    const cutTarget = revealCuts && isCut ? LOOK.cuts.wash : 0
    // The loop sleeps between edits, so the first frame after a pause carries a delta of seconds:
    // clamped, or every tint would arrive at its target in one step instead of fading there.
    const step = Math.min(delta, 1 / 30)
    state.wash = settle(state.wash, washTarget, LOOK.highlight.damp, step)
    state.dim = settle(state.dim, dimTarget, LOOK.highlight.damp, step)
    // prefers-reduced-motion: the wash is a fact about the wall, so it arrives, only without the fade.
    state.cut = reduced ? cutTarget : settle(state.cut, cutTarget, LOOK.cuts.damp, step)
    const flash = animate && isCut ? LOOK.wave.cutHatch * wave.flash(elapsed) : 0
    const flashing = animate && isCut && !wave.done(elapsed)

    // One red channel serves both: the piece the plan points at, and every cut under the pointer.
    const red = Math.max(state.wash, state.cut)
    const written = state.written
    // What the GPU holds decides, not what is still animating: a tint that reached its target inside a
    // single long frame still has to be uploaded, and so does the frame that ends the wave's flash.
    if (!movingTiles && !flashing && red === written.red && flash === written.hatch && state.dim === written.dim) return

    const data = tint.array as Float32Array
    let atRest = true
    for (let i = 0; i < count; i++) {
      const progress = animate ? wave.progress(elapsed, schedule.delays[i]) : 1
      if (movingTiles) {
        if (progress <= 0 && wave.hideUntilLaid) {
          mesh.setMatrixAt(i, HIDDEN)
        } else {
          writeWavePose(
            _matrix,
            positions[i * 2],
            positions[i * 2 + 1],
            piece.width / 2,
            piece.height / 2,
            progress,
            lift,
            schedule.directions[i * 2],
            schedule.directions[i * 2 + 1],
          )
          mesh.setMatrixAt(i, _matrix)
        }
        if (progress < 1) atRest = false
      }
      data[i * 4] = red
      // The hatch lights up as each cut lands, then the whole wave fades it out together.
      data[i * 4 + 1] = flash * THREE.MathUtils.smoothstep(progress, 0.35, 1)
      data[i * 4 + 2] = state.dim
    }
    tint.needsUpdate = true
    written.red = red
    written.hatch = flash
    written.dim = state.dim
    if (movingTiles) {
      mesh.instanceMatrix.needsUpdate = true
      services.shadows.mark()
      if (atRest) state.waveDone = true
    }
    services.motion.bump(now)
    invalidate()
  })

  if (count === 0) return null
  return (
    <instancedMesh
      ref={meshRef}
      args={[asset.geometry, undefined, count]}
      material={materialList}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
}

/** Keeps the red-pencil hatch at a constant screen pitch, whatever the zoom. */
function HatchScale({ materials, stage }: { materials: TileMaterialSet; stage: Stage }) {
  const height = useThree((state) => state.size.height)
  useEffect(() => {
    materials.setHatchDirection(hatchDirection(stage))
  }, [materials, stage])
  useFrame((state) => {
    const camera = state.camera as THREE.PerspectiveCamera
    const worldPerPixel = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.position.length()) / Math.max(1, height)
    materials.setHatchScale(Math.max(0.05, worldPerPixel * LOOK.hatch.pitchPx))
  })
  return null
}

export interface TileFieldProps {
  assets: ReadonlyMap<string, PieceAssets>
  pieces: readonly PieceSpec[]
  placements: readonly Placement[]
  materials: TileMaterialSet
  wave: WaveClock
  highlightPieceId: string | null
  /** Wash every cut piece in red pencil (the view is pointed at or focused). */
  revealCuts: boolean
  reduced: boolean
  stage: Stage
}

/** One instanced mesh per unique piece: at most a handful of draw calls for a whole wall. */
export const TileField = memo(function TileField({ assets, pieces, placements, materials, wave, highlightPieceId, revealCuts, reduced, stage }: TileFieldProps) {
  const positionsByPiece = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of placements) counts.set(p.pieceId, (counts.get(p.pieceId) ?? 0) + 1)
    const arrays = new Map<string, Float32Array>()
    const cursors = new Map<string, number>()
    for (const [id, n] of counts) {
      arrays.set(id, new Float32Array(n * 2))
      cursors.set(id, 0)
    }
    for (const p of placements) {
      const array = arrays.get(p.pieceId)
      const at = cursors.get(p.pieceId)
      if (!array || at === undefined) continue
      array[at] = p.x
      array[at + 1] = p.y
      cursors.set(p.pieceId, at + 2)
    }
    return arrays
  }, [placements])

  const animate = waveAnimates(wave, placements.length)

  return (
    <>
      {pieces.map((piece) => {
        const asset = assets.get(piece.id)
        const positions = positionsByPiece.get(piece.id)
        if (!asset || !positions) return null
        return (
          <PieceInstances
            key={piece.id}
            asset={asset}
            piece={piece}
            positions={positions}
            materials={materials}
            wave={wave}
            animate={animate}
            reduced={reduced}
            revealCuts={revealCuts}
            highlight={highlightPieceId === null ? 'none' : highlightPieceId === piece.id ? 'on' : 'off'}
          />
        )
      })}
      <HatchScale materials={materials} stage={stage} />
    </>
  )
})
