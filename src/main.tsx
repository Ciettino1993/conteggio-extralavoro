import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App'
import { ToastProvider } from './components/Toast'

registerSW({ immediate: true })

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5 * 60_000 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {/* HashRouter: funziona su qualsiasi hosting statico senza configurazioni del server */}
        <HashRouter>
          <App />
        </HashRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
