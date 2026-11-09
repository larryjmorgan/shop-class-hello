// The "My movies" shelf: finished recordings from the Puppet Theater, kept in this browser.
// Video files live in IndexedDB (via db.ts); a small index (title-less, with a poster picture) in localStorage.

import { deleteBlob, getBlob, putBlob } from '../db';
import { uid } from '../model';

const INDEX_KEY = 'storybox.movies';

export interface MovieMeta {
  id: string;
  createdAt: number;
  seconds: number;
  ext: 'mp4' | 'webm';
  mime: string;
  bytes: number;
  /** small JPEG data URL */
  poster?: string;
}

const readIndex = (): MovieMeta[] => {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((m) => m && typeof m.id === 'string') : [];
  } catch {
    return [];
  }
};
const writeIndex = (list: MovieMeta[]): boolean => {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
};

const blobKey = (id: string) => `movie_${id}`;

/** Newest first. */
export const listMovies = (): MovieMeta[] => readIndex().sort((a, b) => b.createdAt - a.createdAt);

export interface SavedMovie {
  meta: MovieMeta;
  /** false if the browser could not store it durably (it is still in memory until the page closes) */
  saved: boolean;
}

export async function saveMovie(blob: Blob, info: { seconds: number; ext: 'mp4' | 'webm'; mime: string; poster?: string }, now = Date.now()): Promise<SavedMovie> {
  const meta: MovieMeta = { id: uid('movie'), createdAt: now, seconds: info.seconds, ext: info.ext, mime: info.mime, bytes: blob.size, poster: info.poster };
  const stored = await putBlob(blobKey(meta.id), blob);
  const indexed = writeIndex([...readIndex(), meta]);
  return { meta, saved: stored && indexed };
}

export const loadMovie = (id: string): Promise<Blob | undefined> => getBlob(blobKey(id));

export async function removeMovie(id: string): Promise<void> {
  writeIndex(readIndex().filter((m) => m.id !== id));
  await deleteBlob(blobKey(id));
}
