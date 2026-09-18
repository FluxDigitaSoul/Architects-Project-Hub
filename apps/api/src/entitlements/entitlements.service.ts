import { Injectable } from '@nestjs/common';
import {
  type EntitlementOverride,
  type Entitlements,
  type FeatureKey,
  type LimitKey,
  checkLimit,
  hasFeature,
  resolveEntitlements,
} from '@aph/contracts';
import { AppError } from '../common/app-error';
import type { Tx } from '../database/database';

export interface PlanState {
  planCode: string;
  planVersion: number;
  status: string;
  trialEndsAt: string | null;
  entitlements: Entitlements;
}

const toIso = (v: Date | string | null): string | null => (v ? new Date(v).toISOString() : null);

/**
 * Unico punto che decide cosa è incluso nel piano del tenant (AFU FR-M6-05, BR-28).
 * Va chiamato dentro `withContext` con il tenant impostato: le letture passano da RLS.
 */
@Injectable()
export class EntitlementsService {
  async planState(tx: Tx, now = new Date()): Promise<PlanState> {
    const sub = await tx
      .selectFrom('subscriptions as s')
      .innerJoin('plan_versions as pv', 'pv.id', 's.plan_version_id')
      .select(['pv.plan_code', 'pv.version', 'pv.entitlements', 's.status', 's.trial_ends_at'])
      .executeTakeFirst();
    if (!sub) throw new AppError('NOT_FOUND', 'Abbonamento non trovato.');

    const overrides = await tx
      .selectFrom('entitlement_overrides')
      .select(['key', 'value', 'expires_at'])
      .execute();

    const entitlements = resolveEntitlements(
      sub.entitlements as Entitlements,
      overrides.map(
        (o): EntitlementOverride => ({
          key: o.key as EntitlementOverride['key'],
          value: o.value as EntitlementOverride['value'],
          expiresAt: toIso(o.expires_at),
        }),
      ),
      now,
    );

    return {
      planCode: sub.plan_code,
      planVersion: sub.version,
      status: sub.status,
      trialEndsAt: toIso(sub.trial_ends_at),
      entitlements,
    };
  }

  /** BR-29: da chiamare solo prima di nuove creazioni. */
  async assertLimit(tx: Tx, key: LimitKey, currentUsage: number, increment = 1): Promise<void> {
    const { entitlements } = await this.planState(tx);
    const result = checkLimit(entitlements, key, currentUsage, increment);
    if (!result.allowed) {
      throw new AppError('PLAN_LIMIT_REACHED', 'Hai raggiunto il limite del tuo piano.', {
        key,
        limit: result.limit,
        usage: result.usage,
      });
    }
  }

  async assertFeature(tx: Tx, key: FeatureKey): Promise<void> {
    const { entitlements } = await this.planState(tx);
    if (!hasFeature(entitlements, key)) {
      throw new AppError('FEATURE_NOT_IN_PLAN', 'Funzione non inclusa nel tuo piano.', { key });
    }
  }
}
