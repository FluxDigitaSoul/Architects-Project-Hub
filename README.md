# Architects Project Hub

Project Hub white-label per studi di architettura: revisione tavole con il committente, verifica R.A.I., diario di cantiere. SaaS multi-tenant.

- Analisi funzionale: [docs/afu](docs/afu/README.md)
- Decisioni architetturali: [docs/architecture/adr](docs/architecture/adr/README.md)
- Roadmap di sviluppo: [docs/development/ROADMAP.md](docs/development/ROADMAP.md)
- **Stato e prossimi passi: [docs/development/STATO-E-PROSSIMI-PASSI.md](docs/development/STATO-E-PROSSIMI-PASSI.md)**
- Deploy in produzione: [docs/deploy/DEPLOY.md](docs/deploy/DEPLOY.md)
- Test dal vivo in locale: [docs/development/TEST-LIVE.md](docs/development/TEST-LIVE.md)

## Struttura del repository

Un solo repository, con frontend e backend **separati e deployabili in modo indipendente** (ADR-001):

```
apps/
  web/          Angular 21 — app dello studio (+ portale committente e PWA cantiere)   → Vercel
  api/          NestJS — API REST e job pianificati                                     → AWS
packages/
  rai-engine/   Motore di calcolo R.A.I. condiviso FE/BE (TypeScript puro)
  contracts/    Codici d'errore, enum, entitlements condivisi
supabase/       Migrazioni SQL del database (PostgreSQL su Supabase)
db-tests/       Test d'integrazione del database su Postgres reale                     [in arrivo]
docs/           AFU, ADR, roadmap, questionario
```

## Requisiti

Node ≥ 22 (consigliato 24), npm 11, Docker (solo per i test del database).

## Comandi

```bash
npm install            # installa tutto il monorepo
npm run dev:web        # frontend su http://localhost:4200
npm run build          # build di tutti i workspace
npm test               # test di packages e frontend
npm run lint           # ESLint su tutto il repository
```

Il frontend importa `@aph/rai-engine` e `@aph/contracts` **dai sorgenti** (tramite `paths` in `apps/web/tsconfig.json`): nessuna build preliminare dei pacchetti.

## Deploy del frontend su Vercel

1. Importa il repository su Vercel.
2. **Root Directory:** `apps/web` (attiva "Include source files outside of the Root Directory").
3. Il resto è in [`apps/web/vercel.json`](apps/web/vercel.json): installazione dalla radice del monorepo (`npm ci`), build `ng build`, output `dist/web/browser`, rewrite SPA e header di sicurezza.
4. Variabili d'ambiente: nessuna. URL dell'API e chiave pubblica di Supabase stanno in `apps/web/src/environments`; in produzione il rewrite `/api` verso l'API è ancora da configurare.

Se un giorno servissero due repository, `apps/web` si sposta così com'è: dentro non ci sono riferimenti a percorsi esterni oltre ai due pacchetti condivisi, che si pubblicherebbero come pacchetti npm.

## Sviluppo in locale

```bash
cp .env.example .env   # poi compila le chiavi del progetto Supabase di test
npm run dev:api        # API su http://localhost:3000/api/v1
npm run dev:web        # interfaccia su http://localhost:4200
npm run test:e2e:api   # test e2e contro il progetto Supabase di test (dati e2e-*)
```

Con `MAIL_PROVIDER=log` le email (inviti, Magic Link, OTP, notifiche) compaiono nel log dell'API.

## Stato

Interfaccia e API sono collegate end-to-end: commesse e committenti, revisione tavole con pin e approvazione con OTP, portale del committente, R.A.I. con relazione asseverata, diario di cantiere con coda offline di foto e audio, documenti con firma PAdES e invio, impostazioni dello studio e automazione. Il dettaglio per requisito è nella [gap analysis](docs/development/GAP-ANALYSIS.md).

## Cantiere offline (PWA)

L'app si installa dal browser del telefono ("Aggiungi a schermata Home") e si apre anche senza rete: il service worker (solo nella build di produzione) conserva l'interfaccia, mentre cantieri, commessa e sopralluoghi aperti restano in una copia locale (IndexedDB). Voci del verbale, dati, presenti, foto e note vocali fatti senza rete restano sul telefono e partono da soli, in ordine, appena torna la connessione; un sopralluogo si può anche avviare offline e riceve il numero alla sincronizzazione. Le foto vengono ricodificate in JPEG sul dispositivo: niente EXIF né posizione GPS nei verbali. Le icone si rigenerano con `node apps/web/scripts/generate-icons.mjs`.

## Automazione

Job pianificati dell'API (`apps/api/src/automation`), idempotenti e con un'esecuzione alla volta (lease su `app.job_runs`):

| Job | Quando | Cosa fa |
|-----|--------|---------|
| `notifications` | ogni 2 minuti | Invia le notifiche della revisione raggruppate: una email per destinatario e commessa ogni 10 minuti, o un riepilogo alle 18 (FR-MT-06) |
| `review-reminders` | ogni giorno alle 08:00 | Promemoria ai committenti firmatari 2 giorni prima della scadenza e il giorno stesso; nessuna approvazione automatica (FR-M2-05, BR-19) |
| `retention` | ogni giorno alle 03:30 | Elimina l'audio grezzo dopo il periodo scelto dallo studio (PRIV-03), le notifiche vecchie di 90 giorni, segna i link scaduti e tronca gli IP dell'audit dopo 90 giorni (cap. 12.2) |

Con `JOBS_SCHEDULER=on` girano dentro l'API. In alternativa (es. EventBridge Scheduler, AFU cap. 14.3) si imposta `JOBS_SECRET` e si chiama `POST /api/v1/internal/jobs/<nome>` con `Authorization: Bearer <JOBS_SECRET>`; `GET /api/v1/internal/jobs` mostra le ultime esecuzioni.
