// Scrive la configurazione pubblica del frontend per la build di produzione
// (src/environments/environment.production.ts, ignorato da git) dalle variabili d'ambiente:
//   APH_SUPABASE_URL              es. https://<ref>.supabase.co del progetto di PRODUZIONE
//   APH_SUPABASE_PUBLISHABLE_KEY  chiave "publishable" (sb_publishable_…), pensata per il browser
//   APH_BASE_DOMAIN               dominio base dei portali (facoltativo, predefinito projecthub.it)
// Sul deploy di produzione di Vercel (VERCEL_ENV=production) le variabili sono obbligatorie: meglio
// una build fallita che un'app in produzione collegata al database di test. Altrove (CI, prove in
// locale, anteprime) senza variabili si usano i valori di sviluppo di environment.ts.
import { copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { env, exit, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'environments');
const target = join(dir, 'environment.production.ts');
const url = env.APH_SUPABASE_URL?.trim();
const key = env.APH_SUPABASE_PUBLISHABLE_KEY?.trim();
const baseDomain = env.APH_BASE_DOMAIN?.trim() || 'projecthub.it';

if (!url || !key) {
  if (env.VERCEL_ENV === 'production') {
    stderr.write('✗ APH_SUPABASE_URL e APH_SUPABASE_PUBLISHABLE_KEY sono obbligatorie per la build di produzione.\n');
    exit(1);
  }
  copyFileSync(join(dir, 'environment.ts'), target);
  stdout.write('ℹ environment.production.ts = valori di sviluppo (variabili APH_* non impostate)\n');
  exit(0);
}

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
  stderr.write(`✗ APH_SUPABASE_URL non valido: ${url}\n`);
  exit(1);
}
if (key.startsWith('sb_secret_')) {
  stderr.write('✗ APH_SUPABASE_PUBLISHABLE_KEY contiene una chiave SECRET: non va mai nel frontend.\n');
  exit(1);
}
if (!/^[a-z0-9.-]+$/i.test(baseDomain)) {
  stderr.write(`✗ APH_BASE_DOMAIN non valido: ${baseDomain}\n`);
  exit(1);
}

writeFileSync(target, `// Generato da scripts/write-env.mjs durante la build: non modificare, non committare.
export const environment = {
  supabaseUrl: ${JSON.stringify(url)},
  supabasePublishableKey: ${JSON.stringify(key)},
  apiBase: '/api/v1',
  baseDomain: ${JSON.stringify(baseDomain)},
};
`);
stdout.write(`✓ environment.production.ts → ${url}\n`);
