// Every tuning knob of the 3D preview lives here so a visual pass can adjust the look in one file.
// Units: millimetres for lengths, degrees for angles, milliseconds for durations unless noted.

/** Quality tier: 0 = low (no post, standard materials), 1 = medium, 2 = high. */
export type Tier = 0 | 1 | 2

export interface LightformerSpec {
  form: 'rect' | 'circle' | 'ring'
  /** Position in the environment's virtual scene (arbitrary units, the cube camera sits at the origin). */
  position: readonly [number, number, number]
  /** Card size: [width, height] for rect, diameter for circle and ring. */
  scale: readonly [number, number] | number
  intensity: number
  color: string
}

export const LOOK = {
  palette: {
    sheet: '#ECEAE4',
    ink: '#2A2826',
    pencil: '#8C877F',
    red: '#C8412F',
    chalk: '#3C64A8',
  },

  quality: {
    /** Upper device-pixel-ratio bound per tier. */
    dprMax: [1, 1.5, 2] as const,
    /** The governor only samples while something moves (demand frameloop gives sparse frames). */
    sampleWhileMovingMs: 700,
    /** Quality governor (qualityGovernor.ts): frame-rate thresholds are absolute, whatever the display's refresh rate. */
    governor: {
      windowMs: 2000,
      minFrames: 12,
      gapMs: 250,
      slowStreak: 3,
      cooldownMs: 2500,
      /** Decline when more than a quarter of the frames run below 40 fps for three windows running: a stall of two seconds cannot slow three. */
      declineFps: 40,
      declinePercentile: 0.75,
      declineWindows: 3,
      /** Incline, before any decline only, when nine frames in ten run above 50 fps for two windows. */
      inclineFps: 50,
      inclinePercentile: 0.9,
      inclineWindows: 2,
      maxChanges: 3,
    },
  },

  camera: {
    fovDeg: 30,
    /** Wall stage: 3/4 raking view, camera slightly left of and above the wall centre. */
    wall: { azimuthDeg: -24, elevationDeg: 11, margin: 1.08 },
    /** Single tile: macro product shot of the tile lying face-up. */
    tile: { azimuthDeg: 30, elevationDeg: 31, margin: 1.22 },
    /** Seconds; camera-controls damping for framing transitions and drags. */
    smoothTime: 0.5,
    draggingSmoothTime: 0.1,
    /** Tile-mode turntable when idle. */
    turntableDegPerSec: 6,
    idleResumeMs: 6000,
    /** Delay before the first turntable spin after a framing change. */
    turntableStartMs: 1400,
    /** interactive=false: slow sway for walls, slow turntable for floors and tiles. */
    cinematic: { azimuthAmpDeg: 14, elevationAmpDeg: 3, periodS: 28, turntableDegPerSec: 5 },
    /** Closest dolly in surface mode, in multiples of the longest tile edge. */
    surfaceMinDistanceTiles: 0.9,
    /** Closest dolly in tile mode, in multiples of the tile diagonal. */
    tileMinDistanceDiagonals: 0.55,
    /** Farthest dolly, in multiples of the framing distance. */
    maxDistanceFit: 2.6,
    /** Wall stage: never orbit behind the wall. */
    wallAzimuthLimitDeg: 72,
    wallPolarRangeDeg: [26, 152] as const,
    /** Floor and tile stages: never go below the floor. */
    floorPolarRangeDeg: [4, 84] as const,
    /** Keyboard orbit steps. */
    keyAzimuthStepDeg: 10,
    keyPolarStepDeg: 6,
    keyDollyFactor: 0.85,
  },

  env: {
    /** scene.environmentIntensity. With key.intensity it sets exposure: a flat lit face shows mid colors near their swatch. */
    intensity: 1.7,
    resolution: [128, 256, 512] as const,
    /** Lightformers for the wall stage (world +Z is the wall normal, +Y is up). */
    wall: [
      // Warm key softbox, upper left front: broad reflection over the relief plateaus.
      { form: 'rect', position: [-4, 4, 5], scale: [6, 4], intensity: 2.4, color: '#FFE9CF' },
      // Horizontal strip above: a highlight line along every horizontal ridge.
      { form: 'rect', position: [0, 7, 2], scale: [12, 0.7], intensity: 3.2, color: '#FFF6EA' },
      // Vertical strip on the right: highlight lines along vertical ridges.
      { form: 'rect', position: [7, 0, 2], scale: [0.7, 12], intensity: 2.4, color: '#FFF6EA' },
      // Cool fill, low and in front, so dark colors never go pitch black.
      { form: 'rect', position: [2, -2, 8], scale: [8, 3], intensity: 0.55, color: '#D4E0F2' },
      // Warm bounce from the desk below.
      { form: 'rect', position: [0, -7, 3], scale: [12, 2], intensity: 0.45, color: '#EBDCC6' },
      // Soft room light behind the camera.
      { form: 'rect', position: [0, 0, 10], scale: [14, 14], intensity: 0.3, color: '#F4EEE4' },
    ] satisfies LightformerSpec[],
    /** Lightformers for the floor and tile stages (world +Y is the floor normal). */
    floor: [
      { form: 'rect', position: [-3, 6, 2], scale: [6, 4], intensity: 2.4, color: '#FFE9CF' },
      { form: 'rect', position: [-7, 2, 0], scale: [12, 0.7], intensity: 3, color: '#FFF6EA' },
      { form: 'rect', position: [7, 2, -1], scale: [12, 0.7], intensity: 2.4, color: '#FFF6EA' },
      { form: 'rect', position: [0, 1.5, 8], scale: [8, 3], intensity: 0.55, color: '#D4E0F2' },
      // Back kicker: rims the tile edges against the sheet.
      { form: 'rect', position: [0, 3, -8], scale: [8, 2], intensity: 1.1, color: '#FFE2C0' },
      { form: 'rect', position: [0, 9, 0], scale: [14, 14], intensity: 0.35, color: '#F4EEE4' },
    ] satisfies LightformerSpec[],
  },

  key: {
    /** The one shadow-casting raking light. Scale it with env.intensity: the ratio draws the relief, the sum is exposure. */
    intensity: 5.6,
    color: '#FFF0DC',
    /** Elevation above the tile surface: low angles rake across the relief so it self-shadows. */
    elevationDeg: { wall: 16, tile: 18 },
    mapSize: [1024, 2048, 4096] as const,
    bias: -0.0001,
    /** normalBias in shadow texels (converted to mm per view): fights acne on grazing slopes. */
    normalBiasTexels: 1.4,
    /** PCF softness in texels. */
    radius: 2.5,
    /** Extra room around the fitted shadow camera, mm. */
    marginMm: 4,
    /** Only re-render the shadow map when the scene changes (camera moves reuse it). */
    cacheShadowMap: true,
  },

  backdrop: {
    /** The sheet itself catches the shadows (ShadowMaterial over the sheet-coloured background). */
    shadowOpacity: 0.36,
    shadowColor: '#3A3129',
    /** Soft warm light pool on the sheet behind the tiles (additive; 0 disables). */
    poolIntensity: 0.07,
    poolColor: '#FFF1DE',
    poolScale: 2.4,
    /** Offset of the pool toward the key light, in fractions of the span. */
    poolShift: 0.18,
    /** Catcher size in multiples of the longest side. */
    catcherScale: 14,
    /** Mortar bed visible through joints: slightly darker than the sheet. */
    groutColor: '#C9C1B4',
    groutRoughness: 0.97,
  },

  contact: {
    /** Soft ground shadow under the hero tile (tile mode). */
    opacity: 0.62,
    blur: 2.2,
    resolution: [256, 512, 1024] as const,
    /** Capture height in multiples of the tile's total height. */
    farHeightMultiple: 5,
    /** Catcher size in multiples of the tile diagonal. */
    scale: 1.9,
    color: '#2A2420',
  },

  ao: {
    /** N8AO radius scales with the relief depth (world mm), clamped. */
    radiusPerReliefMm: 2.2,
    minRadiusMm: 1.5,
    maxRadiusMm: 12,
    intensity: 2.4,
    distanceFalloff: 1,
    color: '#2A2420',
    quality: ['performance', 'medium', 'high'] as const,
  },

  /** The one printed look, a matte PLA: every tile color renders with these. */
  materials: {
    /** Exponential damping rate (1/s) of tile color changes: 95% there in 0.25 s, 99% in 0.4 s. */
    colorDamp: 12,
    envMapIntensity: 1,
    /** Near-white and near-black albedo clamps (sRGB): pure white clips under the key light, pure black reads as a silhouette. */
    whiteClamp: '#EDEBE6',
    blackClamp: '#222222',
    roughness: 0.9,
    metalness: 0,
    /** Physical tiers only (tier 0 has none of these): specular strength, index of refraction and a faint sheen. */
    specularIntensity: 0.42,
    ior: 1.46,
    sheen: 0.08,
    /** Sheen colour: the tile color moved this far toward white. */
    sheenLighten: 0.3,
    sheenRoughness: 0.8,
    /** Fine print grain: repeat size on the tile (mm) and how far it moves roughness and albedo. */
    grain: { tileMm: 18, roughness: 0.06, albedo: 0.04 },
    /** Fraction of the layer-line amplitude a matte print shows. */
    layerLines: 0.5,
  },

  layerLines: {
    layerMm: 0.2,
    /** Top-skin extrusion pitch. */
    lineMm: 0.42,
    /** Bump strength in layer heights; the shader fades it where layers get sub-pixel. */
    amplitude: 0.35,
  },

  wave: {
    /** Stagger across the surface from the setting-out point. */
    spreadMs: 620,
    /** Settle time of one tile. */
    perTileMs: 420,
    /** Lift in fractions of the shorter tile side, capped. */
    liftFraction: 0.22,
    liftMaxMm: 36,
    scaleFrom: 0.9,
    tiltDeg: 8,
    /** Red-pencil hatch strength on cut pieces during the wave. */
    cutHatch: 0.8,
    holdMs: 260,
    fadeMs: 460,
    /** Above this many tiles the wall appears without the wave (matrix updates get costly). */
    maxInstances: 5000,
    /** Longest a thumbnail capture waits for the wave on screen to settle. */
    captureWaitMaxMs: 3000,
  },

  highlight: {
    wash: 0.42,
    dim: 0.3,
    /** Damping rate (1/s) of the highlight wash. */
    damp: 10,
  },

  cuts: {
    /** Red-pencil wash on every cut piece while the view is pointed at or focused. */
    wash: 0.34,
    /** Damping rate (1/s): slow enough to read as a fade, quick enough to answer the pointer. */
    damp: 9,
  },

  hatch: {
    /** Screen pitch of the red-pencil hatch lines, CSS pixels. */
    pitchPx: 7,
    /** Line width as a fraction of the pitch. */
    lineFraction: 0.28,
    glow: 0.35,
    washGlow: 0.08,
    /** Luminance multiplier of dimmed pieces (warm grey). */
    dimTint: [0.8, 0.77, 0.73] as const,
  },

  dims: {
    color: '#2A2826',
    lineWidthPx: 1.1,
    /** Dimension line offset from the model, in fractions of the longest side, clamped (mm). */
    surfaceOffset: { fraction: 0.05, min: 24, max: 600 },
    tileOffset: { fraction: 0.16, min: 8, max: 48 },
    /** Tick length in fractions of the offset. */
    tickFraction: 0.32,
    /** Gap between the model and the start of an extension line, in fractions of the offset. */
    gapFraction: 0.18,
    /** Extension line overshoot past the dimension line, in fractions of the offset. */
    overshootFraction: 0.2,
  },
} as const
