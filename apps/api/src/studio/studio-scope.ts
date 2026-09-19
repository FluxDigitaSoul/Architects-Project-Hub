import { Injectable } from '@nestjs/common';
import type { MembershipRole } from '@aph/contracts';
import type { Selectable } from 'kysely';
import { AppError } from '../common/app-error';
import type { AuthUser } from '../auth/auth';
import { DatabaseService, type Tx } from '../database/database';
import type { ProjectsTable } from '../database/schema/projects';
import type { TenantContext } from '../tenancy/tenancy';

/** Chi sta operando nello studio: usato da tutti i servizi dell'area riservata. */
export interface StudioScope {
  tenantId: string;
  userId: string;
  membershipId: string;
  role: MembershipRole;
}

export type ProjectRow = Selectable<ProjectsTable>;

/**
 * Esegue un'operazione dello studio in una transazione con il contesto RLS impostato (ADR-004)
 * e con la membership dell'utente già risolta.
 */
@Injectable()
export class StudioDb {
  constructor(private readonly database: DatabaseService) {}

  run<T>(user: AuthUser, tenant: TenantContext, fn: (tx: Tx, scope: StudioScope) => Promise<T>): Promise<T> {
    return this.database.withContext({ tenantId: tenant.tenantId, userId: user.id }, async (tx) => {
      const membership = await tx
        .selectFrom('memberships')
        .select(['id', 'role'])
        .where('user_id', '=', user.id)
        .where('status', '=', 'ACTIVE')
        .executeTakeFirst();
      if (!membership) throw new AppError('NOT_FOUND', 'Studio non trovato.');
      return fn(tx, { tenantId: tenant.tenantId, userId: user.id, membershipId: membership.id, role: membership.role });
    });
  }
}

/** Ruoli ammessi per un'azione (cap. 2, RBAC). Il Collaboratore non firma, non pubblica, non gestisce. */
export function requireRole(scope: StudioScope, roles: readonly MembershipRole[]): void {
  if (!roles.includes(scope.role)) {
    throw new AppError('FORBIDDEN', 'Il tuo ruolo non consente questa operazione.');
  }
}

/** Validazione di un UUID che arriva dal path o dal body, prima di usarlo nelle query. */
export function assertUuid(value: string, what = 'Risorsa'): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError('NOT_FOUND', `${what} non trovata.`);
  }
}

/**
 * Commessa visibile all'utente: Owner e Architetto vedono tutte le commesse del tenant (Q-04),
 * il Collaboratore solo quelle a cui è assegnato (FR-M1-02). Altrimenti 404 (BR-04).
 */
export async function loadVisibleProject(tx: Tx, scope: StudioScope, projectId: string): Promise<ProjectRow> {
  assertUuid(projectId, 'Commessa');
  let query = tx.selectFrom('projects').selectAll('projects').where('projects.id', '=', projectId);
  if (scope.role === 'COLLABORATOR') {
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom('project_assignments as pa')
          .select('pa.id')
          .whereRef('pa.project_id', '=', 'projects.id')
          .where('pa.membership_id', '=', scope.membershipId)
          .where('pa.valid_to', 'is', null),
      ),
    );
  }
  const project = await query.executeTakeFirst();
  if (!project) throw new AppError('NOT_FOUND', 'Commessa non trovata.');
  return project;
}

/** Nuovi contenuti ammessi solo su commesse Attive (SM-PROGETTO). */
export function assertProjectWritable(project: ProjectRow): void {
  if (project.status !== 'ACTIVE') {
    throw new AppError('PROJECT_NOT_ACTIVE', 'La commessa non è attiva: riattivala per aggiungere contenuti.');
  }
}
