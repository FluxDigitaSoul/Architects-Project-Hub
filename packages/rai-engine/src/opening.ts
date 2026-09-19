/**
 * Calcolo per singola apertura — AFU FR-M3-08 (passi 1–7) e FR-M3-09.
 * Presuppone input già validati (validation.ts).
 */
import { D, dec, max, out, ZERO, type Dec } from './decimal.js';
import { isVerticalOpening } from './validation.js';
import type { Note, OpeningInput, RegulationProfile } from './types.js';

export interface OpeningComputation {
  id: string;
  label: string;
  isRoofOpening: boolean;
  grossArea: Dec;
  illuminatingHeight: Dec;
  illuminatingArea: Dec;
  ventilatingArea: Dec;
}

export function computeOpening(
  opening: OpeningInput,
  profile: RegulationProfile,
  notes: Note[],
): OpeningComputation {
  const { measurement } = profile;
  const quantity = new D(opening.quantity);
  const width = dec(opening.width);
  const height = dec(opening.height);
  const grossArea = width.times(height);
  const isRoofOpening = !isVerticalOpening(opening.kind);

  // 2. Base di misura
  const useNetGlass =
    measurement.basis === 'NET_GLASS' &&
    opening.glassWidth !== undefined &&
    opening.glassHeight !== undefined;
  const baseWidth = useNetGlass ? dec(opening.glassWidth as string) : width;
  const baseHeight = useNetGlass ? dec(opening.glassHeight as string) : height;
  const sill = opening.sillHeight !== undefined ? dec(opening.sillHeight) : ZERO;
  const baseSill = useNetGlass ? sill.plus(height.minus(baseHeight).dividedBy(2)) : sill;

  let illuminatingHeight: Dec;
  if (isRoofOpening) {
    // Aperture in falda/lucernari: niente fascia bassa né aggetti; coefficiente del profilo.
    illuminatingHeight = baseHeight;
  } else {
    // 3. Fascia bassa esclusa
    const exclusion = dec(measurement.exclusionHeightFromFloor);
    const bottom = max(baseSill, exclusion);
    let top = baseSill.plus(baseHeight);
    if (bottom.greaterThan(baseSill)) {
      notes.push({
        code: 'EXCLUDED_BOTTOM_BAND',
        refId: opening.id,
        message: `${opening.label}: esclusa la parte sotto ${out(exclusion)} m dal pavimento.`,
      });
    }

    // 4. Fascia alta esclusa per aggetto
    const { overhang } = measurement;
    if (
      overhang.method === 'EXCLUDE_TOP_BAND' &&
      opening.overhangDepth !== undefined &&
      dec(opening.overhangDepth).greaterThan(overhang.thresholdDepth)
    ) {
      const band = dec(opening.overhangDepth).times(overhang.factor);
      top = top.minus(band);
      notes.push({
        code: 'EXCLUDED_TOP_BAND_OVERHANG',
        refId: opening.id,
        message: `${opening.label}: aggetto di ${out(dec(opening.overhangDepth))} m, esclusa la fascia superiore di ${out(band)} m.`,
      });
    }

    // 5. Altezza illuminante utile
    illuminatingHeight = max(ZERO, top.minus(bottom));
    if (illuminatingHeight.isZero()) {
      notes.push({
        code: 'OPENING_BELOW_COMPUTATION_HEIGHT',
        refId: opening.id,
        message: `${opening.label}: apertura interamente fuori dalla fascia computabile.`,
      });
    }
  }

  const suitable = opening.facesSuitableSpace !== false;
  if (!suitable) {
    notes.push({
      code: 'NOT_SUITABLE_SPACE',
      refId: opening.id,
      message: `${opening.label}: affaccia su uno spazio non idoneo, non computata.`,
    });
  }

  // 6. Superficie illuminante
  const typeCoefficient = isRoofOpening ? dec(measurement.roofOpeningCoefficient) : new D(1);
  const illuminatingArea = suitable
    ? baseWidth
        .times(illuminatingHeight)
        .times(measurement.frameCoefficient)
        .times(typeCoefficient)
        .times(quantity)
    : ZERO;

  // 7. Superficie aerante
  let ventilatingPerUnit: Dec;
  switch (opening.operability) {
    case 'FULL':
      ventilatingPerUnit = grossArea;
      break;
    case 'PARTIAL':
      ventilatingPerUnit = dec(opening.openableArea as string);
      break;
    case 'FIXED':
      ventilatingPerUnit = ZERO;
      break;
  }
  const ventilatingArea = suitable ? ventilatingPerUnit.times(quantity) : ZERO;

  return {
    id: opening.id,
    label: opening.label,
    isRoofOpening,
    grossArea: grossArea.times(quantity),
    illuminatingHeight,
    illuminatingArea,
    ventilatingArea,
  };
}
