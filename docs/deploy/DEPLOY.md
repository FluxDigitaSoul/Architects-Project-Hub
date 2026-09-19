# Deploy in produzione

Architettura (AFU cap. 14, ADR-001): **frontend** statico su Vercel, **API** NestJS in un container, **database, Auth e storage** su Supabase (UE). Il browser vede un solo dominio: Vercel inoltra `/api/*` all'API, così il cookie di sessione del portale dei committenti resta di prima parte.

```
https://app.<dominio>           → Vercel (apps/web)
https://app.<dominio>/api/*     → rewrite → https://api.<dominio>/api/*  (container apps/api)
                                             → Supabase (Postgres via pooler, Auth, Storage)
```

## 1. Supabase di produzione

1. Nuovo progetto in regione **UE** (es. eu-central-1 o eu-west-1), separato da quello di test.
2. Applica **tutte** le migrazioni di `supabase/migrations/`, in ordine (con la CLI: `supabase link --project-ref <ref>` e `supabase db push`). **Non** eseguire `supabase/seed.sql`: contiene solo dati di sviluppo.
3. Password del ruolo applicativo (una stringa lunga e casuale, da salvare nel secret manager):
   ```sql
   alter role app_api with login password '<password-lunga-casuale>';
   ```
4. Documenti legali veri (l'attivazione di uno studio registra l'accettazione delle ultime versioni):
   ```sql
   insert into app.legal_documents (type, version, url) values
     ('TOS', '2026-10', 'https://<dominio>/legal/termini'),
     ('DPA', '2026-10', 'https://<dominio>/legal/dpa'),
     ('PRIVACY', '2026-10', 'https://<dominio>/legal/privacy');
   ```
5. **Auth** → URL configuration: Site URL `https://app.<dominio>`, Redirect URLs `https://app.<dominio>/**`. Template delle email (conferma, reset password) in italiano. SMTP personalizzato (lo stesso fornitore delle email dell'API) per non restare nei limiti dell'SMTP di Supabase.
6. **Auth** → Password: attiva la **protezione dalle password compromesse** (Leaked password protection).
7. **Database** → Backups: attiva il **Point-in-Time Recovery** prima di caricare dati reali (NFR-AVAIL-02).
8. Controlla **Advisors → Security**: deve risultare pulito.
9. Annota: `Project URL`, chiave **publishable**, chiave **secret** e la stringa del **pooler in modalità transaction** (porta 6543) per l'utente `app_api.<ref>`.

## 2. Email

Account **Resend** con il dominio di invio verificato (record **SPF**, **DKIM** e **DMARC** nel DNS). Mittente es. `notifiche@<dominio>`: lo studio compare come nome del mittente e come Reply-To (FR-M0-09).

## 3. API (container)

Immagine: `docker build -f apps/api/Dockerfile -t aph-api .` (dalla radice del repository). Va su qualsiasi hosting di container: AWS App Runner o ECS come previsto dall'AFU, oppure Render, Fly.io o Railway per la Beta. Health check: `GET /api/v1/health` (verifica anche il database). Il container gira come utente non privilegiato.

Variabili d'ambiente (nessun segreto nell'immagine; i segreti nel secret manager dell'hosting):

| Variabile | Valore in produzione |
|-----------|----------------------|
| `NODE_ENV` | `production` |
| `PORT` | quella richiesta dall'hosting (predefinita 3000) |
| `TRUST_PROXY` | numero di proxy davanti all'API: di solito `2` (rewrite di Vercel + bilanciatore dell'hosting). **Obbligatorio**: senza, IP delle approvazioni e limiti di tentativi sarebbero quelli del proxy |
| `DATABASE_URL` | `postgresql://app_api.<ref>:<password>@<pooler>:6543/postgres` |
| `DATABASE_SSL_STRICT` | `false` finché non si configura il certificato CA di Supabase, poi `true` |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_JWKS_URL` | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `SUPABASE_PUBLISHABLE_KEY` | chiave publishable |
| `SUPABASE_SECRET_KEY` | chiave secret (**solo** qui, mai nel frontend) |
| `STORAGE_BUCKET` | `project-files` |
| `PLATFORM_BASE_DOMAIN` | `<dominio>` |
| `APP_BASE_URL` | `https://app.<dominio>` (base dei link nelle email) |
| `CORS_ORIGINS` | `https://app.<dominio>` |
| `MAIL_PROVIDER` | `resend` (con `log` l'API in produzione non parte, di proposito) |
| `RESEND_API_KEY` | chiave di Resend |
| `MAIL_FROM` | `notifiche@<dominio>` |
| `JOBS_SCHEDULER` | `on` se c'è almeno un'istanza sempre accesa (il lease evita doppioni con più istanze); `off` se l'hosting spegne le istanze inattive |
| `JOBS_SECRET` | solo con uno scheduler esterno: almeno 32 caratteri casuali |

Con uno scheduler esterno (EventBridge Scheduler, cron dell'hosting, GitHub Actions), tutte con l'header `Authorization: Bearer <JOBS_SECRET>`:

- ogni 2 minuti `POST https://api.<dominio>/api/v1/internal/jobs/notifications`
- ogni giorno alle 08:00 (Europe/Rome) `POST …/internal/jobs/review-reminders`
- ogni giorno alle 03:30 `POST …/internal/jobs/retention`

`GET …/internal/jobs` mostra le ultime esecuzioni.

## 4. Frontend (Vercel)

1. Importa il repository; **Root Directory** `apps/web`, con "Include source files outside of the Root Directory" attivo. Il resto è in `apps/web/vercel.json`.
2. In `apps/web/vercel.json` sostituisci `https://api.projecthub.it` con l'indirizzo reale dell'API (prima regola di `rewrites`).
3. Variabili d'ambiente del progetto Vercel (Production):
   - `APH_SUPABASE_URL` = `https://<ref>.supabase.co` (progetto di **produzione**)
   - `APH_SUPABASE_PUBLISHABLE_KEY` = chiave publishable
   - `APH_BASE_DOMAIN` = `<dominio>`

   La build le scrive in `environment.production.ts` (`apps/web/scripts/write-env.mjs`). Senza queste variabili la build di produzione **si ferma**, per non andare online collegati al database di test; con una chiave `sb_secret_` si ferma lo stesso. Nelle anteprime, senza variabili, si usa il progetto di test.
4. Dominio: `app.<dominio>` su Vercel, `api.<dominio>` sull'hosting dell'API.

## 5. Dopo il primo deploy

1. `https://app.<dominio>/api/v1/health` risponde `{"status":"ok","db":"ok"}` (passa dal rewrite: conferma anche quello).
2. Registrati, attiva uno studio, crea una commessa con te stesso come committente e fai il giro completo del [test dal vivo](../development/TEST-LIVE.md).
3. In Supabase, `app.audit_events` deve registrare IP pubblici veri, non quelli del proxy: conferma di `TRUST_PROXY`.
4. Installa l'app dal telefono (Chrome o Safari → Aggiungi a schermata Home) e prova un sopralluogo in modalità aereo.

## Sicurezza prima di aprire ai clienti

- **Rigenera la `SUPABASE_SECRET_KEY` del progetto di test** (è stata condivisa in chat) e usa chiavi diverse per la produzione.
- Nessun segreto nel repository: solo `.env.example`. Il file `.env` resta locale.
- Testi di dichiarazione e approvazione da far validare a un legale (AFU Q-16); informativa privacy, termini e DPA pubblicati agli URL inseriti in `legal_documents`.
- Storage: per ora Supabase Storage; migrazione ad Amazon S3 prevista prima del lancio pubblico (vedi ROADMAP).
