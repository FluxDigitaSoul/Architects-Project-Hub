# Architecture Decision Records (ADR)

Ogni decisione architetturale importante si registra qui con il formato: **Contesto → Decisione → Alternative considerate → Conseguenze**. Un ADR accettato non si modifica: se la decisione cambia, se ne scrive uno nuovo che lo **sostituisce**.

| ADR | Titolo | Stato |
|-----|--------|-------|
| [ADR-001](ADR-001-monorepo.md) | Monorepo unico con npm workspaces | Accettato |
| ADR-002 | Regione AWS primaria e strategia di DR | Da scrivere |
| [ADR-003](ADR-003-autenticazione.md) | Autenticazione: Supabase Auth per lo studio, token propri per i committenti | Proposto |
| [ADR-004](ADR-004-multitenancy-accesso-dati.md) | Multi-tenancy con schema condiviso + RLS, SQL-first, Kysely | Accettato |
| ADR-005 | Domini personalizzati (CloudFront SaaS Manager vs Cloudflare for SaaS) | Da scrivere (`Q-30`) |
| ADR-006 | Motore di generazione PDF | Da scrivere |
| ADR-007 | Fornitori ASR/LLM | Da scrivere (`Q-22`) |
| ADR-008 | Strategia offline e sincronizzazione della PWA | Da scrivere |
| ADR-009 | Viewer deep-zoom e formato dei tile | Da scrivere |
| [ADR-010](ADR-010-rai-engine.md) | Motore R.A.I.: libreria pura condivisa e aritmetica decimale | Accettato |
| ADR-011 | Motore entitlements e modello piani/abbonamenti | Da scrivere (bozza nel cap. 14 dell'AFU) |
| ADR-012 | Stripe e fatturazione elettronica SDI | Da scrivere |
