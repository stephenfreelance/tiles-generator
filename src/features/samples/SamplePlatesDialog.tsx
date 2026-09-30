// "Sample plates": what to print (every relief, or the maker's own alone), the printer, the plates it takes
// drawn with every sample's own relief, and one download. Opened from the studio's texture step, where a
// relief is chosen and every relief is the useful answer, and from the download page's "Test first", where a
// wall is about to be printed and the maker's own relief is. The printer picked here is the dialog's own: the
// design keeps the one set in Advanced, because a sample plate must never re-lay the wall.
import { useEffect, useMemo, useState } from 'react'
import { Download, X } from 'lucide-react'
import { track, trackDownloadFailure } from '@/app/analytics'
import { sizeText } from '@/core/export/filenames'
import { PRINTERS, printerById } from '@/core/printers'
import { TEXTURES, textureById } from '@/core/textures/registry'
import type { DesignConfig } from '@/core/types'
import { formatBytes, formatGrams } from '@/features/export/sizes'
import { downloadBlob, useTextureChips, type ChipItem } from '@/hooks'
import { announce, Button, Dialog, NumberField, ProgressBar, Segmented, Select, toast } from '@/ui'
import {
  plateLegend,
  SAMPLE_MM,
  samplePlates,
  samplePlatesBytes,
  samplePlatesGrams,
  sampleSet,
  type PlacedSample,
  type PlateSize,
  type SamplePlates,
  type SampleScope,
} from './samplePlates'
import { useSamplePlatesDownload } from './useSamplePlatesDownload'
import styles from './SamplePlatesDialog.module.scss'

const CUSTOM = 'custom'
/** A plate any printer could have, mm: the smallest takes one sample with its margins. */
const PLATE_RANGE = { min: 55, max: 1000 }
/** Plates drawn in full; the rest are counted, since they only repeat the grid. */
const PLATES_SHOWN = 3
/** Chip pixels: over twice the drawn size of a sample, so the relief stays crisp on a dense screen. */
const CHIP_PX = 96

const BRANDS = [...new Set(PRINTERS.map((printer) => printer.brand))]

const PRINTER_GROUPS = [
  ...BRANDS.map((brand) => ({
    label: brand,
    options: PRINTERS.filter((printer) => printer.brand === brand).map((printer) => ({
      value: printer.id,
      label: printer.name,
      detail: `${printer.width} × ${printer.depth} mm`,
    })),
  })),
  { label: 'Any other printer', options: [{ value: CUSTOM, label: 'Custom plate size', detail: 'Enter its size' }] },
]

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

const chipKey = (sample: Pick<PlacedSample, 'key'>, pieceId: string) => `sample/${sample.key}/${pieceId}`

const bedOf = (printerId: string): PlateSize => {
  const printer = printerById(printerId)
  return { width: printer.width, depth: printer.depth }
}

export interface SamplePlatesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: DesignConfig
  /** What the dialog opens on until the maker picks: the page that opens it knows which answer is likelier. */
  defaultScope?: SampleScope
}

export function SamplePlatesDialog({ open, onOpenChange, config, defaultScope = 'every' }: SamplePlatesDialogProps) {
  // Until the maker picks here, the dialog follows the printer the design already names.
  const [picked, setPicked] = useState<string | null>(null)
  const [custom, setCustom] = useState<PlateSize | null>(null)
  const [pickedScope, setPickedScope] = useState<SampleScope | null>(null)
  const scope = pickedScope ?? defaultScope
  const choice = picked ?? config.printerId
  const preset = choice === CUSTOM ? null : printerById(choice)
  const bed = preset ? { width: preset.width, depth: preset.depth } : (custom ?? bedOf(config.printerId))

  function choose(next: string) {
    // A custom plate starts from the bed it replaces, so the fields open on a real size.
    if (next === CUSTOM && !custom) setCustom(bed)
    setPicked(next)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Sample plates"
      description="Squares cut from your own tile, laid out on your printer's plate: print them and hold the relief before you print the wall."
    >
      <SamplePlatesBody
        config={config}
        scope={scope}
        onScope={setPickedScope}
        choice={preset ? preset.id : CUSTOM}
        bed={bed}
        printer={preset ? preset.name : 'your own printer'}
        onChoose={choose}
        onBed={setCustom}
        onDone={() => onOpenChange(false)}
      />
    </Dialog>
  )
}

interface BodyProps {
  config: DesignConfig
  scope: SampleScope
  onScope: (scope: SampleScope) => void
  choice: string
  bed: PlateSize
  /** The printer as the README names it. */
  printer: string
  onChoose: (choice: string) => void
  onBed: (bed: PlateSize) => void
  onDone: () => void
}

/** Mounted only while the dialog is open, so its chips and its download live and die with it. */
function SamplePlatesBody({ config, scope, onScope, choice, bed, printer, onChoose, onBed, onDone }: BodyProps) {
  // Finding where each relief shows most samples every pattern, so it is done once a design, not once a printer.
  const set = useMemo(() => sampleSet(config), [config])
  const plates = useMemo(() => samplePlates(config, bed, set, scope), [config, bed, set, scope])
  const relief = textureById(config.texture.id).name
  const scopeOptions = [
    { value: 'every' as const, label: 'Every relief', description: `Yours first, then the other ${TEXTURES.length - 1}` },
    { value: 'yours' as const, label: `${relief} only`, description: 'As you set it, nothing else' },
  ]
  const { run, progress, busy, cancel, error } = useSamplePlatesDownload()

  useEffect(() => track('sample-plates-open', { once: true }), [])

  async function download() {
    if (!plates) return
    announce(`Writing ${plural(plates.plates.length, 'plate')} of samples.`)
    try {
      const bundle = await run(config, plates, printer)
      downloadBlob(bundle.data, bundle.name, 'application/zip')
      track(plates.scope === 'yours' ? 'sample-relief-zip' : 'sample-plates-zip')
      toast(`${bundle.name} is in your downloads.`, { tone: 'success' })
      announce(`Download ready: ${bundle.name}.`)
      onDone()
    } catch (failure) {
      trackDownloadFailure(failure)
      if (failure instanceof Error && failure.name === 'AbortError') {
        toast('Download cancelled. Nothing was written.', { tone: 'info' })
        return
      }
      const message = failure instanceof Error ? failure.message : String(failure)
      toast(`The sample plates could not be written. ${message}`, {
        tone: 'error',
        action: { label: 'Try again', onClick: () => void download() },
      })
    }
  }

  const fraction = progress && progress.total > 0 ? progress.done / progress.total : null

  return (
    <div className={styles.body}>
      <Segmented label="What to print" value={scope} options={scopeOptions} onChange={onScope} disabled={busy} fullWidth />
      <div className={styles.printer}>
        <Select label="Printer" value={choice} groups={PRINTER_GROUPS} onValueChange={onChoose} disabled={busy} />
        {choice === CUSTOM && (
          <div className={styles.custom}>
            <NumberField
              label="Plate width"
              value={bed.width}
              min={PLATE_RANGE.min}
              max={PLATE_RANGE.max}
              step={1}
              unit="mm"
              disabled={busy}
              onChange={(width) => onBed({ ...bed, width })}
            />
            <NumberField
              label="Plate depth"
              value={bed.depth}
              min={PLATE_RANGE.min}
              max={PLATE_RANGE.max}
              step={1}
              unit="mm"
              disabled={busy}
              onChange={(depth) => onBed({ ...bed, depth })}
            />
          </div>
        )}
      </div>

      {plates ? (
        <>
          <PlateDrawings config={config} plates={plates} />

          <div className={styles.summary}>
            <p className={styles.facts}>
              {plural(plates.plates.length, 'plate')} · {plural(plates.samples.length, 'sample')} of{' '}
              {sizeText(plates.box.width)} × {sizeText(plates.box.height)} mm · about {formatGrams(samplePlatesGrams(plates))}
            </p>
            <dl className={styles.legend}>
              {plateLegend(plates).map((line) => (
                <div key={line.numbers} className={styles.legendRow}>
                  <dt>{line.numbers}</dt>
                  <dd>{line.text}</dd>
                </div>
              ))}
            </dl>
            <p className={styles.note}>
              Each is cut from your {sizeText(config.tile.width)} × {sizeText(config.tile.height)} mm tile at your{' '}
              {sizeText(config.tile.thickness)} mm base. Nothing is printed on a sample: its number is its place on the
              plate, and the README in the zip maps them.
            </p>
          </div>

          {/* The foot stays in view while the plates and the legend scroll under it, as the studio rail's does. */}
          {busy ? (
            <div className={`${styles.foot} ${styles.progress}`}>
              <ProgressBar label={progress?.label ?? 'Preparing the samples'} value={fraction} />
              <Button variant="ghost" leadingIcon={<X />} onClick={cancel}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className={`${styles.foot} ${styles.get}`}>
              <Button variant="primary" size="lg" fullWidth leadingIcon={<Download />} onClick={download}>
                Download the plates (.zip)
              </Button>
              <p className={styles.getNote}>
                {plural(plates.plates.length + 1, 'file')}, about {formatBytes(samplePlatesBytes(plates))}: one STL a plate
                and a README
              </p>
              {error && (
                <p className={styles.error} role="status">
                  {error}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <p className={styles.tooSmall} role="status">
          A {sizeText(Math.min(SAMPLE_MM, config.tile.width))} × {sizeText(Math.min(SAMPLE_MM, config.tile.height))} mm
          sample does not fit a {sizeText(bed.width)} × {sizeText(bed.depth)} mm plate. Enter the size of your printer's
          plate in millimetres.
        </p>
      )}
    </div>
  )
}

/** Each plate drawn from above at scale, front at the bottom, every sample in its own lit relief. */
function PlateDrawings({ config, plates }: { config: DesignConfig; plates: SamplePlates }) {
  const shown = useMemo(() => plates.plates.slice(0, PLATES_SHOWN), [plates])
  const chipItems = useMemo<ChipItem[]>(
    () =>
      shown.flat().flatMap((sample) =>
        sample.pieces.map(({ spec }) => ({ key: chipKey(sample, spec.id), config: sample.config, crop: spec.crop, edges: spec.edges })),
      ),
    [shown],
  )
  const chips = useTextureChips(config, chipItems, CHIP_PX)
  const more = plates.plates.length - shown.length

  return (
    <div className={styles.plates}>
      {shown.map((samples, plate) => (
        <figure key={plate} className={styles.plate}>
          <div
            className={styles.bed}
            style={{ aspectRatio: `${plates.bed.width} / ${plates.bed.depth}` }}
            role="img"
            aria-label={`Plate ${plate + 1}: ${samples.map((s) => `${s.number}, ${s.title}`).join('; ')}`}
          >
            {samples.flatMap((sample) =>
              sample.pieces.map((piece) => {
                const src = chips.get(chipKey(sample, piece.spec.id))
                return (
                  <span
                    key={chipKey(sample, piece.spec.id)}
                    className={styles.piece}
                    title={`${sample.number}. ${sample.title}`}
                    style={{
                      left: `${((sample.x + piece.x) / plates.bed.width) * 100}%`,
                      bottom: `${((sample.y + piece.y) / plates.bed.depth) * 100}%`,
                      width: `${(piece.spec.width / plates.bed.width) * 100}%`,
                      height: `${(piece.spec.height / plates.bed.depth) * 100}%`,
                    }}
                  >
                    {/* The chip is square with the piece centred in it, so cover crops it to exactly the piece. */}
                    {src && <img src={src} alt="" draggable={false} />}
                  </span>
                )
              }),
            )}
          </div>
          <figcaption className={styles.plateCaption}>
            Plate {plate + 1}
            <span className={styles.plateCount}>{plural(samples.length, 'sample')}</span>
          </figcaption>
        </figure>
      ))}
      {more > 0 && (
        <p className={styles.more}>
          and {plural(more, 'more plate')} laid out the same way
        </p>
      )}
    </div>
  )
}
