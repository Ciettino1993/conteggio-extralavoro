import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { Keyboard, Pause, Play } from 'lucide-react'
import { isValidBarcode } from '../lib/api/openfoodfacts'

const DEBOUNCE_MS = 1800

/**
 * Scanner EAN/UPC con la fotocamera posteriore.
 * Richiede HTTPS (o localhost) e il permesso della fotocamera; c'è sempre l'inserimento manuale.
 */
export default function BarcodeScanner({ onCode, paused = false }: { onCode: (code: string) => void; paused?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onCodeRef = useRef(onCode)
  const last = useRef({ code: '', at: 0 })
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(true)
  const [manual, setManual] = useState('')
  const [showManual, setShowManual] = useState(false)

  useEffect(() => {
    onCodeRef.current = onCode
  }, [onCode])

  const active = running && !paused

  useEffect(() => {
    if (!active || !videoRef.current) return
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('La fotocamera richiede una connessione sicura (HTTPS). Inserisci il codice a mano.')
      setShowManual(true)
      return
    }
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ])
    const reader = new BrowserMultiFormatReader(hints)
    let controls: IScannerControls | undefined
    let cancelled = false
    reader
      .decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, videoRef.current, (result) => {
        if (!result) return
        let code = result.getText()
        if (code.length === 12) code = '0' + code // UPC-A -> EAN-13
        const now = Date.now()
        // Evita di registrare più volte lo stesso codice inquadrato.
        if (code === last.current.code && now - last.current.at < DEBOUNCE_MS) return
        last.current = { code, at: now }
        navigator.vibrate?.(60)
        onCodeRef.current(code)
      })
      .then((c) => {
        if (cancelled) c.stop()
        else {
          controls = c
          setError(null)
        }
      })
      .catch((err: Error) => {
        setShowManual(true)
        setError(
          err.name === 'NotAllowedError'
            ? 'Permesso fotocamera negato. Puoi abilitarlo dalle impostazioni del browser o inserire il codice a mano.'
            : err.name === 'NotFoundError'
              ? 'Nessuna fotocamera trovata. Inserisci il codice a mano.'
              : `Fotocamera non disponibile (${err.message}).`,
        )
      })
    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [active])

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault()
    const code = manual.replace(/\D/g, '')
    if (!isValidBarcode(code) && !/^\d{8,14}$/.test(code)) return
    onCodeRef.current(code)
    setManual('')
  }

  return (
    <div className="space-y-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-stone-900">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80 shadow-[0_0_8px_red]" />
        {!active && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">In pausa</div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/75 p-4 text-center text-sm text-white">
            {error}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={() => setRunning((r) => !r)}>
          {running ? <Pause size={18} /> : <Play size={18} />} {running ? 'Pausa' : 'Riprendi'}
        </button>
        <button type="button" className="btn-secondary flex-1" onClick={() => setShowManual((s) => !s)}>
          <Keyboard size={18} /> Codice a mano
        </button>
      </div>
      {showManual && (
        <form onSubmit={submitManual} className="flex gap-2">
          <input
            className="input"
            inputMode="numeric"
            placeholder="Codice a barre (8-14 cifre)"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            aria-label="Codice a barre"
          />
          <button className="btn-primary">OK</button>
        </form>
      )}
    </div>
  )
}
