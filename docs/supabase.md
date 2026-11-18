# Collegare Supabase (fase successiva)

Oggi SpesaSmart salva tutto sul dispositivo (IndexedDB): funziona senza account e offline.
Supabase serve quando si vuole:

- accedere con un account e ritrovare liste e spese su più dispositivi;
- condividere i prezzi rilevati tra tutti gli utenti, con moderazione;
- avere un'area di amministrazione (catalogo, equivalenze, negozi, segnalazioni).

## Cosa è già pronto

- `supabase/migrations/20261117000000_init.sql`: tabelle della specifica (Appendice A) con PostGIS,
  vincoli, indici, **Row Level Security** su tutte le tabelle, ruoli (utente, moderatore, catalogo,
  amministratore) e funzione `stores_nearby` per la ricerca per raggio.
  *Non ancora eseguito su un database reale*: va provato alla creazione del progetto.
- Nel database locale tutti gli id sono UUID generati sul dispositivo, quindi la sincronizzazione
  potrà caricare i dati esistenti senza duplicati.
- I prezzi rilevati dall'utente sono già separati («segnalato», fonte «utente») e corrispondono
  alla tabella `price_reports` in coda di moderazione.

## Cosa serve da parte tua

1. Crea un account gratuito su <https://supabase.com> e un nuovo progetto (regione: Europa).
2. Da *Project Settings → API* copia **Project URL** e **anon public key** e mettile in un file `.env`
   (modello in `.env.example`). La chiave anon può stare nel frontend; la chiave **service_role non
   va mai condivisa né messa nell'app**.
3. Da lì in poi: applicazione della migrazione, login via email, sincronizzazione liste/sessioni,
   invio segnalazioni prezzi e pagina di moderazione.
