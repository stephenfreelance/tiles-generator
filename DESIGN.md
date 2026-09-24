---
name: Tessera
description: A well-lit maker's workbench for designing printable relief wall tiles.
colors:
  espresso-bar: "#2e241b"
  bar-ink: "#f7f1e6"
  ground: "#f2eadc"
  panel: "#fffdf8"
  panel-recessed: "#efe7d8"
  hairline: "#e4d8c4"
  hairline-strong: "#d8c9af"
  ink: "#241c14"
  ink-2: "#5c5044"
  ink-3: "#6b5d4d"
  accent: "#306918"
  accent-hover: "#265f09"
  accent-press: "#1d5300"
  accent-ink: "#fffdf8"
  accent-soft: "#eaf4e7"
  ok: "#2c6b3a"
  ok-ink: "#265c31"
  warn: "#a6501e"
  warn-ink: "#8a4216"
  cut: "#a3321a"
  cut-soft: "#fbeae4"
  tile-default: "#5c9748"
typography:
  display:
    fontFamily: "'Archivo Variable', 'Archivo', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 1rem + 2.9vw, 3.5rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "'Archivo Variable', 'Archivo', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.9rem, 1.05rem + 2.3vw, 3.1rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.028em"
  title:
    fontFamily: "'Archivo Variable', 'Archivo', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "0.005em"
  body-lead:
    fontFamily: "'Archivo Variable', 'Archivo', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "'Archivo Variable', 'Archivo', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  figure:
    fontFamily: "'Archivo Variable', 'Archivo', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 650
    lineHeight: 1
    fontFeature: "'tnum'"
  label:
    fontFamily: "'Archivo Variable', 'Archivo', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.005em"
  note:
    fontFamily: "'Archivo Variable', 'Archivo', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  control: "8px"
  sm: "11px"
  md: "14px"
  lg: "22px"
  pill: "999px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
  s-8: "64px"
  s-9: "96px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.accent-ink}"
  button-primary-active:
    backgroundColor: "{colors.accent-press}"
    textColor: "{colors.accent-ink}"
  button-primary-lg:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    padding: "0 24px"
    height: "54px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-ghost:
    textColor: "{colors.accent}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  segmented-group:
    backgroundColor: "{colors.panel-recessed}"
    rounded: "{rounded.sm}"
    padding: "3px"
  segmented-selected:
    backgroundColor: "{colors.espresso-bar}"
    textColor: "{colors.bar-ink}"
    rounded: "{rounded.control}"
    height: "32px"
  choice-tile-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px"
  measure-field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    rounded: "{rounded.sm}"
    height: "48px"
  step-number:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    size: "26px"
  step-index-current:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "32px"
  disclosure-lid:
    backgroundColor: "{colors.bar-ink}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "52px"
  changes-well:
    backgroundColor: "{colors.panel-recessed}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  panel-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  tooltip:
    backgroundColor: "{colors.espresso-bar}"
    textColor: "{colors.bar-ink}"
    rounded: "{rounded.sm}"
  app-bar:
    backgroundColor: "{colors.espresso-bar}"
    textColor: "{colors.bar-ink}"
    height: "56px"
  app-bar-tab-active:
    backgroundColor: "{colors.bar-ink}"
    textColor: "{colors.espresso-bar}"
    rounded: "{rounded.control}"
    height: "32px"
---

# Design System: Tessera

## Overview

**Creative North Star: "The Well-Lit Workbench"**

Tessera is a maker's bench under one warm lamp, not a drawing office. A dark espresso bar anchors the top of every page; beneath it a warm off-white ground carries soft, rounded panels lifted on brown (never grey) shadows. The render of the wall is the product and takes most of the screen; the interface around it is quiet, tactile and legible, so the brightest things in view are always the maker's own tile color and relief. Every screen is lit from the same corner, the upper left: the 3D lamp, the relief chips' hillshade and the home hero's lamp all agree.

Color carries one job at a time. One accent, drawn from the tile color the maker chose, is the primary action, selection and focus; red means only "cut, or wrong"; a fixed green is the exact-fit tick and amber the caution. The chosen tile color also washes the bench at 8%, so picking Teal turns the page teal without ever pushing text under AA. Type is Archivo throughout, in sentence case, with tabular figures on every measurement. Density is moderate: a studio rail of numbered steps separated by single hairlines, controls grouped in recessed wells, and every rarely touched knob folded behind one labelled lid that states on its face whether anything behind it has moved.

The system rejects two things equally, both confirmed by the direction contract: the grey form-sidebar configurator, and the drafting-sheet instrument panel this app used to be (square corners, a 2 px ink frame, lettered sheet borders, expanded uppercase labels, red primary action, chalk-blue focus). The older "Visual world" section of `docs/architecture.md` describes that retired world and is superseded by this file and `src/styles/_tokens.scss`.

**Key Characteristics:**
- Espresso bar over a warm ground; rounded warm panels; one recessed tone for wells, pills and strips; one hairline.
- One accent, derived from the tile color with an enforced contrast floor, for action, selection and focus.
- The relief and color samples are the brightest, least captioned things on screen.
- Archivo only, sentence case, tabular figures, weights 600 to 700 doing the hierarchy.
- One light source, upper left, on every rendered or painted surface.
- Motion settles from an already-legible start, and collapses to nothing under reduced motion.

## Colors

A warm, low-chroma room of browns and creams, with one saturated voice that belongs to the maker's tile.

### Primary
- **Tile Accent** (accent, with accent-hover, accent-press, accent-ink and accent-soft): the primary action, the selected state and the focus ring. The frontmatter values are the palette for the default Green tile; at runtime `accentPalette` (`src/core/accent.ts`) recomputes all five from `config.color` and `useAccentTheme` writes them on the root element with no transition. It keeps the tile's OKLCH hue, uses the tile color itself when that already reaches 6.5:1 on the panel, and otherwise darkens it only as far as the floor needs (a white tile gives a warm grey, a yellow one a deep ochre). Hover and press are darker steps of the same hue; the soft tint is pale enough to carry accent lettering and the lightest ink at 4.5:1 or better, which is why step numbers and selected fills sit on it. `src/styles/tokens.test.ts` holds the stylesheet defaults equal to the script's answer for the default tile, so nothing jumps on load.
- **Tile Color** (tile-default): the maker's own color, the content rather than the chrome. It paints the relief chips and swatches, washes the bench at 8% (`--filament-wash`) behind the fit strip and at 12% (`--filament-tint`) on drawn tiles that carry no text.

### Neutral
- **Espresso Bar** (espresso-bar): the one dark surface: the app bar, the selected segment of a pill group, the tooltip and the selection ring on color swatches. Its lettering is **Bar Cream** (bar-ink), at 13.49:1.
- **Warm Ground** (ground): the page floor every panel stands on.
- **Panel Cream** (panel): the lifted surfaces: the studio rail, cards, dialogs, fields, popovers. Also the lettering on the accent.
- **Recessed Bench** (panel-recessed): the one sunken tone, for wells, pill-group tracks, the "What changes" well, disabled controls and the back of an unloaded tile.
- **Hairline** (hairline): the single divider and border. **Hairline Strong** (hairline-strong) is its hover step on bordered controls.
- **Ink, Ink 2, Ink 3** (ink, ink-2, ink-3): text in three weights. Ink for headings, values and anything read first; Ink 2 for supporting copy and quiet controls; Ink 3 for hints, field names and notes, still AA at 12 px on the panel (6.26:1) and on the recessed bench (5.18:1).

### Status
- **Cut Red** (cut, with cut-soft): cut pieces, errors and their notes, nothing else. Dark enough to be text (6.82:1 on a panel) as well as a stroke or a hatch, so a cut note and a cut tile are the same color.
- **Fit Green** (ok, ok-ink): the exact-fit tick, fixed whatever the tile color.
- **Caution Amber** (warn, warn-ink): cautions and invalid fields. The plain tone is for marks and fills; the `-ink` variant carries text.

### Named Rules
**The One Accent Rule.** The accent means action, selection or focus, and one accent-filled primary button per screen. It is never decoration, never a status color and never a heading color on the operating surfaces.

**The Contrast Floor Rule.** The accent follows the tile, but no tile may drag it under 6.5:1 on the panel. Never hard-code the default green: read `--accent` and let `accentPalette` decide.

**The Bar Exception Rule.** The accent is illegal on the espresso bar (2.3:1 at most, whatever the tile). Everything on the bar focuses and selects in Bar Cream instead.

**The 8% Wash Rule.** The tile color may tint the bench at 8% at most where text sits on it (a pure black tile still leaves Ink 3 at 5.25:1), and at 12% only where no text sits. Nothing lighter than Ink 3 goes on the wash.

**The Red Means Cut Rule.** Red is reserved for cut pieces and for what is wrong. It is never a primary action, never a brand color.

## Typography

**Display Font:** Archivo Variable (with Archivo, ui-sans-serif, system-ui)
**Body Font:** the same
**Label/Mono Font:** the same, with tabular figures

**Character:** One grotesque carries the whole voice, self-hosted and preloaded. Weight does the hierarchy (400 body, 550 to 600 quiet controls and labels, 650 titles and values, 700 display and step numbers), and the display sizes tighten their tracking as they grow.

### Hierarchy
- **Display** (700, clamp 2.25 to 3.5 rem, line-height 0.98, tracking -0.03em): the home page's one headline, a two-beat line with its second beat on its own line. Never animated; it is the page's largest paint.
- **Headline** (700, clamp 1.9 to 3.1 rem, line-height 1.02, tracking -0.028em): the home page's band headings and the close.
- **Title** (650, 1.25 rem, line-height 1.15): studio step headings, the tiling plan heading, dialog titles.
- **Body Lead** (400, 1 rem, line-height 1.55, 34 to 54ch): supporting paragraphs on the home page.
- **Body** (400, 0.875 rem, line-height 1.45): the default for every surface.
- **Figure** (650, 1.1875 rem, tabular): the number in a measurement field. Step values at the end of a heading use Body size at 650, also tabular.
- **Label** (600, 0.75 rem, line-height 1.25): field names, list heads and the step index, in sentence case with near-zero tracking.
- **Note** (500, 0.6875 rem): the smallest text, hints under swatches and hex codes, always Ink 3 or darker.

### Named Rules
**The Sentence Case Rule.** Labels, buttons, tabs and headings are sentence case. The expanded uppercase lettering of the drafting world is retired; the only uppercase in the system is a hex code, which reads as a code.

**The Tabular Figures Rule.** Every measurement, count and value is set with tabular figures, so columns of numbers and live-updating values never shift.

## Layout

Space runs on a 4 px grid (s-1 to s-9); inside components the working steps are 8, 12 and 16 px, and 24 px is the rail's side padding.

**Studio (Operate).** Two columns under the 56 px bar: the render takes the remaining width and the rail is a fixed 33 rem panel, 16 px apart and 16 px from the window. The rail is one card whose steps scroll against a foot that never leaves: the fit strip washed in the tile color, the one accent action, and a quiet line. Steps are divided by a single hairline and padded 16 px top and bottom. The rail's first line is the **step index**, pinned to the top of the steps column (and to the top of the screen below 1100 px), bleeding across the column's padding so what scrolls under it is covered edge to edge; a jump from it lands a step flush beneath it. Below 1100 px the columns stack, the render leads, and the foot pins to the bottom of the screen.

**Home (Persuade).** A catalogue of full-width bands on an 88 rem measure with a fluid gutter (`clamp(1rem, 0.4rem + 2vw, 3rem)`). The hero is one grid: a type column (19 to 30 rem) beside the wall, the wall capped at 40 rem so it reads as an object on a page, not a backdrop. The room is lit at two levels, the ground and a lit band (58% of the way to the panel), and each band's head dissolves out of the level above rather than being ruled off. Short laptop screens (under 50 rem tall, wider than 62 rem) close up the hero's air so the action and fit line land above the fold.

**Breakpoints in use:** 30 rem, 48 rem, 60 rem and 62 rem for content reflow, and 1100 px for the studio's two-column to stacked switch. Any coarse pointer raises every target to 44 px.

## Elevation & Depth

Depth is soft, warm and mostly tonal. Surfaces lift off the ground on brown-tinted shadows built from the espresso color (`rgb(46 36 27 / ...)`), paired with a hairline border; the recessed bench tone does the sinking. There is no grey drop shadow and no hard offset shadow anywhere.

### Shadow Vocabulary
- **Rest** (`--shadow-sm`: `0 1px 2px rgb(46 36 27 / 0.06), 0 2px 6px -4px rgb(46 36 27 / 0.28)`): secondary buttons and the active tab in a tab list.
- **Lift** (`--shadow-md`: `0 1px 2px rgb(46 36 27 / 0.05), 0 12px 28px -22px rgb(46 36 27 / 0.5)`): the studio rail, cards, popovers, tooltips, toasts, the laid pieces of the home page's corner proof.
- **Stage tool** (`0 2px 8px rgb(46 36 27 / 0.08)` over 88% panel with a 6 px backdrop blur): switches and pills resting on the 3D render.
- **Dialog** (`0 24px 60px -28px rgb(46 36 27 / 0.7)` over a 45% espresso scrim).
- **Primary glow** (an inner 25% white top line and `0 10px 20px -12px` of the accent at 90%): the accent button only, so it reads as the lit end of the column.
- **Standing object** (three layers down to `0 60px 90px -50px rgb(46 36 27 / 0.62)`): the home hero's wall, a thing standing off the page under a raking key.

### Named Rules
**The Warm Shadow Rule.** Every shadow is tinted from the espresso bar. A neutral grey or black shadow is off-system.

**The One Lamp Rule.** Light comes from the upper left on every surface: the 3D studio lamp, the relief chips' hillshade (azimuth 135, elevation 26), the hero wall's lamp gradient and the shadows that fall down and to the right. A new lit surface takes the same corner.

## Shapes

Nothing in this world is square. Radii come in three sizes: 11 px (sm) for fields, chips, choice tiles and pill-group tracks; 14 px (md) for buttons, lids, wells, popovers and the hero wall; 22 px (lg) for panels, cards and dialogs. Inner controls nested in a track (segments, steppers, bar tabs) take 8 px, so the inner corner sits concentric with the outer one. Step numbers, the step index items, badges and switches are full pills or circles. Borders are 1 px hairlines; the focus ring is a 3 px accent outline drawn outside the element (inset by 3 px inside lists) so a rounded corner keeps its shape.

## Components

### Buttons
Tactile plates with a clear hierarchy of one.
- **Shape:** gently rounded (14 px; 11 px at the small size).
- **Primary:** accent fill, Panel Cream lettering at 650 weight, a faint inner top highlight and an accent glow beneath. Sizes 32, 40 and 54 px tall; the 54 px size (700 weight, 17 px text) is reserved for the one action that closes a screen, such as "Get my files".
- **Hover / Press:** accent-hover, then accent-press with a 1 px press down. Transitions run at 140 ms on the out ease.
- **Secondary:** a panel plate with a hairline and the rest shadow; hover warms the fill and strengthens the border, press drops to the recessed tone.
- **Ghost:** accent words, underlined at 1.5 px, with the soft accent tint on hover. **Danger quiet** is the same in Ink 2, turning cut-red on its soft wash under the hand.
- **Progress:** a long job fills the button itself with a clipped diagonal hatch, white on the accent and ink on pale buttons.
- **Disabled:** recessed fill, hairline, Ink 3 lettering, no shadow.

### Pill groups (segmented choices)
- **Style:** a recessed track (11 px, 3 px padding, hairline) holding quiet Ink 2 segments at 550 weight.
- **Selected:** a word choice becomes the dark espresso plate with Bar Cream lettering. A picture choice (a "tile" with a drawn diagram) keeps its picture visible instead: accent border, a 1 px inner accent ring and the soft accent fill.

### Color swatches and relief samples
The brightest things on the screen, shown as a wall of lit samples with no captions between them.
- **Swatches:** 44 px, 12 px radius, lit with an inner hairline and a domed top highlight. Selected takes an espresso ring held off the chip by the panel color, never the accent, because the accent is drawn from the same hue and would vanish on its own chip. The tick is Panel Cream with its own small shadow so it reads on any color.
- **Relief samples:** small printed tiles lying on the bench (10 px radius, a light shadow that lifts on hover). Selected takes an accent ring held off by the panel color, with an inner light line so the relief keeps its edge. The name lives in the step heading and the accessible name, not under the chip.

### Measurement fields
- **Style:** a 48 px panel well with a hairline, the field name as a Label above, the figure in 650 tabular, the unit in Ink 3 and two small steppers (8 px radius, bar-cream fill) at the end.
- **Focus:** the ring sits on the whole well (accent border plus 1 px accent spread), so the unit and steppers read as part of what is focused.
- **Invalid:** amber-ink border and an amber hint line with a small icon. **Disabled:** the recessed tone at 70%.
- **Compact:** behind Advanced, the label sits left and a 36 px field right.

### Steps and the step index (signature)
- **Step heading:** a 26 px circle in the soft accent with the number in the accent at 700, the Title beside it, and the step's current value at the far end of the line in Ink at 650, tabular.
- **Step index:** the rail's first line, 52 px tall on the panel over a hairline, pinned while the steps scroll under it. The seven numbers sit in a row as 21 px soft-accent discs, then a hairline and a small plan mark in the accent for the tiling plan. Only the step being read spells out its name, as a full pill in the soft accent with its disc filled in the solid accent and Panel Cream numeral; the others show their number alone and are named on hover and to assistive tech. Hover warms an item to the recessed tone; the row never stretches past the rail's own 33 rem, even when a tablet runs one column across the page. A press scrolls only the steps column and hands the landed heading the keyboard, with its focus outline shown only for keyboard jumps.

### Lids (disclosures)
- **Style:** a full-width 52 px lid (14 px radius, hairline, the bar-cream fill) with a chevron that turns a quarter, the label at 650 with a one-line description in Ink 3, and a pill badge at the end.
- **Behavior:** the badge always says what is behind the lid (a changed count, a profile name, or "All standard", "None"), so a folded panel never changes a design silently. Its panel opens as a hairline panel below with 16 px padding. Inside a well, a lid drops its card and keeps only its line.

### Wells
- **"What changes" well:** a recessed 14 px well with 16 px padding, its rows divided by hairlines. Each row is a term over its value: a small Ink 3 label (12 px, 650) with a line icon, then the words at the well's full measure, because a label column left the words about 45 characters a line at the rail's width. Anything the maker must act on is flagged at the top, before the rows.
- **Fit strip:** in the rail's foot, washed in the tile color at 8%, with the fit-green tick and the one sentence of counts.

### Cards and floating surfaces
- **Panel card:** panel fill, hairline, 22 px radius, Lift shadow.
- **Paper slip:** popovers, menus and toasts at 14 px radius with the Lift shadow; they enter with a short settle toward their trigger from a legible start, and do not animate at all under reduced motion.
- **Tooltip:** a small espresso plate with Bar Cream text beside what it names; key caps inside it sit on translucent cream.
- **Dialog:** a 22 px panel up to 46 rem wide over an espresso scrim, its head ruled off by a hairline.

### Navigation (the app bar)
- **Style:** the 56 px espresso bar carrying the six-tile wordmark, the design's name edited in place, the Studio and History tabs, and undo, redo and the shortcut key.
- **States:** quiet items in a muted cream, lifting to Bar Cream on a 10% cream wash under the hand; the active tab inverts to a Bar Cream pill with espresso lettering. Focus in the bar is drawn in Bar Cream (see The Bar Exception Rule).

### The home hero wall (signature)
The visitor's own wall, built from CPU-rendered relief chips, with no 3D engine on the page.
- **Room light:** behind the hero, a pool of panel-cream light over the wall falls off to 18% espresso at the frame's top and right edges, masked away along the bottom so the first band pours out of plain ground with no seam. The type column stands in the shade beside the lit wall.
- **Face light:** a soft-light lamp gradient on the wall's face, brightest at the upper left and falling to a warm shade in the far corner, so the relief darkens with the light instead of being painted over. A faint raking sheen crosses the face on a 26 s cycle, stands down while the hero is off screen and stops entirely under reduced motion.
- **Joints:** 1 px gaps showing a deep tone of the tile's own color (52% tile over espresso), read as the shadow in the V of two chamfered edges, never as paper showing through. Each tile carries a faint inner edge line. The home page's corner proof uses the same joint.
- **Arrival:** once, when the chips are ready (or after a 2.4 s ceiling so the screen is never left blank), tiles are laid in a wave from the setting-out corner, each pressed into place from slightly larger and higher (1.1 s across the wall, 0.7 s per tile) while the wall swings in from a small turn and a step further off (1.8 s). The joints, the shadow and the face light come up only once most tiles are down, so the first thing seen is a tile going on, never an empty slab. Under reduced motion the wave, the swing and the sheen are skipped and the wall appears whole.

## Do's and Don'ts

### Do:
- **Do** read `--accent` and its four companions for every action, selection and focus, and let `accentPalette` hold the 6.5:1 floor for any tile color.
- **Do** keep one accent-filled primary button per screen, at the 54 px size when it closes the screen.
- **Do** lift surfaces with the warm Rest or Lift shadow plus a hairline, and sink wells into the recessed bench tone.
- **Do** round everything: 11, 14 or 22 px, 8 px for controls nested in a track, full pills for counts, badges and step numbers.
- **Do** set every measurement and count in tabular figures, and every label in sentence case.
- **Do** light every new rendered or painted surface from the upper left.
- **Do** say on a lid's face what has moved behind it.
- **Do** give every target 24 px, and 44 px under a coarse pointer.
- **Do** start every entrance from an already-legible state, with a fallback that shows the content if the entrance never runs, and collapse motion to nothing under reduced motion (`--t-fast`, `--t-med`, `--t-slow` already go to 0 ms).
- **Do** redraw every state carried by color (selected, cut, pressed) in system colors or in a shape under forced colors.

### Don't:
- **Don't** bring back the drafting sheet: square corners, a 2 px ink frame, lettered or numbered sheet borders, sheet feet, expanded uppercase labels, a red primary action or chalk-blue focus.
- **Don't** build a grey form-sidebar configurator; the render leads and the rail is warm.
- **Don't** put the accent on the espresso bar, or use it as decoration or status.
- **Don't** use red for anything but cut pieces and what is wrong.
- **Don't** tint the bench above 8% where text sits, or set anything lighter than Ink 3 on the wash.
- **Don't** use grey or black shadows, or hard offset shadows.
- **Don't** caption the swatches or relief samples, or draw anything brighter than them on the operating surfaces.
- **Don't** select a color swatch with the accent ring; it vanishes on a chip of its own hue.
- **Don't** use the retired alias tokens (`--sheet`, `--desk`, `--chalk`, `--pencil`, `--red` and friends) in new code; they exist only so older files resolve.
- **Don't** introduce a second typeface or a system display face; Archivo is the whole voice.
