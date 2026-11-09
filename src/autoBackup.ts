// Automatic backup: a grown-up picks a file once (for example in iCloud Drive), and from then on the app rewrites
// that file by itself shortly after anything changes. Uses the File System Access API, so it works in Chrome/Edge on
// a computer; other browsers keep the manual "Back up everything" button.
//
// Browsers only let a page keep writing to a file while it has permission. Chrome may ask again after the app is
// reopened; until a grown-up taps "Resume" the backup is paused (nothing is lost; it catches up on resume).

import { useSyncExternalStore } from 'react';
import { makeBackup } from './backup';
import { deleteValue, getValue, putValue } from './db';

const HANDLE_KEY = 'autobackup-handle';
const META_KEY = 'storybox.autobackup';
const LOADING_KEY = 'storybox.autobackup.loading';
const CHECK_EVERY_MS = 15_000;
/** What goes into a backup (see backup.ts). Settings such as the ElevenLabs key are not watched or saved. */
const WATCHED = (k: string) =>
  k === 'storybox.kidstories' || k === 'storybox.ownstories' || k === 'storybox.painted' || k === 'storybox.learn' ||
  k === 'storybox.index' || k.startsWith('storybox.p.');

interface FileHandle {
  name: string;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
}
type Picker = (o: object) => Promise<FileHandle>;

export type AutoState = 'unsupported' | 'off' | 'starting' | 'saving' | 'ok' | 'paused' | 'error';
export interface AutoStatus { state: AutoState; fileName?: string; lastSaved?: number; message?: string }
interface Meta { on: boolean; fileName?: string; lastSaved?: number; fingerprint?: string }

const picker = (): Picker | undefined => (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker;

function readMeta(): Meta {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    return m && typeof m === 'object' ? m : { on: false };
  } catch {
    return { on: false };
  }
}
function writeMeta(m: Meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

let status: AutoStatus = { state: 'off' };
let handle: FileHandle | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let writing: Promise<void> | null = null;
const subs = new Set<() => void>();
const set = (s: AutoStatus) => { status = s; subs.forEach((f) => f()); };

export const getAutoStatus = () => status;
export function useAutoBackup(): AutoStatus {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, getAutoStatus);
}

/** A cheap summary of everything a backup holds; when it changes, the file needs rewriting. */
export function fingerprint(): string {
  let h = 2166136261;
  let n = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && WATCHED(k)) keys.push(k); }
    keys.sort();
    for (const k of keys) {
      const v = `${k}=${localStorage.getItem(k) ?? ''};`;
      n += v.length;
      for (let i = 0; i < v.length; i++) { h ^= v.charCodeAt(i); h = Math.imul(h, 16777619); }
    }
  } catch {
    return '';
  }
  return `${n.toString(36)}-${(h >>> 0).toString(36)}`;
}

async function permitted(h: FileHandle): Promise<boolean> {
  try {
    const p = await h.queryPermission?.({ mode: 'readwrite' });
    return p === undefined || p === 'granted';
  } catch {
    return false;
  }
}

/** Write the backup file now (if anything changed, unless forced). */
export async function backupNow(force = false): Promise<void> {
  if (!handle || status.state === 'paused' || status.state === 'off' || status.state === 'unsupported') return;
  if (writing) return writing;
  const fp = fingerprint();
  const meta = readMeta();
  if (!force && fp && fp === meta.fingerprint) return;
  const h = handle;
  writing = (async () => {
    set({ ...status, state: 'saving' });
    try {
      if (!(await permitted(h))) { set({ ...status, state: 'paused' }); return; }
      const { blob } = await makeBackup();
      const w = await h.createWritable(); // written to a temporary file and swapped in on close, so never half-written
      await w.write(blob);
      await w.close();
      const now = Date.now();
      writeMeta({ ...readMeta(), on: true, fileName: h.name, lastSaved: now, fingerprint: fingerprint() });
      set({ state: 'ok', fileName: h.name, lastSaved: now });
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') set({ ...status, state: 'paused' });
      else if (name === 'NotFoundError') set({ ...status, state: 'error', message: 'The backup file was moved or deleted. Choose a file again.' });
      else set({ ...status, state: 'error', message: 'The backup file could not be written. Is the drive full or offline?' });
    } finally {
      writing = null;
    }
  })();
  return writing;
}

// Checked every 15 s. (Not on page close: a file write started while the page unloads can't finish; anything
// missed is caught up when the app is next opened.)
function startTimer() {
  clearInterval(timer);
  timer = setInterval(() => void backupNow(), CHECK_EVERY_MS);
}

/** Called once when the app starts. */
export async function startAutoBackup(): Promise<void> {
  if (!picker()) { set({ state: 'unsupported' }); return; }
  const meta = readMeta();
  if (!meta.on) { set({ state: 'off' }); return; }
  set({ state: 'starting', fileName: meta.fileName, lastSaved: meta.lastSaved });
  // Safety net: if loading the remembered file ever stopped the app from starting, don't try again (that could
  // repeat on every start). Forget it and ask a grown-up to choose the file again.
  const guard = (() => { try { return localStorage.getItem(LOADING_KEY); } catch { return null; } })();
  if (guard) {
    await deleteValue(HANDLE_KEY);
    try { localStorage.removeItem(LOADING_KEY); } catch { /* ignore */ }
    writeMeta({ on: false, fileName: meta.fileName, lastSaved: meta.lastSaved });
    set({ state: 'error', fileName: meta.fileName, lastSaved: meta.lastSaved, message: 'Automatic backup stopped after a problem reopening the file. Choose the file again.' });
    return;
  }
  try { localStorage.setItem(LOADING_KEY, String(Date.now())); } catch { /* ignore */ }
  const h = await getValue<FileHandle>(HANDLE_KEY);
  try { localStorage.removeItem(LOADING_KEY); } catch { /* ignore */ }
  if (!h) { set({ state: 'error', fileName: meta.fileName, lastSaved: meta.lastSaved, message: 'Choose the backup file again.' }); return; }
  handle = h;
  set({ state: (await permitted(h)) ? 'ok' : 'paused', fileName: h.name, lastSaved: meta.lastSaved });
  startTimer();
  void backupNow();
}

/** A grown-up chooses where the backup goes (e.g. iCloud Drive). Must be called from a click. */
export async function turnOnAutoBackup(): Promise<void> {
  const pick = picker();
  if (!pick) { set({ state: 'unsupported' }); return; }
  let h: FileHandle;
  try {
    h = await pick({ suggestedName: 'StoryBox backup.json', types: [{ description: 'StoryBox backup', accept: { 'application/json': ['.json'] } }] });
  } catch {
    return; // cancelled
  }
  handle = h;
  await putValue(HANDLE_KEY, h); // remembered for next time (if the browser allows storing it)
  writeMeta({ on: true, fileName: h.name });
  set({ state: 'ok', fileName: h.name });
  startTimer();
  await backupNow(true);
}

/** After the app was reopened, Chrome may need a grown-up's tap to allow writing again. Must be called from a click. */
export async function resumeAutoBackup(): Promise<void> {
  if (!handle) return;
  try {
    const r = await handle.requestPermission?.({ mode: 'readwrite' });
    if (r && r !== 'granted') return;
  } catch {
    return;
  }
  set({ ...status, state: 'ok', message: undefined });
  await backupNow(true);
}

export async function turnOffAutoBackup(): Promise<void> {
  clearInterval(timer);
  handle = null;
  writeMeta({ on: false });
  set({ state: picker() ? 'off' : 'unsupported' });
  await deleteValue(HANDLE_KEY);
}

/** "2:14 PM" today, otherwise "Nov 9, 2:14 PM". */
export function savedAt(t?: number): string {
  if (!t) return 'not yet';
  const d = new Date(t);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
