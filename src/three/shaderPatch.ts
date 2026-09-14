import * as THREE from 'three'

// One onBeforeCompile patch shared by every tile material (standard and physical):
// FDM layer lines, procedural finish detail (grain, speckle, wood, fibres, flakes), dual-colour silk,
// and the per-instance red-pencil wash / hatch / dim used by highlights and the re-lay wave.
// Per-instance tint arrives in the `tsTint` instanced attribute: x = wash, y = hatch, z = dim.
// A missing attribute reads as (0, 0, 0, 1), which means "no tint".

export interface PatchFeatures {
  detail: boolean
  flakes: boolean
  dual: boolean
}

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
  tsSecondary: THREE.IUniform<THREE.Color>
  tsLightTint: THREE.IUniform<THREE.Color>
  tsDetailMap: THREE.IUniform<THREE.Texture | null>
  tsDetailMm: THREE.IUniform<number>
  tsGrainRough: THREE.IUniform<number>
  tsGrainAlbedo: THREE.IUniform<number>
  tsSpeckleDark: THREE.IUniform<number>
  tsSpeckleLight: THREE.IUniform<number>
  tsFiber: THREE.IUniform<number>
  tsWoodBands: THREE.IUniform<number>
  tsWoodFreq: THREE.IUniform<number>
  tsFlakeMap: THREE.IUniform<THREE.Texture | null>
  tsFlakeMm: THREE.IUniform<number>
  tsFlakeTilt: THREE.IUniform<number>
  tsFlakeTint: THREE.IUniform<number>
  tsFlakeRough: THREE.IUniform<number>
  tsFlakeMetal: THREE.IUniform<number>
  /** Iridescence kept outside flakes (galaxy glitter shimmers only on the flakes). */
  tsFlakeIri: THREE.IUniform<number>
  tsFlakeColor: THREE.IUniform<THREE.Color>
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
    tsSecondary: { value: new THREE.Color(0, 0, 0) },
    tsLightTint: { value: new THREE.Color(1, 1, 1) },
    tsDetailMap: { value: null },
    tsDetailMm: { value: 24 },
    tsGrainRough: { value: 0 },
    tsGrainAlbedo: { value: 0 },
    tsSpeckleDark: { value: 0 },
    tsSpeckleLight: { value: 0 },
    tsFiber: { value: 0 },
    tsWoodBands: { value: 0 },
    tsWoodFreq: { value: 0.2 },
    tsFlakeMap: { value: null },
    tsFlakeMm: { value: 16 },
    tsFlakeTilt: { value: 0 },
    tsFlakeTint: { value: 0 },
    tsFlakeRough: { value: 0.15 },
    tsFlakeMetal: { value: 1 },
    tsFlakeIri: { value: 1 },
    tsFlakeColor: { value: new THREE.Color(1, 1, 1) },
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
uniform vec3 tsSecondary;
uniform vec3 tsLightTint;
#ifdef TS_DETAIL
	uniform sampler2D tsDetailMap;
	uniform float tsDetailMm;
	uniform float tsGrainRough;
	uniform float tsGrainAlbedo;
	uniform float tsSpeckleDark;
	uniform float tsSpeckleLight;
	uniform float tsFiber;
	uniform float tsWoodBands;
	uniform float tsWoodFreq;
#endif
#ifdef TS_FLAKES
	uniform sampler2D tsFlakeMap;
	uniform float tsFlakeMm;
	uniform float tsFlakeTilt;
	uniform float tsFlakeTint;
	uniform float tsFlakeRough;
	uniform float tsFlakeMetal;
	uniform float tsFlakeIri;
	uniform vec3 tsFlakeColor;
	#ifndef USE_NORMALMAP_OBJECTSPACE
		uniform mat3 normalMatrix;
	#endif
#endif

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
// Every instance samples the detail at a different offset, so identical tiles do not print identical speckle.
vec2 tsUv = tsProject( vTsPos, tsObjN ) + vec2( 0.6180339, 0.3819660 ) * vTsSeed;
float tsFlakeMask = 0.0;

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

#ifdef TS_FLAKES
	vec4 tsFlake = texture2D( tsFlakeMap, tsUv / tsFlakeMm );
	tsFlakeMask = tsFlake.a;
	// Tilt lives in the tile plane (object space), so flakes stay put and wink as the view moves.
	normal = normalize( normal + normalMatrix * vec3( tsFlake.rg * 2.0 - 1.0, 0.0 ) * tsFlakeTilt );
	diffuseColor.rgb = mix( diffuseColor.rgb, tsFlakeColor, tsFlakeMask * tsFlakeTint );
	roughnessFactor = mix( roughnessFactor, tsFlakeRough, tsFlakeMask );
	metalnessFactor = mix( metalnessFactor, tsFlakeMetal, tsFlakeMask );
#endif

#ifdef TS_DETAIL
	vec4 tsDet = texture2D( tsDetailMap, tsUv / tsDetailMm );
	float tsGrain = tsDet.r - 0.5;
	roughnessFactor = clamp( roughnessFactor + tsGrain * tsGrainRough - tsDet.g * tsFiber * 0.3, 0.04, 1.0 );
	diffuseColor.rgb *= 1.0 + tsGrain * tsGrainAlbedo - tsDet.g * tsFiber * 0.15;
	diffuseColor.rgb = mix( diffuseColor.rgb, tsSecondary, tsDet.g * tsSpeckleDark );
	diffuseColor.rgb = mix( diffuseColor.rgb, tsLightTint, tsDet.b * tsSpeckleLight );
	float tsBandPhase = tsUv.x * tsWoodFreq + tsDet.a * 1.7;
	float tsBand = 0.5 + 0.5 * sin( 6.2831853 * tsBandPhase );
	float tsBandFade = 1.0 - smoothstep( 0.2, 0.5, fwidth( tsBandPhase ) );
	diffuseColor.rgb = mix( diffuseColor.rgb, tsSecondary, tsWoodBands * tsBandFade * smoothstep( 0.45, 1.0, tsBand ) );
#endif

#ifdef TS_DUAL
	// Co-extruded dual silk: slopes facing one way read as one colour, the other way as the second.
	float tsSide = smoothstep( -0.3, 0.3, dot( tsObjN.xy, vec2( 0.70710678 ) ) );
	diffuseColor.rgb = mix( diffuseColor.rgb, tsSecondary, tsSide );
#endif

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

const FRAGMENT_CLEARCOAT = /* glsl */ `
#ifdef USE_CLEARCOAT
	// The coat covers the printed relief, so it follows the relief normal (map and layer lines included).
	clearcoatNormal = normal;
#endif
`

const FRAGMENT_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += tsTintRed * tsRedGlow;
`

const FRAGMENT_LIGHTS = /* glsl */ `
#if defined( USE_IRIDESCENCE ) && defined( TS_FLAKES )
	material.iridescence *= mix( tsFlakeIri, 1.0, tsFlakeMask );
#endif
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
export function applyTesseraPatch(material: THREE.MeshStandardMaterial, uniforms: TesseraUniforms, features: PatchFeatures): void {
  const defines: Record<string, string> = { ...(material.defines as Record<string, string> | undefined) }
  if (features.detail) defines.TS_DETAIL = ''
  if (features.flakes) defines.TS_FLAKES = ''
  if (features.dual) defines.TS_DUAL = ''
  material.defines = defines
  const key = `${PATCH_VERSION}:${features.detail ? 'd' : ''}${features.flakes ? 'f' : ''}${features.dual ? 's' : ''}`
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
    fs = inject(fs, '#include <clearcoat_normal_fragment_maps>', FRAGMENT_CLEARCOAT)
    fs = inject(fs, '#include <emissivemap_fragment>', FRAGMENT_EMISSIVE)
    fs = inject(fs, '#include <lights_physical_fragment>', FRAGMENT_LIGHTS)
    shader.fragmentShader = fs
  }
  material.customProgramCacheKey = () => key
  material.needsUpdate = true
}
