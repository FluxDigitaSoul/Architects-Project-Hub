/**
 * Verifiche a livello di unità immobiliare (FR-M3-14), validazione degli input
 * (EC-12) e funzioni di presentazione.
 */
import { describe, expect, it } from 'vitest';
import {
  NATIONAL_DM_1975,
  NATIONAL_SALVA_CASA,
  evaluateRoom,
  evaluateUnit,
  formatDecimalIt,
  ratioAsFraction,
  roomClassOf,
  validateRoom,
  type RoomInput,
} from '../src/index.js';

const JUSTIFICATION =
  'Monolocale oggetto di recupero edilizio con miglioramento delle caratteristiche igienico-sanitarie.';

function habitable(id: string, floorArea: string, width = '1.80'): RoomInput {
  return {
    id,
    name: id,
    use: 'LIVING_ROOM',
    floorArea,
    ceiling: { type: 'FLAT', height: '2.70' },
    openings: [
      {
        id: `${id}-w`,
        label: 'W',
        kind: 'WINDOW',
        quantity: 1,
        width,
        height: '1.50',
        sillHeight: '0.90',
        operability: 'FULL',
      },
    ],
  };
}

const bathroom: RoomInput = {
  id: 'bagno',
  name: 'Bagno',
  use: 'BATHROOM',
  floorArea: '4.00',
  ceiling: { type: 'FLAT', height: '2.40' },
  isWindowless: true,
  mechanicalVentilation: 'EXTRACTION',
  openings: [],
};

describe('evaluateUnit — abitanti (AC-FR-M3-02-1)', () => {
  it('3 occupants need 42 mq of habitable area: 38 mq is not enough', () => {
    const result = evaluateUnit(
      {
        id: 'u1',
        unitType: 'DWELLING',
        occupants: 3,
        rooms: [habitable('a', '20.00'), habitable('b', '18.00')],
      },
      NATIONAL_DM_1975,
    );
    expect(result.occupancy).toMatchObject({ minimum: '42', value: '38', status: 'FAILED' });
    expect(result.outcome).toBe('NON_COMPLIANT');
  });

  it('3 occupants with 45 mq is compliant', () => {
    const result = evaluateUnit(
      {
        id: 'u1',
        unitType: 'DWELLING',
        occupants: 3,
        rooms: [habitable('a', '20.00'), habitable('b', '25.00', '2.20'), bathroom],
      },
      NATIONAL_DM_1975,
    );
    expect(result.occupancy).toMatchObject({ minimum: '42', value: '45', status: 'PASSED' });
    expect(result.outcome).toBe('COMPLIANT');
  });

  it('adds 10 mq per occupant beyond the fourth', () => {
    const result = evaluateUnit(
      { id: 'u1', unitType: 'DWELLING', occupants: 6, rooms: [habitable('a', '80.00', '7.00')] },
      NATIONAL_DM_1975,
    );
    expect(result.occupancy?.minimum).toBe('76');
  });
});

describe('evaluateUnit — monostanza (AC-FR-M3-14-1)', () => {
  it('a 24 mq studio apartment without derogation is not compliant (min 28)', () => {
    const result = evaluateUnit(
      {
        id: 'u2',
        unitType: 'STUDIO_APARTMENT',
        occupants: 1,
        rooms: [{ ...habitable('m', '24.00', '2.00'), use: 'STUDIO_ROOM' }],
      },
      NATIONAL_SALVA_CASA,
    );
    expect(result.studioApartment).toMatchObject({ minimum: '28', status: 'FAILED' });
    expect(result.outcome).toBe('NON_COMPLIANT');
  });

  it('with Salva Casa (D-01) the minimum becomes 20 mq and the unit is subject to attestation', () => {
    const result = evaluateUnit(
      {
        id: 'u2',
        unitType: 'STUDIO_APARTMENT',
        occupants: 1,
        rooms: [{ ...habitable('m', '24.00', '2.00'), use: 'STUDIO_ROOM' }],
        derogations: [
          { code: 'D-01', covers: ['STUDIO_APARTMENT_AREA'], justification: JUSTIFICATION },
        ],
      },
      NATIONAL_SALVA_CASA,
    );
    expect(result.studioApartment).toMatchObject({
      minimum: '20',
      status: 'COVERED_BY_DEROGATION',
    });
    expect(result.outcome).toBe('SUBJECT_TO_ATTESTATION');
  });

  it('two occupants need 38 mq (28 with Salva Casa)', () => {
    const rooms = [{ ...habitable('m', '30.00', '2.10'), use: 'STUDIO_ROOM' as const }];
    expect(
      evaluateUnit({ id: 'u', unitType: 'STUDIO_APARTMENT', occupants: 2, rooms }, NATIONAL_DM_1975)
        .studioApartment,
    ).toMatchObject({ minimum: '38', status: 'FAILED' });
  });
});

describe('evaluateUnit — aggregazione', () => {
  it('sums totals and counts outcomes; windowless allowed rooms do not worsen the unit (EC-09)', () => {
    const result = evaluateUnit(
      { id: 'u3', unitType: 'DWELLING', rooms: [habitable('a', '20.00'), bathroom] },
      NATIONAL_DM_1975,
    );
    expect(result.totals).toEqual({
      computableArea: '24',
      illuminatingArea: '2.7',
      ventilatingArea: '2.7',
    });
    expect(result.counts.COMPLIANT).toBe(2);
    expect(result.outcome).toBe('COMPLIANT');
    expect(result.occupancy).toBeNull();
  });

  it('the worst room outcome wins', () => {
    const result = evaluateUnit(
      {
        id: 'u4',
        unitType: 'DWELLING',
        rooms: [habitable('a', '20.00'), habitable('b', '20.00', '1.40')],
      },
      NATIONAL_DM_1975,
    );
    expect(result.outcome).toBe('NON_COMPLIANT');
    expect(result.counts.NON_COMPLIANT).toBe(1);
  });

  it('a unit with only accessory rooms is "not required"', () => {
    const result = evaluateUnit(
      {
        id: 'u5',
        unitType: 'OTHER',
        rooms: [{ ...bathroom, id: 's', use: 'STORAGE', mechanicalVentilation: 'NONE' }],
      },
      NATIONAL_DM_1975,
    );
    expect(result.outcome).toBe('NOT_REQUIRED');
  });
});

describe('validateRoom (EC-12)', () => {
  it('rejects dimensions that look like centimetres', () => {
    const issues = validateRoom({
      ...habitable('a', '20.00'),
      openings: [
        {
          id: 'w',
          label: 'W',
          kind: 'WINDOW',
          quantity: 1,
          width: '120',
          height: '1.50',
          sillHeight: '0.90',
          operability: 'FULL',
        },
      ],
    });
    expect(issues).toEqual([
      expect.objectContaining({ path: 'openings[0].width', code: 'OUT_OF_RANGE' }),
    ]);
  });

  it('rejects an openable area larger than the opening', () => {
    const issues = validateRoom({
      ...habitable('a', '20.00'),
      openings: [
        {
          id: 'w',
          label: 'W',
          kind: 'WINDOW',
          quantity: 1,
          width: '1.00',
          height: '1.00',
          sillHeight: '0.90',
          operability: 'PARTIAL',
          openableArea: '1.50',
        },
      ],
    });
    expect(issues.map((i) => i.code)).toContain('OPENABLE_AREA_TOO_LARGE');
  });

  it('requires an openable area for partial openings and a sill for vertical ones', () => {
    const issues = validateRoom({
      ...habitable('a', '20.00'),
      openings: [
        {
          id: 'w',
          label: 'W',
          kind: 'WINDOW',
          quantity: 1,
          width: '1.00',
          height: '1.00',
          operability: 'PARTIAL',
        },
      ],
    });
    expect(issues.map((i) => i.code).sort()).toEqual(['REQUIRED', 'REQUIRED']);
  });

  it('rejects non-numeric values, more than 3 decimals, bad quantities and sloped min > max', () => {
    const issues = validateRoom({
      ...habitable('a', 'venti'),
      nonComputableArea: '0.0001',
      ceiling: { type: 'SLOPED', minHeight: '3.00', maxHeight: '2.00' },
      openings: [
        {
          id: 'w',
          label: 'W',
          kind: 'WINDOW',
          quantity: 0,
          width: '1.00',
          height: '1.00',
          sillHeight: '0.90',
          operability: 'FULL',
        },
      ],
    });
    const codes = issues.map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'NOT_A_NUMBER',
        'TOO_MANY_DECIMALS',
        'MIN_GREATER_THAN_MAX',
        'INVALID_QUANTITY',
      ]),
    );
  });

  it('rejects a non-computable area not smaller than the floor area', () => {
    const issues = validateRoom({ ...habitable('a', '10.00'), nonComputableArea: '10.00' });
    expect(issues.map((i) => i.code)).toContain('NON_COMPUTABLE_TOO_LARGE');
  });

  it('evaluateRoom returns INVALID_INPUT with the issues', () => {
    const result = evaluateRoom({ ...habitable('a', '0') }, NATIONAL_DM_1975);
    expect(result.outcome).toBe('INVALID_INPUT');
    expect(result.issues[0]).toMatchObject({ path: 'floorArea', code: 'OUT_OF_RANGE' });
  });

  it('warns about unusually high glazing values without blocking', () => {
    const result = evaluateRoom(habitable('a', '2.00', '6.00'), NATIONAL_DM_1975);
    expect(result.notes.map((n) => n.code)).toContain('UNUSUALLY_HIGH_VALUES');
    expect(result.outcome).not.toBe('INVALID_INPUT');
  });
});

describe('presentazione', () => {
  it('formats decimals the Italian way with half-up rounding', () => {
    expect(formatDecimalIt('2.705')).toBe('2,71');
    expect(formatDecimalIt('-0.00005')).toBe('-0,00');
    expect(formatDecimalIt('1234.5', 1)).toBe('1.234,5');
  });

  it('expresses a ratio as 1/n', () => {
    expect(ratioAsFraction('0.135')).toBe('1/7,41');
    expect(ratioAsFraction('0.125')).toBe('1/8,00');
    expect(ratioAsFraction('0')).toBe('—');
  });

  it('maps uses to classes', () => {
    expect(roomClassOf('KITCHEN')).toBe('HABITABLE');
    expect(roomClassOf('WC')).toBe('SERVICE');
    expect(roomClassOf('CORRIDOR')).toBe('ACCESSORY');
  });
});
