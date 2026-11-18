// Lettura degli scontrini con Claude (immagine -> righe strutturate).
// La chiave API è dell'utente e resta sul suo dispositivo: le chiamate partono direttamente dal browser.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

export const RECEIPT_MODELS = {
  'claude-opus-5-5': { label: 'Claude Opus 5.5 (più preciso)', inputPerM: 4, outputPerM: 20 },
  'claude-haiku-5-5': { label: 'Claude Haiku 5.5 (economico)', inputPerM: 0.1, outputPerM: 0.5 },
} as const
export type ReceiptModel = keyof typeof RECEIPT_MODELS

export const ReceiptSchema = z.object({
  negozio: z.object({
    catena: z.string().nullable().describe('Insegna o catena (es. "Esselunga", "Conad", "Lidl")'),
    indirizzo: z.string().nullable().describe('Via e numero civico del punto vendita, se stampati'),
    citta: z.string().nullable(),
  }),
  data: z.string().nullable().describe('Data dello scontrino in formato AAAA-MM-GG'),
  righe: z.array(
    z.object({
      testo: z.string().describe('Descrizione esattamente come stampata sullo scontrino'),
      nome_probabile: z.string().describe('Nome del prodotto per esteso in italiano, senza abbreviazioni'),
      marca: z.string().nullable(),
      formato: z.string().nullable().describe('Peso o volume della confezione se deducibile (es. "500 g", "1 l")'),
      quantita: z.number().describe('Numero di pezzi, oppure kg per i prodotti a peso'),
      prezzo_unitario: z.number().describe('Prezzo di un pezzo (o al kg) dopo eventuali sconti'),
      prezzo_totale: z.number().describe('Importo pagato per la riga dopo eventuali sconti'),
      peso_variabile: z.boolean(),
      sconto: z.boolean().describe('true se alla riga è stato applicato uno sconto o una promozione'),
    }),
  ),
  totale: z.number().nullable().describe('Totale complessivo pagato'),
})
export type Receipt = z.infer<typeof ReceiptSchema>
export type ReceiptLine = Receipt['righe'][number]

const PROMPT = `Questa è la foto di uno scontrino di un supermercato italiano.
Estrai i dati richiesti. Regole:
- Includi solo i prodotti acquistati. Escludi subtotali, totale, resto, pagamenti, IVA, punti fedeltà e intestazioni.
- Gli sconti stampati su una riga separata (es. "SCONTO", "-0,50") vanno applicati al prodotto a cui si riferiscono:
  riduci prezzo_unitario e prezzo_totale di quel prodotto e imposta sconto = true. Non creare righe per gli sconti.
- Se una riga indica più pezzi (es. "2 x 1,29"), quantita = 2 e prezzo_unitario = 1,29.
- Prodotti a peso (es. "0,512 kg x 2,49 €/kg"): peso_variabile = true, quantita = kg, prezzo_unitario = prezzo al kg.
- Gli importi sono in euro: usa il punto come separatore decimale nei numeri.
- nome_probabile: interpreta le abbreviazioni (es. "SPAGH BARILLA N5 500G" -> "Spaghetti n.5 Barilla").
- Se un dato non è leggibile usa null; non inventare prodotti o importi.`

/** Riduce la foto (gli scontrini sono lunghi e stretti) e la converte in JPEG base64. */
export async function prepareImage(file: File, maxSide = 2000): Promise<{ base64: string; previewUrl: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { base64: dataUrl.split(',')[1], previewUrl: dataUrl }
}

export interface ReceiptResult {
  receipt: Receipt
  costEur: number
  model: string
}

export async function readReceipt(imageBase64: string, apiKey: string, model: ReceiptModel): Promise<ReceiptResult> {
  // La chiave è dell'utente e resta sul suo dispositivo: chiamata diretta dal browser consapevole.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 })
  const isOpus = model === 'claude-opus-5-5'
  let response
  try {
    response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      // Se il modello declina la richiesta, il server la ripete su un modello di riserva (solo Opus).
      ...(isOpus ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      output_config: { format: zodOutputFormat(ReceiptSchema), effort: 'medium' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('Chiave API non valida: controllala nel Profilo.')
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error('La chiave API non ha i permessi per questo modello.')
    if (err instanceof Anthropic.RateLimitError) throw new Error('Troppe richieste o credito esaurito: riprova tra poco o controlla il credito.')
    if (err instanceof Anthropic.BadRequestError) throw new Error(`Richiesta non accettata: ${err.message}`)
    if (err instanceof Anthropic.APIConnectionError) throw new Error('Servizio non raggiungibile: controlla la connessione.')
    if (err instanceof Anthropic.APIError) throw new Error(`Errore del servizio (${err.status}). Riprova tra poco.`)
    throw err
  }
  if (response.stop_reason === 'refusal') throw new Error('Il servizio non ha elaborato questa immagine. Prova con un\'altra foto.')
  if (response.stop_reason === 'max_tokens') throw new Error('Scontrino troppo lungo: fotografalo in due parti.')
  const receipt = response.parsed_output
  if (!receipt) throw new Error('Non sono riuscito a leggere lo scontrino. Prova con una foto più nitida e dritta.')
  const price = RECEIPT_MODELS[model]
  const usd =
    (response.usage.input_tokens * price.inputPerM + response.usage.output_tokens * price.outputPerM) / 1_000_000
  return { receipt, costEur: usd * 0.95, model: response.model }
}
