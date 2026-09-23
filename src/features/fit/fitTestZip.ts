// The fit test's own download: one zip holding every part of the test at its root, plus the README that
// says how to read it. Built here rather than in the worker on purpose: the worker's zip always adds the
// wall's setting-out plan and a README describing tiles this download does not hold, and protocol.ts is a
// read-only contract. Eight separate downloads were the alternative, which Chrome answers with a
// permission bar and Safari by dropping all but the first.
//
// Pure, so the entries and the name are tested without a DOM, and it names no mesher: the part meshes
// arrive already written, as the worker's own ExportedFiles.
import { README_FILE, slug } from '@/core/export/filenames'
import { buildFitTestReadme } from '@/core/export/readme'
import { zipFiles } from '@/core/export/zip'
import type { AccessorySpec } from '@/core/fixing/types'
import type { DesignConfig, ExportFormat } from '@/core/types'

/** One file the worker has written: an ExportedFile narrowed to what a zip entry needs. */
export interface WrittenFile {
  /** The part's file name, with no folder: accessoryFileName, so there is no second naming rule. */
  name: string
  data: Uint8Array
}

export interface FitTestBundle {
  name: string
  data: Uint8Array
}

/**
 * The fit test as one file: the written parts flat at the root (the zip *is* the fit test, so no part needs
 * a folder to say what it belongs to), then README.txt. Named like the wall's own zip, so two zips of one
 * design sort together and never collide.
 */
export function fitTestZip(
  config: DesignConfig,
  parts: readonly AccessorySpec[],
  files: readonly WrittenFile[],
  format: ExportFormat,
): FitTestBundle {
  const data = zipFiles([
    ...files.map((file) => ({ name: file.name, data: file.data })),
    { name: README_FILE, data: new TextEncoder().encode(buildFitTestReadme(config, parts, format)) },
  ])
  return { name: `${slug(config.name) || 'tessera'}-fit-test-${format}.zip`, data }
}
