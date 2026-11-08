import { useSyncExternalStore } from 'react';
import {
  MAX_DURATION, MIN_DURATION, STAGE_H, STAGE_W, clamp, emptyProject, findKeyframeIndex, fitToDuration, samplePose, uid, upsertKeyframe,
  type AudioClip, type BackgroundClip, type Keyframe, type Pose, type Project, type SceneObject,
} from './model';
import { artById, bgById } from './assets';
import { SAMPLE_PROJECT } from './sample';
import { deleteBlob } from './db';

export type Selection =
  | { type: 'none' }
  | { type: 'object'; id: string }
  | { type: 'bg'; id: string }
  | { type: 'audio'; id: string };

export interface AppState {
  project: Project;
  selection: Selection;
  selectedKfT: number | null;
  autoKey: boolean;
  past: Project[];
  future: Project[];
}

const STORAGE = 'storybox.project.v1';

function loadInitial(): Project {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) {
      const p = JSON.parse(raw) as Project;
      if (p?.version === 1 && Array.isArray(p.objects)) return p;
    }
  } catch { /* fall through */ }
  return structuredClone(SAMPLE_PROJECT);
}

let state: AppState = {
  project: loadInitial(),
  selection: { type: 'none' },
  selectedKfT: null,
  autoKey: true,
  past: [],
  future: [],
};

const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

let saveTimer: number | undefined;
function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify(state.project)); } catch { /* quota */ }
  }, 400);
}

function setState(patch: Partial<AppState>) {
  const projectChanged = patch.project && patch.project !== state.project;
  state = { ...state, ...patch };
  if (projectChanged) scheduleSave();
  emit();
}

export const getState = () => state;
export const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => subs.delete(fn);
};

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// ---------- history ----------

const HISTORY_LIMIT = 60;

/** Call once at the start of a drag so the whole gesture is a single undo step. */
export function beginGesture() {
  setState({ past: [...state.past, state.project].slice(-HISTORY_LIMIT), future: [] });
}

/** Apply a change. `record` = push an undo step (false inside a gesture). */
export function mutate(fn: (p: Project) => void, record = true) {
  const next = structuredClone(state.project);
  fn(next);
  const fitted = fitToDuration(next);
  setState({
    project: fitted,
    ...(record ? { past: [...state.past, state.project].slice(-HISTORY_LIMIT), future: [] } : {}),
  });
}

export function undo() {
  const prev = state.past[state.past.length - 1];
  if (!prev) return;
  setState({ project: prev, past: state.past.slice(0, -1), future: [state.project, ...state.future], selection: pruneSel(state.selection, prev) });
}
export function redo() {
  const next = state.future[0];
  if (!next) return;
  setState({ project: next, past: [...state.past, state.project], future: state.future.slice(1), selection: pruneSel(state.selection, next) });
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

export function loadProject(p: Project) {
  setState({ project: fitToDuration(p), past: [], future: [], selection: { type: 'none' }, selectedKfT: null });
}
export function newProject() {
  loadProject(emptyProject());
}
export function loadSample() {
  loadProject(structuredClone(SAMPLE_PROJECT));
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
  mutate((p) => { p.title = title; });
}

export function setDuration(d: number) {
  const dur = clamp(Math.round(d), MIN_DURATION, MAX_DURATION);
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

export function addAudio(clip: Omit<AudioClip, 'id'>): string {
  const id = uid('aud');
  mutate((p) => { p.audio.push({ ...clip, id }); });
  select({ type: 'audio', id });
  return id;
}

export function updateObject(id: string, fn: (o: SceneObject) => void, record = true) {
  mutate((p) => {
    const o = p.objects.find((x) => x.id === id);
    if (o) fn(o);
  }, record);
}
export function updateAudio(id: string, fn: (c: AudioClip) => void, record = true) {
  mutate((p) => {
    const c = p.audio.find((x) => x.id === id);
    if (c) fn(c);
  }, record);
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
export function posePatch(id: string, t: number, patch: Partial<Pose>, record = true) {
  const auto = state.autoKey;
  mutate((p) => {
    const o = p.objects.find((x) => x.id === id);
    if (!o) return;
    const cur = samplePose(o.keyframes, t);
    const next = { ...cur, ...patch };
    if (auto || o.keyframes.length === 0) {
      o.keyframes = upsertKeyframe(o.keyframes, t, next);
    } else {
      const dx = next.x - cur.x, dy = next.y - cur.y, ds = next.scale / (cur.scale || 1), dr = next.rot - cur.rot;
      o.keyframes = o.keyframes.map((k) => ({
        ...k, x: k.x + dx, y: k.y + dy, scale: Math.max(0.05, k.scale * ds), rot: k.rot + dr,
        opacity: patch.opacity !== undefined ? patch.opacity : k.opacity,
        flip: patch.flip !== undefined ? patch.flip : k.flip,
      }));
    }
  }, record);
}

export function setKeyframeEase(id: string, kfT: number, ease: Keyframe['ease']) {
  updateObject(id, (o) => {
    const i = findKeyframeIndex(o.keyframes, kfT);
    if (i >= 0) o.keyframes[i].ease = ease;
  });
}

export function deleteKeyframe(id: string, kfT: number) {
  updateObject(id, (o) => {
    if (o.keyframes.length <= 1) return;
    const i = findKeyframeIndex(o.keyframes, kfT);
    if (i >= 0) o.keyframes.splice(i, 1);
  });
  setState({ selectedKfT: null });
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
  // Audio blobs are kept so undo can bring a clip back; purgeUnusedBlobs() cleans up on demand.
}

export async function purgeUnusedBlobs() {
  const used = new Set(state.project.audio.map((a) => a.blobKey).filter(Boolean));
  const all = [...state.past, ...state.future, state.project].flatMap((p) => p.audio.map((a) => a.blobKey).filter(Boolean) as string[]);
  for (const k of new Set(all)) if (!used.has(k)) await deleteBlob(k);
}

export const STAGE = { w: STAGE_W, h: STAGE_H };
