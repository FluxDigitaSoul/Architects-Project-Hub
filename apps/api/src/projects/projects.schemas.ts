import { z } from 'zod';

/** Validazione degli input del Modulo 1 (FR-M1-01..03). Messaggi in italiano per l'interfaccia. */

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida (AAAA-MM-GG)');

export const INTERVENTION_TYPES = [
  'NEW_BUILD', 'RENOVATION', 'EXTRAORDINARY_MAINTENANCE', 'RESTORATION',
  'CHANGE_OF_USE', 'SPLIT_MERGE', 'ATTIC_RECOVERY', 'INTERIOR_DESIGN', 'OTHER',
] as const;
export const PERMIT_TYPES = ['CILA', 'SCIA', 'SCIA_ALT_PDC', 'PDC', 'FREE', 'TBD'] as const;

export const siteAddressSchema = z.object({
  street: text(150),
  number: z.string().trim().max(20).optional(),
  zip: z.string().trim().regex(/^\d{5}$/, 'CAP non valido').optional(),
  city: text(100),
  province: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Sigla provincia non valida').optional(),
});

export const cadastralSchema = z.object({
  sheet: z.string().trim().max(20).optional(),
  parcel: z.string().trim().max(20).optional(),
  sub: z.string().trim().max(20).optional(),
  category: z.string().trim().max(10).optional(),
});

export const contactSchema = z.object({
  kind: z.enum(['PERSON', 'COMPANY', 'CONDOMINIUM', 'PUBLIC_BODY']).default('PERSON'),
  displayName: text(150),
  taxId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-Z0-9]{16}|\d{11})$/, 'Codice fiscale o P.IVA non valido')
    .optional()
    .nullable(),
  email: z.string().trim().toLowerCase().email('Email non valida').max(254),
  phone: optionalText(30),
  address: optionalText(300),
  roleInProject: z.enum(['OWNER', 'CO_OWNER', 'CONDO_ADMIN', 'DELEGATE', 'OTHER']).optional().nullable(),
  isSigner: z.boolean().optional(),
  portalEnabled: z.boolean().default(true),
});
export type ContactInput = z.infer<typeof contactSchema>;

const projectFields = {
  title: text(150),
  description: optionalText(2000),
  interventionType: z.enum(INTERVENTION_TYPES),
  permitType: z.enum(PERMIT_TYPES).optional().nullable(),
  siteAddress: siteAddressSchema,
  municipality: text(100),
  geo: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional().nullable(),
  altitudeM: z.number().int().min(-50).max(5000).optional().nullable(),
  regulationProfileVersionId: z.string().uuid().optional().nullable(),
  startDate: isoDate.optional().nullable(),
  endDate: isoDate.optional().nullable(),
};

export const createProjectSchema = z
  .object({
    ...projectFields,
    code: z.string().trim().min(1).max(30).optional(),
    cadastral: z.array(cadastralSchema).max(20).default([]),
    tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
    contacts: z.array(contactSchema).min(1, 'Serve almeno un committente').max(10),
    sendInvites: z.boolean().default(true),
  })
  .refine((p) => !p.startDate || !p.endDate || p.endDate >= p.startDate, {
    message: 'La data di fine deve seguire quella di inizio',
    path: ['endDate'],
  });
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  ...Object.fromEntries(Object.entries(projectFields).map(([k, v]) => [k, v.optional()])),
  code: z.string().trim().min(1).max(30).optional(),
  cadastral: z.array(cadastralSchema).max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  /** Controllo di concorrenza ottimistico (cap. 11): la versione letta dal client. */
  version: z.number().int().positive(),
}) as z.ZodType<Partial<CreateProjectInput> & { version: number }>;
export type UpdateProjectInput = Partial<Omit<CreateProjectInput, 'contacts' | 'sendInvites'>> & { version: number };

/** SM-PROGETTO */
export const transitionSchema = z.object({
  action: z.enum(['SUSPEND', 'REACTIVATE', 'CLOSE', 'REOPEN', 'ARCHIVE', 'RESTORE']),
  revokeLinksNow: z.boolean().default(false),
});
export type TransitionInput = z.infer<typeof transitionSchema>;

export const listProjectsSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED', 'ARCHIVED']).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListProjectsInput = z.infer<typeof listProjectsSchema>;

export const assignmentSchema = z.object({
  membershipId: z.string().uuid(),
  projectRole: z.enum(['LEAD', 'DESIGNER', 'SITE_DIRECTOR', 'COLLABORATOR']),
});

export const contractorSchema = z.object({
  name: text(150),
  vatNumber: z.string().trim().regex(/^\d{11}$/, 'P.IVA non valida').optional().nullable(),
  contactName: optionalText(150),
  email: z.string().trim().toLowerCase().email('Email non valida').optional().nullable(),
  pec: z.string().trim().toLowerCase().email('PEC non valida').optional().nullable(),
  phone: optionalText(30),
  category: optionalText(100),
});
