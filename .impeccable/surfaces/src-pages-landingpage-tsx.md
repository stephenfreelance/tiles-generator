---
version: 1
slug: "src-pages-landingpage-tsx"
primary_target: "src/pages/LandingPage.tsx"
related_targets: ["src/pages/StudioPage.tsx","src/pages/ExportPage.tsx","src/pages/FitTestPage.tsx","src/pages/HistoryPage.tsx","src/pages/NotFoundPage.tsx"]
---

# Landing surface brief

Scope: the home route (`/`), and the world every other route now shares (studio, download, fit test, history, not found keep their own structure and take this world's materials). Visitor mode: Persuade.

Audience and job: hobbyist makers with an FDM printer who want to cover a real wall with relief tiles. They should leave the first screen knowing Tessera fits tiles to their exact wall, having sized it, and click into the studio.

Pinned by the user (2026-09-28): full rebrand, whole site; Basteleur Bold (Velvetyne, OFL) as the display face, chosen from two rendered spreads; a grainy, subtle gradient and a paper effect, in ONE hue: the tile color the visitor picks; fewer colors than the reference; the hero wall kept exactly as it is (chips, joints, lay-in, turn, sheen); all copy kept as it is.

Pinned by the user in the feedback round (2026-09-28, later): no decorative horizontal rules anywhere (the double rules, the caption rule under the wall, the footer rule and the Questions dividers are gone); the headline at one moderate size that wraps "wavy" as in the font spread, never a giant "Design"; every gradient a grainy cloud that fades to nothing inside its own box, never cut by an edge; the studio's 3D stage a lighter neutral plate with visible rounded corners and no cream lamp; table heads and wells in the grey-tempered neutrals.

Pinned by the user in the second feedback round (2026-09-28, later still): the home page's gradients were all the same shape, so each plate now prints an impression of its own. The 3D preview's frame, in the studio and on the download page, takes a corner of its own above the panels (`--radius-xl`), and the white containers behind the drawings in sections 01 and 04 are rounded to the panel's 22 px; the square 2 px mat is kept only for a small drawn glyph inside a control.

Pinned by the user in the third feedback round (2026-09-29, earlier), with reference images of grainy dithered WAVES: ovals are not enough. A plate's ink is now a RIDGE of overlapping crests with a wavy edge, one crest line per plate (a band weaving behind the headline, a skyline climbing out from under the corner proof, a wave stood on its end down plate 02, a swell under the kit, a wedge at the foot of plate 04, a double ridge in the colophon); the single round impression is left only to the frontispiece's halo and the working pages' heads. See The Ridge Rule, The Spent Crest Rule and The Ceiling Is Measured on the Union Rule in DESIGN.md. Also pinned: the tile colour settles rather than snapping when it is picked (`--filament` is a registered `<color>`, transitioned on the root); the render frame's corner is raised to 36 px and the canvas is clipped on its own layer as well as its host's, because a composited canvas can paint square corners through an ancestor's clip; and the top bar is the book's BINDING, sticky, with no track behind its tabs.

Memorable moment: the page is printed in the ink of your tile. Pick Teal and every spot-ink wash on the page reprints teal.

Unresolved: none blocking.

## Direction contract

THESIS: Tessera as the pattern book a tile works would print: every band a numbered plate, set in black plus one spot ink, the tile's own color, on heavy grained stock. It refuses the category's clean SaaS hero and the lamp-lit workbench it replaces: nothing glows, everything is printed.

OWN-WORLD: Stock ground #E9E5DD with a fine even grain (paper tooth) over all of it; the mat panel #FFFDF8 for plates; ink #241C14 / #5C5044 / #6B5D4D; one spot ink = the tile color (never darker than OKLCH lightness 0.62), laid as grainy clouds with small text only on their fringe; the accent (accentPalette, 6.5:1 floor) for the one action, selection, focus and the plate numbers. Basteleur Bold for titles only (h1 to h3, plate captions, the wordmark); Archivo for everything read or operated. No rule is drawn across the page: plates are told apart by number, title and air. The spot ink lies in grainy clouds (the ink-cloud mixin) that fade to nothing inside their own box. Printed things are square (ink, plate frames); things you press stay round.

STORY: The visitor sees their wall as the frontispiece of a pattern book, sizes it in the caption fields, reads one sentence of counts, then turns the plates: how it cuts, the patterns, the zip, how it goes up, the questions, and a colophon that sends them to the studio.

FIRST VIEWPORT: Under the espresso bar (Basteleur wordmark), a two-column title page. Left, over a soft grainy cloud of the tile's ink: the headline in Basteleur at one size (up to 3.5rem) on a narrow measure, breaking into four ragged lines ("Design / 3D-printed tiles / that fit your / wall exactly"), the support line, the 54 px accent action, then "Your wall" (Basteleur) with the fields, the three example walls, the fit sentence and the privacy line. Right: the hero wall untouched, standing in a grainy cloud of the tile's ink a little wider than the wall on every side, its caption under it with no rule: the name in Basteleur, the counts in Archivo, then the five sample keys.

FORM: Pattern Book, IMPECCABLE'S PICK (position 1 of my ordered list: tile works pattern book, riso maker zine, letterpress relief, slicer and spool label, paint fan deck, tile-setter's site (assigned), mosaic tesserae); seed key 03fa0513. Signature interaction: the ink pass: as each plate is reached its cloud of spot ink prints in, sliding from a few pixels off register into place, and any color pick reprints every cloud at once. Each plate's cloud sits somewhere different (behind the corner proof, behind the patterns' argument, under the kit, the colophon's right half), never stamped in the same place. Raises kept from the round: hierarchy by scale alone ("Design" enormous, everything else small), one ink at page scale (washes own whole fields, never scattered accents), text stays achromatic (color lives in ink washes, the wall and the one action), a measured field of bare stock around the wall.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance


Pinned by the user in the fourth feedback round (2026-09-29), with a reference of stippled crescents: bolder, and multiply the shapes. The book's figure is now an ARC, a crescent built by walking one oval along an elliptical path (`ink-arc`), struck across each plate and printed THROUGH a dither so its fall-off dissolves into dots; peaks roughly doubled to pay for the stipple. See The Arc Rule and The Dither Rule in DESIGN.md. Also pinned in this round: a full rebrand of the top bar, which is no longer a dark slab but the RUNNING HEAD printed on the same stock as the page, with the identity as a label (the mark on its espresso plate beside the wordmark in ink) and the current tab in the soft-accent pill; and the studio preview's corners, which a hardware-accelerated Firefox still painted square through both clips, now painted over by four quarter-discs of the plate colour that depend on no clipping at all.


Pinned by the user in the fifth feedback round (2026-09-29): the running head casts no shadow while the page is at its top and lifts onto one as soon as the page moves under it; plate 01's figure is an arch OVER the studio note (it used to hook around it); and the studio preview's corner, which was still square in a hardware-accelerated Firefox because the overlay painted the notch in the plate colour, the same colour the canvas clears to. It is painted in the page's stock now, and the fallback is verified against a forced reproduction of the failure (every clip stripped) rather than against a headless browser that never shows the bug.


Pinned by the user in the sixth feedback round (2026-09-29): bolder arcs again, so every figure is now THIN against its span and the dither is coarse enough to read as dots at 1x. On the studio preview's corner the user gave the decisive clue: round below 1100px, square above it. That could not be reproduced in Firefox here, headless or headed, at either width, with hardware acceleration forced; so the corner gained two more guards that depend on nothing being honoured on the canvas's layer (a `mask` on the canvas, and `corner-mat` on the FRAME rather than inside the view), and both frames now write their radius as a literal, because a token that resolves to an invalid value squares a frame silently and `var(--x, fallback)` does not catch it.


Pinned by the user (2026-09-29, once the corner finally rendered): the render frame takes the PANEL's corner, 22 px, the same one the studio's choices rail wears, so the two halves of the bench are cut alike. The xl step is retired; nothing else ever used it.


Spacing pass (2026-09-29), measured on the rendered pages rather than read off the source. Fixed: the studio scrolled sideways on a phone (the shell's implicit `auto` grid column was floored by a nowrap pill's min-content); three different page insets at one viewport (35 / 23 / 16 px) unified on `--page-x`, with `--page-top` and `--page-bottom` giving a display page title real air under the sticky running head; the working pages' flat 24 px rhythm given a cadence, so a titled section opens a step and a half in from its neighbours, at page level and inside a column; a measurement field's input stretched to the full height of its well, which was a 20 px target for a mouse; the history footnote pulled flush with the panel and the title above it; and the running head made to fit down to 320 px by stepping the wordmark down at 26 rem and falling back to the mark alone at 20 rem. History keeps its wider 88 rem measure on purpose: it is a register, and at the document's 76 rem its row actions wrapped.
