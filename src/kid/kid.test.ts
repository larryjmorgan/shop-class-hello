import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const m = new Map<string, string>();
  const s = { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() };
  (globalThis as unknown as { localStorage: typeof s }).localStorage = s;
  return s;
});

import { STAGE_H, STAGE_W } from '../model';
import { makeGate } from './gate';
import { listMovies, loadMovie, removeMovie, saveMovie } from './movies';
import {
  MAX_ACTORS, REACTION_SECONDS, TRASH, addActor, hitActor, inTrash, isReacting, isTap, moveActor, newTheater, nextReaction, prune, react,
  reactionOffset, removeActor, toProject,
} from './puppet';

const bunny = { id: 'bunny', kind: 'character' as const, colors: ['#fff', '#fcc'] };
const sun = { id: 'sun', kind: 'prop' as const, colors: ['#fd0'] };

describe('putting puppets on the stage', () => {
  it('spreads new friends out so none land on top of another', () => {
    const t = newTheater();
    for (let i = 0; i < 5; i++) addActor(t, bunny, 0);
    for (let i = 0; i < t.actors.length; i++)
      for (let j = i + 1; j < t.actors.length; j++) expect(Math.hypot(t.actors[i].x - t.actors[j].x, t.actors[i].y - t.actors[j].y)).toBeGreaterThan(120);
  });

  it('stops at the maximum and says so (null), instead of piling up', () => {
    const t = newTheater();
    for (let i = 0; i < MAX_ACTORS; i++) expect(addActor(t, bunny, 0)).not.toBeNull();
    expect(addActor(t, bunny, 0)).toBeNull();
    expect(t.actors).toHaveLength(MAX_ACTORS);
  });

  it('the newest character becomes the one that talks; props never do', () => {
    const t = newTheater();
    const a = addActor(t, bunny, 0)!;
    addActor(t, sun, 0);
    expect(t.speakerId).toBe(a.id);
  });

  it('props sit higher than characters (sky vs ground)', () => {
    const t = newTheater();
    expect(addActor(t, sun, 0)!.y).toBeLessThan(addActor(t, bunny, 0)!.y);
  });
});

describe('touching and dragging', () => {
  it('finds the topmost puppet under a finger, and nothing in empty space', () => {
    const t = newTheater();
    const a = addActor(t, bunny, 0)!;
    const b = addActor(t, bunny, 0)!;
    b.x = a.x + 40; b.y = a.y; // overlapping: b was added later so it is on top
    expect(hitActor(t, a.x + 30, a.y)!.id).toBe(b.id);
    expect(hitActor(t, 5, 5)).toBeUndefined();
  });

  it('cannot grab a puppet that is already being put away', () => {
    const t = newTheater();
    const a = addActor(t, bunny, 0)!;
    removeActor(t, a.id, 1);
    expect(hitActor(t, a.x, a.y)).toBeUndefined();
  });

  it('keeps a dragged puppet on the stage and faces it the way it walks', () => {
    const t = newTheater();
    const a = addActor(t, bunny, 0)!;
    moveActor(a, -500, -500, 1);
    expect(a.x).toBeGreaterThanOrEqual(60);
    expect(a.y).toBeGreaterThanOrEqual(110);
    moveActor(a, 99999, 99999, 2);
    expect(a.x).toBeLessThanOrEqual(STAGE_W - 60);
    expect(a.y).toBeLessThanOrEqual(STAGE_H - 40);
    a.x = 600;
    moveActor(a, 500, 500, 3);
    expect(a.flip).toBe(true);
    moveActor(a, 700, 500, 4);
    expect(a.flip).toBe(false);
    const before = a.flip;
    moveActor(a, 702, 500, 5); // a tiny jiggle must not flip it back and forth
    expect(a.flip).toBe(before);
  });

  it('only the bin corner counts as "put away"', () => {
    expect(inTrash(TRASH.x + 20, TRASH.y + 20)).toBe(true);
    expect(inTrash(STAGE_W / 2, STAGE_H / 2)).toBe(false);
  });

  it('a quick, barely-moving touch is a tap; a slow or long-moved one is not', () => {
    expect(isTap(3, 120)).toBe(true);
    expect(isTap(40, 120)).toBe(false);
    expect(isTap(3, 2000)).toBe(false);
  });

  it('putting a puppet away shrinks it, then removes it', () => {
    const t = newTheater();
    const a = addActor(t, bunny, 0)!;
    removeActor(t, a.id, 10);
    expect(toProject(t, 10.12).objects[0].keyframes[0].scale).toBeLessThan(a.scale);
    prune(t, 10.1);
    expect(t.actors).toHaveLength(1);
    prune(t, 10.5);
    expect(t.actors).toHaveLength(0);
    expect(t.speakerId).toBeNull();
  });

  it('when the talker is put away, another character takes over', () => {
    const t = newTheater();
    const a = addActor(t, bunny, 0)!;
    const b = addActor(t, bunny, 0)!;
    removeActor(t, b.id, 1);
    expect(t.speakerId).toBe(a.id);
  });
});

describe('reactions', () => {
  it('every reaction moves the puppet and then ends exactly back at rest', () => {
    const t = newTheater();
    const a = addActor(t, bunny, 0)!;
    for (const kind of Object.keys(REACTION_SECONDS) as (keyof typeof REACTION_SECONDS)[]) {
      react(a, kind, 5);
      const mid = reactionOffset(a, 5 + REACTION_SECONDS[kind] * 0.3);
      expect(Math.abs(mid.dy) + Math.abs(mid.rot) + Math.abs(mid.scaleMul - 1)).toBeGreaterThan(0.01);
      expect(reactionOffset(a, 5 + REACTION_SECONDS[kind] + 0.01)).toEqual({ dy: 0, rot: 0, scaleMul: 1 });
    }
  });

  it('a hop only goes up (never below the ground)', () => {
    const a = addActor(newTheater(), bunny, 0)!;
    react(a, 'hop', 0);
    for (let i = 0; i <= 80; i++) expect(reactionOffset(a, i / 100).dy).toBeLessThanOrEqual(0);
  });

  it('tapping again does something different from last time', () => {
    const a = addActor(newTheater(), bunny, 0)!;
    react(a, 'hop', 0);
    for (let i = 0; i < 20; i++) expect(nextReaction(a, i / 20)).not.toBe('hop');
  });
});

describe('drawing the theater', () => {
  it('produces one pose per puppet at this instant, inside the story the renderer expects', () => {
    const t = newTheater('beach');
    addActor(t, bunny, 2);
    addActor(t, sun, 3);
    const p = toProject(t, 4);
    expect(p.objects).toHaveLength(2);
    expect(p.backgrounds[0]).toMatchObject({ bgId: 'beach', start: 0 });
    expect(p.objects.every((o) => o.keyframes.length === 1 && o.start <= 4 && o.end > 4)).toBe(true);
    expect(p.duration).toBeGreaterThan(1e6); // never "ends", so the end-of-story blank-frame guard never kicks in
  });

  it('a puppet being dragged wobbles as it walks; a resting one does not', () => {
    const t = newTheater();
    const a = addActor(t, bunny, 0)!;
    moveActor(a, a.x + 50, a.y, 10);
    const walkingYs = new Set([10.01, 10.05, 10.1].map((n) => toProject(t, n).objects[0].keyframes[0].y));
    expect(walkingYs.size).toBeGreaterThan(1);
    expect(toProject(t, 11).objects[0].keyframes[0].y).toBe(a.y);
  });
});

describe('puppets look alive without a voice', () => {
  it('a puppet "talks" (mouth open) only while it reacts to a tap', () => {
    const a = addActor(newTheater(), bunny, 0)!;
    expect(isReacting(a, 1)).toBe(false);
    react(a, 'hop', 1);
    expect(isReacting(a, 1.3)).toBe(true);
    expect(isReacting(a, 1 + REACTION_SECONDS.hop + 0.01)).toBe(false);
  });
});

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
