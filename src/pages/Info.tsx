import { PageHeader } from '../components/ui'

export default function Info() {
  return (
    <div className="space-y-4">
      <PageHeader title="Come funziona" back="/impostazioni" />
      <section className="card space-y-2 text-sm">
        <h2 className="h2">Il calcolo</h2>
        <p>
          <strong>Carburante</strong> = km percorsi ÷ consumo dell'auto (km/l) × prezzo medio al litro dei distributori entro il
          raggio impostato, rilevato alla partenza.
        </p>
        <p>
          <strong>Tempo</strong> = durata del viaggio × paga oraria.
        </p>
        <p>Prezzo, consumo e paga vengono salvati con ogni viaggio: se li cambi dopo, i viaggi passati non cambiano.</p>
      </section>
      <section className="card space-y-2 text-sm">
        <h2 className="h2">GPS e km</h2>
        <p>
          I km vengono misurati dal GPS mentre l'app è aperta: lo schermo resta acceso da solo. Se blocchi il telefono o passi a
          un'altra app il browser sospende il GPS: all'arrivo puoi scegliere i km del percorso stradale più breve tra partenza e
          arrivo, oppure scriverli a mano.
        </p>
      </section>
      <section className="card space-y-2 text-sm">
        <h2 className="h2">Fonti</h2>
        <p>
          Prezzi carburanti: MIMIT, Osservatorio prezzi carburanti (open data, licenza IODL 2.0), aggiornati ogni giorno. Mappe ©
          OpenStreetMap contributors. Percorsi stradali: OSRM (servizio dimostrativo, valori indicativi).
        </p>
      </section>
      <section className="card space-y-2 text-sm">
        <h2 className="h2">Privacy</h2>
        <p>
          Viaggi, percorsi e impostazioni restano solo su questo telefono: nessun account e nessun server dell'app. La posizione
          serve per misurare i km e trovare i distributori vicini; al servizio dei percorsi vengono inviate solo le coordinate di
          partenza e arrivo.
        </p>
      </section>
      <p className="text-center text-xs text-stone-400">Conteggio Extralavoro 1.0</p>
    </div>
  )
}
