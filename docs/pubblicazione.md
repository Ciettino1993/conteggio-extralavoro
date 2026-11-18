# Pubblicare SpesaSmart su Internet

Per usarla dal telefono ovunque e installarla come app serve un indirizzo **HTTPS** pubblico.
SpesaSmart è un sito statico (non serve un server): qualsiasi hosting statico va bene.

## Opzione consigliata: GitHub Pages (gratis, prezzi carburante aggiornati ogni giorno)

Il file `.github/workflows/pubblica.yml` è già pronto: ogni mattina scarica i nuovi prezzi MIMIT,
esegue i test, compila l'app e la pubblica.

Cosa serve da parte tua (una volta sola, circa 10 minuti):

1. Crea un account gratuito su <https://github.com> (puoi usare l'accesso con Google).
2. Dimmi il nome utente: preparo io il repository e la pubblicazione. Ti verrà chiesto solo di
   autorizzare l'accesso dal browser (la password la inserisci tu, mai in chat).
3. Indirizzo finale: `https://<nome-utente>.github.io/spesasmart/`

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
