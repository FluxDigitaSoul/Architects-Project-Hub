import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { AppError } from '../common/app-error';
import { NotificationsService } from '../automation/notifications.service';
import { AuditService, type RequestMeta } from '../common/audit';
import type { Tx } from '../database/database';
import type { AuthorType, PinStatus, VersionStatus } from '../database/schema/review';
import { assertUuid } from '../studio/studio-scope';

/** Chi agisce sulla revisione: un membro dello studio o un committente (dal portale). */
export interface ReviewActor {
  type: AuthorType; // MEMBER | CLIENT
  /** user_id per i membri, client_contact_id per i committenti. */
  id: string;
  tenantId: string;
  projectId: string;
}

const EDIT_WINDOW_MS = 15 * 60 * 1000; // BR-14
const CLIENT_VISIBLE: VersionStatus[] = ['PUBLISHED', 'APPROVED', 'SUPERSEDED']; // BR-25

const auditActor = (actor: ReviewActor) => (actor.type === 'MEMBER' ? ('USER' as const) : ('CLIENT' as const));

/** Pin e thread di commenti — FR-M2-07..13, SM-PIN, BR-01/11/14/20. */
@Injectable()
export class PinsService {
  constructor(
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Versione della commessa visibile all'attore; per il committente solo le pubblicate (BR-25). */
  async loadVersion(tx: Tx, actor: ReviewActor, versionId: string) {
    assertUuid(versionId, 'Versione');
    const version = await tx.selectFrom('drawing_versions as v').innerJoin('drawings as d', 'd.id', 'v.drawing_id')
      .select(['v.id', 'v.number', 'v.status', 'v.frozen_at', 'v.page_count', 'v.drawing_id', 'v.sha256', 'v.published_at',
        'd.title', 'd.sheet_code', 'd.project_id', 'd.download_allowed'])
      .where('v.id', '=', versionId).where('d.project_id', '=', actor.projectId).executeTakeFirst();
    if (!version) throw new AppError('NOT_FOUND', 'Versione non trovata.');
    if (actor.type === 'CLIENT' && !CLIENT_VISIBLE.includes(version.status)) throw new AppError('NOT_FOUND', 'Versione non trovata.');
    return version;
  }

  /** Vista completa per il viewer: pagine, pin e thread con i nomi degli autori. */
  async view(tx: Tx, actor: ReviewActor, versionId: string) {
    const version = await this.loadVersion(tx, actor, versionId);
    const pages = await tx.selectFrom('drawing_pages').select(['id', 'page_index', 'width_px', 'height_px', 'rotation'])
      .where('version_id', '=', version.id).orderBy('page_index').execute();
    const pins = await tx.selectFrom('pins').selectAll().where('version_id', '=', version.id)
      .where('status', '<>', 'WITHDRAWN').orderBy('number').execute();
    const comments = pins.length
      ? await tx.selectFrom('comments').selectAll().where('pin_id', 'in', pins.map((p) => p.id)).orderBy('created_at').execute()
      : [];
    const names = await this.authorNames(tx, [...pins, ...comments]);
    const pageIndex = new Map(pages.map((p) => [p.id, p.page_index]));

    return {
      version: {
        id: version.id, number: version.number, status: version.status, drawingId: version.drawing_id,
        title: version.title, sheetCode: version.sheet_code, pageCount: version.page_count, sha256: version.sha256,
        frozen: Boolean(version.frozen_at), publishedAt: version.published_at ? new Date(version.published_at).toISOString() : null,
        downloadAllowed: version.download_allowed,
      },
      pages: pages.map((p) => ({ index: p.page_index, width: p.width_px, height: p.height_px, rotation: p.rotation })),
      pins: pins.map((p) => ({
        id: p.id,
        number: p.number,
        pageIndex: pageIndex.get(p.page_id) ?? 0,
        x: Number(p.x_pct),
        y: Number(p.y_pct),
        status: p.status,
        category: p.category,
        authorType: p.author_type,
        authorName: names.get(`${p.author_type}:${p.author_id}`) ?? '—',
        isMine: p.author_type === actor.type && p.author_id === actor.id,
        createdAt: new Date(p.created_at).toISOString(),
        comments: comments.filter((c) => c.pin_id === p.id).map((c) => ({
          id: c.id,
          authorType: c.author_type,
          authorName: names.get(`${c.author_type}:${c.author_id}`) ?? '—',
          isMine: c.author_type === actor.type && c.author_id === actor.id,
          body: c.retracted_at ? '' : c.body,
          retracted: Boolean(c.retracted_at),
          edited: Boolean(c.edited_at),
          createdAt: new Date(c.created_at).toISOString(),
        })),
      })),
    };
  }

  private async authorNames(tx: Tx, rows: Array<{ author_type: AuthorType; author_id: string }>) {
    const members = [...new Set(rows.filter((r) => r.author_type === 'MEMBER').map((r) => r.author_id))];
    const clients = [...new Set(rows.filter((r) => r.author_type === 'CLIENT').map((r) => r.author_id))];
    const names = new Map<string, string>();
    if (members.length) {
      const users = await tx.selectFrom('user_profiles').select(['id', 'first_name', 'last_name', 'email']).where('id', 'in', members).execute();
      users.forEach((u) => names.set(`MEMBER:${u.id}`, [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email));
    }
    if (clients.length) {
      const contacts = await tx.selectFrom('client_contacts').select(['id', 'display_name']).where('id', 'in', clients).execute();
      contacts.forEach((c) => names.set(`CLIENT:${c.id}`, c.display_name));
    }
    return names;
  }

  /** FR-M2-08: nuovo pin con il primo commento. BR-20: coordinate % della pagina, validate. */
  async createPin(
    tx: Tx, actor: ReviewActor, versionId: string,
    input: { pageIndex: number; x: number; y: number; body: string; category?: string | null }, meta?: RequestMeta,
  ) {
    const version = await this.loadVersion(tx, actor, versionId);
    const allowed: VersionStatus[] = actor.type === 'CLIENT' ? ['PUBLISHED'] : ['DRAFT', 'PUBLISHED'];
    if (version.frozen_at) throw new AppError('VERSION_FROZEN', 'Questa versione è approvata o superata: usa "Richiedi una modifica".');
    if (!allowed.includes(version.status)) throw new AppError('INVALID_TRANSITION', 'Su questa versione non si possono aggiungere pin.');
    if (![input.x, input.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)) {
      throw new AppError('VALIDATION_FAILED', 'Posizione del pin fuori dalla tavola.');
    }
    const page = await tx.selectFrom('drawing_pages').select('id')
      .where('version_id', '=', version.id).where('page_index', '=', input.pageIndex).executeTakeFirst();
    if (!page) throw new AppError('VALIDATION_FAILED', 'Pagina inesistente.');

    // Numerazione per versione senza collisioni: si blocca la riga della versione.
    await sql`select 1 from app.drawing_versions where id = ${version.id}::uuid for update`.execute(tx);
    const { max } = await tx.selectFrom('pins').select((eb) => eb.fn.max('number').as('max'))
      .where('version_id', '=', version.id).executeTakeFirstOrThrow();
    const pin = await tx.insertInto('pins').values({
      tenant_id: actor.tenantId, version_id: version.id, page_id: page.id, number: Number(max ?? 0) + 1,
      x_pct: input.x.toFixed(4), y_pct: input.y.toFixed(4), category: input.category ?? null,
      author_type: actor.type, author_id: actor.id,
    }).returning(['id', 'number']).executeTakeFirstOrThrow();
    await tx.insertInto('comments').values({
      tenant_id: actor.tenantId, pin_id: pin.id, author_type: actor.type, author_id: actor.id, body: input.body,
    }).execute();
    await this.audit.record(tx, {
      tenantId: actor.tenantId, actorType: auditActor(actor), actorId: actor.id,
      action: 'PIN_CREATED', objectType: 'PIN', objectId: pin.id, details: { versionId: version.id, number: pin.number }, meta,
    });
    await this.notifications.reviewActivity(tx, actor, pin.id, 'PIN_CREATED', input.body);
    return pin;
  }

  private async loadPin(tx: Tx, actor: ReviewActor, pinId: string) {
    assertUuid(pinId, 'Pin');
    const pin = await tx.selectFrom('pins').selectAll().where('id', '=', pinId).executeTakeFirst();
    if (!pin) throw new AppError('NOT_FOUND', 'Pin non trovato.');
    const version = await this.loadVersion(tx, actor, pin.version_id);
    return { pin, version };
  }

  /** FR-M2-10: risposta nel thread; aggiorna lo stato (SM-PIN: Aperto ↔ In attesa). */
  async comment(tx: Tx, actor: ReviewActor, pinId: string, body: string, meta?: RequestMeta) {
    const { pin, version } = await this.loadPin(tx, actor, pinId);
    if (version.frozen_at) throw new AppError('VERSION_FROZEN', 'Questa versione è approvata o superata.');
    if (['WITHDRAWN', 'FROZEN', 'TRANSFERRED'].includes(pin.status)) throw new AppError('INVALID_TRANSITION', 'Il pin non accetta risposte.');
    const comment = await tx.insertInto('comments').values({
      tenant_id: actor.tenantId, pin_id: pin.id, author_type: actor.type, author_id: actor.id, body,
    }).returning('id').executeTakeFirstOrThrow();
    let next: PinStatus | null = null;
    if (actor.type === 'MEMBER' && pin.status === 'OPEN') next = 'WAITING';
    if (actor.type === 'CLIENT' && pin.status === 'WAITING') next = 'OPEN';
    if (next) await tx.updateTable('pins').set({ status: next }).where('id', '=', pin.id).execute();
    await this.audit.record(tx, {
      tenantId: actor.tenantId, actorType: auditActor(actor), actorId: actor.id,
      action: 'COMMENT_ADDED', objectType: 'PIN', objectId: pin.id, details: { commentId: comment.id }, meta,
    });
    await this.notifications.reviewActivity(tx, actor, pin.id, 'COMMENT_ADDED', body);
    return comment;
  }

  /** BR-14: modifica solo dell'autore, entro 15 minuti e senza risposte successive; resta la cronologia. */
  async editComment(tx: Tx, actor: ReviewActor, commentId: string, body: string, meta?: RequestMeta) {
    assertUuid(commentId, 'Commento');
    const comment = await tx.selectFrom('comments').selectAll().where('id', '=', commentId).executeTakeFirst();
    if (!comment) throw new AppError('NOT_FOUND', 'Commento non trovato.');
    await this.loadPin(tx, actor, comment.pin_id);
    if (comment.author_type !== actor.type || comment.author_id !== actor.id) throw new AppError('FORBIDDEN', 'Puoi modificare solo i tuoi commenti.');
    if (Date.now() - new Date(comment.created_at).getTime() > EDIT_WINDOW_MS) {
      throw new AppError('CONFLICT', 'Il commento si può modificare solo entro 15 minuti.');
    }
    const later = await tx.selectFrom('comments').select('id')
      .where('pin_id', '=', comment.pin_id).where('created_at', '>', comment.created_at).executeTakeFirst();
    if (later) throw new AppError('CONFLICT', 'Non puoi modificare un commento a cui hanno già risposto.');
    await tx.updateTable('comments').set({
      body,
      edited_at: new Date(),
      edit_history: JSON.stringify([...comment.edit_history, { body: comment.body, editedAt: new Date().toISOString() }]),
    }).where('id', '=', comment.id).execute();
    await this.audit.record(tx, {
      tenantId: actor.tenantId, actorType: auditActor(actor), actorId: actor.id,
      action: 'COMMENT_EDITED', objectType: 'COMMENT', objectId: comment.id, meta,
    });
  }

  /** FR-M2-11: lo studio marca Risolto. */
  async resolve(tx: Tx, actor: ReviewActor, pinId: string, meta?: RequestMeta) {
    if (actor.type !== 'MEMBER') throw new AppError('FORBIDDEN', 'Solo lo studio può segnare un pin come risolto.');
    const { pin, version } = await this.loadPin(tx, actor, pinId);
    if (version.frozen_at) throw new AppError('VERSION_FROZEN', 'Questa versione è approvata o superata.');
    if (!['OPEN', 'WAITING'].includes(pin.status)) throw new AppError('INVALID_TRANSITION', 'Il pin non è aperto.');
    await tx.updateTable('pins').set({ status: 'RESOLVED' }).where('id', '=', pin.id).execute();
    await this.audit.record(tx, {
      tenantId: actor.tenantId, actorType: 'USER', actorId: actor.id, action: 'PIN_RESOLVED', objectType: 'PIN', objectId: pin.id, meta,
    });
    await this.notifications.reviewActivity(tx, actor, pin.id, 'PIN_RESOLVED');
  }

  /** BR-11: riapertura con commento obbligatorio, dall'autore committente o dallo studio. */
  async reopen(tx: Tx, actor: ReviewActor, pinId: string, body: string, meta?: RequestMeta) {
    const { pin, version } = await this.loadPin(tx, actor, pinId);
    if (version.frozen_at) throw new AppError('VERSION_FROZEN', 'Questa versione è approvata o superata: non si riapre.');
    if (pin.status !== 'RESOLVED') throw new AppError('INVALID_TRANSITION', 'Si riapre solo un pin risolto.');
    if (actor.type === 'CLIENT' && pin.author_id !== actor.id) throw new AppError('FORBIDDEN', 'Puoi riaprire solo i tuoi pin.');
    await tx.insertInto('comments').values({
      tenant_id: actor.tenantId, pin_id: pin.id, author_type: actor.type, author_id: actor.id, body,
    }).execute();
    await tx.updateTable('pins').set({ status: 'OPEN' }).where('id', '=', pin.id).execute();
    await this.audit.record(tx, {
      tenantId: actor.tenantId, actorType: auditActor(actor), actorId: actor.id,
      action: 'PIN_REOPENED', objectType: 'PIN', objectId: pin.id, meta,
    });
    await this.notifications.reviewActivity(tx, actor, pin.id, 'PIN_REOPENED', body);
  }

  /** SM-PIN: l'autore ritira il pin finché nessun altro ha risposto. */
  async withdraw(tx: Tx, actor: ReviewActor, pinId: string, meta?: RequestMeta) {
    const { pin, version } = await this.loadPin(tx, actor, pinId);
    if (version.frozen_at) throw new AppError('VERSION_FROZEN', 'Questa versione è approvata o superata.');
    if (pin.author_type !== actor.type || pin.author_id !== actor.id) throw new AppError('FORBIDDEN', 'Puoi ritirare solo i tuoi pin.');
    const others = await tx.selectFrom('comments').select('id').where('pin_id', '=', pin.id)
      .where((eb) => eb.or([eb('author_type', '<>', actor.type), eb('author_id', '<>', actor.id)])).executeTakeFirst();
    if (others || pin.status !== 'OPEN') throw new AppError('INVALID_TRANSITION', 'Il pin ha già ricevuto risposte e non si può ritirare.');
    await tx.updateTable('pins').set({ status: 'WITHDRAWN' }).where('id', '=', pin.id).execute();
    await this.audit.record(tx, {
      tenantId: actor.tenantId, actorType: auditActor(actor), actorId: actor.id,
      action: 'PIN_WITHDRAWN', objectType: 'PIN', objectId: pin.id, meta,
    });
  }

  /**
   * FR-M2-13: porta i pin aperti di una versione precedente sulla nuova, nelle stesse coordinate
   * percentuali e con il collegamento all'originale; i vecchi diventano "Congelato — trasferito".
   */
  async transfer(tx: Tx, actor: ReviewActor, fromVersionId: string, toVersionId: string, meta?: RequestMeta) {
    if (actor.type !== 'MEMBER') throw new AppError('FORBIDDEN', 'Operazione riservata allo studio.');
    const from = await this.loadVersion(tx, actor, fromVersionId);
    const to = await this.loadVersion(tx, actor, toVersionId);
    if (from.drawing_id !== to.drawing_id || to.number <= from.number) {
      throw new AppError('VALIDATION_FAILED', 'I pin si trasferiscono verso una versione successiva dello stesso elaborato.');
    }
    if (to.frozen_at) throw new AppError('VERSION_FROZEN', 'La versione di destinazione è congelata.');
    const source = await tx.selectFrom('pins as p').innerJoin('drawing_pages as pg', 'pg.id', 'p.page_id')
      .select(['p.id', 'p.x_pct', 'p.y_pct', 'p.category', 'p.author_type', 'p.author_id', 'pg.page_index'])
      .where('p.version_id', '=', from.id).where('p.status', 'in', ['OPEN', 'WAITING', 'FROZEN']).execute();
    const targetPages = new Map((await tx.selectFrom('drawing_pages').select(['id', 'page_index'])
      .where('version_id', '=', to.id).execute()).map((p) => [p.page_index, p.id]));
    await sql`select 1 from app.drawing_versions where id = ${to.id}::uuid for update`.execute(tx);
    const { max } = await tx.selectFrom('pins').select((eb) => eb.fn.max('number').as('max')).where('version_id', '=', to.id).executeTakeFirstOrThrow();
    let next = Number(max ?? 0);
    let moved = 0;
    for (const p of source) {
      const pageId = targetPages.get(p.page_index);
      if (!pageId) continue;
      next += 1;
      const created = await tx.insertInto('pins').values({
        tenant_id: actor.tenantId, version_id: to.id, page_id: pageId, number: next, x_pct: p.x_pct, y_pct: p.y_pct,
        category: p.category, author_type: p.author_type, author_id: p.author_id, transferred_from_pin_id: p.id,
      }).returning('id').executeTakeFirstOrThrow();
      await tx.insertInto('comments').values({
        tenant_id: actor.tenantId, pin_id: created.id, author_type: 'MEMBER', author_id: actor.id,
        body: `Trasferito dalla versione ${from.number}.`,
      }).execute();
      await tx.updateTable('pins').set({ status: 'TRANSFERRED' }).where('id', '=', p.id).execute();
      moved += 1;
    }
    await this.audit.record(tx, {
      tenantId: actor.tenantId, actorType: 'USER', actorId: actor.id, action: 'PINS_TRANSFERRED',
      objectType: 'DRAWING_VERSION', objectId: to.id, details: { from: from.id, count: moved }, meta,
    });
    return { transferred: moved };
  }
}
