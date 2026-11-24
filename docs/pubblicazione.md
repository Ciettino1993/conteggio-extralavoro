# Pubblicazione

- App: <https://ciettino1993.github.io/conteggio-extralavoro/>
- Codice: <https://github.com/Ciettino1993/conteggio-extralavoro> (ramo `main`)
- Ogni modifica caricata su `main` ripubblica l'app in 2-3 minuti
  (`.github/workflows/pubblica.yml`: test, prezzi carburanti, compilazione, pubblicazione su GitHub Pages).

## Prezzi carburanti: perché passano dal PC

Il sito MIMIT **non accetta connessioni dai server di GitHub** (sono all'estero: «Connect Timeout»),
mentre dall'Italia funziona. Per questo:

1. `scripts/pubblica-carburanti.mjs` scarica dal PC i due CSV MIMIT e li carica sul ramo `carburanti`
   del repository (un solo salvataggio, sostituito ogni volta).
2. Il caricamento avvia la pubblicazione, che legge i CSV da quel ramo.
3. I dati MIMIT del giorno escono verso le 8:45.

**Aggiornamento automatico:** attività pianificata di Windows «SpesaSmart - prezzi carburanti», ogni giorno
alle 9:30 (se il PC è spento, alla prima accensione; riprova 2 volte ogni 30 minuti se fallisce).
Registro: `%LOCALAPPDATA%\SpesaSmart\carburanti.log`. A mano: `Aggiorna prezzi carburanti.cmd`.
Per disattivarla: Utilità di pianificazione → Libreria → «SpesaSmart - prezzi carburanti» → Disabilita.

Se il PC non aggiorna, l'app resta online con gli ultimi prezzi caricati e mostra la data dei dati.
