/**
 * Testi standard dei documenti quando lo studio non li personalizza (FR-M0-05, FR-M5-20).
 * Segnaposto della dichiarazione asseverativa: {titolo} {nome} {ordine} {numero} {profilo}.
 * Il testo va validato da un legale prima della produzione (AFU Q-16).
 */
export const DEFAULT_ATTESTATION =
  'Il/La sottoscritto/a {titolo} {nome}, iscritto/a all’{ordine} al n. {numero}, in qualità di progettista, consapevole delle ' +
  'responsabilità penali previste dall’art. 76 del D.P.R. 445/2000 e dall’art. 481 del Codice Penale in caso di dichiarazioni ' +
  'mendaci, ASSEVERA che le opere in progetto rispettano i requisiti igienico-sanitari di cui al profilo normativo "{profilo}", ' +
  'come dettagliato nella presente relazione.';

export const ATTESTATION_PLACEHOLDERS = ['{titolo}', '{nome}', '{ordine}', '{numero}', '{profilo}'] as const;

/** Formula di chiusura del verbale di sopralluogo. */
export const DEFAULT_CLOSING_FORMULA = 'Letto, confermato e sottoscritto.';
