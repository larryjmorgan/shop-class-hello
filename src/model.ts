// Core data model + pure helpers (no DOM access so it is unit-testable).

export const STAGE_W = 1280;
export const STAGE_H = 720;
export const MAX_DURATION = 180; // 3 minutes
export const MIN_DURATION = 5;
export const OBJ_BASE = 260; // on-stage size in px of an object at scale 1

export type Ease = 'linear' | 'ease' | 'bounce' | 'elastic' | 'hold';
export type Behavior = 'none' | 'wiggle' | 'bounce' | 'float' | 'spin' | 'pulse';
export type Entrance = 'none' | 'pop' | 'fade' | 'slide';

export interface Keyframe {
  t: number; // absolute project time, seconds
  x: number;
  y: number;
  scale: number;
  rot: number; // degrees
  opacity: number;
  flip: boolean;
  ease: Ease; // easing used on the segment that STARTS at this keyframe
}

export interface SceneObject {
  id: string;
  name: string;
  kind: 'character' | 'prop' | 'text';
  assetId: string;
  color: string;
  text?: string;
  start: number;
  end: number;
  keyframes: Keyframe[]; // sorted by t
  behavior: Behavior;
  entrance: Entrance;
}

export interface BackgroundClip {
  id: string;
  bgId: string;
  start: number;
  end: number;
  transition: 'cut' | 'fade';
}

export type AudioKind = 'voice' | 'music' | 'sfx';
export type VoiceProvider = 'browser' | 'eleven' | 'mic' | 'file';

export interface AudioClip {
  id: string;
  kind: AudioKind;
  start: number;
  duration: number;
  volume: number; // 0..1.5
  label: string;
  text?: string; // voice clips
  characterId?: string; // which object "speaks" (mouth flaps)
  provider?: VoiceProvider;
  voiceId?: string;
  rate?: number; // browser TTS speed, or playback rate for recordings
  pitch?: number; // browser TTS pitch
  blobKey?: string; // stored audio (eleven / mic / file)
  bufferDuration?: number; // natural length of stored audio at rate 1
  preset?: string; // procedural music / sfx id
}

export interface Project {
  version: 1;
  title: string;
  duration: number;
  duckMusic: boolean;
  objects: SceneObject[]; // array order = layer order (last = front)
  backgrounds: BackgroundClip[];
  audio: AudioClip[];
}

let idCounter = 0;
export function uid(prefix = 'id'): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const snap = (v: number, step = 0.1) => Math.round(v / step) * step;

// ---------- easing ----------

export function applyEase(ease: Ease, p: number): number {
  let x = clamp(p, 0, 1);
  switch (ease) {
    case 'hold':
      return x >= 1 ? 1 : 0;
    case 'linear':
      return x;
    case 'ease':
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case 'bounce': {
      const n1 = 7.5625;
      const d1 = 2.75;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
      if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
      return n1 * (x -= 2.625 / d1) * x + 0.984375;
    }
    case 'elastic': {
      if (x === 0 || x === 1) return x;
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
    }
  }
}

export function easeOutBack(p: number): number {
  const x = clamp(p, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// ---------- keyframe sampling ----------

export interface Pose {
  x: number;
  y: number;
  scale: number;
  rot: number;
  opacity: number;
  flip: boolean;
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

export function samplePose(keyframes: Keyframe[], t: number): Pose {
  const ks = keyframes;
  if (ks.length === 0) return { x: STAGE_W / 2, y: STAGE_H / 2, scale: 1, rot: 0, opacity: 1, flip: false };
  const first = ks[0];
  const last = ks[ks.length - 1];
  if (t <= first.t) return pick(first);
  if (t >= last.t) return pick(last);
  let i = 0;
  while (i < ks.length - 1 && ks[i + 1].t <= t) i++;
  const a = ks[i];
  const b = ks[i + 1];
  const span = b.t - a.t;
  const p = span <= 0 ? 1 : applyEase(a.ease, (t - a.t) / span);
  return {
    x: lerp(a.x, b.x, p),
    y: lerp(a.y, b.y, p),
    scale: lerp(a.scale, b.scale, p),
    rot: lerp(a.rot, b.rot, p),
    opacity: lerp(a.opacity, b.opacity, p),
    flip: a.flip,
  };
}

function pick(k: Keyframe): Pose {
  return { x: k.x, y: k.y, scale: k.scale, rot: k.rot, opacity: k.opacity, flip: k.flip };
}

export const KF_EPS = 1 / 30;

export function findKeyframeIndex(ks: Keyframe[], t: number): number {
  return ks.findIndex((k) => Math.abs(k.t - t) < KF_EPS);
}

/** Returns a copy of `ks` with a keyframe at `t` holding `pose` (replacing any near t). */
export function upsertKeyframe(ks: Keyframe[], t: number, pose: Pose, ease?: Ease): Keyframe[] {
  const out = ks.map((k) => ({ ...k }));
  const idx = findKeyframeIndex(out, t);
  if (idx >= 0) {
    out[idx] = { ...out[idx], ...pose };
    if (ease) out[idx].ease = ease;
  } else {
    // new keyframes inherit the easing of the segment they split
    const prev = [...out].reverse().find((k) => k.t < t);
    out.push({ t, ...pose, ease: ease ?? prev?.ease ?? 'ease' });
    out.sort((a, b) => a.t - b.t);
  }
  return out;
}

export function activeAt(start: number, end: number, t: number): boolean {
  return t >= start && t < end;
}

// ---------- voice / talking ----------

export function speakingClip(p: Project, objectId: string, t: number): AudioClip | undefined {
  return p.audio.find((c) => c.kind === 'voice' && c.characterId === objectId && t >= c.start && t < c.start + c.duration);
}

// Pseudo-random but deterministic mouth flapping while speaking.
export function mouthOpenAt(t: number): boolean {
  return Math.sin(t * 17) + Math.sin(t * 10.7 + 1.3) > -0.2;
}

export function blinkAt(t: number, seed: number): boolean {
  return (t + seed) % 3.6 < 0.14;
}

export function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 3600;
  return h / 1000;
}

// ---------- project helpers ----------

export function emptyProject(title = 'My Story'): Project {
  return { version: 1, title, duration: 30, duckMusic: true, objects: [], backgrounds: [], audio: [] };
}

/** Greedy lane assignment so overlapping clips are drawn on separate rows. */
export function assignLanes<T extends { id: string }>(items: T[], startOf: (i: T) => number, endOf: (i: T) => number): { lanes: Map<string, number>; count: number } {
  const sorted = [...items].sort((a, b) => startOf(a) - startOf(b));
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const it of sorted) {
    let lane = laneEnds.findIndex((e) => e <= startOf(it) + 1e-6);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = endOf(it);
    lanes.set(it.id, lane);
  }
  return { lanes, count: Math.max(1, laneEnds.length) };
}

/** Estimate how long a spoken line takes (used before real audio exists). */
export function estimateSpeechSeconds(text: string, rate = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(0.8, words / (2.4 * rate) + 0.35);
}

export function fmtTime(s: number): string {
  const total = Math.round(Math.max(0, s) * 10) / 10; // round first so 59.97 shows 1:00.0, never 0:60.0
  const m = Math.floor(total / 60);
  const sec = total - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

const MIN_VISUAL = 0.5;
const MIN_AUDIO = 0.3;

/**
 * Make every clip fit a (possibly shortened) project. Clips that run past the end are trimmed.
 * Clips that would have less than a blink left (or start after the end) are removed, because
 * leaving them past the end makes invisible clips you can't select or delete.
 */
export function fitToDuration(p: Project): Project {
  const d = p.duration;
  return {
    ...p,
    objects: p.objects
      .filter((o) => d - o.start >= MIN_VISUAL)
      .map((o) => (o.end > d ? { ...o, end: d } : o)),
    backgrounds: p.backgrounds
      .filter((b) => d - b.start >= MIN_VISUAL)
      .map((b) => (b.end > d ? { ...b, end: d } : b)),
    audio: p.audio
      .filter((a) => d - a.start >= MIN_AUDIO)
      .map((a) => (a.start + a.duration > d ? { ...a, duration: d - a.start } : a)),
  };
}

/** How many clips `fitToDuration` would delete outright if the project were `d` seconds long. */
export function countDropped(p: Project, d: number): number {
  const fitted = fitToDuration({ ...p, duration: d });
  return p.objects.length + p.backgrounds.length + p.audio.length - (fitted.objects.length + fitted.backgrounds.length + fitted.audio.length);
}

const OBJECT_DEFAULTS: Partial<SceneObject> = { behavior: 'none', entrance: 'pop' };
const HEX = /^#[0-9a-f]{6}$/i;
const AUDIO_DEFAULTS: Partial<AudioClip> = { volume: 1 };

/** Validate + repair a project loaded from storage or a file. Returns null if it isn't a StoryBox project. */
export function normalizeProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Project>;
  if (r.version !== 1) return null;
  const list = <T,>(x: unknown, ok: (v: T) => boolean): T[] => (Array.isArray(x) ? (x as T[]).filter((v) => v && typeof v === 'object' && ok(v)) : []);
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const objects = list<SceneObject>(r.objects, (o) => typeof o.id === 'string' && num(o.start) && num(o.end) && Array.isArray(o.keyframes) && o.keyframes.length > 0 && o.keyframes.every((k) => k && num(k.t) && num(k.x) && num(k.y)));
  const backgrounds = list<BackgroundClip>(r.backgrounds, (b) => typeof b.id === 'string' && typeof b.bgId === 'string' && num(b.start) && num(b.end));
  const audio = list<AudioClip>(r.audio, (a) => typeof a.id === 'string' && num(a.start) && num(a.duration) && (a.kind === 'voice' || a.kind === 'music' || a.kind === 'sfx'));
  const duration = clamp(num(r.duration) ? Math.round(r.duration as number) : 30, MIN_DURATION, MAX_DURATION);
  return fitToDuration({
    version: 1,
    title: typeof r.title === 'string' ? r.title : 'My Story',
    duration,
    duckMusic: r.duckMusic !== false,
    objects: objects.map((o) => ({ ...OBJECT_DEFAULTS, ...o, color: HEX.test(String(o.color)) ? o.color : '#ffffff', name: typeof o.name === 'string' ? o.name : o.id, keyframes: [...o.keyframes].sort((a, b) => a.t - b.t) })),
    backgrounds,
    audio: audio.map((a) => ({ ...AUDIO_DEFAULTS, ...a, label: typeof a.label === 'string' ? a.label : a.kind })),
  });
}
