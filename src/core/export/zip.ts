import { zipSync } from 'fflate'

/** Already-compressed payloads gain nothing from deflate and cost time. */
const STORED = /\.(png|webp|jpg|jpeg|zip|gz)$/i

/** One zip of the export. Synchronous on purpose: it runs in the geometry worker. */
export function zipFiles(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {}
  for (const file of files) {
    let name = file.name
    if (entries[name]) {
      const dot = name.lastIndexOf('.')
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      let n = 2
      while (entries[`${stem}-${n}${ext}`]) n++
      name = `${stem}-${n}${ext}`
    }
    entries[name] = [file.data, { level: STORED.test(name) ? 0 : 6 }]
  }
  return zipSync(entries, { level: 6 })
}
