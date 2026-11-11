import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const m = new Map<string, string>();
  const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() };
  (globalThis as unknown as { localStorage: typeof s }).localStorage = s;
  return s;
});

import { REST_RESETS_MS, WARN_MS, breakState, cleanName, getChildName, getTimeLimit, moreTime, nameLetters, resetUsage, setChildName, setTimeLimit, tick } from './kidSettings';

describe('her name', () => {
  beforeEach(() => fake.clear());
  it('keeps letters only, capital first, at most 12', () => {
    expect(cleanName('  emma ')).toBe('Emma');
    expect(cleanName('ZOË-ANN 2')).toBe('Zoeann');
    expect(cleanName('123')).toBe('');
    expect(cleanName('a'.repeat(30))).toHaveLength(12);
    expect(setChildName('anna')).toBe('Anna');
    expect(getChildName()).toBe('Anna');
    expect(nameLetters()).toEqual(['a', 'n']);
  });
});

describe('play-time limit', () => {
  beforeEach(() => fake.clear());
  it('only allows the offered limits', () => {
    expect(getTimeLimit()).toBe(0);
    setTimeLimit(15); expect(getTimeLimit()).toBe(15);
    setTimeLimit(7); expect(getTimeLimit()).toBe(15);
  });
  it('counts play, ignores a sleeping tab, and starts again after an hour away', () => {
    let u = tick({ usedMs: 0, lastActive: 0, extraMs: 0 }, 1_000_000);
    expect(u.usedMs).toBe(0);
    u = tick(u, 1_005_000); expect(u.usedMs).toBe(5000);
    u = tick(u, 1_005_000 + 20 * 60_000); expect(u.usedMs).toBe(10_000); // 20 min hidden: counts at most one step
    const t = u.lastActive + 30 * 60_000;
    expect(tick(u, t).usedMs).toBe(15_000); // closing and reopening quickly does not reset
    expect(tick(u, u.lastActive + REST_RESETS_MS).usedMs).toBe(0); // an hour away does
  });
  it('play -> soon (last two minutes) -> rest; a grown-up can give 10 more minutes', () => {
    const at = (min: number) => ({ usedMs: min * 60_000, lastActive: 1, extraMs: 0 });
    expect(breakState(at(5), 0)).toBe('play');
    expect(breakState(at(5), 10)).toBe('play');
    expect(breakState({ ...at(10), usedMs: 10 * 60_000 - WARN_MS + 1 }, 10)).toBe('soon');
    expect(breakState(at(10), 10)).toBe('rest');
    const more = moreTime(at(12), 10);
    expect(breakState(more, 10)).toBe('play');
    expect(10 * 60_000 + more.extraMs - more.usedMs).toBe(10 * 60_000);
    expect(breakState(resetUsage(5), 10)).toBe('play');
  });
});
