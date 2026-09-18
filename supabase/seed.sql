-- Dati di sviluppo locale (eseguiti da `supabase db reset`).
-- Il catalogo dei piani è una migrazione (dato di riferimento anche in produzione),
-- non un seed. Qui vanno solo dati fittizi per lo sviluppo.

insert into app.legal_documents (type, version, url) values
  ('TOS', '2026-09-draft', 'https://example.invalid/legal/tos/2026-09-draft'),
  ('DPA', '2026-09-draft', 'https://example.invalid/legal/dpa/2026-09-draft'),
  ('PRIVACY', '2026-09-draft', 'https://example.invalid/legal/privacy/2026-09-draft')
on conflict do nothing;
