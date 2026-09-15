import * as THREE from 'three'

const _matrix = new THREE.Matrix4()

/** Writes every instance at rest: a pure translation to its bottom-left corner (x, y pairs in surface mm). */
export function layInstances(mesh: THREE.InstancedMesh, positions: Float32Array): void {
  const count = Math.min(mesh.count, positions.length / 2)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  for (let i = 0; i < count; i++) {
    mesh.setMatrixAt(i, _matrix.makeTranslation(positions[i * 2], positions[i * 2 + 1], 0))
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}

/**
 * The per-instance tint (red wash, hatch, dim, spare) on a geometry. An attribute of the right count is
 * reused, because replacing one on a live geometry orphans its GPU buffer in WebGLAttributes.
 */
export function ensureTint(geometry: THREE.BufferGeometry, count: number): THREE.InstancedBufferAttribute {
  const existing = geometry.getAttribute('tsTint')
  if (existing instanceof THREE.InstancedBufferAttribute && existing.count === count && existing.itemSize === 4) return existing
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4)
  tint.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('tsTint', tint)
  return tint
}
