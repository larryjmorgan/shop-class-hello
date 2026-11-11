import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => {
  const m = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  return m;
});

import { allCharacters, artById } from '../assets';
import { compileOwnStory, addActor, newOwnStory } from './own';
import { MAX_PAINTED, deletePainted, listPainted, newPaintedId, paintedAsset, savePainted } from './painted';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('painted friends', () => {
  beforeEach(() => { for (const p of listPainted()) deletePainted(p.id); store.clear(); });

  it('saves a painted friend and makes it a character everywhere', () => {
    const id = newPaintedId('bunny');
    expect(id.startsWith('paint-bunny-')).toBe(true);
    expect(savePainted({ id, baseId: 'bunny', paint: PNG })).toBe(true);
    const a = artById(id)!;
    expect(a.kind).toBe('character');
    expect(a.label).toBe('Bunny');
    expect(allCharacters()[0].id).toBe(id); // newest first
    expect(allCharacters().length).toBe(10);
    const svg = a.svg('#ffffff', { mouthOpen: true, blink: true });
    expect(svg).toContain(PNG);
    expect(svg).toContain('mix-blend-mode:multiply');
    expect(svg.match(/<svg/g)!.length).toBe(1); // one well-formed document
    // can be cast in a story
    const s = addActor(newOwnStory(), 0, id);
    expect(s.scenes[0].actors[1].assetId).toBe(id);
    expect(compileOwnStory(s).objects.some((o) => o.assetId === id)).toBe(true);
  });

  it('painting again updates instead of copying', () => {
    const id = newPaintedId('kitty');
    savePainted({ id, baseId: 'kitty', paint: PNG }, 1);
    savePainted({ id, baseId: 'kitty', paint: PNG.replace('=', 'A=') }, 2);
    const all = listPainted();
    expect(all.length).toBe(1);
    expect(all[0].createdAt).toBe(1);
    expect(all[0].updatedAt).toBe(2);
  });

  it('a thrown-away friend falls back to the plain character', () => {
    const id = newPaintedId('dino');
    savePainted({ id, baseId: 'dino', paint: PNG });
    deletePainted(id);
    const a = artById(id)!;
    expect(a.kind).toBe('character');
    expect(a.svg('#ffffff', { mouthOpen: false, blink: false })).toBe(artById('dino')!.svg(artById('dino')!.colors[0], { mouthOpen: false, blink: false }));
    expect(allCharacters().length).toBe(9);
    expect(artById('paint-nothing-1')).toBeUndefined();
  });

  it('limits how many are kept and ignores damaged records', () => {
    for (let i = 0; i < MAX_PAINTED; i++) expect(savePainted({ id: `paint-bear-${i}`, baseId: 'bear', paint: PNG })).toBe(true);
    expect(savePainted({ id: 'paint-bear-x', baseId: 'bear', paint: PNG })).toBe(false);
    store.set('storybox.painted', JSON.stringify([{ id: 'paint-bear-1', baseId: 'kitty', paint: PNG }, { id: 'x', baseId: 'bear', paint: PNG }, { id: 'paint-bear-2', baseId: 'bear', paint: 'javascript:1' }, null]));
    expect(listPainted()).toEqual([]);
    expect(paintedAsset({ id: 'paint-zzz-1', baseId: 'zzz', paint: PNG, createdAt: 0, updatedAt: 0 })).toBeNull();
  });

  it('keeps the sticker layer, drawn on top without blending', () => {
    const id = newPaintedId('bear');
    expect(savePainted({ id, baseId: 'bear', paint: PNG, stickers: PNG.replace('=', 'B=') })).toBe(true);
    const svg = artById(id)!.svg('#fff', { mouthOpen: false, blink: false });
    expect(svg.match(/<image/g)).toHaveLength(2);
    expect(svg.lastIndexOf('mix-blend-mode')).toBeLessThan(svg.lastIndexOf('<image'));
    expect(listPainted().find((p) => p.id === id)!.stickers).toBe(PNG.replace('=', 'B='));
    expect(savePainted({ id, baseId: 'bear', paint: PNG, stickers: 'data:text/html,<b>' })).toBe(false);
  });
});

