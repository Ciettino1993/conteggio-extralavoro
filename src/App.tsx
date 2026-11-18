import { lazy, Suspense } from 'react'
import { NavLink, Route, Routes } from 'react-router'
import { Home as HomeIcon, ListChecks, Scale, ScanBarcode, UserRound } from 'lucide-react'
import Home from './pages/Home'
import Lists from './pages/Lists'

// Pagine caricate su richiesta: scanner e mappe sono pesanti e non servono all'avvio.
const ListDetail = lazy(() => import('./pages/ListDetail'))
const Compare = lazy(() => import('./pages/Compare'))
const Session = lazy(() => import('./pages/Session'))
const Profile = lazy(() => import('./pages/Profile'))
const Fuel = lazy(() => import('./pages/Fuel'))
const Stores = lazy(() => import('./pages/Stores'))
const Info = lazy(() => import('./pages/Info'))
const Receipt = lazy(() => import('./pages/Receipt'))

const NAV = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/liste', label: 'Liste', icon: ListChecks },
  { to: '/confronta', label: 'Confronta', icon: Scale },
  { to: '/spesa', label: 'Spesa', icon: ScanBarcode },
  { to: '/profilo', label: 'Profilo', icon: UserRound },
]

export default function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <main className="flex-1 px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
        <Suspense fallback={<p className="muted pt-8 text-center">Caricamento…</p>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/liste" element={<Lists />} />
          <Route path="/liste/:id" element={<ListDetail />} />
          <Route path="/confronta" element={<Compare />} />
          <Route path="/spesa" element={<Session />} />
          <Route path="/profilo" element={<Profile />} />
          <Route path="/carburante" element={<Fuel />} />
          <Route path="/negozi" element={<Stores />} />
          <Route path="/info" element={<Info />} />
          <Route path="/scontrino" element={<Receipt />} />
          <Route path="*" element={<Home />} />
        </Routes>
        </Suspense>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-brand-700' : 'text-stone-500'}`
                }
              >
                <Icon size={22} aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
