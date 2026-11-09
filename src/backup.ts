// "Back up everything": one file holding all the stories on this device (Story time, My own story and the
// Studio's, with their audio), her painted friends and her Learn levels. Restoring adds what is missing and updates
// anything the backup has a newer copy of; it never replaces newer work and never deletes anything.
// The ElevenLabs key and other settings are deliberately NOT included.

import { getBlob, putBlob } from './db';
import { blobKeysOf, listStories, newStoryId, readStory, writeStory, writeThumb } from './library';
import { normalizeProject, type Project } from './model';
import { forgetArt } from './render';
import { projectFromFile } from './projectFile';
import { flushSave, reloadIfOpen } from './store';
import { allLevels, mergeLevels } from './kid/learn';
import { getOwnStory, listOwnStories, normalizeOwnStory, saveOwnStory, type OwnStory } from './kid/own';
import { getPainted, listPainted, normalizePainted, savePainted, type PaintedFriend } from './kid/painted';
import { getKidStory, listKidStories, normalizeKidStory, saveKidStory, type KidStory } from './kid/story';

export const BACKUP_APP = 'storybox-backup';

interface StudioEntry { id: string; updatedAt: number; thumb?: string; project: Project }
export interface BackupFile {
  app: typeof BACKUP_APP;
  version: 1;
  savedAt: number;
  kidStories: KidStory[];
  ownStories: OwnStory[];
  painted: PaintedFriend[];
  learnLevels: Record<string, number>;
  studio: StudioEntry[];
  blobs: Record<string, string>; // audio used by Studio stories: key -> data URL
}

export interface BackupCounts { stories: number; painted: number }
export interface RestoreResult { added: number; updated: number; kept: number; failed: number }

type BlobIO = { get: (k: string) => Promise<Blob | undefined>; put: (k: string, b: Blob) => Promise<boolean> };
const defaultIO: BlobIO = { get: getBlob, put: putBlob };

const toDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

/** "StoryBox backup 2026-11-09.json" (local date). */
export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `StoryBox backup ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

export async function makeBackup(io: BlobIO = defaultIO, now = Date.now()): Promise<{ blob: Blob; counts: BackupCounts }> {
  flushSave(); // the open Studio story's last edits first
  const studio: StudioEntry[] = [];
  const blobs: Record<string, string> = {};
  for (const m of listStories()) {
    const project = readStory(m.id);
    if (!project) continue;
    studio.push({ id: m.id, updatedAt: m.updatedAt, thumb: m.thumb, project });
    for (const key of blobKeysOf(project)) {
      if (blobs[key]) continue;
      const b = await io.get(key);
      if (b) blobs[key] = await toDataUrl(b);
    }
  }
  const data: BackupFile = {
    app: BACKUP_APP,
    version: 1,
    savedAt: now,
    kidStories: listKidStories(),
    ownStories: listOwnStories(),
    painted: listPainted(),
    learnLevels: allLevels() as Record<string, number>,
    studio,
    blobs,
  };
  return {
    blob: new Blob([JSON.stringify(data)], { type: 'application/json' }),
    counts: { stories: data.kidStories.length + data.ownStories.length + studio.length, painted: data.painted.length },
  };
}

/** Add or update one item: missing -> add, backup newer -> update, otherwise keep what is here. */
function merge<T extends { updatedAt: number }>(r: RestoreResult, incoming: T, existing: T | undefined, save: (x: T) => boolean) {
  if (existing && existing.updatedAt >= incoming.updatedAt) { r.kept++; return; }
  if (save(incoming)) { if (existing) r.updated++; else r.added++; } else r.failed++;
}

export async function restoreBackup(file: File, io: BlobIO = defaultIO): Promise<RestoreResult> {
  let j: Omit<Partial<BackupFile>, 'app'> & { app?: string };
  try {
    j = JSON.parse(await file.text());
  } catch {
    throw new Error('That file isn’t a StoryBox backup (it isn’t valid JSON).');
  }
  const r: RestoreResult = { added: 0, updated: 0, kept: 0, failed: 0 };
  // A single Studio story saved with Project → Save file…: add it as a new Studio story.
  if (j?.app === 'storybox') {
    const project = await projectFromFile(file);
    if (writeStory(newStoryId(), project)) r.added++; else r.failed++;
    return r;
  }
  if (j?.app !== BACKUP_APP) throw new Error('That file isn’t a StoryBox backup.');
  flushSave();
  const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

  for (const raw of arr(j.kidStories)) {
    const s = normalizeKidStory(raw);
    if (!s) { r.failed++; continue; }
    merge(r, s, getKidStory(s.id), (x) => saveKidStory(x, x.updatedAt));
  }
  for (const raw of arr(j.ownStories)) {
    const s = normalizeOwnStory(raw);
    if (!s) { r.failed++; continue; }
    merge(r, s, getOwnStory(s.id), (x) => saveOwnStory(x, x.updatedAt));
  }
  for (const raw of arr(j.painted)) {
    const p = normalizePainted(raw);
    if (!p) { r.failed++; continue; }
    merge(r, p, getPainted(p.id), (x) => { const ok = savePainted(x, x.updatedAt); forgetArt(x.id); return ok; });
  }
  mergeLevels(j.learnLevels);

  const blobs = j.blobs && typeof j.blobs === 'object' ? j.blobs : {};
  const here = listStories();
  for (const raw of arr(j.studio)) {
    const e = raw as Partial<StudioEntry> | null;
    const project = e && typeof e.id === 'string' ? normalizeProject(e.project) : null;
    if (!e || !project || typeof e.id !== 'string' || !/^[\w-]+$/.test(e.id)) { r.failed++; continue; }
    const id = e.id;
    const updatedAt = Number(e.updatedAt) || 0;
    const existing = here.find((m) => m.id === id);
    if (existing && existing.updatedAt >= updatedAt) { r.kept++; continue; }
    // audio first, so a restored story never points at missing sound
    for (const key of blobKeysOf(project)) {
      const url = (blobs as Record<string, unknown>)[key];
      if (typeof url === 'string' && url.startsWith('data:')) await io.put(key, await (await fetch(url)).blob());
    }
    if (!writeStory(id, project, updatedAt || Date.now())) { r.failed++; continue; }
    if (typeof e.thumb === 'string' && e.thumb.startsWith('data:image/')) writeThumb(id, e.thumb);
    reloadIfOpen(id);
    if (existing) r.updated++; else r.added++;
  }
  return r;
}

/** A short sentence for grown-ups. */
export function describeRestore(r: RestoreResult): string {
  const parts: string[] = [];
  if (r.added) parts.push(`${r.added} added`);
  if (r.updated) parts.push(`${r.updated} updated to the newer copy`);
  if (r.kept) parts.push(`${r.kept} already here`);
  if (r.failed) parts.push(`${r.failed} couldn’t be restored (damaged, or this device’s storage is full)`);
  return parts.length ? `Backup restored: ${parts.join(', ')}.` : 'That backup was empty.';
}
