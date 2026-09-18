# 10. Roadmap della Beta e piano di test congiunto

## 10.1 Principi

- **Incrementale e collaudabile:** ogni milestone produce un rilascio usabile dallo studio partner in staging, con un collaudo formale.
- **Test-first:** i criteri di accettazione (cap. 9) diventano test automatici **prima** dell'implementazione (in particolare corpus R.A.I. e business rules).
- **Gate di uscita:** una milestone si chiude solo quando i suoi criteri di uscita sono soddisfatti e il verbale di collaudo è firmato dal referente dello studio partner.

## 10.2 Milestone 0 — Fondamenta (prerequisito tecnico)

**Obiettivo:** base tecnica per tutte le milestone.
**Contenuto:** repository e monorepo, pipeline CI/CD, ambienti (sviluppo, staging, produzione) come codice, autenticazione di base, modello del tenant con isolamento (RLS), osservabilità, libreria UI con i design token, predisposizione i18n. Vedi cap. 14.
**Criteri di uscita:**
- deploy automatico su staging a ogni merge sul branch principale;
- test di isolamento dei tenant (TC-SEC-01) attivo in CI;
- ADR delle scelte architetturali principali approvati.

## 10.3 Milestone 1 — Scheletro gestionale e modulo white-label

| Voce | Dettaglio |
|------|-----------|
| **Requisiti** | FR-M0-01..06, 08, 10, 11 · FR-M1-01..03 · FR-MT-01..04, 07, 12, 15, 16, 18, 19 |
| **Deliverable** | Console del Platform Admin; onboarding del tenant; branding completo sul sottodominio; gestione dei membri; CRUD delle commesse; audit log |
| **Demo di collaudo** | Il Platform Admin crea il tenant dello studio partner → l'Owner configura logo e colori → invita 2 membri → crea 3 commesse reali |
| **Criteri di uscita** | Tutti i TC di MS1 superati; audit di accessibilità di base senza problemi bloccanti; lo studio partner conferma che il branding è "presentabile ai clienti" |
| **Dati richiesti al partner** | Logo in vettoriale, colori istituzionali, dati dello studio e iscrizioni all'albo, elenco del team |

## 10.4 Milestone 2 — Calcolatore R.A.I. validato su casi reali

| Voce | Dettaglio |
|------|-----------|
| **Requisiti** | FR-M3-01..10, 12..16 · FR-M0-11, 12 · FR-M5-00, 02..04, 20..22 |
| **Deliverable** | Profili nazionale, Salva Casa e del comune del partner; inserimento di vani e aperture; badge in tempo reale; quadro riepilogativo; relazione PDF (report di verifica e asseverativa) |
| **Attività congiunta chiave** | **Workshop normativo** (mezza giornata) con lo studio partner per: (1) costruire il profilo del regolamento edilizio del loro comune principale, articolo per articolo; (2) validare la formula di asseverazione; (3) chiudere `Q-01`, `Q-02`, `Q-11`, `Q-16` |
| **Dati richiesti al partner** | Almeno **3 progetti reali già depositati**, con le verifiche R.A.I. fatte a mano (fogli di calcolo o relazioni), da usare come corpus TC-R-20..40 |
| **Criteri di uscita** | 100% di corrispondenza tra gli esiti del motore e quelli validati a mano sui casi reali (KPI-04), oppure ogni differenza spiegata e risolta; PDF della relazione ≤ 3 s; la relazione di un progetto reale è giudicata dallo studio "depositabile senza modifiche sostanziali" |

## 10.5 Milestone 3 — Interfaccia di revisione con un committente di test

| Voce | Dettaglio |
|------|-----------|
| **Requisiti** | FR-M2-01..18 · FR-M1-04..06 · FR-M5-10 · FR-MT-05, 06, 08, 11, 13, 17 · FR-M0-07, 09 |
| **Deliverable** | Upload e versionamento; viewer; pin e thread; sign-off con OTP; PDF del riepilogo di approvazione; dashboard della commessa; notifiche email; dominio personalizzato (se lo studio lo vuole) |
| **Attività congiunta chiave** | **Pilota con 1–3 committenti reali o "amichevoli"** dello studio partner su una commessa in corso; test di usabilità guidato (NFR-UX-06) con osservazione e registrazione (con consenso) |
| **Criteri di uscita** | Almeno 1 ciclo completo pubblicazione → commenti → nuova versione → approvazione concluso da un committente reale; nessun bug bloccante o critico aperto; NFR-UX-06 soddisfatto da ≥ 4 committenti su 5; revisione legale del testo del sign-off (`Q-08`) |

## 10.6 Milestone 4 — Test sul campo in cantiere (foto + vocale → verbale)

| Voce | Dettaglio |
|------|-----------|
| **Requisiti** | FR-M4-01..16 · FR-M5-01, 05 · FR-M1-07 · FR-MT-09, 10, 14 · FR-M0-13 |
| **Deliverable** | PWA installabile; sopralluogo offline; registrazione e trascrizione; strutturazione AI; editing; finalizzazione; PDF del verbale; invio |
| **Attività congiunta chiave** | **Almeno 10 sopralluoghi reali** su almeno 2 cantieri diversi (uno con copertura scarsa), in un periodo di 3–4 settimane. Per ogni sopralluogo si raccolgono: tempo fino all'invio (KPI-01), percentuale di correzioni (KPI-02), problemi riscontrati |
| **Preparazione** | Raccolta del corpus TC-AI (registrazioni con consenso di tutti i presenti), revisione della DPIA (cap. 12) prima di usare dati reali |
| **Criteri di uscita** | KPI-01 ≤ 15 minuti nella mediana; KPI-02 ≤ 20%; **zero perdite di dati** di campo; NFR-AI-01 soddisfatto sul corpus; nessun bug bloccante aperto |

## 10.7 Sessione di debriefing e passaggio alla v1.0

- **Quando:** entro 2 settimane dalla chiusura della MS4.
- **Partecipanti:** titolare e team dello studio partner, product owner, lead tecnico, UX.
- **Input:** KPI (cap. 1.2), feedback in-app (FR-MT-16), bug aperti, esiti dei test di usabilità, costi di esercizio reali (AI, storage, email), questionario di soddisfazione (KPI-07).
- **Agenda:**
  1. revisione dei KPI rispetto ai target;
  2. cosa ha funzionato e cosa no, per modulo;
  3. **prioritizzazione del backlog** per la v1.0 (MoSCoW rivisto): candidati dal cap. 1.3 "Fuori perimetro" e dai Should/Could non fatti;
  4. modello di prezzo e packaging (posti, storage, minuti di audio);
  5. decisione go/no-go per aprire la Beta a 3–5 studi aggiuntivi.
- **Output:** verbale di debriefing, backlog v1.0 prioritizzato, aggiornamento di questa AFU alla v1.0.

## 10.8 Piano di test congiunto

### Livelli di test e responsabilità

| Livello | Chi | Quando | Strumento / evidenza |
|---------|-----|--------|----------------------|
| Unit test | Sviluppo | A ogni commit | CI, copertura ≥ 80% (100% per motore R.A.I. e BR) |
| Integration / API | Sviluppo | A ogni merge | CI, database reale in container |
| Isolamento dei tenant | Sviluppo | A ogni merge | Suite TC-SEC-01 generata per tutti gli endpoint |
| End-to-end | QA | Nightly su staging | Flussi P-01, P-02, P-03 (con offline simulato) |
| Regressione R.A.I. | Sviluppo + partner | A ogni modifica del motore o dei profili | Corpus TC-R |
| Valutazione AI | Sviluppo | A ogni modifica di prompt o modello | Corpus TC-AI |
| Accessibilità | QA | A ogni milestone | axe automatico + audit manuale |
| Prestazioni | Sviluppo | Prima di ogni milestone | Test di carico su staging (NFR-PERF, NFR-SCAL) |
| Sicurezza | Esterno + sviluppo | Prima di MS3 e dell'apertura ad altri studi | Scansioni automatiche + penetration test (NFR-SEC-15) |
| Collaudo utente (UAT) | **Studio partner** | Alla fine di ogni milestone | Verbale di collaudo firmato |
| Test sul campo | **Studio partner** | MS4 | Diario dei test sul campo |

### Ambienti

- **Staging** dedicato con il tenant dello studio partner; dati realistici; nessun dato personale reale di committenti senza la base giuridica e le informative adeguate (cap. 12).
- Dispositivi di test di riferimento: 1 iPhone recente + 1 iPhone di 3–4 anni, 1 Android di fascia media, 1 iPad, 1 PC Windows, 1 Mac.

### Gestione dei difetti

| Gravità | Definizione | Tempo di presa in carico (Beta) |
|---------|-------------|---------------------------------|
| **Bloccante** | Impedisce un flusso critico, causa perdita di dati o violazione di sicurezza/isolamento | Entro 4 ore lavorative; hotfix |
| **Critica** | Esito normativo errato, documento con dati sbagliati, funzione principale inutilizzabile senza alternativa | Entro 1 giorno lavorativo |
| **Maggiore** | Funzione degradata con alternativa possibile | Prossimo rilascio |
| **Minore** | Estetica, testi, piccoli fastidi | Backlog |

> **Un errore di calcolo del R.A.I. è sempre almeno "Critico"**, anche se l'interfaccia funziona.

### Modello di verbale di collaudo di milestone

```
Milestone: MSx — {titolo}           Data: gg/mm/aaaa
Versione rilasciata: x.y.z (staging)
Partecipanti: …
Requisiti collaudati: elenco ID con esito (Superato / Fallito / Non testato)
Difetti aperti: ID, gravità, decisione (bloccante per l'uscita sì/no)
Criteri di uscita: soddisfatti sì/no, con note
Decisione: Milestone ACCETTATA / ACCETTATA CON RISERVA / NON ACCETTATA
Firme: Referente studio partner ______  Product owner ______
```
