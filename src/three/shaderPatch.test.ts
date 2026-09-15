import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { applyTesseraPatch, createTesseraUniforms } from './shaderPatch'

type CompileParameters = Parameters<THREE.Material['onBeforeCompile']>[0]

const VERTEX_ANCHORS = ['#include <common>', '#include <beginnormal_vertex>', '#include <begin_vertex>']
const FRAGMENT_ANCHORS = ['#include <common>', '#include <normal_fragment_maps>', '#include <emissivemap_fragment>']

function compile(material: THREE.MeshStandardMaterial) {
  const lib = material instanceof THREE.MeshPhysicalMaterial ? THREE.ShaderLib.physical : THREE.ShaderLib.standard
  const parameters = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
  } as unknown as CompileParameters
  material.onBeforeCompile(parameters, null as unknown as THREE.WebGLRenderer)
  return parameters
}

describe('tessera shader patch', () => {
  it('finds every injection anchor in the installed three shaders', () => {
    for (const lib of [THREE.ShaderLib.standard, THREE.ShaderLib.physical]) {
      for (const anchor of VERTEX_ANCHORS) expect(lib.vertexShader).toContain(anchor)
      for (const anchor of FRAGMENT_ANCHORS) expect(lib.fragmentShader).toContain(anchor)
    }
  })

  it('injects layer lines, grain, hatch and glow in order on standard and physical materials, without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const material of [new THREE.MeshStandardMaterial(), new THREE.MeshPhysicalMaterial()]) {
      applyTesseraPatch(material, createTesseraUniforms())
      const { vertexShader, fragmentShader: fs } = compile(material)
      expect(vertexShader).toContain('vTsPos = position;')
      expect(vertexShader).toContain('vTsTint = tsTint;')
      const order = [
        '#include <normal_fragment_maps>',
        'tsPerturbNormal( - vViewPosition',
        'texture2D( tsGrainMap, tsUv / tsGrainMm )',
        'diffuseColor.rgb = mix( diffuseColor.rgb, tsTintRed, tsRed );',
        'totalEmissiveRadiance += tsTintRed * tsRedGlow;',
      ].map((snippet) => fs.indexOf(snippet))
      for (const at of order) expect(at).toBeGreaterThan(-1)
      expect([...order].sort((a, b) => a - b)).toEqual(order)
      // Every shared uniform is declared among the fragment shader's globals, before main().
      const main = fs.indexOf('void main()')
      expect(main).toBeGreaterThan(-1)
      for (const name of Object.keys(createTesseraUniforms())) {
        const decl = fs.search(new RegExp(`^uniform \\w+ ${name};$`, 'm'))
        expect(decl, name).toBeGreaterThan(-1)
        expect(decl, name).toBeLessThan(main)
      }
    }
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('shares its uniforms with the material and leaves its defines alone', () => {
    const uniforms = createTesseraUniforms()
    const material = new THREE.MeshPhysicalMaterial()
    applyTesseraPatch(material, uniforms)
    const parameters = compile(material)
    // Shared uniform objects: one update reaches every material of the set.
    expect(parameters.uniforms.tsLayerAmp).toBe(uniforms.tsLayerAmp)
    expect(parameters.uniforms.tsGrainMap).toBe(uniforms.tsGrainMap)
    expect(material.defines).toEqual({ STANDARD: '', PHYSICAL: '' })
  })

  it('gives every patched tile material the same program cache key', () => {
    const plain = new THREE.MeshStandardMaterial()
    const physical = new THREE.MeshPhysicalMaterial({ sheen: 0.08 })
    applyTesseraPatch(plain, createTesseraUniforms())
    applyTesseraPatch(physical, createTesseraUniforms())
    expect(plain.customProgramCacheKey()).toBe(physical.customProgramCacheKey())
    expect(plain.customProgramCacheKey()).not.toBe(new THREE.MeshStandardMaterial().customProgramCacheKey())
  })
})
