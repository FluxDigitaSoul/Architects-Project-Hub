import { toPagePercent } from './drawing-viewer';

describe('toPagePercent (AFU FR-M2-07, BR-20)', () => {
  const rect = { left: 100, top: 50, width: 800, height: 400 };

  it('converts a screen point to page percentages with 4 decimals', () => {
    expect(toPagePercent(300, 150, rect)).toEqual({ x: 25, y: 25 });
    expect(toPagePercent(100 + 800 / 3, 50, rect)).toEqual({ x: 33.3333, y: 0 });
  });

  it('is independent from the zoom level: same page point, different on-screen sizes', () => {
    const zoomed = { left: -500, top: -300, width: 3200, height: 1600 };
    expect(toPagePercent(-500 + 3200 * 0.25, -300 + 1600 * 0.5, zoomed)).toEqual({ x: 25, y: 50 });
  });

  it('rejects points outside the page and degenerate rectangles', () => {
    expect(toPagePercent(50, 100, rect)).toBeNull();
    expect(toPagePercent(300, 500, rect)).toBeNull();
    expect(toPagePercent(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });
});
