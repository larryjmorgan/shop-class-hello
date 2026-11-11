import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const m = new Map<string, string>();
  const s = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
  (globalThis as unknown as { localStorage: typeof s }).localStorage = s;
  // a minimal FileReader (Node has Blob/File/fetch but not FileReader)
  (globalThis as unknown as { FileReader: unknown }).FileReader = class {
    result: string | null = null; error = null; onload: (() => void) | null = null; onerror: (() => void) | null = null;
    readAsDataURL(b: Blob) {
      void b.arrayBuffer().then((buf) => { this.result = `data:${b.type || 'application/octet-stream'};base64,${btoa(String.fromCharCode(...new Uint8Array(buf)))}`; this.onload?.(); });
    }
  };
  return s;
});

import { artById } from './assets';
import { backupFileName, describeRestore, makeBackup, restoreBackup } from './backup';
import { listStories, readStory } from './library';
import { emptyProject } from './model';
import { flushSave, newStory } from './store';
import { getLevel, recordRound } from './kid/learn';
import { addScene, getOwnStory, listOwnStories, newOwnStory, saveOwnStory } from './kid/own';
import { listPainted, newPaintedId, savePainted } from './kid/painted';
import { scenarioById } from './kid/scenarios';
import { listKidStories, newKidStory, saveKidStory } from './kid/story';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const blobsHere = new Map<string, Blob>();
const io = { get: async (k: string) => blobsHere.get(k), put: async (k: string, b: Blob) => { blobsHere.set(k, b); return true; } };
const asFile = async (b: Blob) => new File([await b.text()], 'backup.json', { type: 'application/json' });

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => vi.useRealTimers());

describe('back up everything', () => {
  it('round-trips every kind of story, painted friends, Learn levels and Studio audio', async () => {
    saveKidStory(newKidStory(scenarioById('beach')!), 1000);
    const own = addScene(newOwnStory(), 0).story;
    saveOwnStory(own, 2000);
    const pid = newPaintedId('bunny');
    savePainted({ id: pid, baseId: 'bunny', paint: PNG }, 3000);
    recordRound('count', 0);
    fake.setItem('storybox.stickers', JSON.stringify(['gem', 'moon']));
    fake.setItem('storybox.childname', 'Emma');
    fake.setItem('storybox.timelimit', '20');
    const p = emptyProject('Studio one');
    p.audio.push({ id: 'a1', kind: 'voice', start: 0, duration: 2, volume: 1, label: 'Hi', provider: 'eleven', blobKey: 'voice-1', bufferDuration: 2 });
    newStory(p);
    flushSave();
    blobsHere.set('voice-1', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' }));
    fake.setItem('storybox.elevenKey', 'sk-secret-key');

    const { blob, counts } = await makeBackup(io);
    const text = await blob.text();
    expect(counts.painted).toBe(1);
    expect(counts.stories).toBe(2 + listStories().length);
    expect(text).not.toContain('sk-secret-key');
    const studioBefore = listStories().length;

    // a new device: nothing here
    fake.clear();
    blobsHere.clear();
    expect(listKidStories()).toHaveLength(0);
    const r = await restoreBackup(await asFile(blob), io);
    expect(r).toEqual({ added: 3 + studioBefore, updated: 0, kept: 0, failed: 0 });
    expect(listKidStories()[0].scenarioId).toBe('beach');
    expect(getOwnStory(own.id)!.scenes).toHaveLength(2);
    expect(listPainted()[0].id).toBe(pid);
    expect(artById(pid)!.svg('#fff', { mouthOpen: false, blink: false })).toContain(PNG); // usable straight away
    expect(getLevel('count')).toBe(2);
    expect(JSON.parse(fake.getItem('storybox.stickers')!)).toEqual(['gem', 'moon']);
    expect(fake.getItem('storybox.childname')).toBe('Emma');
    expect(fake.getItem('storybox.timelimit')).toBe('20');
    expect(listStories().some((m) => readStory(m.id)?.title === 'Studio one')).toBe(true);
    expect([...new Uint8Array(await blobsHere.get('voice-1')!.arrayBuffer())]).toEqual([1, 2, 3, 4]);
    expect(describeRestore(r)).toContain('added');

    // restoring the same backup again changes nothing
    const again = await restoreBackup(await asFile(blob), io);
    expect(again.added + again.updated).toBe(0);
    expect(again.kept).toBe(r.added);
  });

  it('never replaces newer work, but takes a newer copy from the backup', async () => {
    const s = newOwnStory();
    saveOwnStory(s, 5000);
    const { blob } = await makeBackup(io);
    saveOwnStory({ ...getOwnStory(s.id)!, scenes: addScene(getOwnStory(s.id)!, 0).story.scenes }, 9000); // she kept going
    let r = await restoreBackup(await asFile(blob), io);
    expect(getOwnStory(s.id)!.scenes).toHaveLength(2); // her newer work kept
    expect(r.updated).toBe(0);

    const j = JSON.parse(await blob.text());
    j.ownStories.find((x: { id: string }) => x.id === s.id).updatedAt = 20000;
    j.ownStories.find((x: { id: string }) => x.id === s.id).scenes[0].bg = 'beach';
    r = await restoreBackup(new File([JSON.stringify(j)], 'b.json'), io);
    expect(r.updated).toBe(1);
    expect(getOwnStory(s.id)!.scenes[0].bg).toBe('beach');
    expect(listOwnStories().filter((x) => x.id === s.id)).toHaveLength(1); // updated, not duplicated
  });

  it('refuses files that are not backups and counts damaged entries', async () => {
    await expect(restoreBackup(new File(['not json'], 'x.json'), io)).rejects.toThrow(/isn’t/);
    await expect(restoreBackup(new File(['{"hello":1}'], 'x.json'), io)).rejects.toThrow(/isn’t a StoryBox backup/);
    const r = await restoreBackup(new File([JSON.stringify({
      app: 'storybox-backup', version: 1, kidStories: [{ nope: 1 }], ownStories: [null], painted: [{ id: 'paint-bunny-1', baseId: 'bunny', paint: 'javascript:alert(1)' }], studio: [{ id: '../x', project: {} }],
    })], 'x.json'), io);
    expect(r.failed).toBe(4);
    expect(r.added).toBe(0);
  });

  it('names the file with the date', () => {
    expect(backupFileName(new Date(2026, 10, 9))).toBe('StoryBox backup 2026-11-09.json');
  });
});
