# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User-pinned: React + Vite + React Router + SCSS, frontend only (no API, no backend). Settings and history persist in localStorage. Other libraries delegated: react-three-fiber / drei / postprocessing for the 3D preview, zustand for state, fflate for zip archives, hand-written STL and STEP writers running in a Web Worker.

## Users

Hobbyist makers who own an FDM printer (mostly Bambu Lab, also Prusa and others) and want to cover a real surface at home (a wall, a kitchen backsplash, a shelf back, a floor section) with decorative 3D-printed relief tiles. They are comfortable with a slicer but not with CAD; they want a beautiful result without modelling anything themselves.

## Product Purpose

Tessera turns a surface size, a tile size, a relief texture and a tile color into a ready-to-print set of tile models. It computes how many full tiles fit, generates the partial tiles needed to cover the remainder, previews the whole surface and a single tile in 3D, and exports every unique tile as STL or STEP. Success: the user leaves with a zip of printable files and a clear picture of what the finished wall will look like.

## Positioning

Unlike parametric generators that feel like engineering forms (gridfinitygenerator.com is the explicit anti-reference: right function, too cold), Tessera treats the tile as a design object: textures are seamless across tile joints (a partial tile is a true cut of the full pattern), the preview is a studio-quality 3D render of the whole surface, and choosing a color is one quick pick: a handful of vivid presets or any color on a wheel or as a hex code, rendered as a matte print.

## Operating Context

- Planning at home, measuring a surface with a tape, then entering dimensions (surface in mm/cm/m, tile in mm).
- Printing each tile face-up on a printer bed (typically 180, 256 or 350 mm), so the relief must be a pure heightfield with no overhangs.
- Opening the exported files in Bambu Studio, OrcaSlicer, PrusaSlicer, or a CAD tool (STEP).
- Choosing a tile color, then matching it with whatever PLA they own or can buy; Tessera names no filament brands, lines or finishes.

## Capabilities and Constraints

- Inputs: surface width/height, tile width/height (square or rectangle), relief texture, tile color (11 presets, or any color by wheel or hex code).
- Partial tiles are generated when the tile size does not divide the surface exactly; every unique model is exported once with its quantity.
- Textures must join seamlessly between adjacent tiles.
- Views: whole surface and single tile, with zoom, rotation and lighting.
- Validation leads to a download page listing the full tile and each partial tile, format choice STL or STEP, individual and zip downloads.
- localStorage keeps the current settings and a history of designs; nothing leaves the browser.
- UI language: English.

## Brand Commitments

- Name: Tessera (chosen by Claude on the user's delegation).
- The 3D preview is the center of the app and must be spectacular; the interface must feel warm and beautiful, never cold or engineering-grey.
- Structure: a landing page with a live 3D hero, then Studio, Download and History pages.

## Evidence on Hand

No testimonials, users, press, pricing or print photos exist. Do not invent any. The color presets are Tessera's own names and hex values, not a manufacturer's catalog, so never present them as matching a real spool; anything estimated (such as filament weight) must be labeled.

## Product Principles

1. The render is the promise: what the preview shows is exactly what the files contain.
2. Fit first: the user always sees how the tiles cover the surface, including every partial tile and its count.
3. Printable by construction: every texture and size choice stays within FDM limits, and the app warns before a tile gets too thin or too big for the bed.
4. Nothing to learn: sensible defaults render something beautiful before the user touches a control.
5. Private and instant: no account, no upload; the browser does all the work.

## Accessibility & Inclusion

Keyboard-operable controls with visible focus, WCAG AA contrast for text, reduced-motion respected for camera and UI animation, and every visual state (fit warnings, partial tiles) also stated in text.
