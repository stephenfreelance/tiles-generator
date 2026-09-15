import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ensureTint, layInstances } from './instanceLayout'

function translations(mesh: THREE.InstancedMesh): Set<string> {
  const seen = new Set<string>()
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix)
    position.setFromMatrixPosition(matrix)
    seen.add(position.toArray().join(','))
  }
  return seen
}

const POSITIONS = new Float32Array([0, 0, 100, 0, 200, 0, 0, 100, 100, 100, 200, 100])

describe('instance layout', () => {
  it('lays every instance at its own corner', () => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(100, 100, 4), new THREE.MeshStandardMaterial(), 6)
    layInstances(mesh, POSITIONS)
    expect(translations(mesh).size).toBe(6)
    expect(translations(mesh).has('200,100,0')).toBe(true)
  })

  it('re-lays a rebuilt mesh, which three starts with every instance at the origin', () => {
    const geometry = new THREE.BoxGeometry(100, 100, 4)
    const first = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 6)
    layInstances(first, POSITIONS)
    // What a reconstruction hands back: same geometry and count, every matrix the identity.
    const rebuilt = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 6)
    expect([...translations(rebuilt)]).toEqual(['0,0,0'])
    layInstances(rebuilt, POSITIONS)
    expect(translations(rebuilt).size).toBe(6)
    expect(rebuilt.boundingSphere?.radius ?? 0).toBeGreaterThan(100)
  })

  it('reuses a tint attribute of the same count and replaces one of another count', () => {
    const geometry = new THREE.BoxGeometry(10, 10, 1)
    const tint = ensureTint(geometry, 6)
    expect(tint.count).toBe(6)
    expect(geometry.getAttribute('tsTint')).toBe(tint)
    expect(ensureTint(geometry, 6)).toBe(tint)
    const bigger = ensureTint(geometry, 9)
    expect(bigger).not.toBe(tint)
    expect(bigger.count).toBe(9)
    expect(geometry.getAttribute('tsTint')).toBe(bigger)
  })
})
