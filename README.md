# Conteggio Extralavoro

PWA (app web installabile sul telefono) che calcola **quanto costano i viaggi di lavoro in auto**:
carburante, in base ai km percorsi e al prezzo medio dei distributori vicini, e tempo, in base alla paga oraria.

**App:** <https://ciettino1993.github.io/conteggio-extralavoro/>
Dal telefono aprila in Chrome (Android) o Safari (iPhone) e scegli «Aggiungi a schermata Home».

## Come si usa

1. **Impostazioni**: paga oraria, carburante (benzina o diesel), consumo dell'auto in km/l.
2. **Viaggio**: «Rileva» trova la posizione e il prezzo medio del carburante entro 10 km (dati ufficiali MIMIT).
   «Partenza» avvia timer e GPS; durante il viaggio l'app mostra tempo, km e costi in tempo reale.
3. **Arrivo**: ferma il timer. Controlli durata e km (GPS, percorso stradale stimato o a mano) e salvi.
4. **Resoconto**: costi di carburante, tempo e totale per settimana, mese, anno o sempre, con grafico,
   elenco per giorno, modifica dei viaggi, inserimento a mano ed esportazione per Excel (CSV).

## Il calcolo

```
carburante = km ÷ consumo (km/l) × prezzo medio €/l alla partenza
tempo      = durata in ore × paga oraria
totale     = carburante + tempo
```

Prezzo, consumo e paga vengono salvati con ogni viaggio: cambiarli dopo non modifica i viaggi passati.

## Limiti da conoscere

- Il GPS funziona **con l'app aperta**: lo schermo resta acceso da solo. Se il telefono si blocca o si passa a
  un'altra app, il browser sospende il GPS: all'arrivo si possono usare i km del percorso stradale o scriverli a mano.
- I dati restano **solo sul telefono** (nessun account): esportare ogni tanto una copia da Impostazioni.

## Prezzi carburante

Il sito MIMIT non risponde ai server di GitHub (esteri), quindi i dati del giorno partono dal PC:
l'attività pianificata di Windows «SpesaSmart - prezzi carburanti» esegue ogni mattina alle 9:30
`scripts/pubblica-carburanti.mjs` (anche a mano: `Aggiorna prezzi carburanti.cmd`). Dettagli in
[docs/pubblicazione.md](docs/pubblicazione.md).

## Per sviluppatori

Il disco `U:` è lento: si lavora nella copia locale `%LOCALAPPDATA%\SpesaSmart\app`
(`npm run dev`, `npm test`, `npm run build`). Codice principale:

```
src/lib/trip.ts       distanza dal GPS, costi, resoconti, CSV (testato)
src/lib/tracker.ts    viaggio in corso: GPS continuo, schermo acceso, salvataggio
src/lib/fuel*.ts      prezzi medi carburante dai dati MIMIT
src/pages/            Viaggio, Resoconto, Modifica viaggio, Impostazioni, Info
scripts/              download e preparazione open data MIMIT
```

Fonti: MIMIT (IODL 2.0), © OpenStreetMap contributors (ODbL), OSRM.
