import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type Toast = { id: number; text: string; tone: 'ok' | 'error' | 'info'; action?: { label: string; run: () => void } }

const Ctx = createContext<(text: string, opts?: Partial<Omit<Toast, 'id' | 'text'>>) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(1)
  const show = useCallback((text: string, opts: Partial<Omit<Toast, 'id' | 'text'>> = {}) => {
    const id = next.current++
    setToasts((t) => [...t.slice(-2), { id, text, tone: opts.tone ?? 'info', action: opts.action }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.action ? 6000 : 3500)
  }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${
              t.tone === 'error' ? 'bg-red-700' : t.tone === 'ok' ? 'bg-brand-800' : 'bg-stone-800'
            }`}
          >
            <span>{t.text}</span>
            {t.action && (
              <button
                className="font-semibold underline"
                onClick={() => {
                  t.action!.run()
                  setToasts((all) => all.filter((x) => x.id !== t.id))
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
