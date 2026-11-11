import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const m = new Map<string, string>();
  const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() };
  (globalThis as unknown as { localStorage: typeof s }).localStorage = s;
  return s;
});

import { STARTER_STICKERS, STICKERS_ALL, earnSticker, earnedStickerIds, mergeStickers, ownedStickers } from './stickers';

describe('stickers', () => {
  beforeEach(() => fake.clear());
  it('starts with a few, earns one per round until she has them all', () => {
    expect(ownedStickers().map((s) => s.id)).toEqual(STARTER_STICKERS);
    const seen = new Set<string>();
    for (let i = 0; i < STICKERS_ALL.length - STARTER_STICKERS.length; i++) {
      const s = earnSticker()!;
      expect(STARTER_STICKERS).not.toContain(s.id);
      expect(seen.has(s.id)).toBe(false);
      seen.add(s.id);
    }
    expect(ownedStickers()).toHaveLength(STICKERS_ALL.length);
    expect(earnSticker()).toBeNull();
    expect(new Set(STICKERS_ALL.map((s) => s.id)).size).toBe(STICKERS_ALL.length);
  });
  it('a backup adds stickers and ignores junk', () => {
    mergeStickers(['gem', 'nope', 5, 'gem']);
    expect(earnedStickerIds()).toEqual(['gem']);
    mergeStickers('x');
    fake.setItem('storybox.stickers', '{bad');
    expect(earnedStickerIds()).toEqual([]);
  });
});
