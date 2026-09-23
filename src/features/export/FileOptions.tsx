// Format and detail: a setting that has to exist, but never in the way. STL at standard suits any slicer.
import { TriangleAlert } from 'lucide-react'
import type { DesignConfig, ExportFormat, ExportQuality, LayoutPlan } from '@/core/types'
import { Button, HelpTip, Segmented } from '@/ui'
import { Disclosure } from './Disclosure'
import styles from './FileOptions.module.scss'
import { heavyDownloadFix } from './heavyDownload'
import { estimateDownloadBytes, formatBytes, LARGE_DOWNLOAD_BYTES } from './sizes'

const FORMATS = [
  { value: 'stl' as const, label: 'STL', description: 'Any slicer. Recommended.' },
  { value: 'step' as const, label: 'STEP', description: 'Editable in CAD, bigger files.' },
]

// Recommended first, and named by what the choice costs rather than by a millimetre step.
const QUALITIES = [
  { value: 'standard' as const, label: 'Standard', description: 'Recommended' },
  { value: 'fine' as const, label: 'Finer detail', description: 'Bigger file' },
  { value: 'draft' as const, label: 'Fastest', description: 'Smaller file' },
]

const QUALITY_NOTE: Record<ExportQuality, string> = {
  standard: 'Standard',
  fine: 'Finer detail',
  draft: 'Fastest',
}

export interface FileOptionsProps {
  config: DesignConfig
  plan: LayoutPlan
  format: ExportFormat
  quality: ExportQuality
  disabled: boolean
  onFormatChange: (format: ExportFormat) => void
  onQualityChange: (quality: ExportQuality) => void
  /** Opens the list of pieces, where each one downloads on its own. */
  onShowPieces: () => void
}

export function FileOptions({
  config,
  plan,
  format,
  quality,
  disabled,
  onFormatChange,
  onQualityChange,
  onShowPieces,
}: FileOptionsProps) {
  const bytes = estimateDownloadBytes(plan, config, format, quality)
  const heavy = bytes > LARGE_DOWNLOAD_BYTES
  // Only a switch that makes the download lighter is offered: on standard STL already it would do nothing.
  const fix = heavy ? heavyDownloadFix(format, quality, { chosen: bytes, standardStl: estimateDownloadBytes(plan, config, 'stl', 'standard') }) : null

  return (
    <div className={styles.options}>
      <Disclosure label="File options: format and detail" note={`${format.toUpperCase()} · ${QUALITY_NOTE[quality]}`}>
        <div className={styles.choices}>
          <Segmented
            label="Format"
            layout="tiles"
            fullWidth
            value={format}
            options={FORMATS}
            disabled={disabled}
            onChange={onFormatChange}
          />
          <div className={styles.detail}>
            <Segmented
              label="Detail"
              fullWidth
              value={quality}
              options={QUALITIES}
              disabled={disabled}
              onChange={onQualityChange}
            />
            <HelpTip label="Detail" className={styles.help}>
              How finely the relief is sampled. Every setting prints the same way: finer only holds more of the
              pattern and writes a bigger file.
            </HelpTip>
          </div>
        </div>
      </Disclosure>

      {/* Stays out of the disclosure: it prevents a real failure, a file the slicer takes minutes to open. */}
      {fix === 'standard-stl' && (
        <div className={styles.warning} role="status">
          <TriangleAlert className={styles.warningIcon} aria-hidden="true" />
          <p className={styles.warningText}>
            This download is around {formatBytes(bytes)} and takes minutes to write. Standard STL carries the same
            relief at a size your slicer opens quickly.
          </p>
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => {
              onFormatChange('stl')
              onQualityChange('standard')
            }}
          >
            Use standard STL
          </Button>
        </div>
      )}
      {fix === 'one-at-a-time' && (
        <div className={styles.warning} role="status">
          <TriangleAlert className={styles.warningIcon} aria-hidden="true" />
          <p className={styles.warningText}>
            This download is around {formatBytes(bytes)}. If your browser or your slicer struggles with it, download the
            pieces one at a time instead: each has its own file under See every piece.
          </p>
          <Button size="sm" onClick={onShowPieces}>
            Show every piece
          </Button>
        </div>
      )}
    </div>
  )
}
