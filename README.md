# Architects Project Hub

Project Hub white-label per studi di architettura: revisione tavole con il committente, verifica R.A.I., diario di cantiere. SaaS multi-tenant.

- Analisi funzionale: [docs/afu](docs/afu/README.md)
- Decisioni architetturali: [docs/architecture/adr](docs/architecture/adr/README.md)
- Roadmap di sviluppo: [docs/development/ROADMAP.md](docs/development/ROADMAP.md)

## Struttura del repository

Un solo repository, con frontend e backend **separati e deployabili in modo indipendente** (ADR-001):

```
apps/
  web/          Angular 21 — app dello studio (+ portale committente e PWA cantiere)   → Vercel
  api/          NestJS — API REST                                                       → AWS   [in arrivo]
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
4. Variabili d'ambiente: nessuna per ora (il frontend usa dati in memoria finché le API non sono pronte).

Se un giorno servissero due repository, `apps/web` si sposta così com'è: dentro non ci sono riferimenti a percorsi esterni oltre ai due pacchetti condivisi, che si pubblicherebbero come pacchetti npm.

## Stato del frontend (Fase C della roadmap)

Fatto, con dati in memoria (`apps/web/src/app/core/data`):

- design system white-label (token CSS, contrasto automatico), login, wizard di onboarding con anteprima dal vivo, impostazioni branding;
- dashboard, elenco commesse, fascicolo commessa, finestre **Nuova commessa** e **Accesso committenti** (Magic Link);
- **revisione tavole**: visualizzatore con zoom/pan/pinch e pin in coordinate percentuali, thread, risoluzione e riapertura, approvazione formale con dichiarazione e OTP (simulato: codice `482913`);
- **portale del committente** su `/p/:token` (demo: `/p/demo-colombo`, firmatario);
- **modulo R.A.I.** con calcolo in tempo reale (stesso motore del backend);
- **diario di cantiere** mobile: foto, note vocali, bozza AI (simulata), finalizzazione con i blocchi di BR-05.

Gli store espongono già l'interfaccia che verrà collegata alle API del backend.
