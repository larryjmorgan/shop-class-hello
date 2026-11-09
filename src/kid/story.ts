// A kid's story = a scenario + the characters she picked + her music and stickers for each scene.
// compileStory() turns it into a normal Project (the same format the Studio edits), so playing, exporting a video
// and "open in the Studio" all reuse the existing engine. Pure (no DOM), so it is unit-tested.

import { artById } from '../assets';
import { sfxById } from '../audio';
import {
  MAX_DURATION, STAGE_W, uid,
  type AudioClip, type BackgroundClip, type Behavior, type Ease, type Entrance, type Keyframe, type Pose, type Project, type SceneObject,
} from '../model';
import { MUSIC_CHOICES, STICKERS, musicChoice, scenarioById, type Beat, type SceneDef, type ScenePropDef, type Scenario, type Who } from './scenarios';

export const MAX_CAST = 4;
export const MAX_SCENE_PROPS = 3;
export const TITLE_SECONDS = 4;
export const END_SECONDS = 4;

export interface CastMember {
  assetId: string;
  color: string;
}

export interface SceneChoice {
  music: string | null;
  /** sticker prop ids she added to this scene */
  props: string[];
}

export interface KidStory {
  id: string;
  scenarioId: string;
  cast: CastMember[];
  scenes: SceneChoice[];
  createdAt: number;
  updatedAt: number;
  /** small JPEG for the shelf */
  thumb?: string;
}

const member = (assetId: string): CastMember => ({ assetId, color: artById(assetId)?.colors[0] ?? '#ffffff' });

export function newKidStory(sc: Scenario, now = Date.now()): KidStory {
  return {
    id: uid('kid'), scenarioId: sc.id, cast: sc.defaultCast.map(member),
    scenes: sc.scenes.map((s) => ({ music: s.music, props: [] })), createdAt: now, updatedAt: now,
  };
}

// ---------- editing (all return a new story) ----------

export function toggleCast(s: KidStory, assetId: string): KidStory {
  if (s.cast.some((c) => c.assetId === assetId)) return { ...s, cast: s.cast.filter((c) => c.assetId !== assetId) };
  if (s.cast.length >= MAX_CAST || artById(assetId)?.kind !== 'character') return s;
  return { ...s, cast: [...s.cast, member(assetId)] };
}

/** Tap a picked character's colour dot: next colour. */
export function cycleCastColor(s: KidStory, assetId: string): KidStory {
  const colors = artById(assetId)?.colors ?? [];
  return {
    ...s,
    cast: s.cast.map((c) => (c.assetId === assetId && colors.length ? { ...c, color: colors[(colors.indexOf(c.color) + 1) % colors.length] } : c)),
  };
}

export function setSceneMusic(s: KidStory, scene: number, music: string | null): KidStory {
  return { ...s, scenes: s.scenes.map((c, i) => (i === scene ? { ...c, music } : c)) };
}

export function nextMusic(current: string | null): string | null {
  const i = MUSIC_CHOICES.findIndex((m) => m.id === current);
  return MUSIC_CHOICES[(i + 1) % MUSIC_CHOICES.length].id;
}

export function addSceneProp(s: KidStory, scene: number, propId: string): KidStory {
  if (!STICKERS.includes(propId)) return s;
  return { ...s, scenes: s.scenes.map((c, i) => (i === scene && c.props.length < MAX_SCENE_PROPS ? { ...c, props: [...c.props, propId] } : c)) };
}

export function removeSceneProp(s: KidStory, scene: number, index: number): KidStory {
  return { ...s, scenes: s.scenes.map((c, i) => (i === scene ? { ...c, props: c.props.filter((_, k) => k !== index) } : c)) };
}

export function castNames(s: KidStory): string {
  const names = s.cast.map((c) => artById(c.assetId)?.label ?? c.assetId);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export function storyTitle(s: KidStory): string {
  const sc = scenarioById(s.scenarioId);
  return sc ? `${sc.title}${s.cast.length ? ` with ${castNames(s)}` : ''}` : 'My story';
}

/** Repair a story read from storage; null if it can't be used (e.g. its scenario no longer exists). */
export function normalizeKidStory(raw: unknown): KidStory | null {
  const r = raw as Partial<KidStory> | null;
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || typeof r.scenarioId !== 'string') return null;
  const sc = scenarioById(r.scenarioId);
  if (!sc) return null;
  const musicIds = new Set(MUSIC_CHOICES.map((m) => m.id));
  const cast = (Array.isArray(r.cast) ? r.cast : [])
    .filter((c) => c && typeof c.assetId === 'string' && artById(c.assetId)?.kind === 'character')
    .slice(0, MAX_CAST)
    .map((c) => ({ assetId: c.assetId, color: typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : member(c.assetId).color }));
  const scenes = sc.scenes.map((def, i) => {
    const got = Array.isArray(r.scenes) ? r.scenes[i] : undefined;
    return {
      music: got && musicIds.has(got.music ?? null) ? (got.music ?? null) : def.music,
      props: Array.isArray(got?.props) ? got!.props.filter((p) => STICKERS.includes(p)).slice(0, MAX_SCENE_PROPS) : [],
    };
  });
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return { id: r.id, scenarioId: sc.id, cast, scenes, createdAt: num(r.createdAt, 0), updatedAt: num(r.updatedAt, 0), thumb: typeof r.thumb === 'string' ? r.thumb : undefined };
}

// ---------- compiling into a movie ----------

const GROUND_Y = 520;
const FLOAT_Y = 380;
const OFF_LEFT = -240;
const OFF_RIGHT = STAGE_W + 240;
const OFF_TOP = -380;
const OFF_BOTTOM = 1000;

/** Where each of n characters stands. 'wide' keeps the middle free (for a cake, apples...). */
export function slotsX(n: number, layout: 'normal' | 'wide' = 'normal'): number[] {
  if (n <= 0) return [];
  if (layout === 'wide') return [[360], [300, 980], [250, 1030, 420], [220, 1060, 400, 880]][Math.min(n, 4) - 1];
  if (n === 1) return [640];
  return Array.from({ length: n }, (_, i) => 330 + (i * 620) / (n - 1));
}

const charScale = (n: number) => (n <= 2 ? 1.25 : n === 3 ? 1.1 : 1.0);

const applies = (who: Who, i: number) => who === 'all' || (who === 'star' ? i === 0 : i > 0);

/** Builds one character's keyframes, holding still between actions. */
class Track {
  kfs: Keyframe[] = [];
  cur: Pose;
  t: number;
  constructor(t0: number, pose: Pose) {
    this.cur = { ...pose };
    this.t = t0;
    this.kfs.push({ t: t0, ...pose, ease: 'linear' });
  }
  /** Stay put until `t`; `ease` shapes the movement that follows. Returns the (never earlier) time used. */
  hold(t: number, ease: Ease = 'ease'): number {
    const tt = Math.max(t, this.t + 0.02);
    this.kfs.push({ t: tt, ...this.cur, ease });
    this.t = tt;
    return tt;
  }
  to(t: number, patch: Partial<Pose>, ease: Ease = 'linear') {
    const tt = Math.max(t, this.t + 0.02);
    this.cur = { ...this.cur, ...patch };
    this.kfs.push({ t: tt, ...this.cur, ease });
    this.t = tt;
  }
}

interface Overlay {
  start: number;
  end: number;
  x: number;
  y: number;
}

function startingPose(first: Beat | undefined, home: Pose): Pose {
  switch (first?.act) {
    case 'enter-left': return { ...home, x: OFF_LEFT, flip: false };
    case 'enter-right': return { ...home, x: OFF_RIGHT, flip: true };
    case 'enter-top': return { ...home, y: OFF_TOP };
    default: return { ...home };
  }
}

/** Plays the beats for character i; returns its keyframes and any "Zzz" overlays (while asleep). */
function act(beats: Beat[], i: number, n: number, segStart: number, segEnd: number, home: Pose): { kfs: Keyframe[]; zzz: Overlay[] } {
  const mine = beats.filter((b) => applies(b.who, i)).sort((a, b) => a.at - b.at);
  const tr = new Track(segStart, startingPose(mine[0], home));
  const zzz: Overlay[] = [];
  let asleepAt: number | null = null;
  const wakeUp = (t: number) => {
    if (asleepAt !== null) zzz.push({ start: asleepAt, end: t, x: tr.cur.x + 110, y: home.y - 170 });
    asleepAt = null;
  };
  for (const b of mine) {
    const T = segStart + b.at;
    switch (b.act) {
      case 'enter-left': case 'enter-right': case 'enter-top': {
        const t = tr.hold(T);
        tr.to(t + 1.6, { x: home.x, y: home.y, flip: home.flip });
        break;
      }
      case 'exit-left': { const t = tr.hold(T); tr.to(t + 1.6, { x: OFF_LEFT, flip: true }); break; }
      case 'exit-right': { const t = tr.hold(T); tr.to(t + 1.6, { x: OFF_RIGHT, flip: false }); break; }
      case 'exit-up': { const t = tr.hold(T); tr.to(t + 1.5, { y: OFF_TOP }); break; }
      case 'exit-down': { const t = tr.hold(T); tr.to(t + 1.5, { y: OFF_BOTTOM }); break; }
      case 'hop': {
        const base = tr.cur.y;
        for (let k = 0; k < Math.max(1, Math.round(b.dur ?? 1)); k++) {
          const t = tr.hold(T + k * 0.75);
          tr.to(t + 0.3, { y: base - 110 }, 'bounce');
          tr.to(t + 0.72, { y: base });
        }
        break;
      }
      case 'dance': {
        const base = tr.cur.y;
        const r0 = tr.cur.rot;
        const d = b.dur ?? 3;
        const t0 = tr.hold(T);
        const steps = Math.max(2, Math.floor(d / 0.36));
        for (let k = 1; k <= steps; k++) tr.to(t0 + k * 0.36, { rot: r0 + (k % 2 ? -10 : 10), y: base - (k % 2 ? 26 : 0) }, 'ease');
        tr.to(t0 + d + 0.2, { rot: r0, y: base });
        break;
      }
      case 'spin': { const t = tr.hold(T); tr.to(t + 0.9, { rot: tr.cur.rot + 360 }); break; }
      case 'wave': {
        const r0 = tr.cur.rot;
        const t = tr.hold(T);
        [[0.2, -12], [0.45, 12], [0.7, -12], [0.95, 10], [1.2, 0]].forEach(([dt, d]) => tr.to(t + dt, { rot: r0 + d }, 'ease'));
        break;
      }
      case 'stretch': {
        const s0 = tr.cur.scale;
        const r0 = tr.cur.rot;
        const t = tr.hold(T);
        tr.to(t + 0.6, { scale: s0 * 1.12, rot: r0 - 6 }, 'ease');
        tr.to(t + 1.3, { scale: s0, rot: r0 });
        break;
      }
      case 'sleep': {
        const t = tr.hold(T);
        tr.to(t + 0.9, { rot: -14, y: home.y + 28, scale: home.scale * 0.96 });
        asleepAt = t + 0.8;
        break;
      }
      case 'wake': {
        const t = tr.hold(T);
        wakeUp(t);
        tr.to(t + 0.5, { rot: 0, y: home.y, scale: home.scale });
        const h = tr.hold(t + 0.6);
        tr.to(h + 0.3, { y: home.y - 110 }, 'bounce');
        tr.to(h + 0.72, { y: home.y });
        break;
      }
      case 'walk-to': {
        const x = Math.min(STAGE_W - 120, Math.max(120, (b.to ?? 0.5) * STAGE_W + (i - (n - 1) / 2) * 170));
        const t = tr.hold(T);
        tr.to(t + (b.dur ?? 1.6), { x, flip: x < tr.cur.x });
        break;
      }
    }
  }
  wakeUp(segEnd);
  // Never let a movement run past the end of the scene (the object disappears then anyway).
  return { kfs: tr.kfs.filter((k) => k.t <= segEnd + 1e-6), zzz: zzz.filter((z) => z.end > z.start + 0.05) };
}

const SKY_PROPS = new Set(['sun', 'moon', 'cloud', 'star', 'balloon', 'butterfly', 'rainbow', 'rocket', 'heart', 'fish']);
const SKY_SLOTS: [number, number][] = [[170, 150], [1110, 150], [410, 110], [870, 110], [640, 170]];
const GROUND_SLOTS: [number, number][] = [[150, 600], [1130, 600], [380, 640], [900, 640], [640, 650]];
const STICKER_SCALE: Record<string, number> = { rainbow: 1.6, tree: 1.5, house: 1.2, rocket: 0.9, cake: 0.9 };

/** Where her stickers go: a free sky or ground spot, away from the scene's own props and each other. */
export function placeStickers(ids: string[], taken: { x: number; y: number }[]): ScenePropDef[] {
  const used = [...taken];
  return ids.map((id, k) => {
    const slots = SKY_PROPS.has(id) ? SKY_SLOTS : GROUND_SLOTS;
    const [x, y] = slots.find(([sx, sy]) => used.every((u) => Math.hypot(u.x - sx, u.y - sy) > 170)) ?? slots[k % slots.length];
    used.push({ x, y });
    return { id, x, y, scale: STICKER_SCALE[id] ?? (SKY_PROPS.has(id) ? 0.6 : 0.7), at: 0.8 + k * 0.5, move: 'pop' as const, sfx: 'pop' };
  });
}

const propBehavior = (id: string): Behavior => (id === 'sun' || id === 'star' ? 'pulse' : ['balloon', 'butterfly', 'cloud', 'fish'].includes(id) ? 'float' : 'none');

function propObject(def: ScenePropDef, segStart: number, segEnd: number, id: string): SceneObject | null {
  const art = artById(def.id);
  if (!art || art.kind !== 'prop') return null;
  const appear = segStart + (def.at ?? 0);
  const base: Pose = { x: def.x, y: def.y, scale: def.scale ?? 0.8, rot: 0, opacity: 1, flip: false };
  const kf = (t: number, p: Partial<Pose>, ease: Ease = 'linear'): Keyframe => ({ t, ...base, ...p, ease });
  let start = segStart;
  let entrance: Entrance = 'none';
  let keyframes: Keyframe[];
  const turn = def.id === 'rocket' ? 90 : 0; // a flying rocket points the way it goes
  switch (def.move ?? 'none') {
    case 'pop': start = appear; entrance = 'pop'; keyframes = [kf(appear, {})]; break;
    case 'rise': keyframes = [kf(segStart, { y: 820 }), kf(appear, { y: 820 }, 'ease'), kf(appear + (def.dur ?? 2.5), {})]; break;
    // fish art faces left, so swimming right means flipping it
    case 'drift-left': keyframes = [kf(segStart, { x: STAGE_W + 170, rot: -turn }), kf(segEnd, { x: -170, rot: -turn })]; break;
    case 'drift-right': keyframes = [kf(segStart, { x: -170, rot: turn, flip: def.id === 'fish' }), kf(segEnd, { x: STAGE_W + 170, rot: turn, flip: def.id === 'fish' })]; break;
    case 'launch': keyframes = [kf(segStart, {}), kf(appear, {}, 'ease'), kf(appear + 1.6, { y: -420 })]; break;
    default: keyframes = [kf(segStart, {})];
  }
  return {
    id, name: art.label, kind: 'prop', assetId: art.id, color: art.colors[(def.color ?? 0) % art.colors.length],
    start, end: segEnd, keyframes: keyframes.filter((k) => k.t <= segEnd + 1e-6), behavior: def.behavior ?? propBehavior(def.id), entrance,
  };
}

function textObject(id: string, text: string, color: string, start: number, end: number, x: number, y: number, scale: number, behavior: Behavior, entrance: Entrance): SceneObject {
  return { id, name: `Text: ${text.split('\n')[0]}`, kind: 'text', assetId: 'text', color, text, start, end, behavior, entrance, keyframes: [{ t: start, x, y, scale, rot: 0, opacity: 1, flip: false, ease: 'linear' }] };
}

/** Turn her story into a playable Project: title card, scenes, "The End". */
export function compileStory(story: KidStory): Project {
  const sc = scenarioById(story.scenarioId);
  if (!sc) throw new Error(`Unknown scenario ${story.scenarioId}`);
  const cast = story.cast.filter((c) => artById(c.assetId)?.kind === 'character').slice(0, MAX_CAST);
  const n = cast.length;
  const objects: SceneObject[] = [];
  const audio: AudioClip[] = [];
  const backgrounds: BackgroundClip[] = [];
  const sfxAt = new Map<string, true>();
  const sfx = (t: number, id: string | undefined, volume = 0.8) => {
    const p = id ? sfxById(id) : undefined;
    const key = `${t.toFixed(2)}|${id}`;
    if (!p || sfxAt.has(key)) return;
    sfxAt.set(key, true);
    audio.push({ id: `sfx${audio.length}`, kind: 'sfx', start: t, duration: p.seconds, volume, label: p.label, preset: p.id });
  };

  // segment times
  const sceneStarts: number[] = [];
  let t = TITLE_SECONDS;
  for (const s of sc.scenes) {
    sceneStarts.push(t);
    t += s.seconds;
  }
  const endStart = t;
  const total = Math.min(MAX_DURATION, Math.ceil(endStart + END_SECONDS));

  const characters = (segIdx: number, def: Pick<SceneDef, 'layout' | 'floaty'>, beats: Beat[], segStart: number, segEnd: number, stagger = 0) => {
    const xs = slotsX(n, def.layout);
    const y = def.floaty ? FLOAT_Y : GROUND_Y;
    cast.forEach((c, i) => {
      const art = artById(c.assetId)!;
      const home: Pose = { x: xs[i], y, scale: charScale(n), rot: 0, opacity: 1, flip: xs[i] > STAGE_W / 2 };
      const start = segStart + stagger * i;
      const { kfs, zzz } = act(beats, i, n, start, segEnd, home);
      objects.push({
        id: `s${segIdx}c${i}`, name: art.label, kind: 'character', assetId: art.id, color: c.color, start, end: segEnd,
        keyframes: kfs, behavior: def.floaty ? 'float' : 'none', entrance: stagger ? 'pop' : 'none',
        ...(zzz.length ? { asleep: zzz.map((z): [number, number] => [z.start, z.end]) } : {}),
      });
      zzz.forEach((z, k) => objects.push(textObject(`s${segIdx}c${i}z${k}`, 'Zzz', '#cfe9ff', z.start, z.end, z.x, z.y, 0.55, 'float', 'fade')));
    });
  };

  // ---- title card ----
  const first = sc.scenes[0];
  backgrounds.push({ id: 'bg-title', bgId: first.bg, start: 0, end: TITLE_SECONDS, transition: 'cut' });
  objects.push(textObject('title', `${sc.title}${n ? `\nwith ${castNames({ ...story, cast })}` : ''}`, '#ffe066', 0.2, TITLE_SECONDS, STAGE_W / 2, 150, 0.9, 'float', 'pop'));
  characters(0, first, [{ at: 1.8, who: 'all', act: 'wave' }], 0.5, TITLE_SECONDS, 0.3);
  sfx(0.3, 'twinkle', 0.6);

  // ---- scenes ----
  sc.scenes.forEach((def, i) => {
    const segStart = sceneStarts[i];
    const segEnd = segStart + def.seconds;
    const prev = i === 0 ? first.bg : sc.scenes[i - 1].bg;
    backgrounds.push({ id: `bg${i}`, bgId: def.bg, start: segStart, end: segEnd, transition: def.bg === prev ? 'cut' : 'fade' });
    const own = def.props ?? [];
    const stickers = placeStickers(story.scenes[i]?.props ?? [], own);
    [...own, ...stickers].forEach((p, k) => {
      const o = propObject(p, segStart, segEnd, `s${i + 1}p${k}`);
      if (!o) return;
      objects.push(o);
      if (p.sfx) sfx(segStart + (p.at ?? 0), p.sfx, k >= own.length ? 0.5 : 0.8);
    });
    characters(i + 1, def, def.beats, segStart, segEnd);
    def.beats.forEach((b) => { if (cast.some((_, ci) => applies(b.who, ci))) sfx(segStart + b.at, b.sfx); });
  });

  // ---- the end ----
  const last = sc.scenes[sc.scenes.length - 1];
  backgrounds.push({ id: 'bg-end', bgId: last.bg, start: endStart, end: total, transition: 'cut' });
  const endBeats: Beat[] = sc.ending === 'sleep' ? [{ at: 0.3, who: 'all', act: 'sleep' }] : [{ at: 0.5, who: 'all', act: 'hop', dur: 2 }];
  characters(sc.scenes.length + 1, last, endBeats, endStart, total);
  objects.push(textObject('the-end', 'The End', '#ffffff', endStart + 0.2, total, STAGE_W / 2, 150, 1, 'pulse', 'pop'));
  sfx(endStart + 0.4, sc.ending === 'sleep' ? 'twinkle' : 'tada');

  // ---- music: each scene's choice; the first also plays under the title, the last under "The End" ----
  sc.scenes.forEach((_, i) => {
    const id = story.scenes[i]?.music ?? null;
    if (!id) return;
    const start = i === 0 ? 0 : sceneStarts[i];
    const end = i === sc.scenes.length - 1 ? total : sceneStarts[i] + sc.scenes[i].seconds;
    audio.push({ id: `music${i}`, kind: 'music', start, duration: end - start, volume: 0.75, label: musicChoice(id).label, preset: id });
  });

  return { version: 1, title: storyTitle({ ...story, cast }), duration: total, duckMusic: true, objects, backgrounds, audio };
}

// ---------- the shelf (saved in this browser) ----------

const KEY = 'storybox.kidstories';

function readAll(): KidStory[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(normalizeKidStory).filter((s): s is KidStory => !!s) : [];
  } catch {
    return [];
  }
}

function writeAll(list: KidStory[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Newest first. */
export const listKidStories = (): KidStory[] => readAll().sort((a, b) => b.updatedAt - a.updatedAt);
export const getKidStory = (id: string): KidStory | undefined => readAll().find((s) => s.id === id);

/** Insert or update. Returns false if the browser refused (storage full/blocked). */
export function saveKidStory(s: KidStory, now = Date.now()): boolean {
  const others = readAll().filter((x) => x.id !== s.id);
  return writeAll([...others, { ...s, updatedAt: now }]);
}

export function setKidStoryThumb(id: string, thumb: string): void {
  const all = readAll();
  const s = all.find((x) => x.id === id);
  if (!s) return;
  s.thumb = thumb;
  writeAll(all);
}

export const deleteKidStory = (id: string): boolean => writeAll(readAll().filter((s) => s.id !== id));
