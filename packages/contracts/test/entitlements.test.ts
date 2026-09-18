import { describe, expect, it } from 'vitest';
import {
  checkLimit,
  hasFeature,
  isErrorCode,
  isValidTenantSlug,
  resolveEntitlements,
  suggestTenantSlug,
  type Entitlements,
} from '../src/index.js';

const SOLO: Entitlements = {
  limits: {
    'seats.max': 1,
    'projects.active.max': 3,
    'storage.bytes.max': 5 * 1024 ** 3,
    'ai.minutes.month.max': 60,
    'clients.per_project.max': 5,
  },
  features: {
    'whitelabel.full': false,
    custom_domain: false,
    email_sender_domain: false,
    'rai.module': true,
    'ai.transcription': true,
    advanced_roles: false,
    'badge.removable': false,
    'support.priority': false,
  },
};

const NOW = new Date('2026-09-18T10:00:00Z');

describe('checkLimit (AC-FR-M6-05-1)', () => {
  it('allows creating the third active project on the Solo plan', () => {
    expect(checkLimit(SOLO, 'projects.active.max', 2)).toEqual({
      allowed: true,
      limit: 3,
      usage: 2,
    });
  });

  it('blocks the fourth active project on the Solo plan', () => {
    expect(checkLimit(SOLO, 'projects.active.max', 3)).toEqual({
      allowed: false,
      limit: 3,
      usage: 3,
    });
  });

  it('treats a null limit as unlimited', () => {
    const pro = resolveEntitlements(SOLO, [{ key: 'projects.active.max', value: null }], NOW);
    expect(checkLimit(pro, 'projects.active.max', 10_000).allowed).toBe(true);
  });

  it('supports increments larger than one (e.g. storage bytes)', () => {
    const result = checkLimit(SOLO, 'storage.bytes.max', 5 * 1024 ** 3 - 10, 11);
    expect(result.allowed).toBe(false);
  });
});

describe('resolveEntitlements (AC-FR-M6-05-2)', () => {
  it('applies an active override without mutating the plan', () => {
    const resolved = resolveEntitlements(
      SOLO,
      [{ key: 'projects.active.max', value: null, expiresAt: '2026-12-31T23:59:59Z' }],
      NOW,
    );
    expect(resolved.limits['projects.active.max']).toBeNull();
    expect(SOLO.limits['projects.active.max']).toBe(3);
  });

  it('ignores expired overrides', () => {
    const resolved = resolveEntitlements(
      SOLO,
      [{ key: 'projects.active.max', value: 50, expiresAt: '2026-01-01T00:00:00Z' }],
      NOW,
    );
    expect(resolved.limits['projects.active.max']).toBe(3);
  });

  it('applies feature overrides and ignores values of the wrong type', () => {
    const resolved = resolveEntitlements(
      SOLO,
      [
        { key: 'custom_domain', value: true },
        { key: 'badge.removable', value: 5 },
        { key: 'seats.max', value: true },
      ],
      NOW,
    );
    expect(hasFeature(resolved, 'custom_domain')).toBe(true);
    expect(hasFeature(resolved, 'badge.removable')).toBe(false);
    expect(resolved.limits['seats.max']).toBe(1);
  });
});

describe('tenant slug (FR-M0-01, FR-M6-02)', () => {
  it.each([
    ['studio-rossi', true],
    ['ab', false],
    ['-studio', false],
    ['studio-', false],
    ['Studio', false],
    ['admin', false],
    ['api', false],
  ])('isValidTenantSlug(%s) = %s', (slug, expected) => {
    expect(isValidTenantSlug(slug)).toBe(expected);
  });

  it('suggests a normalized slug from the studio name', () => {
    expect(suggestTenantSlug('Studio Rossi & Associati')).toBe('studio-rossi-associati');
    expect(suggestTenantSlug("Architettura Città d'Arte")).toBe('architettura-citta-d-arte');
  });

  it('pads very short names to a valid slug', () => {
    expect(isValidTenantSlug(suggestTenantSlug('A'))).toBe(true);
  });
});

describe('error codes', () => {
  it('recognizes known codes only', () => {
    expect(isErrorCode('VERSION_FROZEN')).toBe(true);
    expect(isErrorCode('toString')).toBe(false);
    expect(isErrorCode(42)).toBe(false);
  });
});
