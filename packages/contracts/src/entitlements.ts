/**
 * Diritti d'uso (entitlements) dei piani — AFU FR-M6-05, BR-28, BR-29.
 * Logica pura: risoluzione piano + override e verifica dei limiti.
 * Il backend la usa come fonte di verità; il frontend la usa solo per mostrare lo stato.
 */

export const LIMIT_KEYS = [
  'seats.max',
  'projects.active.max',
  'storage.bytes.max',
  'ai.minutes.month.max',
  'clients.per_project.max',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

export const FEATURE_KEYS = [
  'whitelabel.full',
  'custom_domain',
  'email_sender_domain',
  'rai.module',
  'ai.transcription',
  'advanced_roles',
  'badge.removable',
  'support.priority',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type EntitlementKey = LimitKey | FeatureKey;

/** `null` = illimitato. */
export type LimitValue = number | null;

export interface Entitlements {
  limits: Record<LimitKey, LimitValue>;
  features: Record<FeatureKey, boolean>;
}

export interface EntitlementOverride {
  key: EntitlementKey;
  value: LimitValue | boolean;
  /** ISO 8601; assente = senza scadenza. */
  expiresAt?: string | null;
}

export function isLimitKey(key: string): key is LimitKey {
  return (LIMIT_KEYS as readonly string[]).includes(key);
}

export function isFeatureKey(key: string): key is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(key);
}

/**
 * Applica gli override attivi al set di diritti del piano, senza mutare l'input.
 * Gli override scaduti o con valore di tipo incoerente con la chiave vengono ignorati.
 */
export function resolveEntitlements(
  plan: Entitlements,
  overrides: readonly EntitlementOverride[],
  now: Date,
): Entitlements {
  const limits = { ...plan.limits };
  const features = { ...plan.features };

  for (const override of overrides) {
    if (override.expiresAt && new Date(override.expiresAt).getTime() <= now.getTime()) {
      continue;
    }
    if (
      isLimitKey(override.key) &&
      (override.value === null || typeof override.value === 'number')
    ) {
      limits[override.key] = override.value;
    } else if (isFeatureKey(override.key) && typeof override.value === 'boolean') {
      features[override.key] = override.value;
    }
  }

  return { limits, features };
}

export type LimitCheck =
  | { allowed: true; limit: LimitValue; usage: number }
  | { allowed: false; limit: number; usage: number };

/**
 * Verifica se si può aggiungere `increment` unità a un consumo corrente.
 * BR-29: il controllo si usa SOLO prima di nuove creazioni.
 */
export function checkLimit(
  entitlements: Entitlements,
  key: LimitKey,
  currentUsage: number,
  increment = 1,
): LimitCheck {
  const limit = entitlements.limits[key];
  if (limit === null) {
    return { allowed: true, limit, usage: currentUsage };
  }
  if (currentUsage + increment > limit) {
    return { allowed: false, limit, usage: currentUsage };
  }
  return { allowed: true, limit, usage: currentUsage };
}

export function hasFeature(entitlements: Entitlements, key: FeatureKey): boolean {
  return entitlements.features[key];
}
