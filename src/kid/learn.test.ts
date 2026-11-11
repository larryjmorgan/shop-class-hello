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

import { WORDS, isVowel, letterCue, readingTask } from './learn';
describe('reading', () => {
  it('every word can be sounded out with a picture clue per letter that never gives the answer away', () => {
    for (const w of WORDS) {
      expect(w.word).toMatch(/^[a-z]{3}$/);
      for (const l of w.word) {
        const c = letterCue(l, w.pic);
        expect(c).not.toBe('');
        expect(c).not.toBe(w.pic);
      }
    }
    expect(new Set(WORDS.map((w) => w.pic)).size).toBe(WORDS.length);
  });
  it('level 1 just reveals the picture; levels 2-3 ask for it, level 3 with look-alike words', () => {
    const rng = seq(11);
    const t1 = readingTask(1, rng);
    expect(t1.choices).toEqual([]);
    expect(t1.cueMode).toBe('always');
    expect(t1.cues).toHaveLength(3);
    for (let i = 0; i < 100; i++) {
      const t = readingTask(2 + (i % 2), rng, ['cat']);
      expect(t.word).not.toBe('cat');
      expect(t.choices).toHaveLength(3);
      expect(t.choices.filter((c) => c.word === t.word)).toHaveLength(1);
      expect(new Set(t.choices.map((c) => c.word)).size).toBe(3);
    }
    // look-alikes: "cat" at level 3 is offered with other -at words
    let tries = 0;
    let t = readingTask(3, rng);
    while (t.word !== 'cat' && tries++ < 500) t = readingTask(3, rng);
    expect(t.word).toBe('cat');
    expect(t.choices.filter((c) => c.word !== 'cat').every((c) => c.word.endsWith('at'))).toBe(true);
    expect(t.cueMode).toBe('never');
  });
  it('knows the vowels (shown in blue, like a movable alphabet)', () => {
    expect([...'cat'].map(isVowel)).toEqual([false, true, false]);
  });
});

import { MATCH_PAIRS, matchMisses, matchTask } from './learn';
describe('matching', () => {
  it('deals pairs that fit the level', () => {
    for (let level = 1; level <= 3; level++) {
      const cards = matchTask(level, seq(level));
      expect(cards).toHaveLength(MATCH_PAIRS[level - 1] * 2);
      const counts = new Map<string, number>();
      cards.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
      expect([...counts.values()].every((n) => n === 2)).toBe(true);
    }
  });
  it('a few wrong turns are part of the game', () => {
    expect(matchMisses(3, 3)).toBe(0);
    expect(matchMisses(5, 3)).toBe(2);
  });
});

import { NAME_PIC, PATTERN_PICS, SIZE_SETS, nameTask, patternTask, sizeTask } from './learn';
describe('her name, sizes and patterns', () => {
  it('letters of her name come up more often', () => {
    const rng = seq(21);
    let hits = 0;
    for (let i = 0; i < 400; i++) if (['e', 'm', 'a'].includes(letterTask(rng, [], ['e', 'm', 'a']).l)) hits++;
    expect(hits / 400).toBeGreaterThan(0.35); // ~40% favourites + 3/26 of the rest
  });
  it('her name appears as a reading word with the 👧 picture', () => {
    const rng = seq(4);
    const seen = Array.from({ length: 200 }, () => readingTask(2, rng, [], 'Emma')).filter((t) => t.word === 'Emma');
    expect(seen.length).toBeGreaterThan(20);
    for (const t of seen) {
      expect(t.pic).toBe(NAME_PIC);
      expect(t.cues).toHaveLength(4);
      expect(t.choices.filter((c) => c.word === 'Emma')).toHaveLength(1);
    }
    expect(readingTask(2, rng, ['Emma'], 'Emma').word).not.toBe('Emma');
  });
  it('my name: every letter of the name plus extra letters not in it', () => {
    for (let level = 1; level <= 3; level++) {
      const t = nameTask(level, 'Anna', seq(level));
      expect(t.letters).toEqual(['A', 'n', 'n', 'a']);
      expect(t.tiles).toHaveLength(4 + (level === 1 ? 2 : 4));
      const extra = t.tiles.filter((x) => x.id >= 100);
      expect(extra.every((x) => !'an'.includes(x.ch))).toBe(true);
      expect(t.faint).toBe(level < 3);
    }
  });
  it('sizes: 3, 4 then 5 distinct blocks', () => {
    for (let level = 1; level <= 3; level++) {
      const s = sizeTask(level, seq(level));
      expect([...s].sort()).toEqual([...SIZE_SETS[level - 1]].sort());
      expect(new Set(s).size).toBe(s.length);
    }
  });
  it('patterns: the answer continues the pattern, shown at least twice, among distinct choices', () => {
    const rng = seq(8);
    for (let level = 1; level <= 3; level++) {
      for (let i = 0; i < 60; i++) {
        const t = patternTask(level, rng);
        const full = [...t.seq, t.answer];
        const u = t.unit.length;
        expect(full.length).toBeGreaterThanOrEqual(u * 2 + 1);
        for (let k = u; k < full.length; k++) expect(full[k]).toBe(full[k - u]); // it repeats
        expect(t.choices).toContain(t.answer);
        expect(new Set(t.choices).size).toBe(3);
        expect(t.choices.every((c) => PATTERN_PICS.includes(c))).toBe(true);
        if (level === 1) expect(t.unit).toBe('AB');
      }
    }
  });
});
