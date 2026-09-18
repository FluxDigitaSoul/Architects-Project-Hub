# ADR-001 — Monorepo unico con npm workspaces

**Stato:** Accettato · **Data:** 2026-09-18

## Contesto

Il prodotto ha un backend NestJS, un frontend Angular (app dello studio, portale del committente, PWA di cantiere) e codice che **deve** essere identico su frontend e backend: il motore di calcolo R.A.I. (AFU FR-M3-10, V-05), i codici d'errore delle business rule e le chiavi degli entitlements. Lo sviluppo è fatto da un team piccolo, con uno sviluppatore principale.

## Decisione

- **Un solo repository** per backend, frontend, librerie condivise, migrazioni del database, infrastruttura e documentazione.
- **npm workspaces** (npm 11, Node ≥ 22) come gestore del monorepo:
  - `apps/*` — applicazioni eseguibili (`api` oggi, poi `worker` e `web`);
  - `packages/*` — librerie condivise (`rai-engine`, `contracts`), compilate con `tsup` in doppio formato ESM/CJS, così le usano sia NestJS (CommonJS) sia Angular (ESM);
  - `db-tests` — test d'integrazione del database su Postgres reale.
- **Un solo test runner:** Vitest ovunque (Angular 21 lo usa già come predefinito; NestJS tramite il plugin SWC per i metadata dei decoratori).
- TypeScript `strict` condiviso da `tsconfig.base.json`.

## Alternative considerate

| Alternativa | Perché no (per ora) |
|-------------|---------------------|
| Due repository separati (BE e FE) | Il motore R.A.I. e i contratti andrebbero pubblicati come pacchetti versionati: più attrito, rischio di divergenza tra client e server, due CI da mantenere |
| Nx | Ottimo per monorepo grandi (cache, "affected"), ma aggiunge configurazione e dipendenze. Si potrà adottare più avanti senza riscrivere il codice, se i tempi di build lo giustificano |
| pnpm / Turborepo | pnpm non è installato nell'ambiente di sviluppo e npm 11 copre i bisogni attuali; Turborepo valutabile insieme a Nx |

## Conseguenze

- Un solo PR può cambiare in modo coerente API, contratti e UI.
- La CI esegue lint, typecheck, test e build di tutti i workspace.
- Se in futuro frontend e backend avranno team o cicli di rilascio diversi, si potranno separare i deploy **senza** separare il repository.
