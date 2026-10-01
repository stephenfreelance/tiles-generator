// "Sample plates": the printer, which reliefs to print (every one, the maker's own alone, or any pick of them),
// the plates that takes drawn with every sample's own relief, and one download. Opened from the studio's
// texture step, where a relief is chosen and every relief is the useful answer, and from the download page's
// "Test first", where a wall is about to be printed and the maker's own relief is. The printer and the reliefs
// picked here are the dialog's own: the design keeps the printer set in Advanced, because a sample plate must
// never re-lay the wall.
import { useEffect, useMemo, useState } from 'react'
import { Download, X } from 'lucide-react'
import { track, trackDownloadFailure } from '@/app/analytics'
import { sizeText } from '@/core/export/filenames'
import { PRINTERS, printerById } from '@/core/printers'
import { textureById } from '@/core/textures/registry'
import type { DesignConfig } from '@/core/types'
import { formatBytes, formatGrams } from '@/features/export/sizes'
import { downloadBlob, useTextureChips, type ChipItem } from '@/hooks'
import { announce, Button, Dialog, NumberField, ProgressBar, Select, toast } from '@/ui'
import { ReliefPicker } from './ReliefPicker'
import {
  EVERY_RELIEF,
  followOwnRelief,
  plateLegend,
  SAMPLE_MM,
  sampleZipEvent,
  samplePlates,
  samplePlatesBytes,
  samplePlatesGrams,
  sampleSet,
  type PlacedSample,
  type PlateSize,
  type SamplePlates,
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
  /**
   * The reliefs the picker starts on until the maker picks: every relief, or the maker's own alone. The page
   * that opens it knows which answer is likelier.
   */
  defaultReliefs?: 'every' | 'yours'
}

export function SamplePlatesDialog({ open, onOpenChange, config, defaultReliefs = 'every' }: SamplePlatesDialogProps) {
  // Until the maker picks here, the dialog follows the printer the design already names, and the page's default
  // reliefs. Both picks live as long as the page that owns the dialog, so reopening it finds them as they were.
  const [picked, setPicked] = useState<string | null>(null)
  const [custom, setCustom] = useState<PlateSize | null>(null)
  // A pick remembers the relief that was the maker's, since the studio can change it while the dialog is shut.
  const [pickedReliefs, setPickedReliefs] = useState<{ own: string; ids: readonly string[] } | null>(null)
  const own = textureById(config.texture.id).id
  const reliefs = useMemo<ReadonlySet<string>>(
    () =>
      new Set(
        pickedReliefs
          ? followOwnRelief(pickedReliefs.ids, pickedReliefs.own, own)
          : defaultReliefs === 'yours'
            ? [own]
            : EVERY_RELIEF,
      ),
    [pickedReliefs, defaultReliefs, own],
  )
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
        reliefs={reliefs}
        onReliefs={(ids) => setPickedReliefs({ own, ids })}
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
  reliefs: ReadonlySet<string>
  onReliefs: (reliefs: string[]) => void
  choice: string
  bed: PlateSize
  /** The printer as the README names it. */
  printer: string
  onChoose: (choice: string) => void
  onBed: (bed: PlateSize) => void
  onDone: () => void
}

/** Mounted only while the dialog is open, so its chips and its download live and die with it. */
function SamplePlatesBody({ config, reliefs, onReliefs, choice, bed, printer, onChoose, onBed, onDone }: BodyProps) {
  // Finding where each relief shows most samples every pattern, so it is done once a design, not once a printer.
  const set = useMemo(() => sampleSet(config), [config])
  const plates = useMemo(() => samplePlates(config, bed, set, reliefs), [config, bed, set, reliefs])
  const { run, progress, busy, cancel, error } = useSamplePlatesDownload()

  useEffect(() => track('sample-plates-open', { once: true }), [])

  async function download() {
    if (!plates || plates.pick === 'none') return
    announce(`Writing ${plural(plates.plates.length, 'plate')} of samples.`)
    try {
      const bundle = await run(config, plates, printer)
      downloadBlob(bundle.data, bundle.name, 'application/zip')
      track(sampleZipEvent(plates.pick))
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

      {/* Under the printer, so what a pick changes is drawn right below it. */}
      <ReliefPicker config={config} set={set} value={reliefs} onChange={onReliefs} chipPx={CHIP_PX} disabled={busy} />

      {!plates ? (
        <p className={styles.tooSmall} role="status">
          A {sizeText(Math.min(SAMPLE_MM, config.tile.width))} × {sizeText(Math.min(SAMPLE_MM, config.tile.height))} mm
          sample does not fit a {sizeText(bed.width)} × {sizeText(bed.depth)} mm plate. Enter the size of your printer's
          plate in millimetres.
        </p>
      ) : (
        <>
          {plates.samples.length > 0 && (
            <>
              <PlateDrawings config={config} plates={plates} />

              <div className={styles.summary}>
                <p className={styles.facts}>
                  {plural(plates.plates.length, 'plate')} · {plural(plates.samples.length, 'sample')} of{' '}
                  {sizeText(plates.box.width)} × {sizeText(plates.box.height)} mm · about{' '}
                  {formatGrams(samplePlatesGrams(plates))}
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
                  {sizeText(config.tile.thickness)} mm base. Nothing is printed on a sample: its number is its place on
                  the plate, and the README in the zip maps them.
                </p>
              </div>
            </>
          )}

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
              <Button
                variant="primary"
                size="lg"
                fullWidth
                leadingIcon={<Download />}
                disabled={plates.samples.length === 0}
                onClick={download}
              >
                Download the plates (.zip)
              </Button>
              {/* Not live: the picker's count already speaks at every toggle, "0 of 23" included. */}
              <p className={styles.getNote}>
                {plates.samples.length === 0
                  ? 'Pick at least one relief to print.'
                  : `${plural(plates.plates.length + 1, 'file')}, about ${formatBytes(samplePlatesBytes(plates))}: one STL a plate and a README`}
              </p>
              {error && (
                <p className={styles.error} role="status">
                  {error}
                </p>
              )}
            </div>
          )}
        </>
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
