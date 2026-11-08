import { beforeEach, describe, expect, it } from 'vitest';
import { blobKeysOf, currentStoryId, listStories, migrateLegacyStory, orphanedBlobKeys, readStory, removeStory, setCurrentStoryId, writeStory, writeThumb } from './library';
import { emptyProject, type Project } from './model';

class FakeStorage {
  private m = new Map<string, string>();
  quota = Infinity;
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) {
    if ([...this.m.values()].join('').length + v.length > this.quota) throw new DOMException('full', 'QuotaExceededError');
    this.m.set(k, v);
  }
  removeItem(k: string) { this.m.delete(k); }
}
let store: FakeStorage;
beforeEach(() => {
  store = new FakeStorage();
  (globalThis as unknown as { localStorage: FakeStorage }).localStorage = store;
});

const story = (title: string, keys: string[] = []): Project => ({
  ...emptyProject(title),
  audio: keys.map((k, i) => ({ id: `a${i}`, kind: 'voice' as const, start: i, duration: 1, volume: 1, label: 'v', blobKey: k, provider: 'mic' as const })),
});

describe('library storage', () => {
  it('lists stories newest first and round-trips a project', () => {
    writeStory('a', story('First'), 1000);
    writeStory('b', story('Second'), 2000);
    expect(listStories().map((m) => m.title)).toEqual(['Second', 'First']);
    expect(readStory('a')!.title).toBe('First');
  });

  it('re-saving updates the entry (title, time) without duplicating it, and keeps its thumbnail', () => {
    writeStory('a', story('Old'), 1000);
    writeThumb('a', 'data:image/jpeg;base64,xyz');
    writeStory('a', story('New'), 5000);
    const list = listStories();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a', title: 'New', updatedAt: 5000, thumb: 'data:image/jpeg;base64,xyz' });
  });

  it('writeThumb does not change "last edited"', () => {
    writeStory('a', story('A'), 1000);
    writeThumb('a', 'data:x');
    expect(listStories()[0].updatedAt).toBe(1000);
    writeThumb('missing', 'data:y'); // no entry: ignored, no crash
    expect(listStories()).toHaveLength(1);
  });

  it('returns null for damaged or missing stories instead of throwing', () => {
    store.setItem('storybox.p.bad', '{not json');
    store.setItem('storybox.p.wrong', JSON.stringify({ version: 9 }));
    expect(readStory('bad')).toBeNull();
    expect(readStory('wrong')).toBeNull();
    expect(readStory('nope')).toBeNull();
  });

  it('reports a failed save (storage full) instead of pretending it worked', () => {
    store.quota = 50;
    expect(writeStory('a', story('A'))).toBe(false);
  });

  it('removing a story deletes its data and forgets it was the current one', () => {
    writeStory('a', story('A'));
    setCurrentStoryId('a');
    removeStory('a');
    expect(listStories()).toEqual([]);
    expect(readStory('a')).toBeNull();
    expect(currentStoryId()).toBeNull();
  });

  it('survives a corrupted index', () => {
    store.setItem('storybox.index', 'oops');
    expect(listStories()).toEqual([]);
    expect(writeStory('a', story('A'))).toBe(true);
    expect(listStories()).toHaveLength(1);
  });
});

describe('migrating the single-story version', () => {
  it('moves the old story into the library once and makes it current', () => {
    store.setItem('storybox.project.v1', JSON.stringify(story('Mia story')));
    migrateLegacyStory();
    expect(listStories().map((m) => m.title)).toEqual(['Mia story']);
    expect(currentStoryId()).toBe(listStories()[0].id);
    expect(store.getItem('storybox.project.v1')).toBeNull();
  });

  it('never re-imports once a library exists, even an empty one', () => {
    store.setItem('storybox.index', '[]');
    store.setItem('storybox.project.v1', JSON.stringify(story('Old')));
    migrateLegacyStory();
    expect(listStories()).toEqual([]);
  });

  it('leaves an unreadable legacy story alone', () => {
    store.setItem('storybox.project.v1', '{broken');
    migrateLegacyStory();
    expect(listStories()).toEqual([]);
    expect(store.getItem('storybox.project.v1')).toBe('{broken');
  });
});

describe('recordings are reference-counted across stories', () => {
  it('only offers to delete recordings nobody else uses', () => {
    const doomed = story('Doomed', ['shared', 'mine']);
    const other = story('Other', ['shared']);
    expect(blobKeysOf(doomed).sort()).toEqual(['mine', 'shared']);
    expect(orphanedBlobKeys(doomed, [other])).toEqual(['mine']);
    expect(orphanedBlobKeys(doomed, [])).toEqual(['shared', 'mine']);
  });
});
