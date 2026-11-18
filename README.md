# SpesaSmart

PWA (app web installabile) per preparare la lista della spesa, confrontare i prezzi tra supermercati
**tenendo conto del costo del carburante** e seguire la spesa in negozio con lo scanner dei codici a barre.
Realizzata seguendo `SpesaSmart_Specifica_Tecnica.docx` (v1.0, 16/11/2026).

## Come avviarla

1. Serve **Node.js** (versione LTS, già presente su questo PC).
2. Doppio clic su **`Avvia SpesaSmart.cmd`**: si apre il browser su <http://localhost:5173>.
   La prima volta impiega qualche minuto, poi pochi secondi.
3. Per provarla **sul telefono** (stessa rete Wi-Fi): doppio clic su **`Avvia SpesaSmart per telefono.cmd`**
   e apri sul telefono l'indirizzo `https://192.168.x.x:5173` mostrato nella finestra.
   Il browser avviserà che il certificato non è attendibile (è un certificato di prova): scegli «Procedi».
   Windows potrebbe chiedere di consentire Node.js nel firewall: consentilo per le reti private.

> **Perché la copia in locale?** La cartella `U:` è un disco di rete lento. Il programma di avvio copia i file
> in `%LOCALAPPDATA%\SpesaSmart\app` e li esegue da lì. **I file "veri" restano in questa cartella**:
> le modifiche vanno fatte qui, il programma di avvio le ricopia ogni volta.

**App online:** <https://ciettino1993.github.io/spesasmart/> — dal telefono aprila in Chrome (Android) o
Safari (iPhone) e scegli «Aggiungi a schermata Home» per installarla come app.
I prezzi carburanti online si aggiornano con **`Aggiorna prezzi carburanti.cmd`** (dettagli in
[docs/pubblicazione.md](docs/pubblicazione.md)).

## Cosa fa oggi

| Area | Stato |
|---|---|
| Liste della spesa | Più liste, quantità, note, voci libere, prodotti equivalenti accettati |
| Catalogo prodotti | Ricerca per nome/marca/codice su Open Food Facts; prodotti sconosciuti creati come «da verificare» |
| Scanner | EAN-8/EAN-13/UPC con fotocamera posteriore, anti-doppia lettura, pausa, inserimento manuale |
| Sessione di spesa | Prezzo atteso, prezzo a scaffale, quantità, totale stimato, articoli ancora da prendere, chiusura con totale pagato |
| Supermercati vicini | Tutti i ~20.000 supermercati italiani di OpenStreetMap (estratto Geofabrik aggiornato ogni settimana), entro un raggio (default 5 km), mappa |
| **Lettura scontrini** | Foto dello scontrino → Claude legge tutte le righe → riconoscimento del negozio e dei prodotti (con memoria degli abbinamenti confermati) → revisione → prezzi salvati in un colpo. Serve una chiave API Anthropic personale (Profilo → Lettura scontrini), che resta sul dispositivo |
| **Carburante** | **Prezzo medio di benzina e diesel (self o servito) nei distributori entro 10 km**, min/max, elenco e mappa, dati ufficiali MIMIT aggiornati ogni giorno |
| Confronto | Costo della lista per negozio, copertura, prezzi mancanti/scaduti, piano su 1-3 negozi con costo del carburante (prezzo medio ÷ km/l dell'auto), soglia minima di risparmio per una fermata in più, percorso stradale indicativo |
| Privacy | Tutto resta sul dispositivo; posizione solo su richiesta; esportazione e cancellazione dati |
| Offline | App installabile; liste e sessioni funzionano anche senza rete |

### Il limite principale: i prezzi dei supermercati

Come dice la specifica (cap. 6), **non esiste oggi una fonte libera e completa dei prezzi dei supermercati italiani**.
L'app usa due fonti, senza mai inventare importi:

- **Open Prices** (Open Food Facts): prezzi fotografati dalla community. In Italia sono ancora pochi.
- **I tuoi rilievi**: ogni prezzo che inserisci durante la spesa viene salvato e usato nei confronti successivi.

Per una copertura vera serve un accordo con le catene o un fornitore commerciale di dati: è una decisione
di business (vedi «Decisioni ancora da confermare»).

## Come è calcolato il costo dello spostamento

```
costo al km   = prezzo medio carburante entro 10 km (€/l) ÷ consumo dell'auto (km/l)
km del giro   = casa → negozio 1 → negozio 2 → casa, in linea d'aria × 1,3 (fattore stradale)
totale piano  = prodotti + km del giro × costo al km (+ valore del tempo, se impostato)
```

Esempio: benzina self a 1,951 €/l e auto da 15 km/l → 0,13 €/km. Un secondo negozio viene aggiunto solo se
copre più prodotti o fa risparmiare almeno la soglia impostata (default 2 €), carburante incluso.
Il pulsante «Calcola percorso stradale» sostituisce la stima con il percorso reale (OSRM).

## Struttura

```
Avvia SpesaSmart.cmd          avvio con doppio clic
src/
  lib/compare.ts              motore di confronto e piano multi-negozio (testato)
  lib/fuel.ts                 prezzi medi carburante e costo al km (testato)
  lib/db.ts                   database locale (IndexedDB) con id UUID pronti per la sincronizzazione
  lib/api/                    Open Food Facts, Open Prices, OpenStreetMap (Overpass, Nominatim, OSRM)
  pages/, components/         schermate (Home, Liste, Confronta, Spesa, Profilo, Carburante, Negozi)
scripts/update-fuel.mjs       scarica e prepara gli open data MIMIT (eseguito in automatico)
supabase/migrations/          schema PostgreSQL/PostGIS con RLS per il futuro backend
docs/                         pubblicazione, Supabase, scelte tecniche
```

Comandi per sviluppatori (dalla cartella locale): `npm run dev`, `npm test`, `npm run build`, `npm run fuel:update`.

## Decisioni ancora da confermare (dalla specifica, cap. 18)

- Sito esistente, dominio e hosting dove pubblicare.
- Account Supabase per la sincronizzazione tra dispositivi e le segnalazioni condivise (vedi [docs/supabase.md](docs/supabase.md)).
- Catene della prima versione e fonte prezzi autorizzata.
- Nome definitivo, modello economico, politica foto/scontrini.

## Fonti dei dati e licenze

Prezzi carburanti: MIMIT, IODL 2.0 · Prodotti e prezzi community: Open Food Facts / Open Prices, ODbL ·
Negozi e mappe: © OpenStreetMap contributors, ODbL · Percorsi: OSRM.
