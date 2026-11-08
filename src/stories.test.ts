import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A fake browser storage must exist BEFORE the store module boots (it reads the library on import).
const fake = vi.hoisted(() => {
  const m = new Map<string, string>();
  const s = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    keys: () => [...m.keys()],
  };
  (globalThis as unknown as { localStorage: typeof s }).localStorage = s;
  return s;
});

import { listStories, readStory } from './library';
import { emptyProject } from './model';
import { addObject, deleteStory, duplicateStory, flushSave, getState, newStory, openStory, setTitle } from './store';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('story library actions', () => {
  it('boots into a saved story (the sample on first run)', () => {
    expect(listStories().length).toBeGreaterThanOrEqual(1);
    expect(readStory(getState().currentId)).not.toBeNull();
  });

  it('switching stories saves the one you leave and never loses edits', () => {
    const a = newStory({ ...emptyProject('Story A') });
    addObject('character', 'bunny', 0);
    setTitle('Story A edited'); // not yet autosaved (400ms debounce)…
    const b = newStory({ ...emptyProject('Story B') }); // …but leaving must flush it
    expect(getState().currentId).toBe(b);
    expect(readStory(a)!.title).toBe('Story A edited');
    expect(readStory(a)!.objects).toHaveLength(1);
    expect(getState().project.title).toBe('Story B');
    expect(getState().past).toHaveLength(0); // fresh undo history per story
  });

  it('edits only ever land in the open story', () => {
    const a = newStory({ ...emptyProject('A') });
    const b = newStory({ ...emptyProject('B') });
    setTitle('B changed');
    flushSave();
    expect(readStory(a)!.title).toBe('A');
    expect(readStory(b)!.title).toBe('B changed');
    expect(openStory(a)).toBe(true);
    expect(getState().project.title).toBe('A');
  });

  it('merely opening a story does not mark it as edited', () => {
    const a = newStory({ ...emptyProject('A') });
    flushSave();
    newStory({ ...emptyProject('B') });
    const before = listStories().find((m) => m.id === a)!.updatedAt;
    vi.setSystemTime(Date.now() + 60_000);
    openStory(a);
    vi.advanceTimersByTime(1000);
    flushSave();
    expect(listStories().find((m) => m.id === a)!.updatedAt).toBe(before);
  });

  it('opening a damaged story fails cleanly and keeps the current story', () => {
    const keep = getState().currentId;
    fake.setItem('storybox.p.broken', '{nope');
    fake.setItem('storybox.index', JSON.stringify([...listStories(), { id: 'broken', title: 'Broken', duration: 10, updatedAt: 1 }]));
    expect(openStory('broken')).toBe(false);
    expect(getState().currentId).toBe(keep);
  });

  it('duplicating adds a copy without opening it', () => {
    const a = newStory({ ...emptyProject('Original') });
    const copy = duplicateStory(a)!;
    expect(copy).not.toBe(a);
    expect(getState().currentId).toBe(a);
    expect(readStory(copy)!.title).toBe('Original (copy)');
    expect(listStories().some((m) => m.id === copy)).toBe(true);
  });

  it('deleting another story removes it and leaves the open one alone', async () => {
    const a = newStory({ ...emptyProject('A') });
    const b = newStory({ ...emptyProject('B') });
    await deleteStory(a);
    expect(readStory(a)).toBeNull();
    expect(listStories().some((m) => m.id === a)).toBe(false);
    expect(getState().currentId).toBe(b);
  });

  it('deleting the open story switches to another and the deleted one stays deleted', async () => {
    const a = newStory({ ...emptyProject('A') });
    const b = newStory({ ...emptyProject('B') });
    setTitle('B pending save'); // a save is pending when we delete B
    await deleteStory(b);
    vi.advanceTimersByTime(5000); // let any stale timer fire: it must not resurrect B
    flushSave();
    expect(readStory(b)).toBeNull();
    expect(listStories().some((m) => m.id === b)).toBe(false);
    expect(getState().currentId).not.toBe(b);
    expect(readStory(getState().currentId)).not.toBeNull();
    void a;
  });

  it('deleting every story leaves a fresh blank one to work in', async () => {
    for (const m of listStories()) await deleteStory(m.id);
    const stories = listStories();
    expect(stories).toHaveLength(1);
    expect(getState().currentId).toBe(stories[0].id);
    expect(getState().project.objects).toHaveLength(0);
  });
});
