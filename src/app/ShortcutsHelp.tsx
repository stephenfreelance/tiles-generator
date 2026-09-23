import { Kbd } from '@/ui'
import styles from './AppShell.module.scss'
import { MOD_KEY } from './keyboard'

interface Shortcut {
  keys: string[]
  action: string
}

// Undo, redo and the 3D view's keys belong to the studio: anywhere else they do nothing, so they are not listed.
const STUDIO_SHORTCUTS: Shortcut[] = [
  { keys: [MOD_KEY, 'Z'], action: 'Undo' },
  { keys: ['Shift', MOD_KEY, 'Z'], action: 'Redo' },
  { keys: ['1'], action: 'Surface view' },
  { keys: ['2'], action: 'Single tile view' },
  { keys: ['R'], action: 'Reset the view' },
  { keys: ['Arrows'], action: 'Orbit, once the 3D view has focus' },
  { keys: ['+', '-'], action: 'Zoom the 3D view' },
  { keys: ['0', 'Home'], action: 'Reset the camera, once the 3D view has focus' },
]

const EVERYWHERE: Shortcut[] = [
  { keys: ['Esc'], action: 'Close a note or a popover' },
  { keys: ['?'], action: 'This list' },
]

export interface ShortcutsHelpProps {
  /** The studio listens for many more keys than the other screens. */
  isStudio: boolean
}

/** The margin note behind the header's "?": every key the current screen listens for. */
export function ShortcutsHelp({ isStudio }: ShortcutsHelpProps) {
  const shortcuts = isStudio ? [...STUDIO_SHORTCUTS, ...EVERYWHERE] : EVERYWHERE
  return (
    <dl className={styles.shortcuts}>
      {shortcuts.map(({ keys, action }) => (
        <div key={action} className={styles.shortcutRow}>
          <dt className={styles.shortcutKeys}>
            {keys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </dt>
          <dd className={styles.shortcutAction}>{action}</dd>
        </div>
      ))}
    </dl>
  )
}
