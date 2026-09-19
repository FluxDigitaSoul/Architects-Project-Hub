/**
 * Corpus di regressione del motore R.A.I. — AFU cap. 9.5 (TC-R-*) e criteri
 * AC-FR-M3-* del cap. 5.3. Ogni caso cita l'ID dell'AFU che verifica.
 */
import { describe, expect, it } from 'vitest';
import {
  LOCAL_REGULATION_TEMPLATE,
  NATIONAL_DM_1975,
  NATIONAL_SALVA_CASA,
  evaluateRoom,
  type OpeningInput,
  type RegulationProfile,
  type RoomInput,
} from '../src/index.js';

const LONG_JUSTIFICATION =
  'Intervento di recupero edilizio con miglioramento delle condizioni igienico-sanitarie, ' +
  'riscontro d aria trasversale e aumento della superficie finestrata.';

function opening(overrides: Partial<OpeningInput> = {}): OpeningInput {
  return {
    id: 'w1',
    label: 'W1',
    kind: 'WINDOW',
    quantity: 1,
    width: '1.80',
    height: '1.50',
    sillHeight: '0.90',
    operability: 'FULL',
    ...overrides,
  };
}

function room(overrides: Partial<RoomInput> = {}): RoomInput {
  return {
    id: 'r1',
    name: 'Soggiorno',
    use: 'LIVING_ROOM',
    floorArea: '20.00',
    ceiling: { type: 'FLAT', height: '2.70' },
    openings: [opening()],
    ...overrides,
  };
}

/** Profilo con quota di esclusione a 0,60 m e aggetti oltre 1,20 m (fattore 0,5). */
const LOCAL: RegulationProfile = LOCAL_REGULATION_TEMPLATE;

describe('TC-R-01 · AC-FR-M3-08-1 — esempio corretto della traccia', () => {
  it('20 mq with a 1.80 x 1.50 window is compliant with +0.20 mq', () => {
    const result = evaluateRoom(room(), NATIONAL_DM_1975);

    expect(result.outcome).toBe('COMPLIANT');
    expect(result.illuminating).toMatchObject({
      status: 'PASSED',
      total: '2.7',
      minimum: '2.5',
      delta: '0.2',
      ratio: '0.135',
      requiredRatio: '0.125',
    });
    expect(result.ventilating).toMatchObject({ status: 'PASSED', total: '2.7', delta: '0.2' });
  });
});

describe('TC-R-02 · AC-FR-M3-08-2 — caso originale della traccia (negativo)', () => {
  it('20 mq with a 1.40 x 1.50 window is NOT compliant with -0.40 mq', () => {
    const result = evaluateRoom(room({ openings: [opening({ width: '1.40' })] }), NATIONAL_DM_1975);

    expect(result.outcome).toBe('NON_COMPLIANT');
    expect(result.illuminating).toMatchObject({ status: 'FAILED', total: '2.1', delta: '-0.4' });
    expect(result.ventilating).toMatchObject({ status: 'FAILED', total: '2.1', delta: '-0.4' });
  });
});

describe('TC-R-03 · AC-FR-M3-08-3 — uguaglianza', () => {
  it('treats total == minimum as compliant', () => {
    const result = evaluateRoom(
      room({ floorArea: '16.00', openings: [opening({ width: '1.00', height: '2.00' })] }),
      NATIONAL_DM_1975,
    );
    expect(result.outcome).toBe('COMPLIANT');
    expect(result.ventilating).toMatchObject({ total: '2', minimum: '2', delta: '0' });
  });
});

describe('TC-R-04 · AC-FR-M3-08-4 — precisione (BR-22)', () => {
  it('compares exact values, not rounded ones', () => {
    const result = evaluateRoom(
      room({
        floorArea: '10.01',
        openings: [
          opening({ width: '2.00', height: '1.50', operability: 'PARTIAL', openableArea: '1.251' }),
        ],
      }),
      NATIONAL_DM_1975,
    );
    expect(result.ventilating).toMatchObject({
      status: 'FAILED',
      minimum: '1.25125',
      delta: '-0.00025',
    });
    expect(result.outcome).toBe('NON_COMPLIANT');
  });
});

describe('TC-R-05 · AC-FR-M3-08-5 — quota di esclusione dal pavimento', () => {
  it('excludes the bottom 0.60 m of a French window from the illuminating area', () => {
    const result = evaluateRoom(
      room({
        openings: [
          opening({ kind: 'FRENCH_WINDOW', width: '1.20', height: '2.40', sillHeight: '0.00' }),
        ],
      }),
      LOCAL,
    );
    expect(result.openings[0]).toMatchObject({
      illuminatingHeight: '1.8',
      illuminatingArea: '2.16',
      ventilatingArea: '2.88',
    });
    expect(result.notes.map((n) => n.code)).toContain('EXCLUDED_BOTTOM_BAND');
  });
});

describe('TC-R-06 · AC-FR-M3-08-6 — aggetto sovrastante', () => {
  it('excludes a top band equal to half of an overhang deeper than 1.20 m', () => {
    const result = evaluateRoom(
      room({
        openings: [
          opening({ width: '1.20', height: '1.40', sillHeight: '0.90', overhangDepth: '1.60' }),
        ],
      }),
      LOCAL,
    );
    expect(result.openings[0]).toMatchObject({
      illuminatingHeight: '0.6',
      illuminatingArea: '0.72',
      ventilatingArea: '1.68',
    });
    expect(result.notes.map((n) => n.code)).toContain('EXCLUDED_TOP_BAND_OVERHANG');
  });

  it('ignores overhangs up to the threshold depth', () => {
    const result = evaluateRoom(
      room({ openings: [opening({ width: '1.20', height: '1.40', overhangDepth: '1.20' })] }),
      LOCAL,
    );
    expect(result.openings[0]?.illuminatingArea).toBe('1.68');
  });
});

describe('TC-R-07 · AC-FR-M3-08-7 — apribilità parziale', () => {
  it('fails the ventilating check while passing the illuminating one', () => {
    const result = evaluateRoom(
      room({
        floorArea: '18.00',
        openings: [
          opening({
            kind: 'FIXED_GLAZING',
            width: '3.00',
            height: '2.40',
            sillHeight: '0.00',
            operability: 'PARTIAL',
            openableArea: '1.20',
          }),
        ],
      }),
      NATIONAL_DM_1975,
    );
    expect(result.illuminating).toMatchObject({ status: 'PASSED', total: '7.2', delta: '4.95' });
    expect(result.ventilating).toMatchObject({ status: 'FAILED', total: '1.2', delta: '-1.05' });
    expect(result.outcome).toBe('NON_COMPLIANT');
  });
});

describe('TC-R-08 — aperture miste (verticale, in falda, fissa)', () => {
  it('sums every opening type and counts fixed glazing only as illuminating', () => {
    const result = evaluateRoom(
      room({
        floorArea: '24.00',
        openings: [
          opening({ id: 'a', width: '1.00', height: '1.20' }),
          opening({
            id: 'b',
            kind: 'ROOF_WINDOW',
            width: '0.78',
            height: '1.18',
            sillHeight: undefined,
          }),
          opening({
            id: 'c',
            kind: 'FIXED_GLAZING',
            width: '1.00',
            height: '1.00',
            operability: 'FIXED',
          }),
        ],
      }),
      NATIONAL_DM_1975,
    );
    // Si = 1.20 + 0.9204 + 1.00 = 3.1204 ; Sa = 1.20 + 0.9204 = 2.1204 ; minimo = 3.00
    expect(result.illuminating).toMatchObject({ total: '3.1204', status: 'PASSED' });
    expect(result.ventilating).toMatchObject({ total: '2.1204', status: 'FAILED' });
    expect(result.openings.find((o) => o.id === 'b')?.isRoofOpening).toBe(true);
  });
});

describe('TC-R-09 — quantità > 1', () => {
  it('multiplies identical openings by their quantity', () => {
    const result = evaluateRoom(
      room({ openings: [opening({ width: '1.00', height: '1.40', quantity: 2 })] }),
      NATIONAL_DM_1975,
    );
    expect(result.illuminating?.total).toBe('2.8');
    expect(result.outcome).toBe('COMPLIANT');
  });
});

describe('TC-R-10..12 — altezze', () => {
  it('computes the average height of a sloped ceiling', () => {
    const result = evaluateRoom(
      room({ ceiling: { type: 'SLOPED', minHeight: '2.20', maxHeight: '3.20' } }),
      NATIONAL_DM_1975,
    );
    expect(result.height).toMatchObject({ value: '2.7', minimum: '2.7', status: 'PASSED' });
  });

  it('AC-FR-M3-05-1: 2.60 m is compliant above 1000 m a.s.l. (min 2.55)', () => {
    const result = evaluateRoom(
      room({ ceiling: { type: 'FLAT', height: '2.60' } }),
      NATIONAL_DM_1975,
      {
        altitude: 1150,
      },
    );
    expect(result.height).toMatchObject({ minimum: '2.55', status: 'PASSED' });
    expect(result.notes.map((n) => n.code)).toContain('MOUNTAIN_HEIGHT_APPLIED');
    expect(result.outcome).toBe('COMPLIANT');
  });

  it('AC-FR-M3-05-1: the same room at 800 m a.s.l. is not compliant (min 2.70)', () => {
    const result = evaluateRoom(
      room({ ceiling: { type: 'FLAT', height: '2.60' } }),
      NATIONAL_DM_1975,
      {
        altitude: 800,
      },
    );
    expect(result.height).toMatchObject({ minimum: '2.7', status: 'FAILED' });
    expect(result.outcome).toBe('NON_COMPLIANT');
  });

  it('uses the non-habitable minimum (2.40) for service rooms', () => {
    const result = evaluateRoom(
      room({
        use: 'BATHROOM',
        floorArea: '4.00',
        ceiling: { type: 'MANUAL', averageHeight: '2.40' },
        openings: [opening({ width: '0.60', height: '0.80' })],
      }),
      NATIONAL_DM_1975,
    );
    expect(result.height).toMatchObject({ minimum: '2.4', status: 'PASSED' });
  });
});

describe('TC-R-13..15 — deroghe (FR-M3-12)', () => {
  it('AC-FR-M3-12-1: Salva Casa covers the height but not the R.A.I. deficit', () => {
    const result = evaluateRoom(
      room({
        ceiling: { type: 'FLAT', height: '2.50' },
        openings: [opening({ width: '1.46' })], // Sa = 2.19 → deficit -0.31
        derogations: [
          {
            code: 'D-01',
            covers: ['HEIGHT', 'RAI_VENTILATING'],
            justification: LONG_JUSTIFICATION,
          },
        ],
      }),
      NATIONAL_SALVA_CASA,
    );
    expect(result.height?.status).toBe('COVERED_BY_DEROGATION');
    expect(result.ventilating?.status).toBe('FAILED');
    expect(result.outcome).toBe('NON_COMPLIANT');
    expect(result.notes.map((n) => n.code)).toContain('DEROGATION_IGNORED');
  });

  it('AC-FR-M3-12-2: Salva Casa cannot cover heights below 2.40 m', () => {
    const result = evaluateRoom(
      room({
        ceiling: { type: 'FLAT', height: '2.35' },
        derogations: [{ code: 'D-01', covers: ['HEIGHT'], justification: LONG_JUSTIFICATION }],
      }),
      NATIONAL_SALVA_CASA,
    );
    expect(result.height?.status).toBe('FAILED');
    expect(result.outcome).toBe('NON_COMPLIANT');
  });

  it('marks a room covered only by valid derogations as subject to attestation', () => {
    const result = evaluateRoom(
      room({
        ceiling: { type: 'FLAT', height: '2.50' },
        derogations: [{ code: 'D-01', covers: ['HEIGHT'], justification: LONG_JUSTIFICATION }],
      }),
      NATIONAL_SALVA_CASA,
    );
    expect(result.outcome).toBe('SUBJECT_TO_ATTESTATION');
    expect(result.appliedDerogations).toEqual([
      expect.objectContaining({ code: 'D-01', check: 'HEIGHT' }),
    ]);
  });

  it('ignores Salva Casa in the plain national profile (not allowed there)', () => {
    const result = evaluateRoom(
      room({
        ceiling: { type: 'FLAT', height: '2.50' },
        derogations: [{ code: 'D-01', covers: ['HEIGHT'], justification: LONG_JUSTIFICATION }],
      }),
      NATIONAL_DM_1975,
    );
    expect(result.height?.status).toBe('FAILED');
  });

  it('ignores derogations with a justification shorter than 50 characters', () => {
    const result = evaluateRoom(
      room({
        ceiling: { type: 'FLAT', height: '2.50' },
        derogations: [{ code: 'D-01', covers: ['HEIGHT'], justification: 'troppo corta' }],
      }),
      NATIONAL_SALVA_CASA,
    );
    expect(result.height?.status).toBe('FAILED');
  });

  it('D-99 covers any check when the profile allows it (with a legal reference)', () => {
    const result = evaluateRoom(
      room({
        openings: [opening({ width: '1.40' })],
        derogations: [
          {
            code: 'D-99',
            covers: ['RAI_ILLUMINATING', 'RAI_VENTILATING'],
            justification: LONG_JUSTIFICATION,
            legalReference: 'Reg. edilizio art. 99',
          },
        ],
      }),
      NATIONAL_DM_1975,
    );
    expect(result.outcome).toBe('SUBJECT_TO_ATTESTATION');
    expect(result.appliedDerogations.map((d) => d.legalReference)).toContain(
      'Reg. edilizio art. 99',
    );
  });

  it('D-99 without a legal reference is ignored', () => {
    const result = evaluateRoom(
      room({
        openings: [opening({ width: '1.40' })],
        derogations: [
          {
            code: 'D-99',
            covers: ['RAI_ILLUMINATING', 'RAI_VENTILATING'],
            justification: LONG_JUSTIFICATION,
          },
        ],
      }),
      NATIONAL_DM_1975,
    );
    expect(result.outcome).toBe('NON_COMPLIANT');
  });

  it('D-03 (mechanical ventilation) requires a mechanical ventilation system', () => {
    const base = room({
      openings: [opening({ width: '2.00', operability: 'PARTIAL', openableArea: '1.00' })],
      derogations: [
        { code: 'D-03', covers: ['RAI_VENTILATING'], justification: LONG_JUSTIFICATION },
      ],
    });
    expect(evaluateRoom(base, LOCAL).outcome).toBe('NON_COMPLIANT');
    expect(evaluateRoom({ ...base, mechanicalVentilation: 'MVHR_CENTRAL' }, LOCAL).outcome).toBe(
      'SUBJECT_TO_ATTESTATION',
    );
  });
});

describe('TC-R-16..17 — vani ciechi e di servizio (FR-M3-13)', () => {
  it('AC-FR-M3-13-1: a windowless bathroom with extraction is ventilation-compliant', () => {
    const result = evaluateRoom(
      room({
        use: 'BATHROOM',
        floorArea: '4.50',
        ceiling: { type: 'FLAT', height: '2.40' },
        isWindowless: true,
        mechanicalVentilation: 'EXTRACTION',
        openings: [],
      }),
      NATIONAL_DM_1975,
    );
    expect(result.raiRequired).toBe(false);
    expect(result.ventilation).toMatchObject({ status: 'PASSED', via: 'MECHANICAL' });
    expect(result.outcome).toBe('COMPLIANT');
  });

  it('AC-FR-M3-13-1: a windowless bathroom without extraction is not compliant', () => {
    const result = evaluateRoom(
      room({
        use: 'BATHROOM',
        floorArea: '4.50',
        ceiling: { type: 'FLAT', height: '2.40' },
        isWindowless: true,
        openings: [],
      }),
      NATIONAL_DM_1975,
    );
    expect(result.ventilation).toMatchObject({ status: 'FAILED', via: 'NONE' });
    expect(result.outcome).toBe('NON_COMPLIANT');
  });

  it('a windowless storage room is "not required"', () => {
    const result = evaluateRoom(
      room({
        use: 'STORAGE',
        floorArea: '3.00',
        ceiling: { type: 'FLAT', height: '2.40' },
        isWindowless: true,
        openings: [],
      }),
      NATIONAL_DM_1975,
    );
    expect(result.outcome).toBe('NOT_REQUIRED');
    expect(result.illuminating).toBeNull();
  });

  it('a windowless habitable room is not compliant (art. 5 D.M. 1975)', () => {
    const result = evaluateRoom(room({ isWindowless: true, openings: [] }), NATIONAL_DM_1975);
    expect(result.outcome).toBe('NON_COMPLIANT');
    expect(result.illuminating).toMatchObject({ status: 'FAILED', total: '0', delta: '-2.5' });
    expect(result.notes.map((n) => n.code)).toContain('WINDOWLESS_HABITABLE_ROOM');
  });

  it('a habitable room without openings that is not marked windowless is incomplete', () => {
    const result = evaluateRoom(room({ openings: [] }), NATIONAL_DM_1975);
    expect(result.outcome).toBe('INCOMPLETE');
    expect(result.notes.map((n) => n.code)).toContain('MISSING_OPENINGS');
  });
});

describe('aperture non computabili e sottotetti', () => {
  it('EC-11: an opening on an unsuitable space is listed but not counted', () => {
    const result = evaluateRoom(
      room({ openings: [opening({ facesSuitableSpace: false })] }),
      NATIONAL_DM_1975,
    );
    expect(result.openings[0]).toMatchObject({ illuminatingArea: '0', ventilatingArea: '0' });
    expect(result.notes.map((n) => n.code)).toContain('NOT_SUITABLE_SPACE');
  });

  it('EC-12: an opening entirely below the computation height has zero illuminating area', () => {
    const result = evaluateRoom(
      room({ openings: [opening({ height: '0.40', sillHeight: '0.10' })] }),
      LOCAL,
    );
    expect(result.openings[0]?.illuminatingArea).toBe('0');
    expect(result.notes.map((n) => n.code)).toContain('OPENING_BELOW_COMPUTATION_HEIGHT');
  });

  it('EC-10: attic ratio applies when roof openings prevail in an attic unit', () => {
    const attic: RegulationProfile = {
      ...LOCAL,
      ratios: { ...LOCAL.ratios, attic: { illuminating: '0.1', ventilating: '0.1' } },
    };
    const result = evaluateRoom(
      room({
        floorArea: '20.00',
        openings: [
          opening({ kind: 'ROOF_WINDOW', width: '1.00', height: '2.10', sillHeight: undefined }),
        ],
      }),
      attic,
      { isAttic: true },
    );
    expect(result.ventilating).toMatchObject({
      requiredRatio: '0.1',
      minimum: '2',
      status: 'PASSED',
    });
    expect(result.notes.map((n) => n.code)).toContain('ATTIC_RATIO_APPLIED');
  });

  it('subtracts the non-computable area (mansarda) from Sp', () => {
    const result = evaluateRoom(
      room({ floorArea: '24.00', nonComputableArea: '4.00' }),
      NATIONAL_DM_1975,
    );
    expect(result.computableArea).toBe('20');
    expect(result.illuminating?.minimum).toBe('2.5');
  });

  it('uses net glass dimensions when the profile measures NET_GLASS', () => {
    const netGlass: RegulationProfile = {
      ...NATIONAL_DM_1975,
      measurement: { ...NATIONAL_DM_1975.measurement, basis: 'NET_GLASS' },
    };
    const result = evaluateRoom(
      room({ openings: [opening({ glassWidth: '1.60', glassHeight: '1.30' })] }),
      netGlass,
    );
    expect(result.illuminating?.total).toBe('2.08');
    expect(result.ventilating?.total).toBe('2.7');
  });
});

describe('superfici minime dei vani (art. 2 D.M. 1975)', () => {
  it('a single bedroom below 9 mq fails the minimum area check', () => {
    const result = evaluateRoom(
      room({ use: 'SINGLE_BEDROOM', floorArea: '8.50', openings: [opening({ width: '1.00' })] }),
      NATIONAL_DM_1975,
    );
    expect(result.minimumArea).toMatchObject({ minimum: '9', status: 'FAILED' });
    expect(result.outcome).toBe('NON_COMPLIANT');
  });

  it('a double bedroom of 14 mq passes', () => {
    const result = evaluateRoom(
      room({ use: 'DOUBLE_BEDROOM', floorArea: '14.00', openings: [opening({ width: '1.20' })] }),
      NATIONAL_DM_1975,
    );
    expect(result.minimumArea?.status).toBe('PASSED');
  });
});
