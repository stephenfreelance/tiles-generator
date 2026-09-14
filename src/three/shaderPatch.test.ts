import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { applyTesseraPatch, createTesseraUniforms } from './shaderPatch'

type CompileParameters = Parameters<THREE.Material['onBeforeCompile']>[0]

const VERTEX_ANCHORS = ['#include <common>', '#include <beginnormal_vertex>', '#include <begin_vertex>']
const FRAGMENT_ANCHORS = [
  '#include <common>',
  '#include <normal_fragment_maps>',
  '#include <clearcoat_normal_fragment_maps>',
  '#include <emissivemap_fragment>',
  '#include <lights_physical_fragment>',
]

function compile(material: THREE.MeshStandardMaterial) {
  const parameters = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  } as unknown as CompileParameters
  material.onBeforeCompile(parameters, null as unknown as THREE.WebGLRenderer)
  return parameters
}

describe('tessera shader patch', () => {
  it('finds every injection anchor in the installed three shaders', () => {
    for (const anchor of VERTEX_ANCHORS) expect(THREE.ShaderLib.physical.vertexShader).toContain(anchor)
    for (const anchor of FRAGMENT_ANCHORS) expect(THREE.ShaderLib.physical.fragmentShader).toContain(anchor)
  })

  it('injects its code without warning and shares its uniforms with the material', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const uniforms = createTesseraUniforms()
    const material = new THREE.MeshPhysicalMaterial()
    applyTesseraPatch(material, uniforms, { detail: true, flakes: true, dual: false })
    const parameters = compile(material)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()

    expect(parameters.vertexShader).toContain('vTsPos = position;')
    expect(parameters.fragmentShader).toContain('tsPerturbNormal')
    expect(parameters.fragmentShader).toContain('tsFlakeMask')
    // Shared uniform objects: one update reaches every material of the set.
    expect(parameters.uniforms.tsLayerAmp).toBe(uniforms.tsLayerAmp)
    expect(material.defines).toMatchObject({ TS_DETAIL: '', TS_FLAKES: '' })
    expect((material.defines as Record<string, string>).TS_DUAL).toBeUndefined()
    // Physical materials keep their own defines.
    expect(material.defines).toMatchObject({ PHYSICAL: '' })
  })

  it('keys the program cache per feature set, so variants do not share a compiled program', () => {
    const plain = new THREE.MeshStandardMaterial()
    const dual = new THREE.MeshStandardMaterial()
    applyTesseraPatch(plain, createTesseraUniforms(), { detail: false, flakes: false, dual: false })
    applyTesseraPatch(dual, createTesseraUniforms(), { detail: true, flakes: false, dual: true })
    expect(plain.customProgramCacheKey()).not.toBe(dual.customProgramCacheKey())
  })
})
