/**
 * Validazione degli input dimensionali — AFU FR-M3-03/06, EC-12, BR-22.
 * Restituisce tutti i problemi trovati (non si ferma al primo).
 */
import { D, dec } from './decimal.js';
import type { DecimalString, OpeningInput, RoomInput, ValidationIssue } from './types.js';

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
const MAX_DECIMALS = 3; // precisione al millimetro (BR-22)

interface Range {
  min: string;
  max: string;
  /** Il minimo è escluso (valore > min). */
  exclusiveMin?: boolean;
}

const RANGES = {
  floorArea: { min: '0', max: '1000', exclusiveMin: true },
  height: { min: '1', max: '10' },
  openingWidth: { min: '0.1', max: '20' },
  openingHeight: { min: '0.1', max: '10' },
  sillHeight: { min: '0', max: '5' },
  overhangDepth: { min: '0', max: '10' },
} satisfies Record<string, Range>;

const VERTICAL_KINDS = new Set(['WINDOW', 'FRENCH_WINDOW', 'FIXED_GLAZING', 'TRANSOM']);

export function isVerticalOpening(kind: OpeningInput['kind']): boolean {
  return VERTICAL_KINDS.has(kind);
}

/** Controlla formato, decimali e intervallo. Restituisce il problema o null. */
function checkNumber(path: string, value: DecimalString, range: Range): ValidationIssue | null {
  if (!DECIMAL_PATTERN.test(value)) {
    return { path, code: 'NOT_A_NUMBER', message: `"${value}" non è un numero valido.` };
  }
  const decimals = value.split('.')[1]?.length ?? 0;
  if (decimals > MAX_DECIMALS) {
    return {
      path,
      code: 'TOO_MANY_DECIMALS',
      message: `Sono ammessi al massimo ${MAX_DECIMALS} decimali (precisione al millimetro).`,
    };
  }
  const n = dec(value);
  const belowMin = range.exclusiveMin ? n.lessThanOrEqualTo(range.min) : n.lessThan(range.min);
  if (belowMin || n.greaterThan(range.max)) {
    const hint = n.greaterThan(range.max) ? " Verifica l'unità di misura (metri)." : '';
    return {
      path,
      code: 'OUT_OF_RANGE',
      message: `Valore fuori dall'intervallo ammesso (${range.min}–${range.max}).${hint}`,
    };
  }
  return null;
}

function required(path: string): ValidationIssue {
  return { path, code: 'REQUIRED', message: 'Campo obbligatorio.' };
}

function validateOpening(opening: OpeningInput, index: number): ValidationIssue[] {
  const base = `openings[${index}]`;
  const issues: ValidationIssue[] = [];
  const push = (issue: ValidationIssue | null) => {
    if (issue) issues.push(issue);
  };

  if (!Number.isInteger(opening.quantity) || opening.quantity < 1) {
    issues.push({
      path: `${base}.quantity`,
      code: 'INVALID_QUANTITY',
      message: 'La quantità deve essere un intero maggiore o uguale a 1.',
    });
  }

  const widthIssue = checkNumber(`${base}.width`, opening.width, RANGES.openingWidth);
  const heightIssue = checkNumber(`${base}.height`, opening.height, RANGES.openingHeight);
  push(widthIssue);
  push(heightIssue);

  if (isVerticalOpening(opening.kind)) {
    if (opening.sillHeight === undefined) {
      issues.push(required(`${base}.sillHeight`));
    } else {
      push(checkNumber(`${base}.sillHeight`, opening.sillHeight, RANGES.sillHeight));
    }
  }

  if (opening.overhangDepth !== undefined) {
    push(checkNumber(`${base}.overhangDepth`, opening.overhangDepth, RANGES.overhangDepth));
  }

  const dimensionsValid = !widthIssue && !heightIssue;

  if (opening.glassWidth !== undefined || opening.glassHeight !== undefined) {
    if (opening.glassWidth === undefined || opening.glassHeight === undefined) {
      issues.push(
        required(`${base}.${opening.glassWidth === undefined ? 'glassWidth' : 'glassHeight'}`),
      );
    } else {
      const gw = checkNumber(`${base}.glassWidth`, opening.glassWidth, RANGES.openingWidth);
      const gh = checkNumber(`${base}.glassHeight`, opening.glassHeight, RANGES.openingHeight);
      push(gw);
      push(gh);
      if (
        dimensionsValid &&
        !gw &&
        !gh &&
        (dec(opening.glassWidth).greaterThan(opening.width) ||
          dec(opening.glassHeight).greaterThan(opening.height))
      ) {
        issues.push({
          path: `${base}.glassWidth`,
          code: 'GLASS_LARGER_THAN_OPENING',
          message: "Il vetro netto non può essere più grande dell'apertura.",
        });
      }
    }
  }

  if (opening.operability === 'PARTIAL') {
    if (opening.openableArea === undefined) {
      issues.push(required(`${base}.openableArea`));
    } else {
      const areaIssue = checkNumber(`${base}.openableArea`, opening.openableArea, {
        min: '0',
        max: '200',
        exclusiveMin: true,
      });
      push(areaIssue);
      if (
        !areaIssue &&
        dimensionsValid &&
        dec(opening.openableArea).greaterThan(dec(opening.width).times(opening.height))
      ) {
        issues.push({
          path: `${base}.openableArea`,
          code: 'OPENABLE_AREA_TOO_LARGE',
          message: "La superficie apribile non può superare la superficie dell'apertura.",
        });
      }
    }
  }

  return issues;
}

export function validateRoom(room: RoomInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (issue: ValidationIssue | null) => {
    if (issue) issues.push(issue);
  };

  const floorIssue = checkNumber('floorArea', room.floorArea, RANGES.floorArea);
  push(floorIssue);

  if (room.nonComputableArea !== undefined) {
    const ncIssue = checkNumber('nonComputableArea', room.nonComputableArea, {
      min: '0',
      max: '1000',
    });
    push(ncIssue);
    if (
      !ncIssue &&
      !floorIssue &&
      dec(room.nonComputableArea).greaterThanOrEqualTo(room.floorArea)
    ) {
      issues.push({
        path: 'nonComputableArea',
        code: 'NON_COMPUTABLE_TOO_LARGE',
        message: 'La superficie non computabile deve essere minore della superficie del vano.',
      });
    }
  }

  const { ceiling } = room;
  if (ceiling.type === 'FLAT') {
    push(checkNumber('ceiling.height', ceiling.height, RANGES.height));
  } else if (ceiling.type === 'MANUAL') {
    push(checkNumber('ceiling.averageHeight', ceiling.averageHeight, RANGES.height));
  } else {
    const minIssue = checkNumber('ceiling.minHeight', ceiling.minHeight, { min: '0.1', max: '10' });
    const maxIssue = checkNumber('ceiling.maxHeight', ceiling.maxHeight, RANGES.height);
    push(minIssue);
    push(maxIssue);
    if (!minIssue && !maxIssue && new D(ceiling.minHeight).greaterThan(ceiling.maxHeight)) {
      issues.push({
        path: 'ceiling.minHeight',
        code: 'MIN_GREATER_THAN_MAX',
        message: "L'altezza minima non può superare quella massima.",
      });
    }
  }

  room.openings.forEach((opening, index) => {
    issues.push(...validateOpening(opening, index));
  });

  return issues;
}
