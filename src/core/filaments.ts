// Filament presets from Bambu Lab's published hex tables (store "Hex Code Table" PDFs, cross-checked
// against Bambu Studio's filaments_color_codes.json, fetched 2026-09-11). Pure white/black stay as
// published; the renderer clamps albedo so they do not clip. Secondary hexes for sparkle flakes,
// marble speckles, wood grain, galaxy shimmer and glow emission are estimates for rendering only.

export type Finish =
  | 'matte'
  | 'glossy'
  | 'silk'
  | 'metallic'
  | 'carbon'
  | 'sparkle'
  | 'marble'
  | 'galaxy'
  | 'wood'
  | 'translucent'
  | 'glow'

export interface Filament {
  id: string
  name: string
  line: string
  finish: Finish
  hex: string
  secondaryHex?: string
  popular?: boolean
  /** The hex is not published by the manufacturer. */
  estimated?: boolean
}

export const FILAMENTS: Filament[] = [
  { id: 'pla-matte-ivory-white', name: 'Ivory White', line: 'PLA Matte', finish: 'matte', hex: '#FFFFFF', popular: true },
  { id: 'pla-matte-charcoal', name: 'Charcoal', line: 'PLA Matte', finish: 'matte', hex: '#000000', popular: true },
  { id: 'pla-matte-ash-gray', name: 'Ash Gray', line: 'PLA Matte', finish: 'matte', hex: '#9B9EA0', popular: true },
  { id: 'pla-matte-nardo-gray', name: 'Nardo Gray', line: 'PLA Matte', finish: 'matte', hex: '#757575' },
  { id: 'pla-matte-bone-white', name: 'Bone White', line: 'PLA Matte', finish: 'matte', hex: '#CBC6B8' },
  { id: 'pla-matte-desert-tan', name: 'Desert Tan', line: 'PLA Matte', finish: 'matte', hex: '#E8DBB7' },
  { id: 'pla-matte-latte-brown', name: 'Latte Brown', line: 'PLA Matte', finish: 'matte', hex: '#D3B7A7' },
  { id: 'pla-matte-caramel', name: 'Caramel', line: 'PLA Matte', finish: 'matte', hex: '#AE835B' },
  { id: 'pla-matte-terracotta', name: 'Terracotta', line: 'PLA Matte', finish: 'matte', hex: '#B15533' },
  { id: 'pla-matte-dark-brown', name: 'Dark Brown', line: 'PLA Matte', finish: 'matte', hex: '#7D6556' },
  { id: 'pla-matte-dark-chocolate', name: 'Dark Chocolate', line: 'PLA Matte', finish: 'matte', hex: '#4D3324' },
  { id: 'pla-matte-sakura-pink', name: 'Sakura Pink', line: 'PLA Matte', finish: 'matte', hex: '#E8AFCF' },
  { id: 'pla-matte-lilac-purple', name: 'Lilac Purple', line: 'PLA Matte', finish: 'matte', hex: '#AE96D4' },
  { id: 'pla-matte-plum', name: 'Plum', line: 'PLA Matte', finish: 'matte', hex: '#950051' },
  { id: 'pla-matte-scarlet-red', name: 'Scarlet Red', line: 'PLA Matte', finish: 'matte', hex: '#DE4343', popular: true },
  { id: 'pla-matte-dark-red', name: 'Dark Red', line: 'PLA Matte', finish: 'matte', hex: '#BB3D43' },
  { id: 'pla-matte-mandarin-orange', name: 'Mandarin Orange', line: 'PLA Matte', finish: 'matte', hex: '#F99963', popular: true },
  { id: 'pla-matte-lemon-yellow', name: 'Lemon Yellow', line: 'PLA Matte', finish: 'matte', hex: '#F7D959' },
  { id: 'pla-matte-apple-green', name: 'Apple Green', line: 'PLA Matte', finish: 'matte', hex: '#C2E189' },
  { id: 'pla-matte-grass-green', name: 'Grass Green', line: 'PLA Matte', finish: 'matte', hex: '#61C680' },
  { id: 'pla-matte-dark-green', name: 'Dark Green', line: 'PLA Matte', finish: 'matte', hex: '#68724D' },
  { id: 'pla-matte-ice-blue', name: 'Ice Blue', line: 'PLA Matte', finish: 'matte', hex: '#A3D8E1' },
  { id: 'pla-matte-sky-blue', name: 'Sky Blue', line: 'PLA Matte', finish: 'matte', hex: '#56B7E6' },
  { id: 'pla-matte-marine-blue', name: 'Marine Blue', line: 'PLA Matte', finish: 'matte', hex: '#0078BF', popular: true },
  { id: 'pla-matte-dark-blue', name: 'Dark Blue', line: 'PLA Matte', finish: 'matte', hex: '#042F56' },
  { id: 'pla-basic-jade-white', name: 'Jade White', line: 'PLA Basic', finish: 'glossy', hex: '#FFFFFF', popular: true },
  { id: 'pla-basic-black', name: 'Black', line: 'PLA Basic', finish: 'glossy', hex: '#000000', popular: true },
  { id: 'pla-basic-gray', name: 'Gray', line: 'PLA Basic', finish: 'glossy', hex: '#8E9089', popular: true },
  { id: 'pla-basic-silver', name: 'Silver', line: 'PLA Basic', finish: 'glossy', hex: '#A6A9AA' },
  { id: 'pla-basic-blue-grey', name: 'Blue Grey', line: 'PLA Basic', finish: 'glossy', hex: '#5B6579', popular: true },
  { id: 'pla-basic-red', name: 'Red', line: 'PLA Basic', finish: 'glossy', hex: '#C12E1F', popular: true },
  { id: 'pla-basic-orange', name: 'Orange', line: 'PLA Basic', finish: 'glossy', hex: '#FF6A13', popular: true },
  { id: 'pla-basic-yellow', name: 'Yellow', line: 'PLA Basic', finish: 'glossy', hex: '#F4EE2A', popular: true },
  { id: 'pla-basic-gold', name: 'Gold', line: 'PLA Basic', finish: 'glossy', hex: '#E4BD68' },
  { id: 'pla-basic-bambu-green', name: 'Bambu Green', line: 'PLA Basic', finish: 'glossy', hex: '#00AE42', popular: true },
  { id: 'pla-basic-mistletoe-green', name: 'Mistletoe Green', line: 'PLA Basic', finish: 'glossy', hex: '#3F8E43' },
  { id: 'pla-basic-turquoise', name: 'Turquoise', line: 'PLA Basic', finish: 'glossy', hex: '#00B1B7' },
  { id: 'pla-basic-cyan', name: 'Cyan', line: 'PLA Basic', finish: 'glossy', hex: '#0086D6', popular: true },
  { id: 'pla-basic-blue', name: 'Blue', line: 'PLA Basic', finish: 'glossy', hex: '#0A2989', popular: true },
  { id: 'pla-basic-cobalt-blue', name: 'Cobalt Blue', line: 'PLA Basic', finish: 'glossy', hex: '#0056B8' },
  { id: 'pla-basic-purple', name: 'Purple', line: 'PLA Basic', finish: 'glossy', hex: '#5E43B7', popular: true },
  { id: 'pla-basic-pink', name: 'Pink', line: 'PLA Basic', finish: 'glossy', hex: '#F55A74' },
  { id: 'pla-basic-brown', name: 'Brown', line: 'PLA Basic', finish: 'glossy', hex: '#9D432C' },
  { id: 'pla-basic-cocoa-brown', name: 'Cocoa Brown', line: 'PLA Basic', finish: 'glossy', hex: '#6F5034' },
  { id: 'pla-basic-beige', name: 'Beige', line: 'PLA Basic', finish: 'glossy', hex: '#F7E6DE' },
  { id: 'pla-basic-light-gray', name: 'Light Gray', line: 'PLA Basic', finish: 'glossy', hex: '#D1D3D5' },
  { id: 'pla-basic-dark-gray', name: 'Dark Gray', line: 'PLA Basic', finish: 'glossy', hex: '#545454' },
  { id: 'pla-basic-magenta', name: 'Magenta', line: 'PLA Basic', finish: 'glossy', hex: '#EC008C' },
  { id: 'pla-basic-maroon-red', name: 'Maroon Red', line: 'PLA Basic', finish: 'glossy', hex: '#9D2235' },
  { id: 'pla-basic-sunflower-yellow', name: 'Sunflower Yellow', line: 'PLA Basic', finish: 'glossy', hex: '#FEC600' },
  { id: 'pla-basic-indigo-purple', name: 'Indigo Purple', line: 'PLA Basic', finish: 'glossy', hex: '#482960' },
  { id: 'pla-basic-bronze', name: 'Bronze', line: 'PLA Basic', finish: 'glossy', hex: '#847D48' },
  { id: 'pla-cf-matcha-green', name: 'Matcha Green', line: 'PLA-CF', finish: 'carbon', hex: '#5C9748' },
  { id: 'pla-cf-burgundy-red', name: 'Burgundy Red', line: 'PLA-CF', finish: 'carbon', hex: '#951E23' },
  { id: 'pla-cf-royal-blue', name: 'Royal Blue', line: 'PLA-CF', finish: 'carbon', hex: '#2842AD' },
  { id: 'pla-cf-jeans-blue', name: 'Jeans Blue', line: 'PLA-CF', finish: 'carbon', hex: '#6E88BC' },
  { id: 'pla-cf-lava-gray', name: 'Lava Gray', line: 'PLA-CF', finish: 'carbon', hex: '#4D5054' },
  { id: 'pla-cf-iris-purple', name: 'Iris Purple', line: 'PLA-CF', finish: 'carbon', hex: '#69398E' },
  { id: 'pla-cf-black', name: 'Black', line: 'PLA-CF', finish: 'carbon', hex: '#000000', popular: true },
  { id: 'pla-silk-plus-gold', name: 'Gold', line: 'PLA Silk+', finish: 'silk', hex: '#F4A925', popular: true },
  { id: 'pla-silk-plus-silver', name: 'Silver', line: 'PLA Silk+', finish: 'silk', hex: '#C8C8C8' },
  { id: 'pla-silk-plus-rose-gold', name: 'Rose Gold', line: 'PLA Silk+', finish: 'silk', hex: '#BA9594' },
  { id: 'pla-silk-plus-champagne', name: 'Champagne', line: 'PLA Silk+', finish: 'silk', hex: '#F3CFB2' },
  { id: 'pla-silk-plus-titan-gray', name: 'Titan Gray', line: 'PLA Silk+', finish: 'silk', hex: '#5F6367' },
  { id: 'pla-silk-plus-candy-red', name: 'Candy Red', line: 'PLA Silk+', finish: 'silk', hex: '#D02727' },
  { id: 'pla-silk-plus-mint', name: 'Mint', line: 'PLA Silk+', finish: 'silk', hex: '#96DCB9' },
  { id: 'pla-silk-plus-baby-blue', name: 'Baby Blue', line: 'PLA Silk+', finish: 'silk', hex: '#A8C6EE' },
  { id: 'pla-silk-plus-purple', name: 'Purple', line: 'PLA Silk+', finish: 'silk', hex: '#8671CB' },
  { id: 'pla-silk-multi-color-gilded-rose', name: 'Gilded Rose', line: 'PLA Silk Multi-Color', finish: 'silk', hex: '#FF9425', secondaryHex: '#C16784' },
  { id: 'pla-silk-multi-color-midnight-blaze', name: 'Midnight Blaze', line: 'PLA Silk Multi-Color', finish: 'silk', hex: '#0047BB', secondaryHex: '#7D1B49' },
  { id: 'pla-silk-multi-color-neon-city', name: 'Neon City', line: 'PLA Silk Multi-Color', finish: 'silk', hex: '#0047BB', secondaryHex: '#BB22A3' },
  { id: 'pla-silk-multi-color-blue-hawaii', name: 'Blue Hawaii', line: 'PLA Silk Multi-Color', finish: 'silk', hex: '#418FDE', secondaryHex: '#70C884' },
  { id: 'pla-silk-multi-color-velvet-eclipse', name: 'Velvet Eclipse', line: 'PLA Silk Multi-Color', finish: 'silk', hex: '#000000', secondaryHex: '#A34342' },
  { id: 'pla-silk-multi-color-mystic-magenta', name: 'Mystic Magenta', line: 'PLA Silk Multi-Color', finish: 'silk', hex: '#720062', secondaryHex: '#3A913F' },
  { id: 'pla-metal-iridium-gold-metallic', name: 'Iridium Gold Metallic', line: 'PLA Metal', finish: 'metallic', hex: '#B39B84' },
  { id: 'pla-metal-copper-brown-metallic', name: 'Copper Brown Metallic', line: 'PLA Metal', finish: 'metallic', hex: '#AA6443' },
  { id: 'pla-metal-cobalt-blue-metallic', name: 'Cobalt Blue Metallic', line: 'PLA Metal', finish: 'metallic', hex: '#39699E' },
  { id: 'pla-metal-oxide-green-metallic', name: 'Oxide Green Metallic', line: 'PLA Metal', finish: 'metallic', hex: '#1D7C6A' },
  { id: 'pla-metal-iron-gray-metallic', name: 'Iron Gray Metallic', line: 'PLA Metal', finish: 'metallic', hex: '#43403D' },
  { id: 'pla-sparkle-classic-gold-sparkle', name: 'Classic Gold Sparkle', line: 'PLA Sparkle', finish: 'sparkle', hex: '#CEA629', secondaryHex: '#FFE7A3' },
  { id: 'pla-sparkle-onyx-black-sparkle', name: 'Onyx Black Sparkle', line: 'PLA Sparkle', finish: 'sparkle', hex: '#2D2B28', secondaryHex: '#C9CBCF' },
  { id: 'pla-sparkle-alpine-green-sparkle', name: 'Alpine Green Sparkle', line: 'PLA Sparkle', finish: 'sparkle', hex: '#3F5443', secondaryHex: '#A8C9A6' },
  { id: 'pla-sparkle-crimson-red-sparkle', name: 'Crimson Red Sparkle', line: 'PLA Sparkle', finish: 'sparkle', hex: '#792B36', secondaryHex: '#E68A92' },
  { id: 'pla-sparkle-royal-purple-sparkle', name: 'Royal Purple Sparkle', line: 'PLA Sparkle', finish: 'sparkle', hex: '#483D8B', secondaryHex: '#B3A6F0' },
  { id: 'pla-marble-white-marble', name: 'White Marble', line: 'PLA Marble', finish: 'marble', hex: '#F7F3F0', secondaryHex: '#3C3B3A', popular: true },
  { id: 'pla-marble-red-granite', name: 'Red Granite', line: 'PLA Marble', finish: 'marble', hex: '#AD4E38', secondaryHex: '#231C19' },
  { id: 'pla-galaxy-nebulae', name: 'Nebulae', line: 'PLA Galaxy', finish: 'galaxy', hex: '#424379', secondaryHex: '#4FD39A' },
  { id: 'pla-galaxy-purple', name: 'Purple', line: 'PLA Galaxy', finish: 'galaxy', hex: '#594177', secondaryHex: '#5E8BFF' },
  { id: 'pla-galaxy-green', name: 'Green', line: 'PLA Galaxy', finish: 'galaxy', hex: '#3B665E', secondaryHex: '#D9B45A' },
  { id: 'pla-galaxy-brown', name: 'Brown', line: 'PLA Galaxy', finish: 'galaxy', hex: '#684A43', secondaryHex: '#D9B45A' },
  { id: 'pla-wood-white-oak', name: 'White Oak', line: 'PLA Wood', finish: 'wood', hex: '#D6CCA3', secondaryHex: '#B7A57A' },
  { id: 'pla-wood-classic-birch', name: 'Classic Birch', line: 'PLA Wood', finish: 'wood', hex: '#918669', secondaryHex: '#6F6549' },
  { id: 'pla-wood-black-walnut', name: 'Black Walnut', line: 'PLA Wood', finish: 'wood', hex: '#4F3F24', secondaryHex: '#33281A' },
  { id: 'pla-wood-rosewood', name: 'Rosewood', line: 'PLA Wood', finish: 'wood', hex: '#4C241C', secondaryHex: '#2F1611' },
  { id: 'pla-wood-clay-brown', name: 'Clay Brown', line: 'PLA Wood', finish: 'wood', hex: '#995F11', secondaryHex: '#7A4A0C' },
  { id: 'pla-translucent-teal', name: 'Teal', line: 'PLA Translucent', finish: 'translucent', hex: '#009FA1' },
  { id: 'pla-translucent-blue', name: 'Blue', line: 'PLA Translucent', finish: 'translucent', hex: '#0047BB' },
  { id: 'petg-translucent-clear', name: 'Clear', line: 'PETG Translucent', finish: 'translucent', hex: '#FFFFFF', estimated: true },
  { id: 'petg-translucent-translucent-light-blue', name: 'Translucent Light Blue', line: 'PETG Translucent', finish: 'translucent', hex: '#61B0FF' },
  { id: 'petg-translucent-translucent-teal', name: 'Translucent Teal', line: 'PETG Translucent', finish: 'translucent', hex: '#77EDD7' },
  { id: 'petg-translucent-translucent-orange', name: 'Translucent Orange', line: 'PETG Translucent', finish: 'translucent', hex: '#FF911A' },
  { id: 'petg-translucent-olive', name: 'Olive', line: 'PETG Translucent', finish: 'translucent', hex: '#748C45' },
  { id: 'pla-glow-glow-green', name: 'Glow Green', line: 'PLA Glow', finish: 'glow', hex: '#A1FFAC', secondaryHex: '#5CFF6E' },
  { id: 'pla-glow-glow-blue', name: 'Glow Blue', line: 'PLA Glow', finish: 'glow', hex: '#7AC0E9', secondaryHex: '#38B6FF' },
]

export const FILAMENT_LINES: string[] = [...new Set(FILAMENTS.map((f) => f.line))]

/** Density in g/cm³ used for weight estimates. */
export function densityOf(filament: Filament): number {
  if (filament.line.startsWith('PETG')) return 1.27
  if (filament.line === 'PLA-CF') return 1.22
  if (filament.line === 'PLA Wood') return 1.21
  return 1.24
}

export const FINISH_LABEL: Record<Finish, string> = {
  matte: 'Matte',
  glossy: 'Semi-gloss',
  silk: 'Silk',
  metallic: 'Metallic',
  carbon: 'Carbon fiber',
  sparkle: 'Sparkle',
  marble: 'Stone',
  galaxy: 'Galaxy',
  wood: 'Wood',
  translucent: 'Translucent',
  glow: 'Glow in the dark',
}

const byId = new Map(FILAMENTS.map((f) => [f.id, f]))

export const DEFAULT_FILAMENT_ID = 'pla-cf-matcha-green'

export function filamentById(id: string): Filament {
  return byId.get(id) ?? (byId.get(DEFAULT_FILAMENT_ID) as Filament)
}
