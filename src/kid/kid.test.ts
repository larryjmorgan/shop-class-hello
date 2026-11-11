import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const m = new Map<string, string>();
  const s = { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() };
  (globalThis as unknown as { localStorage: typeof s }).localStorage = s;
  return s;
});

import { makeGate } from './gate';
import { listMovies, loadMovie, removeMovie, saveMovie } from './movies';

describe('grown-ups gate', () => {
  it('always has exactly one correct choice, four distinct choices, and a sum a toddler cannot do', () => {
    for (let i = 0; i < 300; i++) {
      const g = makeGate();
      expect(g.choices).toHaveLength(4);
      expect(new Set(g.choices).size).toBe(4);
      expect(g.choices.filter((c) => c === g.answer)).toHaveLength(1);
      const [a, b] = g.question.split(' + ').map(Number);
      expect(a + b).toBe(g.answer);
      expect(a).toBeGreaterThanOrEqual(4);
      expect(g.choices.every((c) => c > 0)).toBe(true);
    }
  });
});

describe('my movies shelf', () => {
  beforeEach(() => fake.clear());

  it('lists newest first and gives back the saved video', async () => {
    const a = await saveMovie(new Blob(['aaa']), { seconds: 12, ext: 'webm', mime: 'video/webm' }, 1000);
    const b = await saveMovie(new Blob(['bbbb']), { seconds: 30, ext: 'mp4', mime: 'video/mp4', poster: 'data:image/jpeg;base64,x' }, 2000);
    expect(listMovies().map((m) => m.id)).toEqual([b.meta.id, a.meta.id]);
    expect(listMovies()[0]).toMatchObject({ seconds: 30, ext: 'mp4', bytes: 4 });
    expect(await (await loadMovie(a.meta.id))!.text()).toBe('aaa');
  });

  it('deleting removes it from the list and its video', async () => {
    const a = await saveMovie(new Blob(['aaa']), { seconds: 5, ext: 'webm', mime: 'video/webm' });
    await removeMovie(a.meta.id);
    expect(listMovies()).toEqual([]);
    expect(await loadMovie(a.meta.id)).toBeUndefined();
  });

  it('survives a damaged index', () => {
    fake.setItem('storybox.movies', '{oops');
    expect(listMovies()).toEqual([]);
  });
});
