import * as THREE from 'three'

// One onBeforeCompile patch shared by every tile material (standard and physical):
// FDM layer lines, the fine print grain, and the per-instance red-pencil wash / hatch / dim used by
// highlights and the re-lay wave.
// Per-instance tint arrives in the `tsTint` instanced attribute: x = wash, y = hatch, z = dim.
// A missing attribute reads as (0, 0, 0, 1), which means "no tint".

export interface TesseraUniforms {
  tsLayerMm: THREE.IUniform<number>
  tsLineMm: THREE.IUniform<number>
  /** 0 hides the layer lines without recompiling. */
  tsLayerAmp: THREE.IUniform<number>
  tsTintRed: THREE.IUniform<THREE.Color>
  tsDimColor: THREE.IUniform<THREE.Color>
  /** World direction across which hatch lines repeat (the surface's (-1, 1) diagonal). */
  tsHatchDir: THREE.IUniform<THREE.Vector3>
  tsHatchPitch: THREE.IUniform<number>
  tsHatchLine: THREE.IUniform<number>
  tsHatchGlow: THREE.IUniform<number>
  tsWashGlow: THREE.IUniform<number>
  /** Grain in the red channel, around 0.5; tiles seamlessly. */
  tsGrainMap: THREE.IUniform<THREE.Texture | null>
  /** Size of one grain repeat on the tile, mm. */
  tsGrainMm: THREE.IUniform<number>
  tsGrainRough: THREE.IUniform<number>
  tsGrainAlbedo: THREE.IUniform<number>
}

export function createTesseraUniforms(): TesseraUniforms {
  return {
    tsLayerMm: { value: 0.2 },
    tsLineMm: { value: 0.42 },
    tsLayerAmp: { value: 0 },
    tsTintRed: { value: new THREE.Color('#C8412F') },
    tsDimColor: { value: new THREE.Color(0.8, 0.77, 0.73) },
    tsHatchDir: { value: new THREE.Vector3(-Math.SQRT1_2, Math.SQRT1_2, 0) },
    tsHatchPitch: { value: 4 },
    tsHatchLine: { value: 0.28 },
    tsHatchGlow: { value: 0.35 },
    tsWashGlow: { value: 0.08 },
    tsGrainMap: { value: null },
    tsGrainMm: { value: 18 },
    tsGrainRough: { value: 0 },
    tsGrainAlbedo: { value: 0 },
  }
}

const VERTEX_PARS = /* glsl */ `
varying vec3 vTsPos;
varying vec3 vTsObjNormal;
varying float vTsSeed;
varying vec4 vTsTint;
#ifdef USE_INSTANCING
	attribute vec4 tsTint;
#endif
`

const VERTEX_NORMAL = /* glsl */ `
vTsObjNormal = objectNormal;
`

const VERTEX_POSITION = /* glsl */ `
vTsPos = position;
#ifdef USE_INSTANCING
	vTsSeed = mod( float( gl_InstanceID ) * 37.0, 997.0 );
	vTsTint = tsTint;
#else
	vTsSeed = 0.0;
	vTsTint = vec4( 0.0 );
#endif
`

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vTsPos;
varying vec3 vTsObjNormal;
varying float vTsSeed;
varying vec4 vTsTint;
uniform float tsLayerMm;
uniform float tsLineMm;
uniform float tsLayerAmp;
uniform vec3 tsTintRed;
uniform vec3 tsDimColor;
uniform vec3 tsHatchDir;
uniform float tsHatchPitch;
uniform float tsHatchLine;
uniform float tsHatchGlow;
uniform float tsWashGlow;
uniform sampler2D tsGrainMap;
uniform float tsGrainMm;
uniform float tsGrainRough;
uniform float tsGrainAlbedo;

// Planar projection picked by the dominant axis of the object normal: tops use xy, walls use their plane.
vec2 tsProject( vec3 p, vec3 n ) {
	vec3 a = abs( n );
	if ( a.z >= max( a.x, a.y ) ) return p.xy;
	return a.x > a.y ? p.yz : p.xz;
}

// Mikkelsen's bump mapping with unnormalised screen derivatives, so heights in mm give true slopes.
vec3 tsPerturbNormal( vec3 surfPos, vec3 surfNormal, vec2 dHdxy, float faceDir ) {
	vec3 sigmaX = dFdx( surfPos );
	vec3 sigmaY = dFdy( surfPos );
	vec3 r1 = cross( sigmaY, surfNormal );
	vec3 r2 = cross( surfNormal, sigmaX );
	float det = dot( sigmaX, r1 ) * faceDir;
	if ( abs( det ) < 1e-14 ) return surfNormal;
	vec3 grad = sign( det ) * ( dHdxy.x * r1 + dHdxy.y * r2 );
	return normalize( abs( det ) * surfNormal - grad );
}
`

const FRAGMENT_SURFACE = /* glsl */ `
vec3 tsObjN = normalize( vTsObjNormal );
#ifdef USE_NORMALMAP_OBJECTSPACE
	tsObjN = normalize( texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0 );
#endif
// Every instance samples the grain at a different offset, so identical tiles do not print identical grain.
vec2 tsUv = tsProject( vTsPos, tsObjN ) + vec2( 0.6180339, 0.3819660 ) * vTsSeed;

if ( tsLayerAmp > 0.0 ) {
	float tsZl = vTsPos.z / tsLayerMm;
	float tsF = fract( tsZl );
	// Continuous sawtooth: flat treads, a short riser at each layer step; zero wherever z is constant.
	float tsTerrace = smoothstep( 0.78, 1.0, tsF ) - tsF;
	float tsS = ( vTsPos.x + vTsPos.y ) * 0.70710678 / tsLineMm;
	float tsSkin = ( 0.5 + 0.5 * cos( 6.2831853 * tsS ) ) * smoothstep( 0.96, 0.995, abs( tsObjN.z ) );
	float tsFadeZ = 1.0 - smoothstep( 0.3, 0.8, fwidth( tsZl ) );
	float tsFadeS = 1.0 - smoothstep( 0.3, 0.8, fwidth( tsS ) );
	float tsH = tsLayerAmp * tsLayerMm * ( tsTerrace * tsFadeZ + 0.3 * tsSkin * tsFadeS );
	normal = tsPerturbNormal( - vViewPosition, normal, vec2( dFdx( tsH ), dFdy( tsH ) ), faceDirection );
}

float tsGrain = texture2D( tsGrainMap, tsUv / tsGrainMm ).r - 0.5;
roughnessFactor = clamp( roughnessFactor + tsGrain * tsGrainRough, 0.04, 1.0 );
diffuseColor.rgb *= 1.0 + tsGrain * tsGrainAlbedo;

// Red-pencil hatch continuous across every cut: world-space lines at a screen-constant pitch.
vec3 tsWorld = cameraPosition + transpose( mat3( viewMatrix ) ) * ( - vViewPosition );
float tsHd = dot( tsWorld, tsHatchDir ) / tsHatchPitch;
float tsHw = fwidth( tsHd );
float tsHatchCov = 1.0 - smoothstep( tsHatchLine * 0.5 - tsHw * 0.5, tsHatchLine * 0.5 + tsHw * 0.5, abs( fract( tsHd + 0.5 ) - 0.5 ) );
float tsLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( tsLum ) * tsDimColor, vTsTint.z );
float tsRed = clamp( vTsTint.x + vTsTint.y * ( 0.2 + 0.8 * tsHatchCov ), 0.0, 0.92 );
diffuseColor.rgb = mix( diffuseColor.rgb, tsTintRed, tsRed );
metalnessFactor *= 1.0 - tsRed;
roughnessFactor = mix( roughnessFactor, 0.7, tsRed );
float tsRedGlow = vTsTint.y * tsHatchCov * tsHatchGlow + vTsTint.x * tsWashGlow;
`

const FRAGMENT_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += tsTintRed * tsRedGlow;
`

function inject(source: string, anchor: string, code: string, where: 'after' | 'before' = 'after'): string {
  if (!source.includes(anchor)) {
    console.warn(`[tessera] shader anchor ${anchor} not found; a preview effect is disabled`)
    return source
  }
  return source.replace(anchor, where === 'after' ? `${anchor}\n${code}` : `${code}\n${anchor}`)
}

const PATCH_VERSION = 'tessera-v1'

/** Installs the shared patch on a tile material; uniforms are shared objects, so one update reaches every material. */
export function applyTesseraPatch(material: THREE.MeshStandardMaterial, uniforms: TesseraUniforms): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    let vs = shader.vertexShader
    vs = inject(vs, '#include <common>', VERTEX_PARS)
    vs = inject(vs, '#include <beginnormal_vertex>', VERTEX_NORMAL)
    vs = inject(vs, '#include <begin_vertex>', VERTEX_POSITION)
    shader.vertexShader = vs
    let fs = shader.fragmentShader
    fs = inject(fs, '#include <common>', FRAGMENT_PARS)
    fs = inject(fs, '#include <normal_fragment_maps>', FRAGMENT_SURFACE)
    fs = inject(fs, '#include <emissivemap_fragment>', FRAGMENT_EMISSIVE)
    shader.fragmentShader = fs
  }
  // Every tile material runs the same patch; three already keys standard and physical programs apart.
  material.customProgramCacheKey = () => PATCH_VERSION
  material.needsUpdate = true
}
