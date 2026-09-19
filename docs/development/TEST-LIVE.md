# Test dal vivo (in locale, sul progetto Supabase di test)

Come provare a mano tutta l'applicazione, come nelle verifiche fatte durante lo sviluppo.

## Preparazione (una volta)

1. `.env` nella radice compilato (vedi `.env.example`) con le chiavi del progetto di test `fwftucqnfkuzlnriyzja` e `MAIL_PROVIDER=log`.
2. Dalla radice: `npm install`, poi `npm run build --workspace packages/contracts --workspace packages/rai-engine`.
3. Avvia l'API: `npm run dev:api` → `http://localhost:3000/api/v1/health` deve rispondere `ok`.
4. Avvia l'interfaccia: `npm run dev:web` → `http://localhost:4200`.
5. Utente di prova già pronto: `e2e-ui-owner@example.com` (password nel tuo gestore di password), studio **E2E UI Studio Bianchi**, commessa **2026-001**. In alternativa registrati con una tua email.

Con `MAIL_PROVIDER=log` **nessuna email parte davvero**: Magic Link, codici OTP, inviti e notifiche compaiono nel terminale dell'API.

## Giro completo

| # | Cosa fare | Cosa verificare |
|---|-----------|-----------------|
| 1 | Accedi, apri **Impostazioni** | Profilo con iscrizione all'albo ("puoi firmare"), avvisi via email, studio, marchio (colore e logo si applicano subito), persone |
| 2 | **Commesse** → nuova commessa con un committente (una tua seconda email) | Codice progressivo; nel log dell'API l'email con il link `/p/…` |
| 3 | Scheda **Tavole**: carica un PDF, pubblica con una scadenza | Anteprima delle pagine; nel log l'email di pubblicazione |
| 4 | Apri il link `/p/…` in una **finestra anonima** | Portale con il marchio dello studio, informativa privacy, tavola da rivedere, scelta "Avvisi via email" |
| 5 | Nel portale aggiungi un pin; nello studio rispondi | Stati Aperto ↔ In attesa; dopo 10 minuti una sola email per destinatario con tutte le novità |
| 6 | Nel portale **Approva** (codice OTP dal log dell'API) | Versione congelata, riepilogo PDF in **Documenti**, email a studio e committente |
| 7 | Scheda **R.A.I.**: fabbricato, unità, vano, aperture | Esito in tempo reale; "Emetti revisione" e **relazione asseverata** in PDF |
| 8 | **Documenti**: scarica la relazione, ricarica un PDF firmato | Un PDF diverso da quello generato viene rifiutato |
| 9 | **Cantiere** → nuovo sopralluogo; voci, presenti (con il DL), foto, nota vocale | "Finalizza e firma" → **Verbale PDF** con la formula di chiusura dello studio |
| 10 | Cantiere **senza rete**: DevTools → Network → *Offline*, poi aggiungi voci e foto | Banner "Senza rete", voci "in attesa di rete"; togli *Offline* → partono da sole, in ordine |

## Provare la PWA (serve la build di produzione)

Il service worker è attivo solo nella build di produzione. Con l'API avviata:

```bash
cd apps/web
npm run build
npx http-server dist/web/browser -p 8080 -c-1 -P http://localhost:3000
```

Apri `http://localhost:8080` (partendo dalla home: i file della build li serve `http-server`, il resto, cioè `/api`, va all'API). In DevTools → Application → Service workers deve comparire `ngsw-worker.js`; con Network → *Offline* l'app continua ad aprirsi.

Sul telefono si prova meglio dopo il deploy: apri il sito → **Aggiungi a schermata Home** → modalità aereo → l'app si apre e `/cantiere` mostra i dati salvati.

## Job pianificati

Con l'API in esecuzione il log mostra `Job pianificati attivi` (in sviluppo lo scheduler è acceso). Per lanciarne uno a mano, imposta `JOBS_SECRET` (almeno 32 caratteri) nel `.env`, riavvia l'API e:

```bash
curl -X POST -H "Authorization: Bearer <JOBS_SECRET>" http://localhost:3000/api/v1/internal/jobs/notifications
```

## Test automatici

```bash
npm test                # unit di pacchetti, API e interfaccia
npm run test:e2e:api    # e2e contro il progetto di test (crea dati e2e-*)
```

I dati `e2e-*` si eliminano con `supabase/scripts/cleanup-e2e.sql`.
