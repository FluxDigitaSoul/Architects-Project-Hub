import { Injectable, Logger } from '@nestjs/common';
import type { Outcome, UnitInput, UnitResult } from '@aph/rai-engine';
import { AppError } from '../common/app-error';
import type { Tx } from '../database/database';
import { formatAddress } from '../projects/projects.service';
import { maskEmail } from '../review/signoff.service';
import { FileStorage } from '../storage/file-storage';
import type { ApprovalSummaryData } from './pdf/approval-summary.pdf';
import type { Letterhead } from './pdf/pdf-layout';
import type { RaiReportData } from './pdf/rai-report.pdf';
import type { SiteReportData } from './pdf/site-report.pdf';

const INTERVENTION_LABEL: Record<string, string> = {
  NEW_BUILD: 'Nuova costruzione', RENOVATION: 'Ristrutturazione edilizia', EXTRAORDINARY_MAINTENANCE: 'Manutenzione straordinaria',
  RESTORATION: 'Restauro e risanamento conservativo', CHANGE_OF_USE: 'Cambio di destinazione d’uso',
  SPLIT_MERGE: 'Frazionamento / accorpamento', ATTIC_RECOVERY: 'Recupero sottotetto', INTERIOR_DESIGN: 'Interior design', OTHER: 'Intervento',
};

/** Testo di asseverazione predefinito (FR-M5-20 punto 10) — da validare con il legale e lo studio partner (Q-16). */
export const DEFAULT_ATTESTATION =
  'Il/La sottoscritto/a {titolo} {nome}, iscritto/a all’{ordine} al n. {numero}, in qualità di progettista, consapevole delle ' +
  'responsabilità penali previste dall’art. 76 del D.P.R. 445/2000 e dall’art. 481 del Codice Penale in caso di dichiarazioni ' +
  'mendaci, ASSEVERA che le opere in progetto rispettano i requisiti igienico-sanitari di cui al profilo normativo "{profilo}", ' +
  'come dettagliato nella presente relazione.';

export interface Signer {
  membershipId: string;
  name: string;
  title: string | null;
  order: string | null;
  registrationNumber: string | null;
  signatureImageKey: string | null;
}

type CadastralEntry = { sheet?: string; parcel?: string; sub?: string; category?: string };

function cadastralText(entries: CadastralEntry[]): string | null {
  const parts = entries
    .map((c) => [c.sheet ? `Fg. ${c.sheet}` : '', c.parcel ? `Part. ${c.parcel}` : '', c.sub ? `Sub. ${c.sub}` : '', c.category ? `Cat. ${c.category}` : '']
      .filter(Boolean).join(' '))
    .filter(Boolean);
  return parts.length ? parts.join('; ') : null;
}

/** Raccoglie i dati dei documenti dalle fonti congelate (sopralluogo finalizzato, snapshot, approvazione). */
@Injectable()
export class DocumentData {
  private readonly logger = new Logger('Documents');

  constructor(private readonly storage: FileStorage) {}

  /** Carta intestata dal profilo e dal branding dello studio (FR-M5-00, FR-M0-11). */
  async letterhead(tx: Tx, tenantId: string): Promise<Letterhead> {
    const t = await tx.selectFrom('tenants as t').leftJoin('tenant_branding as b', 'b.tenant_id', 't.id')
      .select(['t.name', 't.vat_number', 't.legal_address', 't.email', 't.pec', 't.phone', 'b.primary_color', 'b.logo_keys'])
      .where('t.id', '=', tenantId).executeTakeFirstOrThrow();
    const logoKey = t.logo_keys?.print ?? t.logo_keys?.primary ?? null;
    let logo: Buffer | null = null;
    if (logoKey && !logoKey.endsWith('.svg')) {
      logo = await this.storage.read(logoKey).catch((e: Error) => {
        this.logger.warn(`Logo non leggibile per la carta intestata: ${e.message}`);
        return null;
      });
    }
    const a = t.legal_address;
    return {
      studioName: t.name, vatNumber: t.vat_number, email: t.email, pec: t.pec, phone: t.phone,
      address: a ? [a.street, a.number, a.zip, a.city, a.province ? `(${a.province})` : ''].filter(Boolean).join(' ') : null,
      primaryColor: t.primary_color ?? '#1F2937', logo,
    };
  }

  async signer(tx: Tx, membershipId: string): Promise<Signer> {
    const m = await tx.selectFrom('memberships as m').leftJoin('user_profiles as u', 'u.id', 'm.user_id')
      .select(['m.id', 'm.professional_order', 'm.registration_number', 'm.signature_image_key', 'u.first_name', 'u.last_name', 'u.title', 'u.email'])
      .where('m.id', '=', membershipId).executeTakeFirstOrThrow();
    return {
      membershipId: m.id, name: [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email || '—', title: m.title,
      order: m.professional_order, registrationNumber: m.registration_number, signatureImageKey: m.signature_image_key,
    };
  }

  /** BR-08: firma solo un Owner o Architetto con ordine e numero di iscrizione compilati. */
  async assertQualifiedSigner(tx: Tx, membershipId: string): Promise<Signer> {
    const role = await tx.selectFrom('memberships').select('role').where('id', '=', membershipId).executeTakeFirstOrThrow();
    const signer = await this.signer(tx, membershipId);
    if (role.role === 'COLLABORATOR' || !signer.order || !signer.registrationNumber) {
      throw new AppError('SIGNER_NOT_QUALIFIED', 'Per firmare servono ruolo Owner o Architetto e iscrizione all’albo compilata nel profilo.');
    }
    return signer;
  }

  private async projectInfo(tx: Tx, projectId: string) {
    const p = await tx.selectFrom('projects').selectAll().where('id', '=', projectId).executeTakeFirstOrThrow();
    const clients = await tx.selectFrom('client_contacts').select('display_name').where('project_id', '=', projectId)
      .where('removed_at', 'is', null).orderBy('created_at').execute();
    const contractors = await tx.selectFrom('project_contractors as pc').innerJoin('contractors as c', 'c.id', 'pc.contractor_id')
      .select('c.name').where('pc.project_id', '=', projectId).orderBy('c.name').execute();
    return { p, clients: clients.map((c) => c.display_name), contractors: contractors.map((c) => c.name) };
  }

  /** Verbale di sopralluogo (FR-M5-01) da un sopralluogo finalizzato. */
  async siteReport(tx: Tx, visitId: string) {
    const v = await tx.selectFrom('site_visits').selectAll().where('id', '=', visitId).executeTakeFirst();
    if (!v) throw new AppError('NOT_FOUND', 'Sopralluogo non trovato.');
    if (!['FINAL', 'SENT', 'CANCELLED'].includes(v.status)) throw new AppError('INVALID_TRANSITION', 'Il verbale si genera dopo la finalizzazione.');
    const { p, clients, contractors } = await this.projectInfo(tx, v.project_id);
    const director = await this.signer(tx, v.director_membership_id);
    const attendees = await tx.selectFrom('visit_attendees').selectAll().where('visit_id', '=', v.id).orderBy('sort_order').execute();
    const items = await tx.selectFrom('report_items').selectAll().where('visit_id', '=', v.id).orderBy('sort_order').orderBy('created_at').execute();
    const photos = await tx.selectFrom('visit_photos').selectAll().where('visit_id', '=', v.id)
      .where('include_in_report', '=', true).where('upload_status', '=', 'UPLOADED').orderBy('sort_order').execute();
    const photoNumber = new Map(photos.map((ph, i) => [ph.id, i + 1]));
    const images = await Promise.all(photos.map((ph) => (ph.file_key ? this.storage.read(ph.file_key).catch(() => null) : Promise.resolve(null))));
    const resolved = await tx.selectFrom('open_actions as oa').innerJoin('report_items as ri', 'ri.id', 'oa.source_item_id')
      .select(['ri.text', 'oa.source_visit_number']).where('oa.resolved_in_visit_id', '=', v.id).execute();
    const stillOpen = await tx.selectFrom('open_actions as oa').innerJoin('report_items as ri', 'ri.id', 'oa.source_item_id')
      .select(['ri.text', 'oa.source_visit_number']).where('oa.project_id', '=', v.project_id).where('oa.status', '=', 'OPEN')
      .where('oa.source_visit_number', '<', v.number).execute();
    const toItem = (i: (typeof items)[number]) => ({
      text: i.text, severity: i.severity, addressee: i.addressee, dueDate: i.due_date,
      photoNumbers: i.photo_refs.map((ref) => photoNumber.get(ref)).filter((x): x is number => Boolean(x)),
    });
    const w = v.weather;
    const previousNumber = Math.max(0, ...[...resolved, ...stillOpen].map((r) => r.source_visit_number));
    const data: SiteReportData = {
      number: v.number, startedAt: new Date(v.started_at), endedAt: v.ended_at ? new Date(v.ended_at) : null,
      project: { code: p.code, title: p.title, address: formatAddress(p.site_address), cadastral: cadastralText(p.cadastral), permitType: p.permit_type },
      clients, contractors,
      director: { name: director.name, title: director.title, registration: director.order ? `${director.order} n. ${director.registrationNumber ?? ''}` : null },
      attendees: attendees.map((a) => ({ name: a.name, qualification: a.qualification, organization: a.organization })),
      weather: w ? `${w.condition}${w.temperatureC !== undefined ? `, ${w.temperatureC} °C` : ''}` : null,
      previous: previousNumber
        ? { number: previousNumber, items: [...resolved.map((r) => ({ text: r.text, resolved: true })), ...stillOpen.map((r) => ({ text: r.text, resolved: false }))] }
        : null,
      progress: items.filter((i) => i.section === 'PROGRESS').map(toItem),
      issues: items.filter((i) => i.section === 'ISSUES').map(toItem),
      orders: items.filter((i) => i.section === 'ORDERS').map(toItem),
      generalNotes: [v.general_notes, ...items.filter((i) => i.section === 'GENERAL').map((i) => i.text)].filter(Boolean).join('\n') || null,
      photos: photos.map((ph, i) => ({ number: i + 1, image: images[i] ?? null, caption: ph.caption ?? '', takenAt: ph.taken_at ? new Date(ph.taken_at) : null })),
      place: p.municipality,
      closingFormula: 'Letto, confermato e sottoscritto.',
      aiAssisted: items.some((i) => i.origin !== 'HUMAN'),
    };
    return { data, projectId: p.id, number: v.number, date: new Date(v.finalized_at ?? v.started_at), directorMembershipId: v.director_membership_id };
  }

  /** Relazione R.A.I. (FR-M5-20..22) da uno snapshot: rigenerarla dà gli stessi valori (AC-FR-M5-04-1). */
  async raiReport(tx: Tx, snapshotId: string, variant: RaiReportData['variant'], signer: Signer | null, attestationTemplate: string | null) {
    const s = await tx.selectFrom('rai_snapshots').selectAll().where('id', '=', snapshotId).executeTakeFirst();
    if (!s) throw new AppError('NOT_FOUND', 'Revisione del calcolo non trovata.');
    const profileVersion = await tx.selectFrom('regulation_profile_versions').select('parameters').where('id', '=', s.profile_version_id).executeTakeFirstOrThrow();
    const { p, clients } = await this.projectInfo(tx, s.project_id);
    const inputs = s.inputs as { buildings: Array<{ id: string; name: string; address: string | null; units: Array<{ id: string; name: string; floor: string | null; input: UnitInput }> }> };
    const results = s.results as {
      buildings: Array<{ id: string; units: Array<{ id: string; result: UnitResult }> }>;
      summary: { counts: Record<Outcome, number>; deficitSqm: string };
    };
    const profile = profileVersion.parameters;
    const attestationText = signer && variant === 'ATTESTATION'
      ? (attestationTemplate ?? DEFAULT_ATTESTATION)
        .replace('{titolo}', signer.title ?? '').replace('{nome}', signer.name).replace('{ordine}', signer.order ?? '')
        .replace('{numero}', signer.registrationNumber ?? '').replace('{profilo}', profile.name).replace(/\s{2,}/g, ' ')
      : null;
    const data: RaiReportData = {
      variant, revision: s.revision, revisionReason: s.reason, date: new Date(s.created_at),
      project: {
        code: p.code, title: p.title, address: formatAddress(p.site_address), municipality: p.municipality,
        cadastral: cadastralText(p.cadastral), interventionType: INTERVENTION_LABEL[p.intervention_type] ?? p.intervention_type, permitType: p.permit_type,
      },
      clients,
      profile,
      buildings: inputs.buildings.map((b) => ({
        name: b.name,
        address: b.address,
        units: b.units.map((u) => {
          const result = results.buildings.find((rb) => rb.id === b.id)?.units.find((ru) => ru.id === u.id)?.result;
          if (!result) throw new AppError('INTERNAL_ERROR', 'Snapshot incoerente: risultati mancanti.');
          return { name: u.name, floor: u.floor, input: u.input, result };
        }),
      })),
      summary: results.summary,
      signer: signer ? { name: signer.name, title: signer.title, order: signer.order, registrationNumber: signer.registrationNumber } : null,
      attestationText,
    };
    return { data, projectId: p.id, revision: s.revision, reason: s.reason, date: new Date(s.created_at) };
  }

  /** Riepilogo di approvazione (FR-M5-10) da un'approvazione registrata. */
  async approvalSummary(tx: Tx, approvalId: string) {
    const a = await tx.selectFrom('approvals as a')
      .innerJoin('drawing_versions as v', 'v.id', 'a.version_id')
      .innerJoin('drawings as d', 'd.id', 'v.drawing_id')
      .innerJoin('client_contacts as c', 'c.id', 'a.client_contact_id')
      .innerJoin('otp_challenges as o', 'o.id', 'a.otp_challenge_id')
      .select(['a.id', 'a.approved_at', 'a.ip', 'a.user_agent', 'a.file_sha256', 'a.verification_code', 'a.declaration_text', 'a.version_id',
        'v.number', 'v.published_at', 'v.page_count', 'd.title', 'd.sheet_code', 'd.category', 'd.phase', 'd.project_id',
        'c.display_name', 'c.email', 'c.role_in_project', 'o.created_at as otp_sent', 'o.verified_at as otp_verified'])
      .where('a.id', '=', approvalId).executeTakeFirst();
    if (!a) throw new AppError('NOT_FOUND', 'Approvazione non trovata.');
    const p = await tx.selectFrom('projects').select(['code', 'title']).where('id', '=', a.project_id).executeTakeFirstOrThrow();
    const pins = await tx.selectFrom('pins').select(['id', 'number']).where('version_id', '=', a.version_id)
      .where('status', 'not in', ['WITHDRAWN', 'TRANSFERRED']).orderBy('number').execute();
    // Stato dei pin al momento dell'approvazione: dall'ultimo evento risolto/riaperto registrato prima (audit, FR-MT-07).
    const events = pins.length
      ? await tx.selectFrom('audit_events').select(['object_id', 'action']).where('object_id', 'in', pins.map((x) => x.id))
        .where('action', 'in', ['PIN_RESOLVED', 'PIN_REOPENED']).where('occurred_at', '<=', a.approved_at)
        .orderBy('occurred_at').orderBy('id').execute()
      : [];
    const lastEvent = new Map<string, string>();
    events.forEach((e) => lastEvent.set(e.object_id ?? '', e.action));
    const open = pins.filter((pin) => lastEvent.get(pin.id) !== 'PIN_RESOLVED');
    const firstComments = open.length
      ? await tx.selectFrom('comments').select(['pin_id', 'body']).where('pin_id', 'in', open.map((f) => f.id)).orderBy('created_at').execute()
      : [];
    const data: ApprovalSummaryData = {
      project: { code: p.code, title: p.title },
      drawing: { sheetCode: a.sheet_code, title: a.title, category: a.category, phase: a.phase },
      version: { number: a.number, publishedAt: a.published_at ? new Date(a.published_at) : null, pageCount: a.page_count },
      signer: { name: a.display_name, role: a.role_in_project, maskedEmail: maskEmail(a.email) },
      approvedAt: new Date(a.approved_at), ip: a.ip, userAgent: a.user_agent,
      otp: { sentAt: new Date(a.otp_sent), verifiedAt: a.otp_verified ? new Date(a.otp_verified) : null },
      fileSha256: a.file_sha256, verificationCode: a.verification_code, declarationText: a.declaration_text,
      pins: {
        total: pins.length,
        resolved: pins.length - open.length,
        openAtApproval: open.map((f) => ({ number: f.number, firstComment: firstComments.find((c) => c.pin_id === f.id)?.body ?? '' })),
      },
    };
    return { data, projectId: a.project_id, date: new Date(a.approved_at), verificationCode: a.verification_code, versionNumber: a.number, drawingTitle: a.title };
  }
}
