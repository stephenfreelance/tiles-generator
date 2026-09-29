---
name: Tessera
description: A tile works' pattern book, printed in black and the tile's own ink on grained stock, for designing printable relief wall tiles.
colors:
  espresso-bar: "#2e241b"
  bar-ink: "#f7f1e6"
  stock: "#e9e5dd"
  panel: "#fffdf8"
  panel-recessed: "#eeebe4"
  hairline: "#dcd7ce"
  hairline-strong: "#cdc7bc"
  stage-plate: "#f3f2ee"
  ink: "#241c14"
  ink-2: "#5c5044"
  ink-3: "#6b5d4d"
  accent: "#306918"
  accent-hover: "#265f09"
  accent-press: "#1d5300"
  accent-ink: "#fffdf8"
  accent-soft: "#eaf4e7"
  tile-default: "#5c9748"
  spot-ink: "#5d9849"
  mark: "#5c9748"
  mark-cut: "#90c080"
  ok: "#2c6b3a"
  ok-ink: "#265c31"
  warn: "#a6501e"
  warn-ink: "#8a4216"
  cut: "#a3321a"
  cut-soft: "#fbeae4"
typography:
  display:
    fontFamily: "'Basteleur', ui-serif, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(2.5rem, 1.6rem + 2.2vw, 3.5rem)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "0"
  colophon:
    fontFamily: "'Basteleur', ui-serif, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(2.75rem, 1rem + 4.6vw, 5.5rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0"
  plate-number:
    fontFamily: "'Basteleur', ui-serif, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(2.5rem, 1.1rem + 2.8vw, 3.75rem)"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "0"
    fontFeature: "'tnum'"
  headline:
    fontFamily: "'Basteleur', ui-serif, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(2rem, 1.05rem + 2.1vw, 3.125rem)"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "0"
  page-title:
    fontFamily: "'Basteleur', ui-serif, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(2.25rem, 1.5rem + 1.8vw, 3.25rem)"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "0"
  title:
    fontFamily: "'Basteleur', ui-serif, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(1.5rem, 1.25rem + 0.6vw, 1.875rem)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "0"
  step-title:
    fontFamily: "'Basteleur', ui-serif, Georgia, 'Times New Roman', serif"
    fontSize: "1.375rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0"
  plate-caption:
    fontFamily: "'Basteleur', ui-serif, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(1.25rem, 1rem + 0.6vw, 1.625rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0"
  wordmark:
    fontFamily: "'Basteleur', ui-serif, Georgia, 'Times New Roman', serif"
    fontSize: "1.625rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0"
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
  print: "2px"
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
  page-x: "clamp(1rem, 0.4rem + 2vw, 3rem)"
  page-top: "clamp(1.5rem, 3vw, 2.75rem)"
  page-bottom: "clamp(2rem, 5vw, 6rem)"
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
  button-secondary-active:
    backgroundColor: "{colors.panel-recessed}"
    textColor: "{colors.ink}"
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
  step-title:
    textColor: "{colors.ink}"
    typography: "{typography.step-title}"
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
  disclosure-lid-hover:
    backgroundColor: "{colors.panel-recessed}"
    textColor: "{colors.ink}"
  changes-well:
    backgroundColor: "{colors.panel-recessed}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  panel-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  render-view:
    backgroundColor: "{colors.stage-plate}"
    rounded: "{rounded.lg}"
  drawing-mat:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.lg}"
  page-title:
    textColor: "{colors.ink}"
    typography: "{typography.page-title}"
  plate-number:
    textColor: "{colors.accent}"
    typography: "{typography.plate-number}"
  plate-heading:
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
  plate-caption:
    textColor: "{colors.ink}"
    typography: "{typography.plate-caption}"
  tooltip:
    backgroundColor: "{colors.espresso-bar}"
    textColor: "{colors.bar-ink}"
    rounded: "{rounded.sm}"
  app-bar:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink}"
    height: "56px"
  app-bar-mark-plate:
    backgroundColor: "{colors.espresso-bar}"
    rounded: "7px"
    size: "30px"
  app-bar-wordmark:
    textColor: "{colors.ink}"
    typography: "{typography.wordmark}"
  app-bar-tab-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    height: "32px"
---

# Design System: Tessera

## Overview

**Creative North Star: "The Pattern Book"**

Tessera is the pattern book a tile works would print: every page is a sheet of heavy, grained grey stock bound under a dark espresso bar, printed in black ink and one spot ink, the tile's own color. Nothing on the page glows; everything is printed. Titles are set in Basteleur, a display face with the swash and ink trap of a trade catalogue, and everything read or operated is set in Archivo. No rule is drawn across a page: a plate is told from the next by its number, its title and the air around it. The spot ink lies on the stock as grainy clouds, each spent to nothing before every edge of its own box, so picking Teal reprints every cloud in teal while the type stays black.

The home page is the book itself: a title page with the visitor's wall as its frontispiece, a run of numbered plates (how it cuts, the patterns, the zip, how it goes up, the questions) and a colophon that sends the reader to the studio. The working pages (studio, download, fit test, history) are printed on the same stock, with Basteleur titles, and the download, fit test and history pages open with their title over a faint cloud of spot ink; underneath, they keep the studio's rounded warm panels, its one-accent controls and its component inventory, because a page is printed but the controls on it are pressed. The 3D render and the hero wall stay lit objects: they are the product, photographed, standing on the printed page. The render stands on its own neutral plate inside a rounded frame, and only the tiles in it are lit.

The system rejects the category's clean SaaS hero, the lamp-lit workbench it replaced (a warm #F2EADC ground, Archivo alone, light pooling on the page), the older drafting-sheet instrument panel (a 2 px ink frame round the whole sheet, lettered sheet borders, sheet feet, expanded uppercase labels, a red primary action, chalk-blue focus), and decorative horizontal rules: the double ink rule the first Pattern Book pass drew over every head, caption, colophon and footer was taken out at the user's request. The "Visual world" section of `docs/architecture.md` still describes the drafting sheet and is superseded by this file and `src/styles/_tokens.scss`.

**Key Characteristics:**
- Grained grey stock (#E9E5DD with its tooth) under every page, the running head included, so the whole site is one sheet; the grain is part of the ground, never a separate effect.
- Black ink plus one spot ink, the tile color, laid as grainy clouds spent to nothing at every edge. Text stays achromatic; color lives in the clouds, the wall, the plate numbers and the one action.
- Basteleur for titles only, at one weight; Archivo for every word read or operated.
- A headline of one size that breaks into four ragged lines on a narrow measure; the colophon's closing sentence is the largest type in the book.
- No decorative rules: plates are parted by number, title and air. A hairline is a panel's border or a row in a table, a list or the studio rail, and nothing else.
- Printed things are square; things a hand presses are round.
- The ink pass: each plate's ink prints in from its own few pixels off register as that plate is reached.

## Colors

Black ink and one spot ink on grey stock, with the espresso bar as binding and a single accent for what a hand does.

### Primary
- **Tile Accent** (accent, with accent-hover, accent-press, accent-ink and accent-soft): the primary action, selection, focus, and on the home page the plate numbers. The frontmatter values are the palette for the default Green tile; at runtime `accentPalette` (`src/core/accent.ts`) recomputes all five from `config.color` and `useAccentTheme` writes them on the root element with no transition. It keeps the tile's OKLCH hue, uses the tile color itself when that already reaches 6.5:1 on the panel (5.2:1 on the stock), and otherwise darkens only as far as the floor needs (a white tile gives a warm grey, a yellow one a deep ochre). The soft tint keeps accent lettering and Ink 3 at 4.5:1 or better, measured against the recessed mat it sits beside (`BENCH` in `accent.ts` follows `--panel-2`). `src/styles/tokens.test.ts` holds the stylesheet defaults equal to the script's answer.
- **Spot Ink** (spot-ink): the one printing color of the book: the tile color, but never darker than OKLCH lightness 0.62 (`oklch(from var(--filament) max(l, 0.62) c h)`, with the plain tile color as the fallback where relative colors are unsupported). A black or charcoal tile therefore prints a grey cloud that display type and accent plate numbers still read on. Every cloud on every page is printed in it, grained with `--grain-ink`; the frontispiece's and the colophon's clouds may pale it toward white at their fringe, never shift its hue.
- **Tile Color** (tile-default, `--filament`): the maker's own color as content: the relief chips, the swatches, the hero wall, and the 8% `--filament-wash` behind the studio's fit strip.
- **Mark and Mark Cut** (mark, mark-cut): the mark's two tones, measured against the espresso bar (see The Mark's Own Floor Rule).

### Neutral
- **Espresso** (espresso-bar): the darkest ink the book prints, used as a small plate and never as a floor: the plate the mark stands on in the running head and in a tab strip, the selected segment of a pill group, the tooltip, and the ring on a selected color swatch. Its lettering is **Bar Cream** (bar-ink), at 13.49:1; Bar Cream is also the lid's face.
- **Stock** (stock): the paper every page is printed on, a greyer, cooler sheet than the panels, always painted with its grain (the `stock` mixin: `--grain` over `--ground`, 256 px tile). Ink on it: 13.36:1, Ink 2 6.22:1, Ink 3 5.07:1.
- **Panel Mat** (panel): the lighter mat a plate or a control is mounted on: the studio rail, cards, dialogs, fields, popovers, drawing mats. Also the lettering on the accent.
- **Recessed Mat** (panel-recessed): the one sunken tone, tempered to the grey stock so it reads as a shade of the same paper: wells, pill-group tracks, table heads, the "What changes" well, a pressed secondary button, a lid under the hand and disabled controls. Ink 2 on it 6.57:1, Ink 3 5.35:1.
- **Hairline** (hairline, with hairline-strong, `--rule-strong`, as every bordered control's hover step): the 1 px border of a panel, a field, a chip or a lid, and the only rule in the system: rows in a table or a list, the studio rail's steps, a dialog's head.
- **Stage Plate** (stage-plate): the neutral plate the 3D render stands on (`LOOK.palette.sheet` in `src/three/look.ts`, and the view frame's own fill), a little lighter and cooler than the stock so the frame's rounded edge reads on the page.
- **Ink, Ink 2, Ink 3** (ink, ink-2, ink-3): text in three weights.

### Status
- **Cut Red** (cut, with cut-soft): cut pieces and what is wrong, on the working surfaces. Dark enough to be text (6.82:1 on a panel) as well as a stroke or a hatch.
- **Fit Green** (ok, ok-ink): the exact-fit tick, fixed whatever the tile color.
- **Caution Amber** (warn, warn-ink): cautions and invalid fields; the `-ink` variant carries text.

### Named Rules
**The One Ink Rule.** The book is printed in black plus one spot ink, the tile color. A second hue never appears in a cloud, a title or a figure; clouds own whole fields at page scale and are never scattered as accents.

**The Spot Ink Floor Rule.** Clouds print in `--spot-ink`, never in `--filament` directly: its 0.62 lightness floor is what keeps display type and plate numbers legible on a black tile's cloud.

**The Cloud Ceiling Rule.** Measured on a black tile's cloud, where the spot ink bottoms out: Ink 3 text stands on 12% of a cloud at most (4.55:1), Ink 2 on 26% (4.89:1), and Ink on any strength the book prints (5.89:1 at 80%). A working page's head cloud peaks at 12%. The home page's denser clouds (42% to 80% at their core) lie behind display type, the wall, the kit's pieces or empty stock, and every line of Archivo beside them stands on their fringe.

**The One Accent Rule.** The accent means action, selection or focus, and one accent-filled primary button per screen. Its only other use is the home page's plate numbers, the plate's mark. It is never a status color.

**The Contrast Floor Rule.** The accent follows the tile, but no tile may drag it under 6.5:1 on the panel. Never hard-code the default green: read `--accent` and let `accentPalette` decide.

**The Espresso Is Ink, Not A Surface Rule.** The espresso no longer floors a bar: it is what the mark's plate, the tooltip and a selected pill-group segment are printed in, and nothing else. The accent is still illegal on it (2.3:1 at most, whatever the tile), so anything that does sit on espresso focuses and selects in Bar Cream.

**The Mark's Own Floor Rule.** The mark wears the tile color, never the accent, and keeps its own floor of 2.5:1 on the espresso bar: the tile color itself when it reaches that, otherwise the darkest color of its hue that does, capped at OKLCH lightness 0.93. The cut pieces sit one step (0.14) lighter at 80% of the chroma, or one step darker at 90% on a tile paler than 0.78.

**The Red Means Cut Rule.** On the working surfaces red is reserved for cut pieces and what is wrong, never an action or a brand color. The home page scopes `--cut` and `--cut-soft` to the accent, so its plates print their cut pieces and cut marks in the one spot ink and the hatching alone says "cut".

## Typography

**Display Font:** Basteleur (Velvetyne, OFL; one face, declared at 400, with ui-serif, Georgia fallback)
**Body Font:** Archivo Variable (with Archivo, ui-sans-serif, system-ui)
**Label/Mono Font:** Archivo, with tabular figures

**Character:** A swash-cut catalogue face for the titles of the book and a plain grotesque for everything read or operated. Both are self-hosted and preloaded; Basteleur ships unmodified (its OFL reserves the name, so it is never subset or renamed).

### Hierarchy
- **Display** (Basteleur, clamp 2.5 to 3.5 rem, line-height 1.04; 3 rem on short laptop screens): the title page's headline, the page's LCP element and never animated. One size throughout, on a 9.5 em measure with `text-wrap: pretty`, so the swash runs down four short lines with a ragged right edge ("Design / 3D-printed tiles / that fit your / wall exactly"); "Design" keeps a line of its own at every width.
- **Colophon** (Basteleur, clamp 2.75 to 5.5 rem, line-height 1): the home page's closing sentence and the largest type in the book, its second sentence on its own line in Ink 2.
- **Plate Number** (Basteleur, clamp 2.5 to 3.75 rem, tabular, accent): the number in a plate head's margin, sharing its cap line with the plate heading.
- **Headline** (Basteleur, clamp 2 to 3.125 rem, line-height 1.02): a plate's heading.
- **Page Title** (Basteleur, clamp 2.25 to 3.25 rem, line-height 1.02): the download, fit test and history titles.
- **Title** (Basteleur, clamp 1.5 to 1.875 rem, line-height 1.08): section heads on the working pages ("Before you print", "Putting it up") and the home page's sub-heads; the drawing and dialog titles sit at 1.5 to 2 rem.
- **Step Title** (Basteleur, 1.375 rem, line-height 1.1): the studio's seven steps, read as the chapter heads of the rail.
- **Plate Caption** (Basteleur, clamp 1.25 to 1.625 rem): the name under the frontispiece ("Wavy in Green") and the other captions of the book.
- **Wordmark** (Basteleur, 1.4375 rem, line-height 1): "Tessera" in the bar, centred on the mark rather than on its baseline.
- **Body Lead** (Archivo 400, 1 rem, line-height 1.55, 36 to 54ch): supporting paragraphs and a plate's argument.
- **Body** (Archivo 400, 0.875 rem, line-height 1.45): the default everywhere.
- **Figure** (Archivo 650, 1.1875 rem, tabular): the number in a measurement field. The fit sentence under the fields is Archivo 650 at 1 rem, tabular.
- **Label** (Archivo 600, 0.75 rem): field names, list heads, the step index and the 3D view's dimension tags, in sentence case.
- **Note** (Archivo 500, 0.6875 rem): hints and hex codes, Ink 3 or darker.

### Named Rules
**The Titles Only Rule.** Basteleur sets h1 to h3, plate numbers, plate captions and the wordmark, and nothing else. A button, a label, a field, a value, a table or a paragraph is Archivo.

**The One Weight Rule.** Basteleur has one weight, declared at 400, with `font-synthesis: none` and zero tracking (the `display` mixin). Never ask it for bold or italic; hierarchy in it comes from size alone.

**The Ragged Headline Rule.** The headline is one size on a narrow measure and is left to break where it falls: never split it into a giant first word and a smaller tail, and never balance it square.

**The Sentence Case Rule.** Labels, buttons, tabs, headings and dimension tags ("60 cm") are sentence case. The only uppercase in the system is a hex code, which reads as a code.

**The Tabular Figures Rule.** Every measurement, count and value is set with tabular figures.

## Layout

Space runs on a 4 px grid (s-1 to s-9); inside components the working steps are 8, 12 and 16 px.

**Home (the book).** An 88 rem measure with a fluid gutter (`clamp(1rem, 0.4rem + 2vw, 3rem)`), all on one continuous stock: plates are told apart by their numbers, their titles and the air between them (clamp 3 to 8 rem above each), never by a rule or a band of another paper. The **title page** is one grid: the lede column (the headline, the support line, the 54 px action) over the caption column ("Your wall" and its fields, the example walls, the fit sentence, the privacy line), beside the frontispiece, capped at 40 rem (34 rem on short laptops) so the wall reads as an object on a page. Each **plate** opens with its head: a 5 rem margin column for the plate number beside a two-column title (heading and argument); the argument drops under the heading below 60 rem and the number over it below 48 rem. The **colophon** closes the book with its sentence on the left and the largest cloud in its right half, then a footer in Ink 2 with nothing ruled over it. A cloud's box may reach the window's edge (it is spent there) but never widens the page (`overflow-x: clip`). Below 62 rem the frontispiece becomes a full-width plate between the lede and the caption.

**Studio (Operate).** Two columns under the 56 px bar: the render takes the remaining width and the rail is a fixed 33 rem panel, 16 px apart and 16 px from the window, standing on the stock. The rail's steps, parted by hairlines, scroll against a foot that never leaves (the fit strip, the one accent action, a quiet line), under a pinned step index. Below 1100 px the columns stack, the render leads, and the foot pins to the bottom of the screen.

**Working pages.** Download, fit test and history open with the Basteleur page title over a head cloud of spot ink in the top-left corner (the `head-wash` mixin); an empty page is centred on its message with no cloud. Their content is panels on the stock. Download and fit test keep a 76 rem document measure; history runs to 88 rem because it is a REGISTER, not a document: seven columns and four row actions, which at 76 rem broke onto a second line and made every row taller. Under 88 rem the two frames are identical anyway, since they share the same inset.

**The One Page Inset Rule.** Every page the reader reads keeps the same margin from the window: `--page-x` (1 to 3 rem, fluid), which is the home page's own gutter promoted to a token. The working pages take more air above the title than at their sides (`--page-top`) and close on a deeper foot (`--page-bottom`), because a display page title under a sticky running head needs room to be a title. The studio is the one exception and keeps its own 16 px: it is a tool that fills the window, not a page.

**The Cadence Rule.** A page is groups, not a list of equal blocks. Everything a page stacks sits one step apart (`--s-5`), and a section that carries a title of its own opens on a step and a half (`+--s-2`), inside a column as well as at page level. One interval repeated until every block weighs the same is the failure this rule exists to prevent.

**Breakpoints in use:** 20, 26, 30, 48, 60, 62 and 68 rem for reflow, a 50 rem max-height query for short laptops, and 1100 px for the studio. Any coarse pointer raises every target to 44 px, and every target is 24 px at a fine one too: a measurement field's input stretches to the full height of its well rather than being the 20 px of ink inside it.

**The Nothing Scrolls Sideways Rule.** No route may scroll horizontally at any width down to 20 rem (320 px), and it is measured, not assumed. The shell's grid names its column `minmax(0, 1fr)`, because an implicit `auto` column is floored by its content's min-content width and one nowrap pill deep in the studio was pushing the whole app wider than the phone. Where a row genuinely cannot fit, it gives up words rather than overflowing: below 26 rem the wordmark steps down, below 20 rem it falls back to the mark alone and the step index to its numbers, each keeping its name in the accessibility tree.

## Elevation & Depth

Depth is ink and tone first. The page is flat printed stock; clouds of ink and the air between plates carry the structure of the book and cast nothing. The working pages' panels still lift off the stock on warm shadows tinted from the espresso color, paired with a hairline, and the recessed mat does the sinking. The hero wall is the one object that stands off the page with a long shadow of its own, and the 3D view is a panel whose render carries its own light.

### Shadow Vocabulary
- **Rest** (`--shadow-sm`: `0 1px 2px rgb(46 36 27 / 0.06), 0 2px 6px -4px rgb(46 36 27 / 0.28)`): secondary buttons, the active tab, drawing mats.
- **Lift** (`--shadow-md`: `0 1px 2px rgb(46 36 27 / 0.05), 0 12px 28px -22px rgb(46 36 27 / 0.5)`): the studio rail, the 3D view's frame, cards, popovers, tooltips, toasts.
- **Stage tool** (`0 2px 8px rgb(46 36 27 / 0.08)` over 88% panel with a 6 px backdrop blur): controls resting on the 3D render.
- **Dialog** (`0 24px 60px -28px rgb(46 36 27 / 0.7)` over a 45% espresso scrim).
- **Primary glow** (an inner 25% white top line and `0 10px 20px -12px` of the accent at 90%): the accent button only.
- **Standing object** (three layers down to `0 60px 90px -50px rgb(46 36 27 / 0.62)`): the hero wall.

### Named Rules
**The Printed Page Rule.** The page itself is never lit: no light pools, glows or vignettes on the stock, and no lamp on the 3D view's frame. Color on the page is ink, laid as a grained cloud; only rendered objects (the tiles in the 3D view, the relief chips, the hero wall) carry light.

**The Spent Edge Rule.** Every impression of the ink is an ellipse that is spent to nothing before every edge of its own box (the `ink-shape` mixin: `closest-side` measured from its core, flat through `$flat` of its radius, 45% of its peak most of the way out, gone at the edge), so no box, window or neighbour can ever cut it square. Place and size the box; never mask an impression with a straight edge or print a solid block of ink behind an object.

**The Arc Rule.** The book's figure is an ARC: a crescent, THIN against its own span, hollow through its middle, heavy at its head and dissolving at its tail, struck across a plate. A crest is about a third of the path's radius and the span runs 150 degrees or more, because a short fat arc closes back into the oval it was built from. It is built by MULTIPLYING one oval, never by a second effect: `ink-arc` walks crests (`ink-crest`) along an elliptical path and the mask unions them, so the crests' own edges vanish and what is left is the arc and its hollow. Vary the path, the span and the taper; a single round impression is reserved for ink that SURROUNDS something (the frontispiece's halo, a working page's head), and anywhere the ink is a field, a lone ellipse is the failure mode, not the shape.

**The Dither Rule.** A figure is printed THROUGH the stipple: `--dither`, a near-binary noise coarse enough to read as dots at 1x, is the first mask layer and is intersected with the figure, so the ink is laid as grain and its fall-off dissolves into it instead of airbrushing out. A dithered figure carries no `--grain-ink` over it (the dither is the texture, and the two together only muddy each other), and it needs about double the peak of a smooth wash, because the stipple leaves roughly half the ground covered.

**The Spent Crest Rule.** Every crest is spent inside its own box: its rx may not pass its centre's distance to the left or right edge, nor its ry the distance to the top or bottom (`ink-arc` clamps each crest to exactly that). A crest centred one radius in touches that edge and is spent there, which is how an arc reaches the window without being cut. Never rotate a box to fake a diagonal: each plate is its own stacking context, so a turned box spills its corners over the plate before it.

**The Ceiling Is Measured on the Built Page Rule.** Crests union rather than sum, and the dither then halves what they reach, so a plate's ceiling cannot be read off `$peak`. Measure the rendered page: the arcs are laid so their heads fall behind display type or an opaque object, and small text stands where the arc is already dissolving.

**The Warm Shadow Rule.** Every shadow is tinted from the espresso bar. A neutral grey or black shadow is off-system.

**The Well Needs a Panel Rule.** The recessed mat reads only on a panel: a well sits inside a panel, and anything standing on the stock is a panel with a hairline.

**The One Lamp Rule.** Rendered objects are lit from the upper left: the 3D studio lamp, the relief chips' hillshade (azimuth 135, elevation 26) and the hero wall's face light and shadow. A new rendered surface takes the same corner.

## Shapes

Two families, split by what a thing is. **Drawn marks are square or have no edge at all:** the small wall glyphs under the example walls (2 px), the caption and key swatches under the frontispiece and the kit's chips (3 px), and the clouds, which have no edge to shape. **Pressed and mounted things are round:** 11 px (sm) for fields, chips, choice tiles and pill-group tracks; 14 px (md) for buttons, lids, wells, popovers and the hero wall; 22 px (lg) for panels, cards, dialogs, the mats a drawing is mounted on and the 3D view's frame; 8 px for controls nested in a track; full pills or circles for step numbers, the step index, badges and switches. The 3D canvas takes its host's corners by `clip-path: inset(0 round var(--view-radius))` on its own box (the host sets `--view-radius`, 21 px inside a 22 px frame), because a composited canvas can escape a rounded overflow. Borders are 1 px hairlines. The focus ring is a 3 px accent outline drawn outside the element (inset by 3 px inside lists).

**The Render's Own Corner Rule.** The render stage is cut like the panel beside it: the studio's two halves, the frame and the choices rail, carry the same 22 px, and the tools resting on the render and the caption under it are held in by that same radius. The frame writes it out as a literal rather than deriving it, because a token that resolves to an invalid value squares a frame silently and `var(--x, fallback)` does not catch it.

**The Mounted Mat Rule.** A drawing large enough to be a plate of its own (section 01's three steps, section 04's four systems, the download page's guide) is mounted on a panel and takes the panel's corner (the user's call, 2026-09-28). Only a small drawn glyph inside a control stays square.

## Components

### Plate head (signature)
The opening of every plate and every working page, with no rule over it.
- **Home plates:** the plate number in the margin in Basteleur and the accent, the heading beside it, the argument in Archivo Ink 2 in a second column; the air above the plate is what parts it from the one before. A plate without a number drops the margin column.
- **Working pages:** a Basteleur page title over a `head-wash` cloud (12% at its core, top-left, in a box up to 56 by 22 rem and spent before every edge of it).

### Ink impressions and the ink pass (signature)
- **Impression:** the spot ink grained with `--grain-ink`, shaped by `ink-shape($peak, $size, $at, $flat, $ink)` (see The Spent Edge Rule); `ink-cloud($peak, $ink)` is its round case, and `head-wash` the faint one at the head of a working page. Hidden under forced colors; printed at full strength on paper.
- **The home page strikes a different arc on every plate**, and never the same sweep twice running. The strengths below are per crest, before the union and the dither:
  - **Title page:** a quarter-arc sweeping up from the left margin, heavy behind the headline and dissolving away over the wall (85%). On a narrow screen the box becomes a band the width of the page and the sweep runs across it.
  - **Frontispiece:** the one round halo, filling a box wider than the wall on every side and kept within the window (92%).
  - **Plate 01, the cuts:** a BOWL swung under the corner proof and up into the open half of the plate, weakest where the opaque proof stands, because this plate is about a pattern carrying on across a joint (62%).
  - **Plate 02, the patterns:** the arc stood on its end, a crescent bowing out into the right margin and back (42%).
  - **Plate 03, the zip:** a wide BOWL the kit is laid in, its ends rising clear of the pieces at either side and its belly running behind them (88%).
  - **Plate 04, the fixings:** a CAP struck over the foot of the plate, the last of the ink arching away under the closing notes (48%, the lowest in the book, because Ink 2 stands on it).
  - **Colophon:** the only ink pulled TWICE, a full arch across the right half (95%, paling toward white at its fringe) with the same arc struck again inside it and off register (50%). The questions carry none.
- **The colour settle:** `--filament` is registered (`@property`, `<color>`) and transitioned on the root over 1.5 × `--t-med` on the in-out ease, so a colour pick PRINTS the whole book across to the new ink instead of swapping it between frames. The accent, rewritten by the same pick, stays instant on purpose: an action must not look as though it is still deciding. Reduced motion zeroes `--t-med`, so there the page reprints at once.
- **The ink pass:** an impression rests off register at 35% opacity and lands in register at full strength when its plate is reached (opacity over 900 ms, position over 1300 ms, ease-out). `--register` is set beside each shape, so no two plates are pulled off the same way and the colophon's pair closes up from opposite sides. The title page prints its own once on load (the `ink-pass` keyframes, 1300 ms after 250 ms). A pass that never runs leaves a paler impression, never missing content; reduced motion sees them already printed. A color pick reprints every one at once.

### Plate caption
The way the book captions a figure, set apart by its own space: the name in Basteleur, the counts in Archivo Ink 2 set to the right-hand edge, and under it an index line of quiet Archivo keys, each with a 3 px chip of the color it would paint; the chosen key rings its chip in the accent over a stock gap.

### Buttons
Tactile plates with a hierarchy of one.
- **Shape:** gently rounded (14 px; 11 px at the small size).
- **Primary:** accent fill, Panel Mat lettering at 650, a faint inner top highlight and the accent glow beneath. 32, 40 and 54 px tall; the 54 px size (700 weight, 17 px text) is reserved for the action that closes a screen ("Open this wall in the studio", "Get my files", "Download everything").
- **Hover / Press:** accent-hover, then accent-press with a 1 px press down, 140 ms on the out ease.
- **Secondary:** a panel plate with a hairline and the Rest shadow; hover warms the fill (#FBF5EA) and steps the hairline to Hairline Strong, press drops to the recessed mat.
- **Ghost:** accent words underlined at 1.5 px, the soft tint on hover.
- **Quiet link (on the stock):** Ink 2 Archivo with an underline at 30% ink, full ink on hover.
- **Disabled:** recessed fill, hairline, Ink 3 lettering, no shadow.

### Pill groups (segmented choices)
- **Style:** a recessed track (11 px, 3 px padding, hairline) holding Ink 2 segments at 550. Inside a recessed well the track takes the panel color instead.
- **Selected:** a word choice becomes the espresso plate with Bar Cream lettering; a picture choice keeps its picture and takes an accent border, a 1 px inner accent ring and the soft fill. An unselected picture choice warms and steps its hairline to Hairline Strong on hover.

### Color swatches and relief samples
- **Swatches:** 44 px, 12 px radius, lit with an inner hairline and a domed highlight. Selected takes an espresso ring held off by the panel color, never the accent.
- **Relief samples:** small printed tiles (10 px radius, a light shadow that lifts on hover); selected takes an accent ring held off by the panel color. Neither is captioned: the name lives in the heading and the accessible name.

### Measurement fields
- **Style:** a 48 px panel well with a hairline, the Label above, the figure in 650 tabular, the unit in Ink 3 and two small steppers (8 px radius) at the end. Hover steps the hairline to Hairline Strong.
- **Focus:** on the whole well (accent border plus 1 px accent spread). **Invalid:** amber-ink border and hint. **Disabled:** the recessed mat at 70%.

### Steps and the step index
- **Step heading:** a 26 px soft-accent disc with the number in the accent at 700, the Step Title in Basteleur beside it, and the step's current value at the far end in Archivo 650, tabular.
- **Step index:** the rail's pinned first line: the seven numbers as 21 px soft-accent discs and a plan mark; only the step being read spells out its name, as a soft-accent pill with its disc filled in the accent.

### Lids (disclosures)
A full-width 52 px lid (14 px, hairline, Bar Cream face) with a quarter-turn chevron, the label at 650, a one-line description in Ink 3, and a pill badge that always says what is behind it ("All standard", a changed count, a profile name). Under the hand it sinks to the recessed mat and its hairline steps to Hairline Strong.

### Questions
The home page's accordion: two columns of questions, each a bold Archivo line (1 rem, 650) with its own chevron, parted from the next by air, never by a divider.

### Wells
- **"What changes" well:** a recessed 14 px well with 16 px padding; its parts set apart by space, never a hairline.
- **Fit strip:** in the rail's foot, washed in the tile color at 8%, with the fit-green tick and the sentence of counts.

### Cards, drawings and floating surfaces
- **Panel card:** panel fill, hairline, 22 px, Lift shadow.
- **Render view:** the 3D view's frame is a 22 px panel of Stage Plate with a hairline and the Lift shadow and nothing lit on it; everything resting on it (the view pills, the material pill, the cut legend, the colour slip on the download page) is held in by that radius so the curve passes outside it. Its corner is made FOUR ways, because a hardware-accelerated Firefox paints a composited canvas straight through a clip and no headless browser reproduces it: the host clips; the canvas clips its own layer; the canvas carries the same shape again as a `mask` (`rounded-mask`), which a compositor cannot reduce to a bounding rectangle the way it can a clip; and last the `corner-mat` on the FRAME paints four quarter-discs over the corners, which clips nothing at all and sits in the frame's own stacking context, so it paints after the whole subtree the canvas lives in. The mat is filled with the PAGE's stock, never the plate: the canvas clears to the plate colour, so a notch painted in that leaves the corner exactly as square as it was. The two frames also write their radius out as a literal rather than deriving it, because `var(--x, fallback)` gives no protection when `--x` is defined but invalid, and a frame that silently squares is the failure this corner keeps having. Its dimension tags read as typed ("60 cm"): Archivo 600 at 0.75 rem, the unit in Ink 2 at 0.6875 rem, knocked out of the leader line. The view's own chrome is the system's: a Basteleur title and a secondary button on the WebGL notice, and the cut legend as a sentence-case panel chip with a hatched swatch.
- **Drawing mat:** a drawn figure that is a plate of its own (the section drawings, the fixing figures) is mounted, so its mat is a 22 px panel with the Rest shadow, and its title is Basteleur. A drawn glyph inside a control (the example walls' outlines) stays square at 2 px.
- **Paper slip:** popovers, menus and toasts at 14 px with the Lift shadow, entering with a short settle from a legible start, no animation under reduced motion.
- **Tooltip:** a small espresso plate with Bar Cream text.
- **Dialog:** a 22 px panel up to 46 rem wide over an espresso scrim, its title in Basteleur at 1.5 rem, its head ruled off by a hairline.

### Navigation (the app bar)
- **Style:** the RUNNING HEAD printed at the top of the sheet. There is no dark slab: the 56 px bar is the same grained stock as everything under it, so the whole site is one continuous page and the tile's colour is the only colour on it. The identity is a printed LABEL instead: the mark on its own 30 px espresso plate (the same plate the tab icon wears, which is why the mark's contrast floor did not have to move) beside the wordmark in Basteleur and full ink. Then the design's name edited in place, the Studio and History tabs, and undo, redo and the shortcut key.
- **Position:** sticky at the top of every route, above the page and above any ink a plate prints near its own top edge. The shell's first grid row is a fixed `--header-h` and the bar spans both rows, because a sticky grid item can only travel inside its own grid area. Nothing is ruled across it: at the top of a page it casts NOTHING and is seamless with the sheet, and it lifts onto its warm shadow only once the page is moving under it (`data-lifted`, written onto the node from a rAF-throttled passive listener, so a scroll never costs a render).
- **States:** the tabs stand on the binding with no track behind them (a translucent slab on an already dark bar only muddies it): quiet items in a muted cream, lifting to Bar Cream on a 10% cream wash, and the tab you are on inverts to a Bar Cream plate with espresso lettering and a hairline of its own light along its top. Focus on the bar is Bar Cream.

### The mark and the tab icon
The corner of a wall as the default layout sets it out, drawn flat from one geometry (`src/app/mark.ts`): one whole tile at the top left in Mark, the three pieces its wall cuts in Mark Cut, each with rounded corners along the joints (4 of 32) and square only where the wall's edge cut it. No relief, bevel or shadow. 24 px in the bar, 8 px before the wordmark; the tab icon sets it on a 32-unit espresso plate (7 radius).

### The frontispiece (the hero wall)
The visitor's own wall, built from CPU-rendered relief chips with no 3D engine on the page, standing in its own cloud of spot ink and captioned as a plate. It is a lit object on a printed page: a face light from the upper left, a raking sheen, 1 px joints in a deep tone of the tile's color, the Standing object shadow, and a lay-in wave from the setting-out corner on arrival (skipped under reduced motion). A small resting turn (`rotateY(-4deg)` at 2400 px perspective) that the pointer and the scroll add to, damped at 520 ms, and dropped entirely under reduced motion.

## Do's and Don'ts

### Do:
- **Do** paint every stock surface with its grain (the `stock` mixin), never flat `--ground`.
- **Do** print every cloud in `--spot-ink` through the `ink-cloud` mixin (or `head-wash` at the head of a working page): size and place its box and let the cloud spend itself before every edge.
- **Do** hold Ink 3 text to 12% of a cloud and Ink 2 to 26%, and keep Archivo on a denser cloud's fringe.
- **Do** part plates and page heads by number, title and air, and keep the hairline for borders and for rows in a table, a list or the studio rail.
- **Do** step a bordered control's hairline to Hairline Strong (`--rule-strong`) on hover.
- **Do** keep Basteleur to titles at its one declared weight, and set every other word in Archivo.
- **Do** make small drawn glyphs and swatches square (2 to 3 px) and everything pressed or mounted round (11, 14, 22 px, 8 px nested, pills).
- **Do** set the 3D render on the Stage Plate (`--stage-plate`, the same value `LOOK.palette.sheet` renders) and clip its canvas to its host's corners through `--view-radius`.
- **Do** read `--accent` and its companions for action, selection and focus, and keep one accent-filled primary button per screen.
- **Do** set every measurement and count in tabular figures, and every label in sentence case.
- **Do** give every target 24 px, and 44 px under a coarse pointer.
- **Do** start every entrance from a legible state (a cloud from 35% off register, never from nothing) and collapse motion under reduced motion.
- **Do** redraw every color-carried state under forced colors, and drop the clouds there.

### Don't:
- **Don't** print a second hue: no multi-color gradients, no clouds in anything but the spot ink, no colored body text.
- **Don't** draw a decorative rule: no rule over a plate or a page head, a caption, the colophon or the footer, and no divider between questions.
- **Don't** cut a cloud square: no straight-edged mask, no solid block of ink behind an object.
- **Don't** give a plate a lone ellipse of ink. A field of ink is a ridge of crests with a wavy edge; the single round impression belongs to a halo around an object and to a working page's head, and nowhere else.
- **Don't** light the page: no light pools, glows or vignettes on the stock and no lamp on the view frame; light belongs to rendered objects.
- **Don't** set Basteleur in bold, italic or synthesized weights, or use it for a button, a label, a value or a paragraph.
- **Don't** split the headline into sizes or balance it square.
- **Don't** bring back the drafting sheet: a 2 px ink frame round the page, lettered or numbered sheet borders, sheet feet, expanded uppercase labels, a red primary action or chalk-blue focus.
- **Don't** put the accent on espresso, or use it as a status color.
- **Don't** floor a surface in espresso. It is a plate the size of the mark, a tooltip or a selected segment, never a bar, a panel or a band.
- **Don't** draw the mark in the accent or give it relief, a bevel or a shadow.
- **Don't** use red on the working surfaces for anything but cut pieces and what is wrong.
- **Don't** use grey or black shadows, or set a recessed well straight on the stock.
- **Don't** select a color swatch with the accent ring; it vanishes on a chip of its own hue.
- **Don't** use the retired alias tokens (`--sheet`, `--desk`, `--chalk`, `--pencil`, `--red` and friends) in new code.
