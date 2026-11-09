// "My own story": the more open path. She builds the story scene by scene: a backdrop, the friends in it, ONE
// action picture per friend, music and stickers, and as many scenes as she likes (1 to 6 = story length).
// It compiles through the same movie builder as the ready-made stories. Pure (no DOM), unit-tested.

import { BACKGROUNDS, artById } from '../assets';
import { uid, type Project } from '../model';
import { MUSIC_CHOICES, STICKERS, type Beat, type SceneDef } from './scenarios';
import { MAX_SCENE_PROPS, TITLE_SECONDS, buildMovie, type CastMember } from './story';

export const MAX_OWN_SCENES = 6;
export const MAX_SCENE_ACTORS = 4;
export const OWN_SCENE_SECONDS = 8;

export type ActionId = 'walk' | 'hop' | 'dance' | 'spin' | 'wave' | 'sleep' | 'fly' | 'run' | 'wiggle' | 'grow';

/** The action pictures she taps. Order = order on screen. */
export const ACTIONS: { id: ActionId; icon: string; label: string; sound?: string }[] = [
  { id: 'walk', icon: '🚶', label: 'Walk in', sound: 'whoosh' },
  { id: 'hop', icon: '🦘', label: 'Hop', sound: 'boing' },
  { id: 'dance', icon: '💃', label: 'Dance', sound: 'yay' },
  { id: 'spin', icon: '🌀', label: 'Spin', sound: 'whoosh' },
  { id: 'wave', icon: '👋', label: 'Wave', sound: 'pop' },
  { id: 'sleep', icon: '😴', label: 'Sleep', sound: 'twinkle' },
  { id: 'fly', icon: '🎈', label: 'Fly', sound: 'twinkle' },
  { id: 'run', icon: '🏃', label: 'Run around', sound: 'whoosh' },
  { id: 'wiggle', icon: '🤪', label: 'Wiggle', sound: 'pop' },
  { id: 'grow', icon: '🦒', label: 'Grow big', sound: 'boing' },
];
export const actionById = (id: ActionId) => ACTIONS.find((a) => a.id === id) ?? ACTIONS[0];

export interface OwnActor extends CastMember {
  action: ActionId;
}

export interface OwnScene {
  bg: string;
  music: string | null;
  actors: OwnActor[];
  props: string[];
}

export interface OwnStory {
  id: string;
  scenes: OwnScene[];
  createdAt: number;
  updatedAt: number;
  thumb?: string;
}

const colorOf = (assetId: string, index = 0) => {
  const colors = artById(assetId)?.colors ?? ['#ffffff'];
  return colors[index % colors.length];
};

export function newOwnStory(now = Date.now()): OwnStory {
  return {
    id: uid('own'), createdAt: now, updatedAt: now,
    scenes: [{ bg: 'meadow', music: 'sunny', actors: [{ assetId: 'bunny', color: colorOf('bunny'), action: 'walk' }], props: [] }],
  };
}

// ---------- editing (all return a new story) ----------

const withScene = (s: OwnStory, i: number, fn: (sc: OwnScene) => OwnScene): OwnStory => ({ ...s, scenes: s.scenes.map((sc, k) => (k === i ? fn(sc) : sc)) });

/** A new scene right after scene `after`: same place and friends (a story continues), each friend starts by hopping. */
export function addScene(s: OwnStory, after: number): { story: OwnStory; index: number } {
  if (s.scenes.length >= MAX_OWN_SCENES) return { story: s, index: after };
  const base = s.scenes[after] ?? s.scenes[s.scenes.length - 1];
  const fresh: OwnScene = { bg: base.bg, music: base.music, actors: base.actors.map((a) => ({ ...a, action: 'hop' as ActionId })), props: [] };
  const scenes = [...s.scenes];
  scenes.splice(after + 1, 0, fresh);
  return { story: { ...s, scenes }, index: after + 1 };
}

export function removeScene(s: OwnStory, i: number): OwnStory {
  if (s.scenes.length <= 1) return s;
  return { ...s, scenes: s.scenes.filter((_, k) => k !== i) };
}

export const setSceneBg = (s: OwnStory, i: number, bg: string): OwnStory => (BACKGROUNDS.some((b) => b.id === bg) ? withScene(s, i, (sc) => ({ ...sc, bg })) : s);
export const setOwnMusic = (s: OwnStory, i: number, music: string | null): OwnStory => withScene(s, i, (sc) => ({ ...sc, music }));

/** Add a friend to a scene. New friends walk in. Returns null-op if the scene is full or it isn't a character. */
export function addActor(s: OwnStory, i: number, assetId: string): OwnStory {
  if (artById(assetId)?.kind !== 'character') return s;
  return withScene(s, i, (sc) => {
    if (sc.actors.length >= MAX_SCENE_ACTORS) return sc;
    const same = sc.actors.filter((a) => a.assetId === assetId).length; // two bunnies get different colours
    return { ...sc, actors: [...sc.actors, { assetId, color: colorOf(assetId, same), action: 'walk' }] };
  });
}

export const removeActor = (s: OwnStory, i: number, a: number): OwnStory => withScene(s, i, (sc) => ({ ...sc, actors: sc.actors.filter((_, k) => k !== a) }));
export const setAction = (s: OwnStory, i: number, a: number, action: ActionId): OwnStory =>
  withScene(s, i, (sc) => ({ ...sc, actors: sc.actors.map((x, k) => (k === a ? { ...x, action } : x)) }));

export function cycleActorColor(s: OwnStory, i: number, a: number): OwnStory {
  return withScene(s, i, (sc) => ({
    ...sc,
    actors: sc.actors.map((x, k) => {
      if (k !== a) return x;
      const colors = artById(x.assetId)?.colors ?? [x.color];
      return { ...x, color: colors[(colors.indexOf(x.color) + 1) % colors.length] };
    }),
  }));
}

export function addOwnProp(s: OwnStory, i: number, propId: string): OwnStory {
  if (!STICKERS.includes(propId)) return s;
  return withScene(s, i, (sc) => (sc.props.length >= MAX_SCENE_PROPS ? sc : { ...sc, props: [...sc.props, propId] }));
}
export const removeOwnProp = (s: OwnStory, i: number, k: number): OwnStory => withScene(s, i, (sc) => ({ ...sc, props: sc.props.filter((_, j) => j !== k) }));

// ---------- turning it into a movie ----------

const FLOATY = new Set(['underwater', 'space']);

/** What one friend does in a scene, as script beats. Friends start a little apart so they don't move in lockstep. */
export function actionBeats(action: ActionId, who: number): Beat[] {
  const d = who * 0.35;
  const sound = actionById(action).sound;
  const b = (at: number, act: Beat['act'], extra: Partial<Beat> = {}): Beat => ({ at: at + d, who, act, ...extra });
  switch (action) {
    case 'walk': return [b(0, 'enter-left', { sfx: sound }), b(3.6, 'wave')];
    case 'hop': return [b(0.8, 'hop', { dur: 2, sfx: sound }), b(4.2, 'hop', { dur: 2 })];
    case 'dance': return [b(0.6, 'dance', { dur: 5.5, sfx: sound })];
    case 'spin': return [b(1, 'spin', { sfx: sound }), b(3.4, 'spin'), b(5.6, 'spin')];
    case 'wave': return [b(0.8, 'wave', { sfx: sound }), b(3.2, 'wave'), b(5.6, 'wave')];
    case 'sleep': return [b(0.6, 'stretch'), b(2.4, 'sleep', { sfx: sound })];
    case 'fly': return [b(0.6, 'fly', { dur: 3, sfx: sound })];
    case 'run': return [b(1, 'run', { sfx: sound }), b(4.2, 'run')];
    case 'wiggle': return [b(1, 'shake', { sfx: sound }), b(3.4, 'shake'), b(5.6, 'shake')];
    case 'grow': return [b(1, 'grow', { sfx: sound }), b(4.4, 'grow')];
  }
}

export function ownSceneDef(sc: OwnScene): SceneDef {
  return {
    bg: sc.bg, seconds: OWN_SCENE_SECONDS, music: sc.music, floaty: FLOATY.has(sc.bg),
    beats: sc.actors.slice(0, MAX_SCENE_ACTORS).flatMap((a, i) => actionBeats(a.action, i)),
  };
}

/** Everyone who appears anywhere in the story (first 4), for the title card and "The End". */
export function ownCast(s: OwnStory): CastMember[] {
  const seen = new Map<string, CastMember>();
  for (const sc of s.scenes) for (const a of sc.actors) if (!seen.has(a.assetId)) seen.set(a.assetId, { assetId: a.assetId, color: a.color });
  return [...seen.values()].slice(0, MAX_SCENE_ACTORS);
}

export function ownNames(s: OwnStory): string {
  const names = ownCast(s).map((c) => artById(c.assetId)?.label ?? c.assetId);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export const ownTitle = (s: OwnStory) => `My Story${ownCast(s).length ? ` with ${ownNames(s)}` : ''}`;

/** When scene i starts in the movie (after the title card). */
export const ownSceneStart = (i: number) => TITLE_SECONDS + i * OWN_SCENE_SECONDS;

export function compileOwnStory(s: OwnStory): Project {
  const cast = ownCast(s);
  return buildMovie({
    title: ownTitle(s),
    heading: `My Story${cast.length ? `\nwith ${ownNames(s)}` : ''}`,
    titleCast: cast,
    ending: 'hop',
    scenes: s.scenes.slice(0, MAX_OWN_SCENES).map((sc) => ({ def: ownSceneDef(sc), cast: sc.actors, music: sc.music, stickers: sc.props })),
  });
}

// ---------- saved in this browser ----------

const KEY = 'storybox.ownstories';
const ACTION_IDS = new Set(ACTIONS.map((a) => a.id));
const MUSIC_IDS = new Set(MUSIC_CHOICES.map((m) => m.id));

export function normalizeOwnStory(raw: unknown): OwnStory | null {
  const r = raw as Partial<OwnStory> | null;
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !Array.isArray(r.scenes)) return null;
  const scenes: OwnScene[] = r.scenes.slice(0, MAX_OWN_SCENES).filter((x) => x && typeof x === 'object').map((x) => ({
    bg: BACKGROUNDS.some((b) => b.id === x.bg) ? x.bg : 'meadow',
    music: MUSIC_IDS.has(x.music ?? null) ? (x.music ?? null) : null,
    actors: (Array.isArray(x.actors) ? x.actors : [])
      .filter((a) => a && artById(a.assetId)?.kind === 'character')
      .slice(0, MAX_SCENE_ACTORS)
      .map((a) => ({ assetId: a.assetId, color: /^#[0-9a-f]{6}$/i.test(String(a.color)) ? a.color : colorOf(a.assetId), action: ACTION_IDS.has(a.action) ? a.action : 'walk' })),
    props: Array.isArray(x.props) ? x.props.filter((p) => STICKERS.includes(p)).slice(0, MAX_SCENE_PROPS) : [],
  }));
  if (!scenes.length) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return { id: r.id, scenes, createdAt: num(r.createdAt), updatedAt: num(r.updatedAt), thumb: typeof r.thumb === 'string' ? r.thumb : undefined };
}

function readAll(): OwnStory[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(normalizeOwnStory).filter((s): s is OwnStory => !!s) : [];
  } catch {
    return [];
  }
}

function writeAll(list: OwnStory[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export const listOwnStories = (): OwnStory[] => readAll().sort((a, b) => b.updatedAt - a.updatedAt);
export const getOwnStory = (id: string) => readAll().find((s) => s.id === id);
export function saveOwnStory(s: OwnStory, now = Date.now()): boolean {
  const all = readAll();
  const old = all.find((x) => x.id === s.id);
  // keep the shelf picture if this copy doesn't carry one (it is refreshed shortly after each change)
  return writeAll([...all.filter((x) => x.id !== s.id), { ...s, thumb: s.thumb ?? old?.thumb, updatedAt: now }]);
}
export function setOwnThumb(id: string, thumb: string) {
  const all = readAll();
  const s = all.find((x) => x.id === id);
  if (s) { s.thumb = thumb; writeAll(all); }
}
export const deleteOwnStory = (id: string): boolean => writeAll(readAll().filter((s) => s.id !== id));
