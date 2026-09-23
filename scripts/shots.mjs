// The capture harness: every screenshot and browser check in this project runs through here, which is
// why playwright is a devDependency. Component behavior is checked in a real browser rather than in
// jsdom (see CLAUDE.md, "Testing policy"), so this is the second gate after vitest.
//
//   npm run dev                     # in another terminal
//   npm run shots                   # all five routes, desktop and mobile, into test-output/shots
//   npm run shots -- --og           # regenerate public/og-cover.png (the 1200x630 share card)
//   npm run shots -- --icons        # regenerate public/apple-touch-icon.png from public/favicon.svg
//   npm run shots -- --motion       # the same ten route shots with motion left on, into shots-motion
//   npm run shots -- --url http://localhost:4173   # point at `npm run preview` instead
import { mkdir, readFile } from 'node:fs/promises'
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
  ['fit-test', '/fit-test'],
  ['history', '/history'],
]
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }

// The wall is meshed in a worker and then re-laid by the stagger wave; reduced motion pins the wave at
// its end state, so this is settling time for the geometry rather than for the animation.
const SETTLE_MS = 2600

// LandingMotion skips its animations on this, which is how every deterministic capture here asks for end
// states. --motion is the one run that leaves it off, so the landing's transitions are visible at all.
const STILL = '?still=1'

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
// are the same ten frames with motion left on, in their own folder, so the two sets diff against each
// other and the landing's transitions are visible at all. Reduce also zeroes --t-fast/med/slow in
// _tokens.scss, so the difference is real even where the motion is pure CSS.
async function captureMotion(browser) {
  const context = await browser.newContext({ reducedMotion: 'no-preference', colorScheme: 'light', deviceScaleFactor: 1 })
  await captureRoutes(context, { dir: `${outDir}-motion`, still: false })
  await context.close()
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
const asked = ['icons', 'og', 'motion'].filter(has)
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
  // --motion needs a reduced-motion setting of its own, so it opens its own context: everything else
  // shoots under reduce for determinism, and this one under no-preference to catch the transitions.
  if (has('motion')) await captureMotion(browser)
  if (asked.length === 0) await captureRoutes(context)
} finally {
  await browser.close()
}
