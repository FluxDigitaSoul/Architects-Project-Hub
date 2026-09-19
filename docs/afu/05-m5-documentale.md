# 5.5 Modulo 5 — Engine documentale e generazione PDF

**Obiettivo:** generare documenti professionali, con il marchio dello studio, **deterministici** (stessi dati → stesso contenuto), verificabili tramite hash e prodotti entro 3 secondi (`NFR-PERF-01`).

## Requisiti comuni a tutti i documenti

### FR-M5-00 — Regole generali di impaginazione · **M**

| Aspetto | Specifica |
|---------|-----------|
| Formato | A4 verticale, margini 20 mm (15 mm in basso con piè di pagina) |
| Carta intestata | Logo per stampa (FR-M0-03) + dati dello studio secondo le impostazioni (FR-M0-11) |
| Font | Font sans-serif open source incorporato (subset) per garantire resa identica; corpo 10 pt nel testo, 8 pt nelle note |
| Intestazione ripetuta | Da pagina 2: logo piccolo, tipo documento, codice commessa, numero documento |
| Piè di pagina | "Pagina X di Y", denominazione e P.IVA dello studio, identificativo del documento, data di generazione |
| Standard PDF | PDF/A-2b per i documenti **definitivi** (archiviazione a lungo termine) — Should; PDF 1.7 minimo |
| Metadati PDF | Titolo, autore (studio), soggetto, parole chiave, data di creazione |
| Accessibilità | PDF con tag (struttura dei titoli, testo alternativo per le immagini) — Should |
| Bozze | Filigrana diagonale "BOZZA — NON VALIDO" su ogni pagina |
| Documenti annullati | Filigrana "ANNULLATO" + motivo e data in prima pagina |
| Hash | SHA-256 del PDF definitivo, salvato e riportato nel riepilogo di verifica. **Non** stampato nel PDF stesso (sarebbe circolare); nel PDF c'è un **codice di verifica breve** consultabile dallo studio |
| Lingua | Italiano; formati numerici italiani (virgola decimale, punto per le migliaia), date `gg/mm/aaaa` |
| Nome file | `{tipo}_{codiceCommessa}_{numero}_{aaaammgg}.pdf`, es. `Verbale_2026-014_VS-03_20260918.pdf` |

### FR-M5-02 — Firma dei documenti · **M**

- **Beta:** nel PDF c'è il **blocco firma** con nome, titolo, ordine e numero di iscrizione del professionista (`BR-08`), l'**immagine della firma** se caricata (FR-M0-08) e il riquadro per la firma autografa di esecutore e DL (per la stampa).
- **Firma digitale del professionista (Should):** download del PDF definitivo per firmarlo in **PAdES** con il dispositivo del professionista (smart card o firma remota) e **ricaricamento** del PDF firmato. Il sistema verifica che il contenuto firmato corrisponda al documento generato (stesso hash del contenuto prima della firma, oppure confronto del documento incorporato) e lo archivia come "versione firmata digitalmente".
- **Integrazione diretta con un prestatore di firma qualificata:** Won't in Beta.

### FR-M5-03 — Archivio documenti · **M**

Ogni documento generato viene archiviato nella commessa con: tipo, numero, revisione, stato (Bozza / Definitivo / Firmato digitalmente / Annullato), autore, data, hash e collegamento all'oggetto di origine (sopralluogo, snapshot R.A.I., approvazione). I documenti definitivi **non** si eliminano (`BR-09`).

### FR-M5-04 — Rigenerazione e determinismo · **M**

Rigenerare un documento definitivo dagli stessi dati dello snapshot deve produrre lo **stesso contenuto** (testo, valori, immagini, impaginazione). Solo metadati come la data di stampa possono cambiare, e il sistema lo esplicita. Il documento archiviato originale resta la fonte di verità.

### FR-M5-05 — Invio dei documenti · **M**

- Invio via email ai destinatari scelti (committenti, imprese, altri indirizzi) con un messaggio personalizzabile.
- Il PDF va **allegato** se ≤ 10 MB; oltre, **link di download** a scadenza (7 giorni, rinnovabile) con il marchio dello studio.
- Tracciamento: data di invio, destinatari ed esito della consegna (accettato dal server di posta / rimbalzato). La lettura **non** si traccia con pixel nascosti (privacy).
- **Invio via PEC:** Won't in Beta (`Q-14`). Il sistema permette di scaricare il PDF per inviarlo dalla propria casella PEC e di registrarne a mano l'invio.

---

## Documento 1 — Verbale di sopralluogo di cantiere

### FR-M5-01 — Contenuto e struttura · **M**

1. **Intestazione:** carta intestata dello studio; titolo "VERBALE DI SOPRALLUOGO N. {n}"; data, ora di inizio e fine.
2. **Dati della commessa e del cantiere:** codice e titolo commessa, indirizzo del cantiere, dati catastali (se presenti), committente/i, impresa/e esecutrice/i, titolo edilizio (se presente).
3. **Direttore dei Lavori:** nome, titolo, iscrizione all'albo.
4. **Presenti:** elenco con qualifica e ente di appartenenza.
5. **Condizioni meteo** (se compilate).
6. **Riferimento al verbale precedente** e stato delle azioni aperte verificate (se FR-M4-15 è attivo).
7. **Blocco 1 — Avanzamento lavori:** elenco numerato (1.1, 1.2, …).
8. **Blocco 2 — Difformità, non conformità e fermi:** elenco numerato (2.1, …) con gravità e rimandi alle foto ("vedi Foto 4, 5").
9. **Blocco 3 — Disposizioni e ordini di servizio:** elenco numerato (3.1, …) con destinatario e **termine** evidenziato.
10. **Note generali** (se presenti).
11. **Documentazione fotografica:** griglia di 2 foto per riga (4–6 per pagina), ognuna con numero progressivo, didascalia, data e ora di scatto; le foto sono ridimensionate per la stampa (≈ 150 dpi alla dimensione di stampa) per contenere il peso del file.
12. **Chiusura e firme:** luogo e data; formula di chiusura (configurabile, predefinita: "Letto, confermato e sottoscritto"); riquadri firma: Direttore dei Lavori, Impresa esecutrice (per presa visione), Committente (facoltativo).
13. **Nota di trasparenza (se il testo è nato da AI):** in piè di pagina dell'ultima pagina, "Testo redatto con il supporto di strumenti di trascrizione e sintesi automatica e verificato dal Direttore dei Lavori" — configurabile (`Q-15`).

**Dimensione:** verbale con 30 foto ≤ 8 MB.

---

## Documento 2 — Relazione tecnica sui requisiti aeroilluminanti

### FR-M5-20 — Contenuto e struttura · **M**

1. **Frontespizio:** carta intestata; titolo "RELAZIONE TECNICA — VERIFICA DEI REQUISITI IGIENICO-SANITARI E DEI RAPPORTI AEROILLUMINANTI"; oggetto (tipologia di intervento, indirizzo, dati catastali); committente; titolo edilizio di riferimento (CILA/SCIA/PdC/SCA); revisione e data.
2. **Premessa e riferimenti normativi:** elenco generato dal profilo usato (es. D.M. Sanità 5/7/1975, artt. 1–7; DPR 380/2001 art. 24 c. 5-bis se si applica D-01; regolamento edilizio comunale, articoli specifici), con la versione del profilo.
3. **Criteri e metodologia di calcolo (legenda):** definizioni di `Sp`, `Si`, `Sa`; regole di misura attive (quota di esclusione, aggetti, telaio, aperture in falda); formule; soglie per destinazione. Il testo è generato dai parametri del profilo, così è sempre coerente con il calcolo eseguito.
4. **Prospetto tabellare per unità immobiliare:**

| Vano | Destinazione | Sp [mq] | H [m] | Aperture | Si [mq] | Sa [mq] | Si/Sp | Sa/Sp | Minimo | Δ [mq] | Esito |
|------|--------------|---------|-------|----------|---------|---------|-------|-------|--------|--------|-------|

   seguito dal **dettaglio delle aperture** per vano (etichetta, L × H, davanzale, apribilità, Si, Sa, correzioni applicate) e, facoltativamente, dall'abaco dei serramenti.
5. **Vani ciechi e vani di servizio:** elenco con la modalità di ventilazione.
6. **Verifiche dimensionali:** altezze e superfici minime per vano; monostanza; verifica per abitanti (se presente).
7. **Deroghe applicate:** per ciascuna, vano, verifica coperta, riferimento normativo, condizione di accesso (per D-01), **motivazione tecnica** integrale.
8. **Quadro riepilogativo del fabbricato** (FR-M3-15).
9. **Esito normativo:** frase generata dall'esito complessivo, in tre varianti (conforme / subordinato ad asseverazione / non conforme — quest'ultima solo nel "Report di verifica", non nella relazione asseverativa).
10. **Formula di asseverazione:** testo configurabile dal tenant, con testo predefinito, es.: *"Il/La sottoscritto/a {titolo} {nome cognome}, iscritto/a all'{ordine} al n. {numero}, in qualità di progettista, consapevole delle responsabilità penali previste dall'art. 76 del D.P.R. 445/2000 e dall'art. 481 del Codice Penale in caso di dichiarazioni mendaci, ASSEVERA che le opere in progetto rispettano i requisiti igienico-sanitari di cui al D.M. 5 luglio 1975 e al regolamento {…}, come dettagliato nella presente relazione."* La formula va **validata dal consulente legale e dallo studio partner** (`Q-16`).
11. **Timbro e firma:** blocco firma del professionista (FR-M5-02) e spazio per il timbro professionale.
12. **Allegati (Should):** planimetria con individuazione dei vani (upload di un'immagine o scelta di un elaborato della commessa).

### FR-M5-21 — Varianti della relazione · **M**

| Variante | Quando | Filigrana | Formula di asseverazione |
|----------|--------|-----------|--------------------------|
| **Report di verifica** (bozza di lavoro) | Sempre disponibile | "DOCUMENTO DI LAVORO — NON ASSEVERATIVO" | No |
| **Relazione asseverativa** | Solo se `BR-06` è soddisfatta | Nessuna (definitivo) | Sì |

### FR-M5-22 — Revisioni della relazione · **M**

Numerazione Rev. 0, Rev. 1, … ogni revisione è uno snapshot autonomo (FR-M3-16) con un campo "Motivo della revisione" obbligatorio da Rev. 1 in poi.

---

## Documento 3 — Riepilogo di approvazione dell'elaborato

### FR-M5-10 — Contenuto · **M**

1. Carta intestata; titolo "RIEPILOGO DI APPROVAZIONE ELABORATO".
2. Commessa, elaborato (codice, titolo, categoria, fase), versione, data di pubblicazione.
3. Miniatura della prima pagina (e numero di pagine).
4. **Dati dell'approvazione:** nome del firmatario e ruolo; data e ora (UTC e ora locale italiana); indirizzo IP; browser e dispositivo; metodo di verifica ("Codice OTP inviato a m***@dominio.it il … e verificato il …"); **hash SHA-256 del file approvato**; codice di verifica dell'approvazione.
5. Testo integrale della dichiarazione accettata.
6. Riepilogo dei pin: totale, risolti, aperti al momento dell'approvazione (con elenco dei pin aperti e del loro primo commento).
7. Nota: "La verifica dell'integrità si fa confrontando l'hash del file approvato con quello del file in possesso delle parti."

---

## Documento 4 — Esportazione dei commenti su tavola (Should)

Vedi FR-M2-14.

---

## Criteri di accettazione chiave del Modulo 5

- **AC-FR-M5-01-1** — *Dato* un sopralluogo con 3 voci per blocco e 12 foto, *quando* il DL finalizza, *allora* il PDF è pronto entro **3 s** (p95, `NFR-PERF-01`), contiene tutte le sezioni da 1 a 12 nell'ordine indicato, le foto numerate da 1 a 12 con didascalia e l'intestazione con logo e dati dello studio del tenant.
- **AC-FR-M5-20-1** — *Data* una commessa con un vano non conforme senza deroga, *quando* l'architetto chiede la relazione asseverativa, *allora* il sistema la nega indicando il vano e permette di generare solo il Report di verifica con filigrana.
- **AC-FR-M5-04-1** — *Dato* uno snapshot R.A.I. della Rev. 0, *quando* la relazione viene rigenerata 6 mesi dopo con un profilo aggiornato nel frattempo, *allora* valori ed esiti coincidono con la Rev. 0 originale.
- **AC-FR-M5-10-1** — *Data* un'approvazione registrata, *quando* si apre il PDF di riepilogo, *allora* l'hash riportato coincide con l'hash SHA-256 del file originale della versione approvata ricalcolato in modo indipendente.
- **AC-FR-M5-00-1** — *Dato* un tenant con colore primario personalizzato, *quando* si genera un qualsiasi PDF, *allora* nessun testo del corpo usa il colore primario e il documento stampato in scala di grigi resta interamente leggibile.
