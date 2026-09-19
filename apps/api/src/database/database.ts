import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Kysely, PostgresDialect, type Transaction, sql } from 'kysely';
import { Pool, types } from 'pg';
import { ENV, type Env } from '../config/env';
import type { Database } from './schema';

// Le colonne `date` (scadenze, termini, date della commessa) restano 'YYYY-MM-DD': convertirle in
// Date a mezzanotte del fuso del server sposterebbe il giorno nelle risposte JSON.
types.setTypeParser(types.builtins.DATE, (value: string) => value);

export type Db = Kysely<Database>;
export type Tx = Transaction<Database>;

export interface DbContext {
  tenantId?: string;
  userId?: string;
}

/**
 * Accesso al database con il ruolo `app_api` (soggetto a RLS, ADR-004).
 * Ogni operazione di dominio passa da `withContext`: una transazione in cui il tenant e
 * l'utente sono impostati con `set_config(..., true)`, valida solo per quella transazione
 * (compatibile con il pooler in modalità transaction).
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;
  readonly db: Db;

  constructor(@Inject(ENV) env: Env) {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      ssl: { rejectUnauthorized: env.DATABASE_SSL_STRICT },
    });
    this.db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: this.pool }) }).withSchema('app');
  }

  withContext<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (tx) => {
      await sql`select set_config('app.tenant_id', ${ctx.tenantId ?? ''}, true),
                       set_config('app.user_id', ${ctx.userId ?? ''}, true)`.execute(tx);
      return fn(tx);
    });
  }

  async ping(): Promise<boolean> {
    const r = await sql<{ ok: number }>`select 1 as ok`.execute(this.db);
    return r.rows[0]?.ok === 1;
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
