# Stato del progetto e prossimi passi

Aggiornato al **2026-09-19**. Punto di ripartenza per la prossima sessione: cosa è fatto, cosa manca nello sviluppo, cosa serve per andare in produzione e chi deve farlo.

Documenti collegati:
- stato per requisito AFU: [GAP-ANALYSIS.md](GAP-ANALYSIS.md)
- fasi e step: [ROADMAP.md](ROADMAP.md)
- guida al deploy: [../deploy/DEPLOY.md](../deploy/DEPLOY.md)
- test a mano in locale: [TEST-LIVE.md](TEST-LIVE.md)

---

## 1. Dove siamo

### Repository

- Branch di lavoro: `claude/afu-project-hub-whitlabel-fa5e1e`, confluito in `main` (merge `813fac0`, già su GitHub).
- Dopo quel merge sul branch sono arrivati la correzione della configurazione di ESLint (`44e8832`) e la preparazione al deploy (`e46e7f6`), da portare in `main` con un nuovo merge.
- Nel repository non ci sono segreti: solo `.env.example`; il `.env` resta locale.
- Controlli: tipi, lint, test unitari (pacchetti 29 + 53, API 10, web 9), test e2e dell'API sul progetto Supabase di test (10 + 13) e build: tutto verde. CI su GitHub Actions (`.github/workflows/ci.yml`).

### Fatto e verificato

Quasi tutti i requisiti obbligatori (Must) dell'AFU:

- studi e white-label: attivazione, profilo, marchio con loghi e colori, testi dei documenti, persone e ruoli;
- commesse, committenti, imprese, team con DL unico, Magic Link con revoca;
- revisione delle tavole: caricamento, versioni, pin, discussioni, pubblicazione con scadenza, trasferimento dei pin, richieste di modifica;
- portale del committente con informativa privacy e **approvazione con OTP**, riepilogo PDF;
- **R.A.I.** persistente con revisioni e relazione asseverata / report di verifica;
- **diario di cantiere**: sopralluoghi numerati, voci, presenti, foto e note vocali, verbale PDF; **funziona senza rete** ed è **installabile come app** (PWA); foto senza EXIF/GPS, HEIC convertito;
- **documenti**: archivio, firma PAdES esterna con verifica, invio via email, condivisione nel portale;
- **automazione**: notifiche raggruppate (10 minuti o riepilogo giornaliero, a scelta), promemoria delle scadenze di revisione, conservazione dei dati (audio, notifiche, link scaduti, IP dell'audit);
- **preparazione al deploy**: immagine Docker dell'API, configurazione di produzione del frontend dalle variabili di Vercel, rewrite `/api`, `TRUST_PROXY` per l'IP reale dei client.

---

## 2. Cosa manca nello sviluppo

### Must che si possono fare subito

| Requisito | Cosa | Note |
|-----------|------|------|
| FR-MT-09 | Esportazione dei dati dello studio | Archivio scaricabile (dati + file) per l'Owner |
| FR-M6-09 | Pagina di consumi e quote | Tabelle pronte, mancano contatori e pagina |
| FR-MT-15 | Console di amministrazione della piattaforma | Tenant, piani, override, trial |
| FR-M0-06 | Sottodomini degli studi nell'interfaccia | L'API li gestisce già; serve il DNS wildcard |
| FR-MT-12 | Traduzioni | Oggi tutto in italiano: va bene per la Beta |

### Bloccati da una decisione

- **Q-22** — trascrizione e strutturazione AI del verbale: scegliere il fornitore. Stati e tabelle sono già pronti.
- **Q-16** — testi di dichiarazione e approvazione: validazione legale.

### Should / Could

- centro notifiche nell'app (FR-MT-05) e disiscrizione con un clic (`List-Unsubscribe`);
- abaco dei serramenti nell'interfaccia (l'API c'è) e raggruppamento dei pin vicini;
- cronologia delle ultime configurazioni del marchio;
- esportazione dei commenti in PDF e note interne della commessa;
- dominio personalizzato ed email con il marchio dello studio.

### Fase D (dopo la Beta)

Stripe (abbonamenti), fatturazione elettronica SDI, back-office, demo e lead magnet.

---

## 3. Cosa manca per il deploy

### Fatto (pronto nel repository)

- [x] `apps/api/Dockerfile` + `.dockerignore`: immagine costruita e provata (health check `ok`, utente non privilegiato).
- [x] Configurazione di produzione del frontend: `apps/web/scripts/write-env.mjs` legge `APH_SUPABASE_URL`, `APH_SUPABASE_PUBLISHABLE_KEY`, `APH_BASE_DOMAIN`; senza variabili (o con una chiave secret) la build di produzione su Vercel si ferma.
- [x] Rewrite `/api` in `apps/web/vercel.json` (stessa origine per il cookie del portale) e intestazioni di cache per il service worker.
- [x] Guida completa: [DEPLOY.md](../deploy/DEPLOY.md).

### Da fare con i tuoi account

1. **Hosting dell'API** — AWS (App Runner o ECS) come previsto dall'AFU, oppure Render, Fly o Railway per la Beta. Un'istanza sempre accesa (scheduler interno `JOBS_SCHEDULER=on`) oppure un cron esterno con `JOBS_SECRET`.
2. **Supabase di produzione** (regione UE):
   - applicare tutte le migrazioni di `supabase/migrations/` (non il `seed.sql`);
   - password del ruolo `app_api`;
   - righe di `app.legal_documents` con gli URL veri di termini, DPA e privacy;
   - Auth: indirizzo del sito e redirect, template delle email in italiano, SMTP;
   - protezione dalle password compromesse e backup/PITR.
3. **Segreti e variabili**:
   - **rigenerare la `SUPABASE_SECRET_KEY` del progetto di test** (è stata condivisa in chat);
   - creare `RESEND_API_KEY` e, se serve, `JOBS_SECRET`;
   - variabili dell'API: `NODE_ENV=production`, `TRUST_PROXY=2`, `DATABASE_URL`, `SUPABASE_*`, `APP_BASE_URL`, `CORS_ORIGINS`, `PLATFORM_BASE_DOMAIN`, `MAIL_PROVIDER=resend`, `MAIL_FROM`; `DATABASE_SSL_STRICT` resta `false` finché non si configura il certificato CA di Supabase.
4. **Vercel** — root `apps/web`, variabili `APH_*`, indirizzo reale dell'API al posto di `api.projecthub.it` in `vercel.json`.
5. **Email** — account Resend con il dominio verificato (SPF, DKIM, DMARC).
6. **Dominio e DNS** — `app.<dominio>` e `api.<dominio>`; il wildcard per i sottodomini degli studi è facoltativo.
7. **GitHub** — segreti di Supabase per i test e2e in CI, protezione del branch `main`.
8. **Legale** — validazione dei testi (Q-16); informativa privacy, termini e DPA pubblicati.
9. **Formattazione finale** con Prettier (189 file): la fai tu alla fine.
10. **Pulizia dei dati di test `e2e-*`** sul progetto di test (`supabase/scripts/cleanup-e2e.sql`), solo su tua richiesta.

---

## 4. Test dal vivo

- **In locale, subito**: vedi [TEST-LIVE.md](TEST-LIVE.md). `npm run dev:api` + `npm run dev:web`, giro completo in 10 passi; con `MAIL_PROVIDER=log` Magic Link, OTP ed email compaiono nel terminale dell'API. Offline: DevTools → Network → Offline. PWA: build di produzione servita con `http-server`.
- **Online**: servono i punti 1–6 del capitolo 3. Per una prova veloce si può usare il progetto Supabase di test come "produzione" (si salta il punto 2).
- Dopo il primo deploy: `https://app.<dominio>/api/v1/health` risponde `ok`; in `app.audit_events` compaiono IP pubblici veri (conferma di `TRUST_PROXY`); installazione dell'app sul telefono e sopralluogo in modalità aereo.

---

## 5. Da dove ripartire

1. Portare in `main` gli ultimi commit del branch e fare il push.
2. Deploy di prova (capitolo 3, punti 1–6) e test dal vivo online.
3. Scegliere tra i Must rimasti: esportazione dei dati, consumi e quote, console di amministrazione.
4. Decisioni aperte: fornitore AI (Q-22), testi legali (Q-16).
