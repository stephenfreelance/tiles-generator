import { use, type ReactElement, type ReactNode } from 'react'
import { Tooltip as RadixTooltip } from 'radix-ui'
import { Kbd } from './Kbd'
import styles from './Tooltip.module.scss'
import { TooltipProviderPresent } from './tooltipContext'

const OPEN_DELAY_MS = 450

export interface TooltipProviderProps {
  children: ReactNode
  delayDuration?: number
}

/** Mount once near the root so moving between triggers skips the second open delay. */
export function TooltipProvider({ children, delayDuration = OPEN_DELAY_MS }: TooltipProviderProps) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration} skipDelayDuration={300}>
      <TooltipProviderPresent value={true}>{children}</TooltipProviderPresent>
    </RadixTooltip.Provider>
  )
}

export interface TooltipProps {
  /** What the slip says; nothing renders when empty. */
  content: ReactNode
  /** One element that accepts a ref and event props (a button, a radio item). */
  children: ReactElement
  /** Keyboard shortcut shown as key caps after the text, e.g. "Z" or ["Shift", "R"]. */
  shortcut?: string | string[]
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  disabled?: boolean
}

/** A small paper label that appears beside its trigger on hover and keyboard focus. */
export function Tooltip({ content, children, shortcut, side = 'top', align = 'center', disabled }: TooltipProps) {
  const hasProvider = use(TooltipProviderPresent)
  if (disabled || content === null || content === undefined || content === '') return children
  const keys = shortcut === undefined ? [] : Array.isArray(shortcut) ? shortcut : [shortcut]

  const tip = (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className={styles.content} side={side} align={align} sideOffset={6} collisionPadding={10}>
          <span className={styles.text}>{content}</span>
          {keys.length > 0 && (
            <span className={styles.keys}>
              {keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </span>
          )}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )

  return hasProvider ? tip : <RadixTooltip.Provider delayDuration={OPEN_DELAY_MS}>{tip}</RadixTooltip.Provider>
}
