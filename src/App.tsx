import { lazy, Suspense } from 'react'
import { NavLink, Route, Routes } from 'react-router'
import { BarChart3, Car, Settings as SettingsIcon } from 'lucide-react'
import TripPage from './pages/TripPage'

// Pagine caricate su richiesta (grafici e mappe non servono all'avvio).
const Report = lazy(() => import('./pages/Report'))
const TripEdit = lazy(() => import('./pages/TripEdit'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const Info = lazy(() => import('./pages/Info'))

const NAV = [
  { to: '/', label: 'Viaggio', icon: Car, end: true },
  { to: '/resoconto', label: 'Resoconto', icon: BarChart3 },
  { to: '/impostazioni', label: 'Impostazioni', icon: SettingsIcon },
]

export default function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <main className="flex-1 px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
        <Suspense fallback={<p className="muted pt-8 text-center">Caricamento…</p>}>
          <Routes>
            <Route path="/" element={<TripPage />} />
            <Route path="/resoconto" element={<Report />} />
            <Route path="/viaggio/:id" element={<TripEdit />} />
            <Route path="/impostazioni" element={<SettingsPage />} />
            <Route path="/info" element={<Info />} />
            <Route path="*" element={<TripPage />} />
          </Routes>
        </Suspense>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto grid max-w-xl grid-cols-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${isActive ? 'text-brand-700' : 'text-stone-500'}`}
              >
                <Icon size={24} aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
