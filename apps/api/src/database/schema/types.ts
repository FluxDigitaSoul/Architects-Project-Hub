import type { ColumnType } from 'kysely';

/**
 * Timestamp: letto come Date, scritto come Date o stringa ISO.
 * Si usa ColumnType diretto (non annidato in Generated<> o in un'unione con null),
 * così Kysely deduce correttamente i tipi di select, insert e update.
 */
export type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
export type NullableTimestamp = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;

/** Numerico SQL (numeric): pg lo restituisce come stringa, così non si perde precisione (BR-22). */
export type Numeric = ColumnType<string, string | number, string | number>;
export type NullableNumeric = ColumnType<string | null, string | number | null | undefined, string | number | null>;

/** Colonna JSON con valore predefinito nel database: facoltativa in inserimento (JSON serializzato). */
export type JsonWithDefault<T> = ColumnType<T, string | undefined, string>;

/** Colonna JSON che ammette null: facoltativa in inserimento. */
export type NullableJson<T> = ColumnType<T | null, string | null | undefined, string | null>;
