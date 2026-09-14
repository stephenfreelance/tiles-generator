import { createBrowserRouter, RouterProvider } from 'react-router'
import { Toaster, TooltipProvider } from '@/ui'
import { AppShell } from './AppShell'
import { RouteError } from './RouteError'
import { SheetFallback } from './SheetFallback'

// Every sheet loads when it is opened, the studio included: its renderer is by far the heaviest thing
// here and the register has no use for it. Intent warms the studio instead (see prefetchStudio).
const router = createBrowserRouter(
  [
    {
      element: <AppShell />,
      errorElement: <RouteError />,
      HydrateFallback: SheetFallback,
      children: [
        { index: true, lazy: async () => ({ Component: (await import('@/pages/LandingPage')).LandingPage }) },
        { path: 'studio', lazy: async () => ({ Component: (await import('@/pages/StudioPage')).StudioPage }) },
        { path: 'download', lazy: async () => ({ Component: (await import('@/pages/ExportPage')).ExportPage }) },
        { path: 'history', lazy: async () => ({ Component: (await import('@/pages/HistoryPage')).HistoryPage }) },
        { path: '*', lazy: async () => ({ Component: (await import('@/pages/NotFoundPage')).NotFoundPage }) },
      ],
    },
  ],
  // GitHub Pages serves the app under /tiles-generator/ (the build's --base); everywhere else this is "/".
  { basename: import.meta.env.BASE_URL },
)

export function App() {
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
      <Toaster />
    </TooltipProvider>
  )
}
