-- =============================================================================
-- 0400 — Storage dei file di progetto (elaborati, foto, audio, PDF)
--
-- ⚠️ SOLUZIONE TEMPORANEA: per la Beta si usa un bucket di Supabase Storage al posto di
-- Amazon S3 (AFU cap. 14). Il backend accede allo storage SOLO tramite l'interfaccia
-- `FileStorage` (apps/api), così il passaggio a S3 cambia un adapter, non il dominio.
-- Vedi docs/development/ROADMAP.md, voce "Migrazione storage a S3".
--
-- Regole (AFU NFR-SEC-03/04, BR-04):
-- - bucket PRIVATO: nessun accesso pubblico, nessuna policy per anon/authenticated;
-- - accesso solo dal backend con la chiave secret, download con URL firmati a scadenza breve;
-- - chiavi degli oggetti prefissate dal tenant: tenants/{tenantId}/... (cap. 11.3).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  false,
  209715200, -- 200 MB (FR-M2-01)
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/svg+xml',
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg'
  ]
)
on conflict (id) do nothing;
