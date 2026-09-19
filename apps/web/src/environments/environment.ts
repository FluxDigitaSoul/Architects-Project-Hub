/**
 * Configurazione pubblica del frontend.
 * Contiene SOLO valori destinati al browser: URL di Supabase e chiave "publishable"
 * (pensata per stare nel client; i dati sono protetti dall'API e dalla RLS).
 * La chiave secret non va MAI qui: resta nel backend (.env).
 *
 * `apiBase` è relativo: in sviluppo il dev server fa da proxy verso l'API (proxy.conf.json),
 * in produzione Vercel riscrive /api verso il backend (stessa origine: serve al cookie del portale).
 */
export const environment = {
  supabaseUrl: 'https://fwftucqnfkuzlnriyzja.supabase.co',
  supabasePublishableKey: 'sb_publishable_PHrCgURVV34-91JYGsVjPA_9NYdpSJe',
  apiBase: '/api/v1',
  /** Dominio base dei portali: {slug}.{baseDomain}. In sviluppo lo studio si sceglie dopo il login. */
  baseDomain: 'projecthub.it',
};
