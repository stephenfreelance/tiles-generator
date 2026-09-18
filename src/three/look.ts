// Every tuning knob of the 3D preview lives here so a visual pass can adjust the look in one file.
// Units: millimetres for lengths, degrees for angles, milliseconds for durations unless noted.

/** Quality tier: 0 = low (no post, standard materials), 1 = medium, 2 = high. */
export type Tier = 0 | 1 | 2

/**
 * How a view is presented. 'studio' is the app's own framing and lighting, and every route keeps it:
 * nothing reads LOOK.object unless a caller opts in. 'object' is the landing hero's product
 * photograph: a wider three-quarter view, a harder rake, and the wall standing off its own shadow.
 */
export type Presentation = 'studio' | 'object'

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

  /**
   * The 'object' presentation, read only when a caller asks for it (the landing hero does). Every
   * number here replaces one above for that one view; with presentation 'studio' none of it is read,
   * which is what keeps /studio, /download and /history byte-for-byte what they were.
   */
  object: {
    /**
     * No red-pencil flash on the cut pieces as the wave lays them. On the studio's drawing that
     * flash names the cuts; on a photograph of a printed wall it is a mustard band down the right
     * edge and along the bottom for a second, and the cut geometry already says it here.
     */
    waveCutHatch: 0,
    /**
     * Camera preset for the wall stage: further round and lower, so the relief is seen along itself.
     * The margin is the air a photograph of a thing keeps around it (1 is edge to edge), and it is
     * the air it keeps inside whatever the page's own type leaves it, not inside the screen: a
     * window that hands the object half its width photographs it smaller rather than jamming it
     * against the column. At 1.229 the wall ran from the last word of the headline to the right-hand
     * edge of a 1,024 pixel window, which reads as a texture laid over the page, not as a thing.
     */
    wall: { azimuthDeg: -31, elevationDeg: 8, margin: 1.36 },
    /** Key-light elevation over the wall. With envIntensity below, this is what rakes the relief. */
    keyElevationDeg: 18,
    /** Key intensity: the rake is the whole point of this view, so it is pushed past the studio's. */
    keyIntensity: 6.8,
    /**
     * A slow breath on the key, in fractions of its intensity. It rides frames the view is already
     * drawing (the drift, the scroll, the arrival) and never asks for one of its own, so a page left
     * open still lets the loop sleep. Small enough that it reads as a lamp settling, never as a fade.
     */
    breath: { amplitude: 0.045, periodS: 13 },
    /**
     * The light the room throws back at the wall from the side the key never reaches. It casts no
     * shadow, because a bounce has none: it is what turns the far wall of every chamfer from a black
     * scratch into a grout shadow, and it is the one thing that keeps a 45 degree valley lit at all
     * when the key rakes across it at 18. Azimuth is measured from the key's own, so the hand that
     * sweeps the key swings the bounce with it and the two never cross.
     */
    bounce: {
      azimuthOffsetDeg: 168,
      /**
       * Low, like the light coming back off a room rather than off a ceiling. A high bounce lands on
       * the face of the wall and on the far side of the chamfer in equal measure, which lifts the
       * joint by flattening everything around it; a grazing one lands on the chamfer and barely
       * touches the face, which is the whole trick.
       */
      elevationDeg: 22,
      intensity: 1.3,
      color: '#F7E3C9',
    },
    /**
     * The lamp standing in front of the wall, off toward the key. A point light, so its light falls
     * off across the face: the corners go quietly down and the wall is lit like a thing in a room
     * instead of like a swatch under a scanner. The one gradient in this picture.
     */
    lamp: {
      /** How far in front of the wall it stands, in multiples of the wall's longest side. */
      distanceSpans: 0.72,
      /** How far off centre, toward the key, in multiples of that same side. */
      offsetSpans: 0.55,
      /** Irradiance it lands with at the centre of the wall, in the key's own units. */
      intensity: 0.6,
      color: '#FFEBD2',
    },
    /**
     * scene.environmentIntensity, pulled down from the studio's 1.7, and again from this view's own
     * 1.2 once `bounce` and `lamp` arrived: the fill in this picture comes from somewhere now, and an
     * environment that lifts the lit face and the shadowed chamfer by the same amount is exposure
     * spent flattening the shot. The key and the fill together are exposure and their ratio is
     * contrast: what turns a lit swatch into a photograph is where the fill comes from, not how much.
     */
    envIntensity: 0.92,
    /** The tile backs stand this far off the shadow catcher, mm: a real drop shadow under the object. */
    standoffMm: 14,
    /** The studio's 0.36, softened: this shadow is a photograph's, not a drawing's. */
    shadowOpacity: 0.3,
    /** PCF softness in texels. Twice the studio's, because this shadow is thrown much further. */
    shadowRadius: 9,
    /**
     * The warm pool thrown on the page behind the object, over the backdrop's own 0.07. A photograph
     * of a lit thing has lit air around it: this is the only mark the object leaves on the page it
     * has no frame on, and it is what keeps the wall from reading as a sticker.
     */
    poolIntensity: 0.16,
    poolScale: 3.2,
    /**
     * The arrival, played once when the wall first appears. The camera settles in from further back
     * and further round while the key rakes down the relief from near the top edge, so the first
     * thing the visitor sees is every ridge throwing its longest shadow and then coming to rest.
     * Nothing here is read under prefers-reduced-motion: the view is placed at its settled framing
     * and the key sits at its resting elevation from the first frame.
     */
    arrival: {
      /** How long the camera takes to settle, seconds, counted from the handover, not from the mount. */
      seconds: 2.4,
      /**
       * Tail of the camera's curve, over an ease that is gentle at both ends (see `remaining` in
       * stage.ts): 1 is that ease itself, higher lands sooner, lower keeps moving later. The old
       * curve was a plain (1 - t) to the fifth, which spent seven eighths of the move inside the
       * first third of its window: behind the poster, where nobody ever saw it.
       */
      power: 1,
      /** Where it starts, relative to the settled framing: back along its own axis, and round. */
      distanceFactor: 1.13,
      azimuthDeg: 17,
      elevationDeg: 10,
      /** The key starts here and rakes down to keyElevationDeg. Near the top edge of the wall. */
      keyFromDeg: 58,
      /** A touch longer than the camera's, so the shadows are still lengthening as it comes to rest. */
      keySeconds: 2.9,
      /** Under 1, so the rake lags the camera and is still walking down as the camera lands. */
      keyPower: 0.8,
      /** Each degree of rake refits and re-renders the shadow map: a whole rake is 50 of those, not 180. */
      keyQuantumDeg: 0.8,
      /** A hand on the wall is driving the light itself, so the rake runs out this much faster. */
      keyYield: 9,
    },
    /**
     * Device-pixel-ratio ceiling for this view, under the tier's own. The object fills the whole
     * first screen, which is three to four times the pixels the studio's bench asks for, and it is
     * a decorative render rather than a thing being inspected: 1.75 keeps it crisp under SMAA and
     * gives back about a quarter of the fragments a full 2x would cost.
     */
    dprMax: 1.75,
    /**
     * Where the object is asked to sit inside the band the page leaves it: x in fractions of that
     * band's own half-width (0 is the middle of whatever the type does not take), y in fractions of
     * the half-frame. Centred across and a touch high, which is where a thing hung on a wall is
     * photographed. An intent, not a promise: an object too wide for the band keeps the band first.
     */
    screenShift: { x: 0, y: 0.06 },
    /**
     * The column of type the page lays over the left of this same screen, in CSS pixels of frame.
     * These mirror `.hero` in LandingPage.module.scss, which sets `--pad: clamp(1rem, 0.4rem + 2vw,
     * 3rem)`, a `--gutter` of `max(--pad, (100% - 88rem) / 2)` and a lede column of `minmax(0, 27rem)`.
     * The camera reads them so the wall is composed clear of the type at every width rather than at
     * one breakpoint: this is what the headline was being printed over between 993 and 1300 px. Change
     * the page's gutter or its column and change these with it, or the type lands on the wall again.
     */
    typeColumn: {
      /** `clamp(1rem, 0.4rem + 2vw, 3rem)`, in px: the page's own --pad. */
      padMinPx: 16,
      padBasePx: 6.4,
      padPerPx: 0.02,
      padMaxPx: 48,
      /** 88rem: past this the page stops growing its content and starts growing its gutters. */
      contentMaxPx: 1408,
      /** 27rem: `grid-template-columns: minmax(0, 27rem)` on the hero. */
      columnPx: 432,
      /**
       * Air between the last of the type and the first of the wall, in multiples of the page's own
       * --pad: one gutter of it, so the gap grows with the page rather than staying a fixed hairline.
       */
      airPads: 1,
      /** Never hand the type more than this much of the frame: past it there is no picture left. */
      maxFraction: 0.52,
    },
    /**
     * How the object is composed once it has the frame to itself. Below `widthPx` CSS pixels of frame
     * the page stops laying a column of type over the object and stands it on a row of its own (the
     * hero's own 62rem breakpoint), so there is nothing left for the wall to sit clear of: it is
     * composed square on, and the fit leaves more air than the desktop's 1.02, because a frame this
     * narrow has no width to spare and the cut column down its right edge is the point of the
     * picture. Aspect cannot stand in for the width: the same phone holds the object in a frame
     * anywhere from 1:1 to 1.9:1, and the wide composition landing on one of those is what pushed the
     * cut column off the right of the screen.
     */
    narrow: {
      /** The hero's own 62rem breakpoint. A step here is the page's step, not the camera's: at this
          width the object stops standing behind the type and takes a row of its own. */
      widthPx: 992,
      /** Dead center: nothing is laid over this frame, so every fraction of it spent off-center is
          a fraction the wall itself does not get. */
      screenShift: { x: 0, y: 0 },
      /** Tighter than the desktop's, because nothing is laid over this frame and every fraction of it
          spent on air is a fraction the wall itself does not get. The air that is left is where the
          shadow the wall stands off falls. */
      margin: 1.18,
    },
    /** The slow drift while the object is on screen: half the studio hero's swing, twice as slow. */
    cinematic: { azimuthAmpDeg: 7, elevationAmpDeg: 1.6, periodS: 36 },
    /**
     * What the page's own scroll does to the object. As the first screen leaves, the wall turns a few
     * degrees further round, the eye drops under it and it settles back into the room: the parallax a
     * thing standing in a room has when you walk past it, which a picture pasted on the page has not.
     * It is driven from the frame loop off a number a passive listener writes, never from the scroll
     * event itself, it is inert under prefers-reduced-motion, and the hero off screen reads none of it.
     */
    scroll: {
      /**
       * Further round toward the raking edge, degrees. Negative is more oblique, and more oblique is
       * also narrower on screen: the turn can only ever take the wall further inside its own frame.
       */
      azimuthDeg: -6,
      /** The eye drops as the object rises past it, degrees of elevation: you end up under it. */
      elevationDeg: -2.5,
      /** And it stands back into the room as it goes. */
      distanceFactor: 1.05,
      /** Damping rate (1/s) toward the pose the scroll asks for: the wall carries weight into the turn. */
      damp: 5,
    },
    /**
     * How long the drift carries on after the arrival with nothing touching the object, ms. Half a
     * drift period: it stands down having travelled one visible arc, and a hand on the wall or a
     * scroll back onto it starts the count again. A landing page left open otherwise asks for a
     * frame every 16 ms for as long as the tab lives, to move a wall by a degree a second.
     */
    driftIdleMs: 18000,
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
