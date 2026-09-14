import { Kbd } from '@/ui'
import styles from './AppShell.module.scss'
import { MOD_KEY } from './keyboard'

const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: [MOD_KEY, 'Z'], action: 'Undo' },
  { keys: ['Shift', MOD_KEY, 'Z'], action: 'Redo' },
  { keys: ['1'], action: 'Surface view' },
  { keys: ['2'], action: 'Single tile view' },
  { keys: ['R'], action: 'Reset the view' },
  { keys: ['Arrows'], action: 'Orbit, once the 3D view has focus' },
  { keys: ['+', '-'], action: 'Zoom the 3D view' },
  { keys: ['0', 'Home'], action: 'Reset the camera, once the 3D view has focus' },
  { keys: ['Esc'], action: 'Close a note or a popover' },
  { keys: ['?'], action: 'This list' },
]

/** The margin note behind the header's "?": every key the studio listens for. */
export function ShortcutsHelp() {
  return (
    <dl className={styles.shortcuts}>
      {SHORTCUTS.map(({ keys, action }) => (
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
