# Pubblicare SpesaSmart su Internet

Per usarla dal telefono ovunque e installarla come app serve un indirizzo **HTTPS** pubblico.
SpesaSmart è un sito statico (non serve un server): qualsiasi hosting statico va bene.

## Pubblicazione attiva: GitHub Pages

- App: <https://ciettino1993.github.io/spesasmart/>
- Codice: <https://github.com/Ciettino1993/spesasmart> (ramo `main`)
- Ogni modifica caricata su `main` ripubblica l'app in 2-3 minuti
  (`.github/workflows/pubblica.yml`: test, prezzi carburanti, compilazione, pubblicazione).

### Prezzi carburanti: perché passano dal PC

Il sito MIMIT **non accetta connessioni dai server di GitHub** (sono all'estero: «Connect Timeout»),
mentre dall'Italia funziona. Per questo:

1. `Aggiorna prezzi carburanti.cmd` (o `npm run fuel:pubblica`) scarica dal PC i due CSV MIMIT e li
   carica sul ramo `carburanti` del repository (un solo salvataggio, sostituito ogni volta).
2. Il caricamento avvia la pubblicazione, che legge i CSV da quel ramo.
3. I dati MIMIT del giorno escono verso le 8:45: conviene aggiornare dopo le 9.

Se il PC non aggiorna, l'app resta online con gli ultimi prezzi caricati e mostra la data dei dati.

**Aggiornamento automatico:** attività pianificata di Windows «SpesaSmart - prezzi carburanti», ogni giorno
alle 9:30 (se il PC è spento, alla prima accensione; riprova 2 volte ogni 30 minuti se fallisce).
Registro: `%LOCALAPPDATA%\SpesaSmart\carburanti.log`. Per disattivarla: Utilità di pianificazione →
Libreria → «SpesaSmart - prezzi carburanti» → Disabilita.

## Alternativa: il sito che hai già

Se hai già un sito (es. su Netlify), si può pubblicare SpesaSmart in una sottocartella o in un
sottodominio. Per l'aggiornamento giornaliero dei prezzi carburante serve una ricompilazione
programmata (Netlify: "build hook" chiamato ogni giorno da un'attività pianificata).

## Prima della pubblicazione (checklist della specifica, Appendice C)

- [x] Prezzi mai inventati, stati verificato/segnalato/scaduto
- [x] Prezzi carburante da fonte ufficiale con licenza e attribuzione
- [x] Scanner con fallback manuale
- [x] Esportazione e cancellazione dati
- [ ] Test su iPhone (Safari) e Android (Chrome) reali: fotocamera, installazione, offline
- [ ] Informativa privacy definitiva (se si attivano account e sincronizzazione)
- [ ] Per uso intenso: istanze dedicate o fornitori a pagamento per mappe, Overpass e percorsi
      (i server pubblici gratuiti hanno limiti d'uso)
