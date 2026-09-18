import type { Activity, Drawing, Project, SiteVisit } from '../models';

const day = (offset: number, hour = 10): string => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

export const PROJECTS: Project[] = [
  { id: 'p1', code: '2026-014', title: 'Ristrutturazione appartamento Via Verdi 12', address: 'Via Giuseppe Verdi 12, 20121 Milano', municipality: 'Milano', clientName: 'Fam. Colombo', status: 'ACTIVE', interventionType: 'Ristrutturazione edilizia', updatedAt: day(0, 9) },
  { id: 'p2', code: '2026-011', title: 'Recupero sottotetto Villa Flora', address: 'Via dei Platani 4, 22100 Como', municipality: 'Como', clientName: 'Sig.ra Bianchi', status: 'ACTIVE', interventionType: 'Recupero sottotetto', updatedAt: day(1, 16) },
  { id: 'p3', code: '2026-009', title: 'Nuova sede uffici Studio Legale Riva', address: 'Corso Italia 88, 20122 Milano', municipality: 'Milano', clientName: 'Studio Legale Riva', status: 'ACTIVE', interventionType: 'Cambio di destinazione d\u2019uso', updatedAt: day(3, 11) },
  { id: 'p4', code: '2025-031', title: 'Frazionamento unit\u00e0 Via Manzoni 7', address: 'Via Manzoni 7, 24121 Bergamo', municipality: 'Bergamo', clientName: 'Condominio Manzoni', status: 'SUSPENDED', interventionType: 'Frazionamento', updatedAt: day(12, 15) },
  { id: 'p5', code: '2025-022', title: 'Interior design loft Navigli', address: 'Ripa di Porta Ticinese 55, 20143 Milano', municipality: 'Milano', clientName: 'Sig. Ferrari', status: 'CLOSED', interventionType: 'Interior design', updatedAt: day(40, 12) },
];

export const DRAWINGS: Drawing[] = [
  { id: 'd1', projectId: 'p1', code: 'A-101', title: 'Pianta piano primo \u2014 stato di progetto', category: 'Progetto', version: 3, status: 'PUBLISHED', pinsOpen: 2, pinsTotal: 7, updatedAt: day(0, 9) },
  { id: 'd2', projectId: 'p1', code: 'A-102', title: 'Pianta demolizioni e costruzioni', category: 'Comparativa', version: 2, status: 'APPROVED', pinsOpen: 0, pinsTotal: 4, updatedAt: day(5) },
  { id: 'd3', projectId: 'p1', code: 'R-01', title: 'Render soggiorno', category: 'Render', version: 1, status: 'DRAFT', pinsOpen: 0, pinsTotal: 0, updatedAt: day(1) },
  { id: 'd4', projectId: 'p2', code: 'A-201', title: 'Pianta sottotetto', category: 'Progetto', version: 2, status: 'PUBLISHED', pinsOpen: 3, pinsTotal: 3, updatedAt: day(1, 16) },
  { id: 'd5', projectId: 'p2', code: 'A-202', title: 'Sezione AA', category: 'Progetto', version: 1, status: 'PUBLISHED', pinsOpen: 0, pinsTotal: 1, updatedAt: day(2) },
  { id: 'd6', projectId: 'p3', code: 'A-301', title: 'Layout uffici', category: 'Progetto', version: 4, status: 'APPROVED', pinsOpen: 0, pinsTotal: 12, updatedAt: day(3, 11) },
];

export const VISITS: SiteVisit[] = [
  { id: 'v1', projectId: 'p1', number: 3, date: day(0, 8), status: 'REVIEW', photos: 14, issuesOpen: 2 },
  { id: 'v2', projectId: 'p1', number: 2, date: day(7, 9), status: 'SENT', photos: 22, issuesOpen: 0 },
  { id: 'v3', projectId: 'p1', number: 1, date: day(14, 9), status: 'SENT', photos: 9, issuesOpen: 0 },
  { id: 'v4', projectId: 'p3', number: 5, date: day(3, 15), status: 'DRAFT', photos: 6, issuesOpen: 1 },
  { id: 'v5', projectId: 'p3', number: 4, date: day(10, 15), status: 'SENT', photos: 18, issuesOpen: 0 },
];

export const ACTIVITIES: Activity[] = [
  { id: 'a1', projectId: 'p1', kind: 'PIN', text: 'Fam. Colombo ha aggiunto 2 osservazioni su A-101 v3', at: day(0, 9) },
  { id: 'a2', projectId: 'p1', kind: 'VISIT', text: 'Bozza AI del verbale n. 3 pronta da revisionare', at: day(0, 8) },
  { id: 'a3', projectId: 'p2', kind: 'PUBLISH', text: 'Pubblicata A-201 v2 al committente', at: day(1, 16) },
  { id: 'a4', projectId: 'p3', kind: 'APPROVAL', text: 'Studio Legale Riva ha approvato A-301 v4', at: day(3, 11) },
  { id: 'a5', projectId: 'p2', kind: 'RAI', text: 'Camera mansarda: verifica R.A.I. non conforme (\u22120,31 mq)', at: day(2, 17) },
  { id: 'a6', projectId: 'p1', kind: 'APPROVAL', text: 'Fam. Colombo ha approvato A-102 v2', at: day(5, 18) },
];
