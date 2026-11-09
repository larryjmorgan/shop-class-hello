import { useSyncExternalStore } from 'react';
import {
  MAX_DURATION, MIN_DURATION, STAGE_W, clamp, emptyProject, findKeyframeIndex, fitToDuration, samplePose, uid, upsertKeyframe,
  type AudioClip, type BackgroundClip, type Keyframe, type Pose, type Project, type SceneObject,
} from './model';
import { artById, bgById } from './assets';
import { SAMPLE_PROJECT } from './sample';
import { deleteBlob } from './db';
import {
  currentStoryId, listStories, migrateLegacyStory, newStoryId, orphanedBlobKeys, otherStories, readStory, removeStory,
  setCurrentStoryId, writeStory, writeThumb,
} from './library';
import { makeThumb } from './thumb';

export type Selection =
  | { type: 'none' }
  | { type: 'object'; id: string }
  | { type: 'bg'; id: string }
  | { type: 'audio'; id: string };

export interface AppState {
  /** id of the story that is open (its library entry) */
  currentId: string;
  project: Project;
  selection: Selection;
  selectedKfT: number | null;
  autoKey: boolean;
  past: Project[];
  future: Project[];
  /** true when the last autosave could not be written (storage full/blocked) */
  saveFailed: boolean;
}

/** Open the last story, or the newest readable one, or start with the sample. */
function boot(): { id: string; project: Project } {
  migrateLegacyStory();
  for (const id of [currentStoryId(), ...listStories().map((m) => m.id)]) {
    const project = id ? readStory(id) : null;
    if (id && project) {
      setCurrentStoryId(id);
      return { id, project };
    }
  }
  const id = newStoryId();
  const project = structuredClone(SAMPLE_PROJECT);
  writeStory(id, project);
  setCurrentStoryId(id);
  return { id, project };
}

const initial = boot();

let state: AppState = {
  currentId: initial.id,
  project: initial.project,
  selection: { type: 'none' },
  selectedKfT: null,
  autoKey: true,
  past: [],
  future: [],
  saveFailed: false,
};

const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;

function writeNow() {
  clearTimeout(saveTimer);
  if (!dirty) return;
  dirty = false;
  const failed = !writeStory(state.currentId, state.project);
  if (failed !== state.saveFailed) setState({ saveFailed: failed }, false);
  scheduleThumb();
}

const thumbTimers = new Map<string, ReturnType<typeof setTimeout>>();
/**
 * Refresh a story's library picture a couple of seconds after editing stops (no need to do it per keystroke).
 * It works from a snapshot, so it still happens if you switch to another story in the meantime.
 */
function scheduleThumb(id = state.currentId, project = state.project) {
  clearTimeout(thumbTimers.get(id));
  thumbTimers.set(id, setTimeout(async () => {
    thumbTimers.delete(id);
    const t = await makeThumb(project);
    if (t) writeThumb(id, t); // ignored if the story was deleted meanwhile
  }, 2500));
}

function scheduleSave() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 400);
}

/** Write any pending autosave immediately (called when the page is hidden or closed). */
export function flushSave() {
  writeNow();
}

/** `persist` = autosave the change. (Opening a story must not count as editing it.) */
function setState(patch: Partial<AppState>, persist = true) {
  const projectChanged = patch.project && patch.project !== state.project;
  state = { ...state, ...patch };
  if (projectChanged && persist) scheduleSave();
  emit();
}

export const getState = () => state;
export const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => subs.delete(fn);
};

/** The selector MUST return a stable value (a field of the state), never a freshly built array/object, or React loops. */
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// ---------- history ----------

const HISTORY_LIMIT = 60;

// Edits with the same `key` made within this window share one undo step (typing a title, dragging a slider).
const COALESCE_MS = 1000;
let lastKey: string | undefined;
let lastKeyAt = 0;

/** Call once at the start of a drag so the whole gesture is a single undo step. */
export function beginGesture() {
  lastKey = undefined;
  setState({ past: [...state.past, state.project].slice(-HISTORY_LIMIT), future: [] });
}

/** Apply a change. `record` = push an undo step (false inside a gesture). `key` merges rapid repeat edits. */
export function mutate(fn: (p: Project) => void, record = true, key?: string) {
  const next = structuredClone(state.project);
  fn(next);
  const fitted = fitToDuration(next);
  let patch: Partial<AppState> = { project: fitted };
  if (record) {
    const now = Date.now();
    const merge = key !== undefined && key === lastKey && now - lastKeyAt < COALESCE_MS && state.past.length > 0;
    lastKey = key;
    lastKeyAt = now;
    patch = { ...patch, future: [], ...(merge ? {} : { past: [...state.past, state.project].slice(-HISTORY_LIMIT) }) };
  }
  setState(patch);
}

export function undo() {
  lastKey = undefined;
  const prev = state.past[state.past.length - 1];
  if (!prev) return;
  setState({ project: prev, past: state.past.slice(0, -1), future: [state.project, ...state.future], selection: pruneSel(state.selection, prev), selectedKfT: null });
}
export function redo() {
  lastKey = undefined;
  const next = state.future[0];
  if (!next) return;
  setState({ project: next, past: [...state.past, state.project], future: state.future.slice(1), selection: pruneSel(state.selection, next), selectedKfT: null });
}

function pruneSel(sel: Selection, p: Project): Selection {
  if (sel.type === 'object' && !p.objects.some((o) => o.id === sel.id)) return { type: 'none' };
  if (sel.type === 'bg' && !p.backgrounds.some((o) => o.id === sel.id)) return { type: 'none' };
  if (sel.type === 'audio' && !p.audio.some((o) => o.id === sel.id)) return { type: 'none' };
  return sel;
}

export function select(sel: Selection, kfT: number | null = null) {
  setState({ selection: sel, selectedKfT: kfT });
}
export const setAutoKey = (v: boolean) => setState({ autoKey: v });

/** Replace the open story's contents in memory and clear undo history (used by tests). */
export function loadProject(p: Project) {
  lastKey = undefined;
  setState({ project: fitToDuration(p), past: [], future: [], selection: { type: 'none' }, selectedKfT: null });
}

// ---------- the story library ----------

function activate(id: string, project: Project) {
  lastKey = undefined;
  setCurrentStoryId(id);
  setState({ currentId: id, project, past: [], future: [], selection: { type: 'none' }, selectedKfT: null }, false);
  if (!listStories().find((m) => m.id === id)?.thumb) scheduleThumb();
}

/** Switch to another saved story. The one being left is saved first, so nothing is ever lost. */
export function openStory(id: string): boolean {
  flushSave();
  const project = readStory(id);
  if (!project) return false;
  activate(id, project);
  return true;
}

/** After a backup was restored: if it replaced the open story, show the restored version (no stale copy in memory). */
export function reloadIfOpen(id: string): void {
  if (id !== state.currentId) return;
  const project = readStory(id);
  if (project) activate(id, project);
}

/** Create a story (blank unless a project is given), save it, and open it. */
export function newStory(project: Project = emptyProject()): string {
  flushSave();
  const id = newStoryId();
  const fitted = fitToDuration(project);
  const saved = writeStory(id, fitted);
  activate(id, fitted);
  if (!saved) setState({ saveFailed: true }, false);
  return id;
}

export const newSampleStory = () => newStory(structuredClone(SAMPLE_PROJECT));

/** Add a copy of a story to the library (the copy shares recordings, which is safe: they are reference-counted). */
export function duplicateStory(id: string): string | null {
  flushSave();
  const src = id === state.currentId ? state.project : readStory(id);
  if (!src) return null;
  const copy = { ...structuredClone(src), title: `${src.title} (copy)` };
  const newId = newStoryId();
  if (!writeStory(newId, copy)) {
    setState({ saveFailed: true }, false);
    return null;
  }
  const thumb = listStories().find((m) => m.id === id)?.thumb;
  if (thumb) writeThumb(newId, thumb);
  return newId;
}

/** Delete a story and any recordings that no other story (or undo step) still needs. */
export async function deleteStory(id: string): Promise<void> {
  flushSave(); // first, so a pending save can't resurrect it afterwards
  const isCurrent = id === state.currentId;
  const doomed = isCurrent ? state.project : readStory(id);
  removeStory(id);
  if (doomed) {
    const needed = [...otherStories(id), ...(isCurrent ? [] : [state.project, ...state.past, ...state.future])];
    for (const key of orphanedBlobKeys(doomed, needed)) await deleteBlob(key);
  }
  if (isCurrent) {
    const next = listStories().find((m) => openStory(m.id));
    if (!next) newStory();
  }
}

// ---------- playhead (separate tiny store: it changes every frame) ----------

let time = 0;
let playing = false;
const tsubs = new Set<() => void>();
const temit = () => tsubs.forEach((s) => s());
export const getTime = () => time;
export const isPlaying = () => playing;
export const subscribeTime = (fn: () => void) => {
  tsubs.add(fn);
  return () => tsubs.delete(fn);
};
export function setTime(t: number) {
  time = clamp(t, 0, state.project.duration);
  temit();
}
export function setPlaying(v: boolean) {
  playing = v;
  temit();
}
export function useTime(): number {
  return useSyncExternalStore(subscribeTime, getTime);
}
export function usePlaying(): boolean {
  return useSyncExternalStore(subscribeTime, isPlaying);
}

// ---------- editing actions ----------

export function setTitle(title: string) {
  mutate((p) => { p.title = title; }, true, 'title');
}

export function setDuration(d: number) {
  const dur = clamp(Math.round(d), MIN_DURATION, MAX_DURATION);
  if (dur === state.project.duration) return;
  mutate((p) => { p.duration = dur; });
  if (time > dur) setTime(dur);
}

export function addObject(kind: 'character' | 'prop', assetId: string, at: number): string | null {
  const art = artById(assetId);
  if (!art) return null;
  const dur = state.project.duration;
  const id = uid('obj');
  const n = state.project.objects.length;
  const start = Math.min(at, Math.max(0, dur - 1));
  const end = Math.min(dur, Math.max(start + 1, kind === 'character' ? dur : start + 8));
  const pose: Pose = {
    x: 260 + ((n * 170) % 760),
    y: kind === 'character' ? 470 : 240 + ((n * 60) % 200),
    scale: kind === 'character' ? 1.2 : 0.8,
    rot: 0, opacity: 1, flip: false,
  };
  mutate((p) => {
    p.objects.push({
      id, name: `${art.label} ${p.objects.filter((o) => o.assetId === assetId).length + 1}`,
      kind, assetId, color: art.colors[0], start, end,
      keyframes: [{ t: start, ...pose, ease: 'ease' }],
      behavior: 'none', entrance: 'pop',
    });
  });
  select({ type: 'object', id });
  return id;
}

export function addText(text: string, at: number): string {
  const id = uid('obj');
  const dur = state.project.duration;
  const start = Math.min(at, Math.max(0, dur - 1));
  mutate((p) => {
    p.objects.push({
      id, name: `Text: ${text.slice(0, 12)}`, kind: 'text', assetId: 'text', color: '#ffe066', text,
      start, end: Math.min(dur, start + 5),
      keyframes: [{ t: start, x: STAGE_W / 2, y: 140, scale: 1, rot: 0, opacity: 1, flip: false, ease: 'ease' }],
      behavior: 'float', entrance: 'pop',
    });
  });
  select({ type: 'object', id });
  return id;
}

export function addBackground(bgId: string, at: number) {
  const def = bgById(bgId);
  if (!def) return;
  const dur = state.project.duration;
  const id = uid('bg');
  mutate((p) => {
    // A new background starts at the playhead; anything it overlaps is trimmed, and one starting exactly here is replaced.
    const start = Math.min(at, Math.max(0, dur - 1));
    p.backgrounds = p.backgrounds.filter((b) => Math.abs(b.start - start) > 0.01);
    for (const b of p.backgrounds) if (b.start < start && b.end > start) b.end = start;
    const next = p.backgrounds.filter((b) => b.start > start).sort((a, b) => a.start - b.start)[0];
    const follows = p.backgrounds.some((b) => Math.abs(b.end - start) < 0.05);
    p.backgrounds.push({ id, bgId, start, end: next ? next.start : dur, transition: follows ? 'fade' : 'cut' });
    p.backgrounds.sort((a, b) => a.start - b.start);
  });
  select({ type: 'bg', id });
}

/**
 * Give a written (silent) line its voice, e.g. one generated with ElevenLabs. Words, speaker and start time are kept;
 * the length follows the audio (and the story grows if it runs past the end).
 */
export function replaceVoiceAudio(id: string, take: { blobKey: string; bufferDuration: number; rate?: number; provider: 'eleven' | 'file'; voiceId?: string }) {
  mutate((p) => {
    const c = p.audio.find((x) => x.id === id && x.kind === 'voice');
    if (!c) return;
    const rate = take.rate ?? 1;
    c.provider = take.provider;
    c.blobKey = take.blobKey;
    c.bufferDuration = take.bufferDuration;
    c.rate = take.rate;
    c.duration = take.bufferDuration / rate;
    c.voiceId = take.voiceId;
    const end = c.start + c.duration;
    if (end > p.duration) p.duration = clamp(Math.ceil(end), MIN_DURATION, MAX_DURATION);
  });
}

export function addAudio(clip: Omit<AudioClip, 'id'>): string {
  const id = uid('aud');
  mutate((p) => {
    // Never silently cut a spoken line short: grow the story (up to 3:00) to fit it.
    // (Music just needs room for a couple of seconds; it is trimmed to the end like any loop.)
    const end = clip.start + (clip.kind === 'music' ? Math.min(clip.duration, 2) : clip.duration);
    if (end > p.duration) p.duration = clamp(Math.ceil(end), MIN_DURATION, MAX_DURATION);
    p.audio.push({ ...clip, id });
  });
  select({ type: 'audio', id });
  return id;
}

export function updateObject(id: string, fn: (o: SceneObject) => void, record = true, key?: string) {
  mutate((p) => {
    const o = p.objects.find((x) => x.id === id);
    if (o) fn(o);
  }, record, key);
}
export function updateAudio(id: string, fn: (c: AudioClip) => void, record = true, key?: string) {
  mutate((p) => {
    const c = p.audio.find((x) => x.id === id);
    if (c) fn(c);
  }, record, key);
}
export function updateBackground(id: string, fn: (c: BackgroundClip) => void, record = true) {
  mutate((p) => {
    const c = p.backgrounds.find((x) => x.id === id);
    if (c) fn(c);
  }, record);
}

/**
 * Change an object's pose at time `t`.
 *  - autoKey on: creates/updates a keyframe at t (the object animates between keyframes)
 *  - autoKey off: shifts the whole motion path by the delta (no new keyframes)
 */
export function posePatch(id: string, t: number, patch: Partial<Pose>, record = true, key?: string) {
  const auto = state.autoKey;
  mutate((p) => {
    const o = p.objects.find((x) => x.id === id);
    if (!o) return;
    // A keyframe outside the object's bar would make it appear mid-glide; snap edits to the nearest edge instead.
    const tt = clamp(t, o.start, Math.max(o.start, o.end - 0.001));
    const cur = samplePose(o.keyframes, tt);
    const next = { ...cur, ...patch };
    if (auto || o.keyframes.length === 0) {
      o.keyframes = upsertKeyframe(o.keyframes, tt, next);
    } else {
      const dx = next.x - cur.x, dy = next.y - cur.y, ds = next.scale / (cur.scale || 1), dr = next.rot - cur.rot;
      o.keyframes = o.keyframes.map((k) => ({
        ...k, x: k.x + dx, y: k.y + dy, scale: Math.max(0.05, k.scale * ds), rot: k.rot + dr,
        opacity: patch.opacity !== undefined ? patch.opacity : k.opacity,
        flip: patch.flip !== undefined ? patch.flip : k.flip,
      }));
    }
  }, record, key);
}

/** Add a keyframe at `t` holding the pose the object has right now (works regardless of auto-key). */
export function addKeyframeAt(id: string, t: number) {
  mutate((p) => {
    const o = p.objects.find((x) => x.id === id);
    if (o) o.keyframes = upsertKeyframe(o.keyframes, t, samplePose(o.keyframes, t));
  });
  setState({ selectedKfT: t });
}

export function setKeyframeEase(id: string, kfT: number, ease: Keyframe['ease']) {
  updateObject(id, (o) => {
    const i = findKeyframeIndex(o.keyframes, kfT);
    if (i >= 0) o.keyframes[i].ease = ease;
  });
}

export function deleteKeyframe(id: string, kfT: number) {
  const o = state.project.objects.find((x) => x.id === id);
  // An object always keeps at least one keyframe; do nothing (and record no undo step) if there is nothing to delete.
  if (o && o.keyframes.length > 1 && findKeyframeIndex(o.keyframes, kfT) >= 0) {
    updateObject(id, (x) => { x.keyframes.splice(findKeyframeIndex(x.keyframes, kfT), 1); });
  }
  setState({ selectedKfT: null });
}

/**
 * Delete key handler: removes the selected keyframe if there really is one.
 * Returns true if the key press was "used up" (so the object itself must not be deleted).
 */
export function deleteSelectedKeyframe(): boolean {
  const { selection, selectedKfT, project } = state;
  if (selection.type !== 'object' || selectedKfT === null) return false;
  const o = project.objects.find((x) => x.id === selection.id);
  if (!o || findKeyframeIndex(o.keyframes, selectedKfT) < 0) {
    setState({ selectedKfT: null }); // stale selection: fall through to deleting the object
    return false;
  }
  deleteKeyframe(o.id, selectedKfT);
  return true;
}

export function moveObjectClip(id: string, dStart: number, dEnd: number, origin: SceneObject, record = false) {
  mutate((p) => {
    const o = p.objects.find((x) => x.id === id);
    if (!o) return;
    const dur = p.duration;
    let s = origin.start + dStart;
    let e = origin.end + dEnd;
    if (dStart === dEnd) {
      // moving the whole clip: keep length and shift keyframes along with it
      s = clamp(s, 0, dur - (origin.end - origin.start));
      e = s + (origin.end - origin.start);
      const shift = s - origin.start;
      o.keyframes = origin.keyframes.map((k) => ({ ...k, t: k.t + shift }));
    } else {
      s = clamp(s, 0, origin.end - 0.3);
      e = clamp(e, origin.start + 0.3, dur);
    }
    o.start = s;
    o.end = e;
  }, record);
}

export function moveKeyframe(id: string, fromT: number, toT: number, record = false) {
  mutate((p) => {
    const o = p.objects.find((x) => x.id === id);
    if (!o) return;
    const i = findKeyframeIndex(o.keyframes, fromT);
    if (i < 0) return;
    o.keyframes[i].t = clamp(toT, 0, p.duration);
    o.keyframes.sort((a, b) => a.t - b.t);
  }, record);
  setState({ selectedKfT: toT });
}

export function moveLayer(id: string, dir: -1 | 1) {
  mutate((p) => {
    const i = p.objects.findIndex((o) => o.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.objects.length) return;
    [p.objects[i], p.objects[j]] = [p.objects[j], p.objects[i]];
  });
}

export function duplicateObject(id: string) {
  const src = state.project.objects.find((o) => o.id === id);
  if (!src) return;
  const nid = uid('obj');
  mutate((p) => {
    const copy = structuredClone(src);
    copy.id = nid;
    copy.name = `${src.name} copy`;
    copy.keyframes = copy.keyframes.map((k) => ({ ...k, x: k.x + 60, y: k.y + 20 }));
    p.objects.push(copy);
  });
  select({ type: 'object', id: nid });
}

export function deleteSelection() {
  const sel = state.selection;
  if (sel.type === 'none') return;
  mutate((p) => {
    if (sel.type === 'object') {
      p.objects = p.objects.filter((o) => o.id !== sel.id);
      for (const a of p.audio) if (a.characterId === sel.id) a.characterId = undefined;
    }
    if (sel.type === 'bg') p.backgrounds = p.backgrounds.filter((b) => b.id !== sel.id);
    if (sel.type === 'audio') p.audio = p.audio.filter((a) => a.id !== sel.id);
  });
  setState({ selection: { type: 'none' }, selectedKfT: null });
  // Audio blobs are kept in browser storage so Undo can bring a clip back.
}

