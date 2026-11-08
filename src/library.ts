// The "My Stories" library: many stories saved in this browser, one of which is open at a time.
//
// Layout in localStorage (small JSON, so it loads synchronously at start-up):
//   storybox.index      -> StoryMeta[]            (what the library screen lists)
//   storybox.p.<id>     -> Project                (one key per story)
//   storybox.current    -> id of the open story
// Audio recordings live in IndexedDB (see db.ts) and are referenced by `blobKey`.

import { normalizeProject, uid, type Project } from './model';

const INDEX_KEY = 'storybox.index';
const CURRENT_KEY = 'storybox.current';
const PROJECT_PREFIX = 'storybox.p.';
const LEGACY_KEY = 'storybox.project.v1'; // single-story version of the app

export interface StoryMeta {
  id: string;
  title: string;
  duration: number;
  updatedAt: number;
  /** small JPEG data URL for the library screen */
  thumb?: string;
}

const get = (k: string): string | null => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const set = (k: string, v: string): boolean => {
  try { localStorage.setItem(k, v); return true; } catch { return false; }
};
const remove = (k: string) => {
  try { localStorage.removeItem(k); } catch { /* ignore */ }
};

function readIndex(): StoryMeta[] {
  const raw = get(INDEX_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((m) => m && typeof m.id === 'string' && typeof m.title === 'string');
  } catch {
    return [];
  }
}

/** Newest first. */
export function listStories(): StoryMeta[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

export const newStoryId = () => uid('story');

/** The story's project, validated/repaired — or null if it is missing or unreadable. */
export function readStory(id: string): Project | null {
  const raw = get(PROJECT_PREFIX + id);
  if (!raw) return null;
  try {
    return normalizeProject(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Save a story and update its library entry. Returns false if the browser refused (storage full/blocked). */
export function writeStory(id: string, project: Project, now = Date.now()): boolean {
  if (!set(PROJECT_PREFIX + id, JSON.stringify(project))) return false;
  const index = readIndex();
  const prev = index.find((m) => m.id === id);
  const meta: StoryMeta = { id, title: project.title, duration: project.duration, updatedAt: now, thumb: prev?.thumb };
  return set(INDEX_KEY, JSON.stringify([...index.filter((m) => m.id !== id), meta]));
}

/** Attach a thumbnail to an existing library entry (does not change "last edited"). */
export function writeThumb(id: string, thumb: string): void {
  const index = readIndex();
  const m = index.find((x) => x.id === id);
  if (!m) return;
  m.thumb = thumb;
  set(INDEX_KEY, JSON.stringify(index));
}

export function removeStory(id: string): void {
  remove(PROJECT_PREFIX + id);
  set(INDEX_KEY, JSON.stringify(readIndex().filter((m) => m.id !== id)));
  if (get(CURRENT_KEY) === id) remove(CURRENT_KEY);
}

export const currentStoryId = (): string | null => get(CURRENT_KEY);
export const setCurrentStoryId = (id: string): void => void set(CURRENT_KEY, id);

/** If this browser has a story from the single-story version of the app, move it into the library once. */
export function migrateLegacyStory(): void {
  if (get(INDEX_KEY) !== null) return; // library already exists (even if empty): never re-import
  const raw = get(LEGACY_KEY);
  if (!raw) return;
  try {
    const p = normalizeProject(JSON.parse(raw));
    if (p) {
      const id = newStoryId();
      if (writeStory(id, p)) {
        setCurrentStoryId(id);
        remove(LEGACY_KEY);
      }
    }
  } catch { /* unreadable: leave it alone */ }
}

// ---------- audio-blob bookkeeping (pure, so it can be unit-tested) ----------

export function blobKeysOf(p: Project): string[] {
  return [...new Set(p.audio.map((a) => a.blobKey).filter((k): k is string => !!k))];
}

/** Blob keys used by `deleted` that nothing in `stillNeeded` refers to, i.e. safe to erase from storage. */
export function orphanedBlobKeys(deleted: Project, stillNeeded: Project[]): string[] {
  const keep = new Set(stillNeeded.flatMap(blobKeysOf));
  return blobKeysOf(deleted).filter((k) => !keep.has(k));
}

/** Every other story (loaded), for blob reference counting. */
export function otherStories(exceptId: string): Project[] {
  return readIndex()
    .filter((m) => m.id !== exceptId)
    .map((m) => readStory(m.id))
    .filter((p): p is Project => !!p);
}
