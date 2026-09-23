import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clampAlbedo } from './colorMath'
import { LOOK, partColor } from './look'
import { useSceneServices } from './sceneServices'
import type { SeatedModel, SeatedSet } from './seatedSet'
import { waveAnimates, waveLift, writeWavePose, type WaveClock } from './wave'

const _pose = new THREE.Matrix4()

/** A model's mesh moved so its box centre sits on the origin and its bottom on z = 0: a seat then only turns and places it. */
function seatedGeometry(model: SeatedModel): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  // A copy: translate() writes into the array, and the mesh is shared through the cache by accessory id.
  geometry.setAttribute('position', new THREE.BufferAttribute(model.mesh.positions.slice(), 3))
  geometry.setIndex(new THREE.BufferAttribute(model.mesh.indices, 1))
  const { box } = model
  geometry.translate(-(box.minX + box.maxX) / 2, -(box.minY + box.maxY) / 2, -box.minZ)
  // Printed parts are flat-faced prisms: a normal per shared vertex would round their edges.
  const flat = geometry.toNonIndexed()
  geometry.dispose()
  flat.computeVertexNormals()
  flat.computeBoundingBox()
  flat.computeBoundingSphere()
  return flat
}

export interface SeatedPartsProps {
  set: SeatedSet
  /** Tile color as '#RRGGBB': the parts take the neutral that stands out from it (partColor). */
  color: string
  /** The single tile's size: the parts ride its re-lay wave exactly as the tile does. */
  width: number
  height: number
  wave: WaveClock
}

/**
 * The keys and clips as they sit in the single tile's back, drawn in the tile's own frame so they turn
 * over with it. They also ride the tile's re-lay wave, from the same clock and the same pose TileField
 * gives the tile, so a rebuild never leaves them floating over an empty pocket.
 */
export function SeatedParts({ set, color, width, height, wave }: SeatedPartsProps) {
  const groupRef = useRef<THREE.Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const services = useSceneServices()

  const geometries = useMemo(() => set.models.map((model) => ({ model, geometry: seatedGeometry(model) })), [set])
  useEffect(() => () => geometries.forEach(({ geometry }) => geometry.dispose()), [geometries])

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: LOOK.materials.roughness,
        metalness: LOOK.materials.metalness,
        envMapIntensity: LOOK.materials.envMapIntensity,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    material.color.copy(clampAlbedo(partColor(color)))
    invalidate()
  }, [material, color, invalidate])

  // The tile's own wave schedule, worked out as TileField works it out for the one placement at the origin.
  const delay = wave.delayFor(width / 2, height / 2)
  const towardX = width / 2 - wave.origin.x
  const towardY = height / 2 - wave.origin.y
  const toward = Math.hypot(towardX, towardY) || 1
  const lift = waveLift(width, height)
  const animate = waveAnimates(wave, 1)

  useLayoutEffect(() => {
    const group = groupRef.current
    if (!group) return
    // At rest until the frame loop says otherwise: a wave that is not running leaves the parts in place.
    group.matrix.identity()
    group.matrixWorldNeedsUpdate = true
    group.visible = true
    services.shadows.mark(3)
    invalidate()
  }, [geometries, wave, services, invalidate])

  useFrame(() => {
    const group = groupRef.current
    if (!group || !animate) return
    const progress = wave.progress(wave.elapsed(performance.now()), delay)
    // Hidden with the tile until the very first lay-in reaches it, as TileField hides it.
    const shown = !(progress <= 0 && wave.hideUntilLaid)
    if (group.visible !== shown) group.visible = shown
    if (progress >= 1 && group.matrix.equals(_pose.identity())) return
    writeWavePose(_pose, 0, 0, width / 2, height / 2, progress, lift, towardX / toward, towardY / toward)
    group.matrix.copy(_pose)
    group.matrixWorldNeedsUpdate = true
    services.shadows.mark()
    invalidate()
  })

  return (
    <group ref={groupRef} matrixAutoUpdate={false}>
      {geometries.map(({ model, geometry }) =>
        model.seats.map((seat, index) => (
          <mesh
            key={`${model.accessoryId}:${index}`}
            geometry={geometry}
            material={material}
            position={[seat.x, seat.y, seat.z]}
            rotation={[0, 0, (seat.turns * Math.PI) / 2]}
            castShadow
            receiveShadow
          />
        )),
      )}
    </group>
  )
}
