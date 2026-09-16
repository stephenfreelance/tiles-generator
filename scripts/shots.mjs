// The capture harness: every screenshot and browser check in this project runs through here, which is
// why playwright is a devDependency. Component behavior is checked in a real browser rather than in
// jsdom (see CLAUDE.md, "Testing policy"), so this is the second gate after vitest.
//
//   npm run dev                     # in another terminal
//   npm run shots                   # all four routes, desktop and mobile, into test-output/shots
//   npm run shots -- --og           # regenerate public/og-cover.png (the 1200x630 share card)
//   npm run shots -- --icons        # regenerate public/apple-touch-icon.png from public/favicon.svg
//   npm run shots -- --hero-poster  # regenerate public/hero-poster.webp from the live board
//   npm run shots -- --motion       # the same eight route shots with motion left on, into shots-motion
//   npm run shots -- --url http://localhost:4173   # point at `npm run preview` instead
import { mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const has = (name) => args.includes(`--${name}`)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 || i + 1 >= args.length ? fallback : args[i + 1]
}

const baseUrl = flag('url', 'http://localhost:5184').replace(/\/$/, '')
const outDir = path.resolve(root, flag('out', 'test-output/shots'))

const ROUTES = [
  ['landing', '/'],
  ['studio', '/studio'],
  ['download', '/download'],
  ['history', '/history'],
]
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }

// The wall is meshed in a worker and then re-laid by the stagger wave; reduced motion pins the wave at
// its end state, so this is settling time for the geometry rather than for the animation.
const SETTLE_MS = 2600

// The hero poster is captured at scale 2 from a board pinned to 640x440 CSS px, which is the board's own
// 16/11: the render frames on the aspect ratio, not the pixel size, so pinning the width costs nothing
// and is the only way to land on exactly 1280x880 whatever the hero column happens to be doing.
// Quality 72 is where a wall of relief still holds its shading and the file clears the budget; at 80
// the same board weighs 51 kB, which is more than the poster is worth against the render it stands in for.
const POSTER = { cssWidth: 640, cssHeight: 440, scale: 2, quality: 72, budgetBytes: 45 * 1024 }
// public/, not an import: the landing preloads this from index.html, which can only name a stable path.
const POSTER_FILE = 'public/hero-poster.webp'
// LandingMotion skips its animations on this, which is how every deterministic capture here asks for end
// states. --motion is the one run that leaves it off, so the landing's transitions are visible at all.
const STILL = '?still=1'
// CSS modules keep the local name and hash the suffix (`_board_8qg4r_9`), so this is `.board` written as
// a selector the dev server and the build both answer: the token either starts the list or follows a space.
const BOARD = '[class^="_board_"], [class*=" _board_"]'
const PILL = '[class^="_pill_"], [class*=" _pill_"]'

async function newPage(context, viewport) {
  const page = await context.newPage()
  await page.setViewportSize(viewport)
  return page
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(SETTLE_MS)
}

async function captureRoutes(context, { dir = outDir, still = true } = {}) {
  await mkdir(dir, { recursive: true })
  for (const [name, route] of ROUTES) {
    for (const [size, viewport] of Object.entries(VIEWPORTS)) {
      const page = await newPage(context, viewport)
      await page.goto(`${baseUrl}${route}${still ? STILL : ''}`, { waitUntil: 'domcontentloaded' })
      await settle(page)
      await page.screenshot({ path: path.join(dir, `${name}-${size}.png`) })
      await page.close()
      console.log(`shot  ${name}-${size}.png`)
    }
  }
  console.log(`\n${ROUTES.length * 2} shots in ${path.relative(root, dir)}`)
}

// Every default shot is a reduced-motion end state, which is the one state nobody needs to review. These
// are the same eight frames with motion left on, in their own folder, so the two sets diff against each
// other and the landing's transitions are visible at all. Reduce also zeroes --t-fast/med/slow in
// _tokens.scss, so the difference is real even where the motion is pure CSS.
async function captureMotion(browser) {
  const context = await browser.newContext({ reducedMotion: 'no-preference', colorScheme: 'light', deviceScaleFactor: 1 })
  await captureRoutes(context, { dir: `${outDir}-motion`, still: false })
  await context.close()
}

// The hero poster: the WebP in public/ that the landing paints, and preloads, while the canvas chunk is
// still downloading. It has to be the live render or the crossfade to the real board jumps, so it is
// captured from the running app rather than drawn by hand. Regenerate it whenever the board's look, wall
// or default sample moves.
async function captureHeroPoster(browser) {
  // Reduce, deliberately: it pins the cinematic rig at the framing the camera also starts every live
  // session on (CinematicRig's sway returns early under it), so the poster and the canvas that fades in
  // over it are shot from the same place. On no-preference the sway has crept several degrees by the
  // time the wall has meshed and settled, and the crossfade visibly swings the wall. Scale 2 for 2x screens.
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    colorScheme: 'light',
    deviceScaleFactor: POSTER.scale,
  })
  // Tall and wide enough to hold the whole board at scroll 0: the clip below and boundingBox() only
  // agree while the page has not scrolled, and nothing here scrolls it.
  const viewport = { width: 1600, height: 1200 }
  const page = await newPage(context, viewport)
  await page.goto(`${baseUrl}/${STILL}`, { waitUntil: 'domcontentloaded' })
  // The pill is live DOM on top of the poster, so baking a second one into it would double the label
  // (and freeze it on the first sample). Hidden, not removed: it must keep its box or the board reflows.
  await page.addStyleTag({
    content: `${BOARD} { width: ${POSTER.cssWidth}px !important; max-width: none !important; }
      ${PILL} { visibility: hidden !important; }`,
  })
  const board = page.locator(BOARD).first()
  await board.waitFor()
  // The canvas is lazy, so wait for it to mount before waiting for its [data-pending] to clear, or the
  // second wait passes on an attribute that was never there. The settle then covers the worker's last
  // mesh and the poster's own 260 ms crossfade out: capture too early and the shot is the old poster.
  await page.waitForSelector('canvas', { timeout: 30_000 })
  await page.waitForSelector('[data-pending]', { state: 'detached', timeout: 60_000 })
  await settle(page)

  const box = await board.boundingBox()
  if (!box) throw new Error('The hero board has no box: check the selector against HeroStage.module.scss.')
  // Rounded and centered rather than taken from the box directly: a fractional origin would round the
  // capture to 1281 px wide, and the poster's intrinsic size is declared in the markup.
  const clip = {
    x: Math.round(box.x + (box.width - POSTER.cssWidth) / 2),
    y: Math.round(box.y + (box.height - POSTER.cssHeight) / 2),
    width: POSTER.cssWidth,
    height: POSTER.cssHeight,
  }
  // The crop is what gets photographed, so the guard is on its own edges rather than on the board's
  // origin: a board taller than the poster pushes the bottom of the crop down, and anything past the
  // viewport comes back as flat white with no other warning.
  if (clip.x < 0 || clip.y < 0 || clip.x + clip.width > viewport.width || clip.y + clip.height > viewport.height) {
    throw new Error(
      `The crop runs ${clip.x},${clip.y} to ${clip.x + clip.width},${clip.y + clip.height}, outside this ` +
        `${viewport.width}x${viewport.height} viewport: raise the viewport and shoot again.`,
    )
  }
  const file = path.join(root, POSTER_FILE)
  await page.screenshot({ path: file, type: 'webp', quality: POSTER.quality, clip })
  await page.close()
  await context.close()

  const { size } = await stat(file)
  const px = `${POSTER.cssWidth * POSTER.scale}x${POSTER.cssHeight * POSTER.scale}`
  console.log(`shot  ${POSTER_FILE} (${px}, ${(size / 1024).toFixed(1)} kB)`)
  if (size > POSTER.budgetBytes) {
    console.warn(`      over the ${POSTER.budgetBytes / 1024} kB budget: lower POSTER.quality before committing it.`)
  }
}

async function captureOgCard(context) {
  // Exactly 1200x630 at scale 1: the size every social card crops to.
  const page = await newPage(context, { width: 1200, height: 630 })
  await page.goto(`${baseUrl}/${STILL}`, { waitUntil: 'domcontentloaded' })
  await settle(page)
  // The card is the hero alone: the next section starts inside the 630px frame and would be cut through.
  // Visibility, not display, so neither the hero nor its canvas reflows.
  await page.addStyleTag({ content: '#main-content section:first-of-type ~ *, footer { visibility: hidden !important; }' })
  const file = path.join(root, 'public/og-cover.png')
  await page.screenshot({ path: file })
  await page.close()
  console.log(`shot  ${path.relative(root, file)} (1200x630)`)
}

async function captureIcon(context) {
  // The touch icon is the favicon rasterized on --ground, so iOS never rounds off transparency. The
  // literal is the token's value: this page is set on its own, with none of the app's CSS behind it.
  const svg = await readFile(path.join(root, 'public/favicon.svg'), 'utf8')
  const page = await newPage(context, { width: 180, height: 180 })
  await page.setContent(
    `<style>html,body{margin:0;background:#f2eadc}svg{display:block;width:180px;height:180px}</style>${svg}`,
  )
  const file = path.join(root, 'public/apple-touch-icon.png')
  await page.screenshot({ path: file })
  await page.close()
  console.log(`shot  ${path.relative(root, file)} (180x180)`)
}

async function serverIsUp() {
  try {
    const response = await fetch(`${baseUrl}/`)
    return response.ok
  } catch {
    return false
  }
}

// With no flag at all the harness shoots the routes; otherwise it does only what was asked for. --icons
// is the one capture that runs offline, since it rasterizes public/favicon.svg with no app behind it.
const asked = ['icons', 'og', 'hero-poster', 'motion'].filter(has)
const needsServer = asked.length === 0 || asked.some((name) => name !== 'icons')
if (needsServer && !(await serverIsUp())) {
  console.error(`No dev server at ${baseUrl}. Start one with \`npm run dev\`, or pass --url.`)
  process.exit(1)
}

const browser = await chromium.launch()
// Reduced motion keeps captures deterministic; the light theme is the only theme Tessera has.
const context = await browser.newContext({ reducedMotion: 'reduce', colorScheme: 'light', deviceScaleFactor: 1 })
try {
  if (has('icons')) await captureIcon(context)
  if (has('og')) await captureOgCard(context)
  // Each of these needs a reduced-motion setting of its own, so both open their own context: the poster
  // shoots under reduce to pin the rig, --motion shoots under no-preference to catch the transitions.
  if (has('hero-poster')) await captureHeroPoster(browser)
  if (has('motion')) await captureMotion(browser)
  if (asked.length === 0) await captureRoutes(context)
} finally {
  await browser.close()
}
