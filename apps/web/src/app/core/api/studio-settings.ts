import { Injectable, inject } from '@angular/core';
import { Api, uploadToSignedUrl } from './api';
import type { StudioRole } from '../tenant/tenant-context';

export type LogoKind = 'primary' | 'print' | 'icon';
export type PortalTheme = 'LIGHT' | 'DARK' | 'AUTO';

export interface LegalAddress {
  street: string;
  number?: string;
  zip?: string;
  city: string;
  province?: string;
}

/** FR-M0-02: anagrafica dello studio. */
export interface StudioProfile {
  name: string;
  slug: string;
  legalForm: string | null;
  vatNumber: string | null;
  taxCode: string | null;
  legalAddress: LegalAddress | null;
  email: string | null;
  pec: string | null;
  phone: string | null;
  website: string | null;
  legalRepresentative: string | null;
}

/** FR-M0-11 e BR-03. */
export interface StudioOperations {
  codePattern?: string;
  graceDays?: number;
  requireOtpNewDevice?: boolean;
}

/** FR-M0-04/05 e FR-M5-00/20. */
export interface StudioBranding {
  primaryColor: string;
  secondaryColor: string | null;
  portalTheme: PortalTheme;
  logos: Partial<Record<LogoKind, string | null>>;
  attestationTemplate: string | null;
  closingFormula: string | null;
}

export interface StudioSettings {
  profile: StudioProfile;
  settings: StudioOperations;
  branding: StudioBranding;
}

/** FR-MT-04 / BR-08: profilo personale; senza iscrizione all'albo non si firma. */
export interface MyProfile {
  email: string;
  firstName: string;
  lastName: string;
  title: string | null;
  phone: string | null;
  role: StudioRole;
  professionalOrder: string | null;
  registrationNumber: string | null;
  registrationSection: string | null;
  canSign: boolean;
}

export interface Member {
  membershipId: string;
  role: StudioRole;
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
  email: string | null;
  name: string;
  invitedAt: string | null;
  canSign: boolean;
}

type ProfilePatch = Partial<Omit<StudioProfile, 'slug'>>;
type BrandingPatch = Partial<Omit<StudioBranding, 'logos'>>;
type MyProfilePatch = Partial<Omit<MyProfile, 'email' | 'role' | 'canSign'>>;

/** Loghi accettati dall'API (niente SVG nella Beta, TC-SEC-06). */
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp';
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Impostazioni dello studio, profilo personale e membri (FR-M0-02..11, FR-MT-04). */
@Injectable({ providedIn: 'root' })
export class StudioSettingsApi {
  private readonly api = inject(Api);

  get(): Promise<StudioSettings> {
    return this.api.get<StudioSettings>('/studio/settings');
  }

  updateProfile(patch: ProfilePatch): Promise<void> {
    return this.api.patch<void>('/studio/settings/profile', patch);
  }

  updateOperations(patch: StudioOperations): Promise<void> {
    return this.api.patch<void>('/studio/settings/operations', patch);
  }

  updateBranding(patch: BrandingPatch): Promise<void> {
    return this.api.patch<void>('/studio/settings/branding', patch);
  }

  /** Il file va direttamente allo storage; l'API poi ne verifica il tipo reale e la dimensione. */
  async uploadLogo(kind: LogoKind, file: File): Promise<void> {
    const { key, uploadUrl } = await this.api.post<{ key: string; uploadUrl: string }>(`/studio/settings/logo/${kind}`);
    await uploadToSignedUrl(uploadUrl, file);
    await this.api.post<void>(`/studio/settings/logo/${kind}/complete`, { key });
  }

  myProfile(): Promise<MyProfile> {
    return this.api.get<MyProfile>('/studio/me/profile');
  }

  updateMyProfile(patch: MyProfilePatch): Promise<MyProfile> {
    return this.api.patch<MyProfile>('/studio/me/profile', patch);
  }

  members(): Promise<Member[]> {
    return this.api.get<Member[]>('/studio/members');
  }

  invite(email: string, role: StudioRole): Promise<{ membershipId: string; emailSent: boolean }> {
    return this.api.post('/studio/members/invitations', { email, role });
  }

  updateMember(membershipId: string, patch: { role?: StudioRole; status?: 'ACTIVE' | 'SUSPENDED' | 'REMOVED' }): Promise<void> {
    return this.api.patch<void>(`/studio/members/${membershipId}`, patch);
  }
}
