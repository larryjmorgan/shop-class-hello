import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const m = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(),
  };
});

import { COLOURS, COUNT_MAX, LETTERS, MAX_LEVEL, SHAPES, colourTask, countTask, getLevel, letterTask, recordRound, shapeTask, shuffle } from './learn';

// small deterministic random numbers
const seq = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('learn', () => {
  it('counting tasks fit the level and always offer the answer', () => {
    for (let level = 1; level <= 3; level++) {
      const rng = seq(level * 7);
      let prev: number | undefined;
      for (let i = 0; i < 200; i++) {
        const t = countTask(level, rng, prev);
        expect(t.n).toBeGreaterThanOrEqual(1);
        expect(t.n).toBeLessThanOrEqual(COUNT_MAX[level - 1]);
        expect(t.n).not.toBe(prev);
        expect(t.choices).toContain(t.n);
        expect(new Set(t.choices).size).toBe(t.choices.length);
        expect(t.choices.length).toBe(3);
        expect([...t.choices].sort((a, b) => a - b)).toEqual(t.choices);
        prev = t.n;
      }
    }
  });

  it('colour tasks: the answer is among distinct choices; level 1 uses red, yellow, blue', () => {
    for (let level = 1; level <= 3; level++) {
      const rng = seq(level * 13);
      for (let i = 0; i < 100; i++) {
        const t = colourTask(level, rng);
        expect(t.choices.filter((c) => c.id === t.target.id).length).toBe(1);
        expect(new Set(t.choices.map((c) => c.hex)).size).toBe(t.choices.length);
        expect(t.choices.length).toBe(level === 1 ? 3 : 4);
        if (level === 1) expect(['red', 'yellow', 'blue']).toContain(t.target.id);
        if (level === 3) expect(t.target.hex.startsWith('hsl(')).toBe(true);
      }
    }
    expect(COLOURS.length).toBe(11);
  });

  it('shape tasks grow with the level and never repeat a shape', () => {
    const rng = seq(5);
    for (let level = 1; level <= 3; level++) {
      const ids = shapeTask(level, rng);
      expect(ids.length).toBe(level + 2);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(SHAPES.some((s) => s.id === id)).toBe(true);
    }
    for (const s of SHAPES) expect(s.path).toMatch(/^M[\d. LHVACZ-]+Z$/);
  });

  it('letters: 26 lowercase letters with pictures; avoid recent ones', () => {
    expect(LETTERS.map((l) => l.l).join('')).toBe('abcdefghijklmnopqrstuvwxyz');
    const rng = seq(3);
    for (let i = 0; i < 50; i++) expect(['a', 'b']).not.toContain(letterTask(rng, ['a', 'b']).l);
  });

  it('levels go up after a perfect round and down after a hard one', () => {
    expect(getLevel('count')).toBe(1);
    expect(recordRound('count', 0)).toBe(2);
    expect(recordRound('count', 1)).toBe(2);
    expect(recordRound('count', 0)).toBe(3);
    expect(recordRound('count', 0)).toBe(MAX_LEVEL);
    expect(recordRound('count', 4)).toBe(2);
    expect(getLevel('shapes')).toBe(1);
    expect(recordRound('shapes', 5)).toBe(1);
  });

  it('shuffle keeps every item', () => {
    expect(shuffle([1, 2, 3, 4, 5], seq(9)).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
