import type { RoomInput } from '@aph/rai-engine';

/** Vani di esempio per il modulo R.A.I. (AFU FR-M6-03: progetto dimostrativo). */
export const ROOMS: Record<string, RoomInput[]> = {
  p1: [
    {
      id: 'r1', name: 'Soggiorno', use: 'LIVING_ROOM', floorArea: '24.50',
      ceiling: { type: 'FLAT', height: '2.90' },
      openings: [
        { id: 'o1', label: 'PF1', kind: 'FRENCH_WINDOW', quantity: 1, width: '1.40', height: '2.30', sillHeight: '0.00', operability: 'FULL' },
        { id: 'o2', label: 'W1', kind: 'WINDOW', quantity: 1, width: '1.20', height: '1.50', sillHeight: '0.90', operability: 'FULL' },
      ],
    },
    {
      id: 'r2', name: 'Camera matrimoniale', use: 'DOUBLE_BEDROOM', floorArea: '16.20',
      ceiling: { type: 'FLAT', height: '2.90' },
      openings: [
        { id: 'o3', label: 'W2', kind: 'WINDOW', quantity: 1, width: '1.20', height: '1.40', sillHeight: '0.90', operability: 'FULL' },
      ],
    },
    {
      id: 'r3', name: 'Cucina', use: 'KITCHEN', floorArea: '11.80',
      ceiling: { type: 'FLAT', height: '2.90' },
      openings: [
        { id: 'o4', label: 'W3', kind: 'WINDOW', quantity: 1, width: '1.00', height: '1.40', sillHeight: '1.00', operability: 'FULL' },
        { id: 'o5', label: 'W4', kind: 'WINDOW', quantity: 1, width: '0.60', height: '1.40', sillHeight: '1.00', operability: 'FULL' },
      ],
    },
    {
      id: 'r4', name: 'Bagno', use: 'BATHROOM', floorArea: '5.10',
      ceiling: { type: 'FLAT', height: '2.40' },
      isWindowless: true, mechanicalVentilation: 'EXTRACTION', openings: [],
    },
  ],
  p2: [
    {
      id: 'r5', name: 'Camera mansarda', use: 'SINGLE_BEDROOM', floorArea: '14.00', nonComputableArea: '2.50',
      ceiling: { type: 'SLOPED', minHeight: '1.50', maxHeight: '3.10' },
      openings: [
        { id: 'o6', label: 'V1', kind: 'ROOF_WINDOW', quantity: 1, width: '0.78', height: '1.40', operability: 'FULL' },
      ],
    },
    {
      id: 'r6', name: 'Studio', use: 'STUDY', floorArea: '9.50',
      ceiling: { type: 'SLOPED', minHeight: '1.80', maxHeight: '3.00' },
      openings: [
        { id: 'o7', label: 'V2', kind: 'ROOF_WINDOW', quantity: 2, width: '0.78', height: '1.18', operability: 'FULL' },
      ],
    },
  ],
};
