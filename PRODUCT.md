# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User-pinned: React + Vite + React Router + SCSS, frontend only (no API, no backend). Settings and history persist in localStorage. Other libraries delegated: react-three-fiber / drei / postprocessing for the 3D preview, zustand for state, fflate for zip archives, hand-written STL and STEP writers running in a Web Worker.

## Users

Hobbyist makers who own an FDM printer (mostly Bambu Lab, also Prusa and others) and want to cover a real surface at home (a wall, a kitchen backsplash, a shelf back, a floor section) with decorative 3D-printed relief tiles. They are comfortable with a slicer but not with CAD; they want a beautiful result without modelling anything themselves.

## Product Purpose

Tessera turns a surface size, a tile size, a relief texture and a tile color into a ready-to-print set of tile models. It computes how many full tiles fit, generates the partial tiles needed to cover the remainder, previews the whole surface and a single tile in 3D, and exports every unique tile as STL or STEP. Optionally it finishes the edge of the whole surface with a profile, locks the tiles edge to edge with printed keys or with tabs moulded into the tiles themselves, or puts them up on printed wall clips each tile clicks onto, and then adds those parts and a guide to the download, with the fit test on a page of its own. Success: the user leaves with a zip of printable files and a clear picture of what the finished wall will look like and how it goes up.

## Positioning

Unlike parametric generators that feel like engineering forms (gridfinitygenerator.com is the explicit anti-reference: right function, too cold), Tessera treats the tile as a design object: textures are seamless across tile joints (a partial tile is a true cut of the full pattern), the preview is a studio-quality 3D render of the whole surface, and choosing a color is one quick pick: a handful of vivid presets or any color on a wheel or as a hex code, rendered as a matte print.

## Operating Context

- Planning at home, measuring a surface with a tape, then entering dimensions (surface in mm/cm/m, tile in mm).
- Printing each tile face-up on a printer bed (typically 180, 256 or 350 mm), so the relief must be a pure heightfield with no overhangs. Key slots and clip pockets are cut into the back with flat ceilings the printer bridges.
- Opening the exported files in Bambu Studio, OrcaSlicer, PrusaSlicer, or a CAD tool (STEP).
- Choosing a tile color, then matching it with whatever PLA they own or can buy; Tessera names no filament brands, lines or finishes.

## Capabilities and Constraints

- Inputs: surface width/height, tile width/height (square or rectangle), relief texture, tile color (11 presets, or any color by wheel or hex code).
- Partial tiles are generated when the tile size does not divide the surface exactly; every unique model is exported once with its quantity.
- Textures must join seamlessly between adjacent tiles.
- Edges: the edge between tiles is square, chamfered, rounded or pillowed, the same on both neighbours so the relief still lines up. Around the whole surface an optional profile (flat margin, chamfer, rounded, ogee or raised frame) runs along the sides the maker ticks, with its width and drop. A chamfer, rounded or ogee edge trims the pattern by default: its shape cuts through the relief and never fills the valleys, which stay open right to the edge, and the edge between tiles still runs along the outer rim, so a trimmed edge never stands above the tile as it would print without one. Its drop is measured down from the peaks; the chamfer starts at 3 mm, deeper than the default relief, and the studio says when a drop stops above the valleys. Any profile can instead flatten the pattern first into a smooth band level with its valleys or its peaks, over a fade the maker can set. Only the pieces on those sides change, and they become models of their own.
- Putting it up (the studio's last step): two questions answered with drawn cards, "On the wall" (Glue or tape, the default, or Wall clips) and "Tile to tile" (Side by side, the default, Keys, or Tabs), and under them a "What changes" panel read off the real plans: tile A seen from the back with what is cut into it, what the maker will print, what to buy, the short way up, the trade-offs in the design's own numbers, the fit, and the base moved to Standard when a choice needed it. A system is named only once the plans place it.
- Keys (optional, off by default): flat bow-tie keys pressed from the back into slots across the joints lock the tiles edge to edge, in the plane of the wall, in line with even joints; the wall or the clips keep them flat. They do not hold a tile to the wall; a drop of glue makes a panel permanent. When a tile size and brick pattern leave rows that no key joins, the studio says so and names what would.
- Tabs (optional, off by default, an alternative to keys): each tile carries a small tab standing out past the back of its right edge and the socket that tab goes into in the back of its left, both wholly inside the base plate, so the face, the pattern, the joint edges and the border profile are untouched and nothing extra is printed. The tab goes into its neighbour's socket as the tile is pressed onto the wall, which locks the tiles of a row edge to edge, in the plane of the wall, in line with even joints; the wall or the clips keep them flat, exactly as with keys. Vertical joints only: nothing locks one row to the next, so a tab wall is one strip per row, which the studio and the guide state plainly rather than report as a fault. The tab's head is wider than its socket's throat at every depth, so a tile held at the wrong joint stands proud instead of lying down; and because a tab cannot rise past the ceiling of the socket it stands in, a row comes off again from its right-hand end. A tab makes each tile's file wider than the tile, which the bed check and the plate count both read, and a piece too narrow for a socket locks nothing and is named with what to do about it.
- Wall clips (optional, off by default): small printed clips that click into pockets in the back of each tile, so the tile places its own clips. A piece of thin double-sided tape goes on each clip, and the tile is pressed into its place on the wall: the tape holds each clip where its tile needs it, so nothing is measured but a level start line, and the tile sits on the wall with only the tape behind it. Each tile clicks on and pulls straight off again, leaving its clips on the wall, and clicks back on. Each clip is also its own drill guide for an optional screw and wall plug. A pocket is looked for everywhere a piece has room for one, and a piece left with none is named with the reason (too small, too narrow, or its own key slots in the way) and with what to do about it, piece by piece: a drop of glue in the key slots where its keys hold it in line with the tiles around, or glue to the wall.
- Keys, tabs and clips all need at least the 4 mm Standard base, and the clips work with either way of joining tiles (keys and tabs are alternatives to each other). The keys' and clips' tolerance lives only in the printed keys and clips (Snug, Standard or Loose), chosen by printing the small fit test first, which has its own page with its own download, its own steps and the fit picker (a test coupon in the tile's own relief with a clip pocket, two coupons that butt together across a joint for the keys, and each fastener in all three fits; the clips are tried stuck down with the maker's own tape), so a wrong fit means reprinting keys or clips, never tiles. The tabs are the one exception, and the app says so wherever a maker can act on it: their socket is cut into the tile itself, so the fit test prints one tabbed coupon and the socket at all three fits, and a fit changed afterwards means printing the tiles again. That is why the fit test is printed before the tiles rather than after them. When a lock or the clips are asked for but none fit (a base too thin, an edge between tiles too deep, a joint too wide to hide a tab, tiles too small for a clip or too narrow for a socket, or key slots taking the room a pocket needs), nothing about them is printed or promised and the notes say why, with the one-click change that would fit them.
- Views: whole surface and single tile, with zoom, rotation and lighting; when the tile has pockets or a tab in its back, the single tile turns over to show them with its keys and clips seated in place; choosing a lock or the clips on a wide screen, or "See the back of tile A" anywhere, turns it over for a look.
- Validation leads to a download page listing the full tile and each partial tile (and, with keys or clips, each printed part grouped as wall clips and keys: final parts only, since the fit test is printed from its own page, and nothing at all for the tabs, which are part of the tiles), format choice STL or STEP, individual and zip downloads, and a "Putting it up" guide in the design's own numbers (for clips: the fit these files were made at, with a link to the fit-test page, clicking the clips in, the tape, the start line, pressing the tiles on from the bottom row, the pieces with no clip, the optional screws and how to take a tile off). The zip's README carries the same guide, step for step.
- localStorage keeps the current settings and a history of designs; no design ever leaves the browser. The one thing sent is an anonymous usage count to GoatCounter (EU-hosted, no cookie, no IP address kept): the screens opened, the actions used and, for a downloaded wall, its choices by category (relief, color preset name or "custom", fixings placed, format, printer, a tile-count band). Never a design's name, its measurements, its color value or its share link. A browser sending Do Not Track or Global Privacy Control sends nothing, and the home page's "Does anything leave my computer?" says all of this.
- UI language: English.

## Brand Commitments

- Name: Tessera (chosen by Claude on the user's delegation).
- The 3D preview is the center of the app and must be spectacular; the interface must feel warm and beautiful, never cold or engineering-grey.
- Structure: a landing page whose hero is the visitor's own wall, built from CPU-rendered relief chips and answering the pointer and the scroll (no 3D engine on that page), then Studio, Download and History pages.

## Evidence on Hand

No testimonials, users, press, pricing or print photos exist. Do not invent any. The color presets are Tessera's own names and hex values, not a manufacturer's catalog, so never present them as matching a real spool; anything estimated (such as filament weight) must be labeled. The keys, the tabs and the wall clips are designed and checked in code (the clip's tine strain, catch and preload over every fit and a drooping pocket ceiling; the tab's engagement, its shoulder and the air left under its socket's ceiling; the clearances, sound meshes), not tested on printed parts: no strength, hold or load figure exists, nor any measured print or fitting time, so never claim one. How well a tape grips is not known either. The fit test is how a maker finds out, and the copy says to print it first.

## Product Principles

1. The render is the promise: what the preview shows is exactly what the files contain.
2. Fit first: the user always sees how the tiles cover the surface, including every partial tile and its count.
3. Printable by construction: every texture and size choice stays within FDM limits, and the app warns before a tile gets too thin or too big for the bed.
4. Nothing to learn: sensible defaults render something beautiful before the user touches a control.
5. Private and instant: no account, no upload; the browser does all the work, and the only thing it sends is an anonymous count.

## Accessibility & Inclusion

Keyboard-operable controls with visible focus, WCAG AA contrast for text, reduced-motion respected for camera and UI animation, and every visual state (fit warnings, partial tiles) also stated in text.
