import { describe, expect, it } from 'vitest';
import { curveAt, duckCurve, musicLoopSeconds } from './audio';

describe('music ducking curve', () => {
  it('dips under a voice line with a short ramp either side', () => {
    const c = duckCurve([[5, 8]]);
    expect(curveAt(c, 4)).toBe(1);
    expect(curveAt(c, 6.5)).toBeCloseTo(0.32);
    expect(curveAt(c, 4.875)).toBeGreaterThan(0.32);
    expect(curveAt(c, 4.875)).toBeLessThan(1);
    expect(curveAt(c, 9)).toBe(1);
  });
  it('keeps the music down across short gaps between lines instead of pumping', () => {
    const c = duckCurve([[1, 2], [2.5, 3]]);
    expect(curveAt(c, 2.25)).toBeCloseTo(0.32);
  });
  it('is flat with no voices', () => {
    expect(curveAt(duckCurve([]), 3)).toBe(1);
  });
});

describe('music presets', () => {
  it('report a sensible loop length', () => {
    expect(musicLoopSeconds('sunny')).toBeCloseTo((8 * 4 * 60) / 112);
    expect(musicLoopSeconds('nope')).toBe(0);
  });
});
