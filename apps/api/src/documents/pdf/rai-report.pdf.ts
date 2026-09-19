import {
  type Outcome,
  type RegulationProfile,
  type RoomResult,
  type UnitInput,
  type UnitResult,
  formatDecimalIt,
  ratioAsFraction,
} from '@aph/rai-engine';
import { type DocMeta, type Letterhead, PdfDoc, formatDateIt } from './pdf-layout';

/** Etichette italiane delle destinazioni d'uso (glossario, cap. 3). */
export const ROOM_USE_LABEL: Record<string, string> = {
  LIVING_ROOM: 'Soggiorno', SINGLE_BEDROOM: 'Camera singola', DOUBLE_BEDROOM: 'Camera doppia', KITCHEN: 'Cucina',
  LIVING_WITH_KITCHENETTE: 'Soggiorno con angolo cottura', DINING: 'Sala da pranzo', STUDY: 'Studio', STUDIO_ROOM: 'Monolocale',
  OTHER_HABITABLE: 'Altro vano abitabile', BATHROOM: 'Bagno', WC: 'WC', LAUNDRY: 'Lavanderia', STORAGE: 'Ripostiglio',
  WALK_IN_CLOSET: 'Cabina armadio', HALLWAY: 'Disimpegno', CORRIDOR: 'Corridoio', STAIRWELL: 'Vano scala', TECHNICAL: 'Locale tecnico',
  ATTIC_NON_HABITABLE: 'Sottotetto non abitabile', OTHER_ACCESSORY: 'Altro vano accessorio',
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  COMPLIANT: 'Conforme', NON_COMPLIANT: 'Non conforme', SUBJECT_TO_ATTESTATION: 'Subordinato ad asseverazione',
  INCOMPLETE: 'Dati incompleti', NOT_REQUIRED: 'Non richiesto', INVALID_INPUT: 'Dati non validi',
};

const PERMIT_LABEL: Record<string, string> = {
  CILA: 'CILA', SCIA: 'SCIA', SCIA_ALT_PDC: 'SCIA alternativa al PdC', PDC: 'Permesso di Costruire', FREE: 'Edilizia libera', TBD: 'Da definire',
};

export interface RaiReportData {
  variant: 'ATTESTATION' | 'CHECK';
  revision: number;
  revisionReason: string | null;
  date: Date;
  project: { code: string; title: string; address: string; municipality: string; cadastral: string | null; interventionType: string; permitType: string | null };
  clients: string[];
  profile: RegulationProfile;
  buildings: Array<{ name: string; address: string | null; units: Array<{ name: string; floor: string | null; input: UnitInput; result: UnitResult }> }>;
  summary: { counts: Record<Outcome, number>; deficitSqm: string };
  signer: { name: string; title: string | null; order: string | null; registrationNumber: string | null } | null;
  attestationText: string | null;
}

const n2 = (v: string | null | undefined): string => (v === null || v === undefined ? '—' : formatDecimalIt(v, 2));

function heightOf(input: UnitInput, roomId: string): string {
  const room = input.rooms.find((r) => r.id === roomId);
  if (!room) return '—';
  const c = room.ceiling;
  if (c.type === 'FLAT') return n2(c.height);
  if (c.type === 'SLOPED') return `${n2(c.minHeight)}–${n2(c.maxHeight)}`;
  return n2(c.averageHeight);
}

/** Frase dell'esito normativo (FR-M5-20 punto 9) generata dall'esito complessivo. */
export function overallOutcome(summary: RaiReportData['summary']): { outcome: Outcome; sentence: string } {
  const c = summary.counts;
  if (c.NON_COMPLIANT > 0) {
    return {
      outcome: 'NON_COMPLIANT',
      sentence: `Uno o più vani non rispettano i requisiti (deficit complessivo ${formatDecimalIt(summary.deficitSqm, 2)} mq): l'intervento, allo stato, non è asseverabile per i requisiti aeroilluminanti.`,
    };
  }
  if (c.INCOMPLETE > 0 || c.INVALID_INPUT > 0) {
    return { outcome: 'INCOMPLETE', sentence: 'Per alcuni vani i dati non sono completi: la verifica va completata prima dell’asseverazione.' };
  }
  if (c.SUBJECT_TO_ATTESTATION > 0) {
    return {
      outcome: 'SUBJECT_TO_ATTESTATION',
      sentence: 'I vani verificati risultano conformi, alcuni in forza delle deroghe motivate riportate al paragrafo 6, la cui applicazione è asseverata dal progettista.',
    };
  }
  return {
    outcome: 'COMPLIANT',
    sentence: 'Tutti i vani soggetti a verifica rispettano i requisiti igienico-sanitari e i rapporti aeroilluminanti previsti dal profilo normativo applicato.',
  };
}

/** BR-06: vani che impediscono la relazione asseverativa (non conformi o con dati incompleti). */
export function blockingRooms(data: Pick<RaiReportData, 'buildings'>): Array<{ unit: string; room: string; outcome: Outcome }> {
  return data.buildings.flatMap((b) => b.units.flatMap((u) => u.result.rooms
    .filter((r) => r.raiRequired && ['NON_COMPLIANT', 'INCOMPLETE', 'INVALID_INPUT'].includes(r.outcome))
    .map((r) => ({ unit: u.name, room: u.input.rooms.find((x) => x.id === r.roomId)?.name ?? r.roomId, outcome: r.outcome }))));
}

function roomRows(input: UnitInput, result: UnitResult): string[][] {
  return result.rooms.map((r: RoomResult) => {
    const room = input.rooms.find((x) => x.id === r.roomId);
    const minimum = r.illuminating?.minimum ?? r.ventilating?.minimum ?? null;
    const deltas = [r.illuminating?.delta, r.ventilating?.delta].filter((d): d is string => d !== undefined);
    const delta = deltas.reduce<string | null>((min, d) => (min === null || Number(d) < Number(min) ? d : min), null);
    return [
      room?.name ?? '—', ROOM_USE_LABEL[room?.use ?? ''] ?? room?.use ?? '—', n2(r.computableArea), heightOf(input, r.roomId),
      String(room?.openings.reduce((s, o) => s + o.quantity, 0) ?? 0), n2(r.illuminating?.total), n2(r.ventilating?.total),
      r.illuminating ? formatDecimalIt(r.illuminating.ratio, 3) : '—', r.ventilating ? formatDecimalIt(r.ventilating.ratio, 3) : '—',
      n2(minimum), delta === null ? '—' : n2(delta), OUTCOME_LABEL[r.outcome],
    ];
  });
}

function openingRows(input: UnitInput, result: UnitResult): string[][] {
  return input.rooms.flatMap((room) => {
    const computed = result.rooms.find((r) => r.roomId === room.id);
    return room.openings.map((o) => {
      const calc = computed?.openings.find((x) => x.id === o.id);
      const operability = o.operability === 'FULL' ? 'Totale' : o.operability === 'PARTIAL' ? 'Parziale' : 'Fissa';
      return [room.name, o.label, `${n2(o.width)} × ${n2(o.height)}`, o.sillHeight ? n2(o.sillHeight) : '—', operability,
        String(o.quantity), n2(calc?.illuminatingArea), n2(calc?.ventilatingArea)];
    });
  });
}

/** Relazione tecnica R.A.I. (FR-M5-20) o report di verifica non asseverativo (FR-M5-21). */
export function renderRaiReport(meta: Omit<DocMeta, 'title' | 'kind' | 'watermark'>, letterhead: Letterhead, data: RaiReportData): Promise<Buffer> {
  const attestation = data.variant === 'ATTESTATION';
  return PdfDoc.render({
    ...meta,
    title: attestation
      ? 'RELAZIONE TECNICA — VERIFICA DEI REQUISITI IGIENICO-SANITARI E DEI RAPPORTI AEROILLUMINANTI'
      : 'REPORT DI VERIFICA DEI REQUISITI AEROILLUMINANTI',
    kind: attestation ? 'Relazione R.A.I.' : 'Report di verifica R.A.I.',
    watermark: attestation ? null : 'DOCUMENTO DI LAVORO — NON ASSEVERATIVO',
  }, letterhead, (pdf) => {
    const p = data.project;
    const profile = data.profile;

    pdf.keyValues([
      ['Oggetto', `${p.interventionType} — ${p.title}`],
      ['Ubicazione', p.address],
      ['Dati catastali', p.cadastral],
      ['Committente', data.clients.join(', ')],
      ['Titolo edilizio', p.permitType ? PERMIT_LABEL[p.permitType] ?? p.permitType : null],
      ['Revisione', `Rev. ${data.revision} del ${formatDateIt(data.date)}${data.revisionReason ? ` — ${data.revisionReason}` : ''}`],
      ['Commessa', p.code],
    ]);

    pdf.heading('1. Premessa e riferimenti normativi');
    pdf.paragraph(`La presente relazione verifica il rispetto dei requisiti igienico-sanitari e dei rapporti aeroilluminanti dei vani dell'intervento in oggetto, secondo il profilo normativo "${profile.name}" (versione ${profile.version}).`);
    pdf.numberedList('1', profile.legalReferences.map((r) => ({ text: r })));

    pdf.heading('2. Criteri e metodologia di calcolo');
    const m = profile.measurement;
    pdf.paragraph('Sp: superficie utile di pavimento computabile del vano. Si: superficie illuminante. Sa: superficie apribile aerante. ' +
      `Rapporti minimi: Si/Sp ≥ ${ratioAsFraction(profile.ratios.standard.illuminating)} e Sa/Sp ≥ ${ratioAsFraction(profile.ratios.standard.ventilating)}.`);
    pdf.keyValues([
      ['Base di misura', m.basis === 'NET_GLASS' ? 'Vetro netto' : 'Luce architettonica'],
      ['Coefficiente telaio', formatDecimalIt(m.frameCoefficient, 2)],
      ['Quota di esclusione', `${formatDecimalIt(m.exclusionHeightFromFloor, 2)} m dal pavimento`],
      ['Aggetti', m.overhang.method === 'EXCLUDE_TOP_BAND'
        ? `Oltre ${formatDecimalIt(m.overhang.thresholdDepth, 2)} m si esclude la fascia superiore pari a ${formatDecimalIt(m.overhang.factor, 2)} × profondità`
        : 'Nessuna correzione'],
      ['Altezze minime', `Vani abitabili ${formatDecimalIt(profile.heights.habitable, 2)} m; accessori ${formatDecimalIt(profile.heights.nonHabitable, 2)} m`],
      ['Superfici minime', `Camera singola ${formatDecimalIt(profile.minimumAreas.singleBedroom, 2)} mq; doppia ${formatDecimalIt(profile.minimumAreas.doubleBedroom, 2)} mq; soggiorno ${formatDecimalIt(profile.minimumAreas.livingRoom, 2)} mq`],
    ]);
    pdf.note('I confronti con le soglie sono eseguiti sui valori non arrotondati; nelle tabelle i valori sono arrotondati a 2 decimali (BR-22).');

    pdf.heading('3. Prospetto per unità immobiliare');
    for (const b of data.buildings) {
      for (const u of b.units) {
        pdf.paragraph(`${b.name} — ${u.name}${u.floor ? `, piano ${u.floor}` : ''}`, { bold: true });
        pdf.table([
          { header: 'Vano', width: 14 }, { header: 'Destinazione', width: 16 }, { header: 'Sp [mq]', width: 8, align: 'right' },
          { header: 'H [m]', width: 8, align: 'right' }, { header: 'Ap.', width: 5, align: 'right' }, { header: 'Si [mq]', width: 8, align: 'right' },
          { header: 'Sa [mq]', width: 8, align: 'right' }, { header: 'Si/Sp', width: 7, align: 'right' }, { header: 'Sa/Sp', width: 7, align: 'right' },
          { header: 'Minimo', width: 8, align: 'right' }, { header: 'Δ [mq]', width: 8, align: 'right' }, { header: 'Esito', width: 14 },
        ], roomRows(u.input, u.result), 7);
        const openings = openingRows(u.input, u.result);
        if (openings.length) {
          pdf.note('Dettaglio delle aperture');
          pdf.table([
            { header: 'Vano', width: 16 }, { header: 'Apertura', width: 10 }, { header: 'L × H [m]', width: 14 },
            { header: 'Davanzale', width: 10, align: 'right' }, { header: 'Apribilità', width: 12 }, { header: 'Q.tà', width: 6, align: 'right' },
            { header: 'Si [mq]', width: 10, align: 'right' }, { header: 'Sa [mq]', width: 10, align: 'right' },
          ], openings, 7);
        }
        u.result.rooms.forEach((r) => r.notes.forEach((n) => pdf.note(`${u.input.rooms.find((x) => x.id === r.roomId)?.name ?? ''}: ${n.message}`)));
      }
    }

    pdf.heading('4. Vani ciechi e vani di servizio');
    pdf.numberedList('4', data.buildings.flatMap((b) => b.units.flatMap((u) => u.input.rooms
      .filter((r) => r.isWindowless || u.result.rooms.find((x) => x.roomId === r.id)?.roomClass !== 'HABITABLE')
      .map((r) => ({
        text: `${u.name} — ${r.name} (${ROOM_USE_LABEL[r.use] ?? r.use})`,
        detail: `Ventilazione ${r.mechanicalVentilation && r.mechanicalVentilation !== 'NONE' ? 'meccanica' : 'naturale'}`,
      })))));

    pdf.heading('5. Verifiche dimensionali dell’unità');
    for (const b of data.buildings) {
      for (const u of b.units) {
        const rows: Array<[string, string]> = [];
        if (u.result.studioApartment) rows.push([`${u.name} — monostanza`, `${n2(u.result.studioApartment.value)} mq (minimo ${n2(u.result.studioApartment.minimum)} mq)`]);
        if (u.result.occupancy) rows.push([`${u.name} — per abitanti`, `${n2(u.result.occupancy.value)} mq (minimo ${n2(u.result.occupancy.minimum)} mq)`]);
        rows.push([`${u.name} — esito`, OUTCOME_LABEL[u.result.outcome]]);
        pdf.keyValues(rows);
      }
    }

    pdf.heading('6. Deroghe applicate');
    const derogations = data.buildings.flatMap((b) => b.units.flatMap((u) => [
      ...u.result.appliedDerogations.map((d) => ({ where: u.name, d })),
      ...u.result.rooms.flatMap((r) => r.appliedDerogations.map((d) => ({ where: `${u.name} — ${u.input.rooms.find((x) => x.id === r.roomId)?.name ?? ''}`, d }))),
    ]));
    pdf.numberedList('6', derogations.map(({ where, d }) => ({
      text: `${where}: deroga ${d.code} sulla verifica ${d.check}`,
      detail: `${d.legalReference ? `${d.legalReference}. ` : ''}Motivazione: ${d.justification}`,
    })));

    pdf.heading('7. Quadro riepilogativo');
    const c = data.summary.counts;
    pdf.keyValues([
      ['Conformi', String(c.COMPLIANT)], ['Subordinati ad asseverazione', String(c.SUBJECT_TO_ATTESTATION)],
      ['Non conformi', String(c.NON_COMPLIANT)], ['Dati incompleti', String(c.INCOMPLETE + c.INVALID_INPUT)],
      ['Non richiesti', String(c.NOT_REQUIRED)], ['Deficit complessivo', `${formatDecimalIt(data.summary.deficitSqm, 2)} mq`],
    ]);

    pdf.heading('8. Esito');
    pdf.paragraph(overallOutcome(data.summary).sentence);

    if (attestation && data.attestationText) {
      pdf.heading('9. Asseverazione');
      pdf.paragraph(data.attestationText);
    }
    pdf.note('Il contenuto del presente documento è sotto la responsabilità del professionista firmatario (BR-07). Il software non rilascia asseverazioni in proprio.');
    pdf.spacer();
    pdf.signatures([{
      role: attestation ? 'Il progettista (timbro e firma)' : 'Il redattore',
      name: data.signer ? [data.signer.title, data.signer.name].filter(Boolean).join(' ') : null,
      detail: data.signer?.order ? `${data.signer.order} n. ${data.signer.registrationNumber ?? ''}` : null,
    }]);
  });
}
