import { PageHeader } from '../components/ui'

const SOURCES = [
  {
    name: 'Prezzi carburanti',
    who: 'MIMIT - Osservatorio prezzi carburanti (open data, aggiornamento giornaliero)',
    license: 'IODL 2.0',
    url: 'https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti',
  },
  {
    name: 'Prezzi dei prodotti',
    who: 'Open Prices (Open Food Facts): prezzi rilevati dalla community con foto di scontrini e cartellini',
    license: 'ODbL',
    url: 'https://prices.openfoodfacts.org',
  },
  {
    name: 'Catalogo prodotti e codici a barre',
    who: 'Open Food Facts',
    license: 'ODbL',
    url: 'https://world.openfoodfacts.org',
  },
  {
    name: 'Supermercati, mappe e indirizzi',
    who: 'OpenStreetMap (Overpass API, Nominatim, tile OSM)',
    license: 'ODbL',
    url: 'https://www.openstreetmap.org/copyright',
  },
  {
    name: 'Percorsi stradali',
    who: 'OSRM (server dimostrativo, uso leggero)',
    license: 'BSD / dati ODbL',
    url: 'https://project-osrm.org',
  },
]

export default function Info() {
  return (
    <div className="space-y-4">
      <PageHeader title="Fonti e privacy" back="/profilo" />
      <section className="card space-y-3">
        <h2 className="h2">Da dove arrivano i dati</h2>
        <ul className="space-y-3 text-sm">
          {SOURCES.map((s) => (
            <li key={s.name}>
              <p className="font-semibold">{s.name}</p>
              <p className="text-stone-600">
                {s.who} · licenza {s.license} ·{' '}
                <a className="text-brand-700 underline" href={s.url} target="_blank" rel="noreferrer">
                  sito
                </a>
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section className="card space-y-2 text-sm">
        <h2 className="h2">Stato dei prezzi</h2>
        <p><strong>Verificato</strong>: da fonte ufficiale o validato (oggi nessuna catena fornisce un listino ufficiale).</p>
        <p><strong>Segnalato</strong>: rilevato da utenti (Open Prices o tu stesso durante la spesa), non confermato.</p>
        <p><strong>Scaduto</strong>: più vecchio del limite impostato nel profilo; non usato nel confronto.</p>
        <p>Se un prezzo non è noto l'app mostra «non disponibile»: non vengono mai inventati importi.</p>
      </section>
      <section className="card space-y-2 text-sm">
        <h2 className="h2">Privacy</h2>
        <p>
          Liste, spese, prezzi rilevati e posizione restano nel browser di questo dispositivo. La posizione viene chiesta solo
          quando premi «Usa la mia posizione». Ai servizi esterni vengono inviate solo le richieste necessarie (codice a barre,
          parola cercata, coordinate approssimate per i negozi vicini).
        </p>
        <p>
          <strong>Scontrini:</strong> la foto viene inviata ad Anthropic (Claude) con la tua chiave API solo per leggerne le righe e
          non viene conservata nell'app. Gli scontrini possono contenere dati personali (es. numero tessera fedeltà): se
          preferisci, coprili prima di scattare. La chiave API resta su questo dispositivo e non viene esportata.
        </p>
      </section>
      <p className="text-center text-xs text-stone-400">SpesaSmart 0.1 · prototipo</p>
    </div>
  )
}
