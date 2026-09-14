import { createContext } from 'react'

/** True under <TooltipProvider>; lone tooltips fall back to a private provider instead of throwing. */
export const TooltipProviderPresent = createContext(false)
