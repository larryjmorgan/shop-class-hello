// The Puppet Theater's brain: pure logic, no DOM, so it can be unit-tested.
// A child drags characters around a backdrop and taps them to make them react.

import { STAGE_H, STAGE_W, OBJ_BASE, type Behavior, type Project, type SceneObject } from '../model';

export const MAX_ACTORS = 8;
/** The bin in the bottom-right corner (stage coordinates): drop a puppet here to put it away. */
export const TRASH = { x: STAGE_W - 190, y: STAGE_H - 170, w: 190, h: 170 };
const FAR_FUTURE = 1e9;

export type Reaction = 'hop' | 'wiggle' | 'spin' | 'squash';
export const REACTION_SECONDS: Record<Reaction, number> = { hop: 0.8, wiggle: 0.8, spin: 0.9, squash: 0.6 };
export const REACTION_SOUND: Record<Reaction, string> = { hop: 'boing', wiggle: 'twinkle', spin: 'whoosh', squash: 'pop' };
const REACTIONS: Reaction[] = ['hop', 'wiggle', 'spin', 'squash'];

export interface Actor {
  id: string;
  assetId: string;
  kind: 'character' | 'prop';
  color: string;
  x: number;
  y: number;
  scale: number;
  flip: boolean;
  /** theater-clock seconds when it appeared (drives the pop-in) */
  spawnT: number;
  reaction?: { kind: Reaction; t0: number };
  /** set when it was dropped in the bin: shrinks away, then is pruned */
  removingT0?: number;
  /** last time it was being dragged (gives a little walking wobble) */
  lastMoveT: number;
}

export interface Theater {
  backgroundId: string;
  actors: Actor[];
  /** the character whose mouth moves when the child talks (last one touched) */
  speakerId: string | null;
  nextId: number;
}

export const newTheater = (backgroundId = 'meadow'): Theater => ({ backgroundId, actors: [], speakerId: null, nextId: 1 });

const SLOTS_CHAR: [number, number][] = [[300, 500], [560, 520], [820, 500], [1060, 520], [180, 540], [440, 470], [700, 540], [940, 480]];
const SLOTS_PROP: [number, number][] = [[240, 250], [520, 300], [800, 240], [1040, 300], [380, 360], [660, 380], [920, 360], [140, 330]];

/** Where a new puppet appears: the first free spot so friends don't land on top of each other. */
export function freeSlot(t: Theater, kind: 'character' | 'prop'): [number, number] {
  const slots = kind === 'character' ? SLOTS_CHAR : SLOTS_PROP;
  const live = t.actors.filter((a) => a.removingT0 === undefined);
  for (const [x, y] of slots) if (!live.some((a) => Math.hypot(a.x - x, a.y - y) < 130)) return [x, y];
  return slots[live.length % slots.length];
}

/** Add a puppet. Returns null when the stage is full. */
export function addActor(t: Theater, art: { id: string; kind: 'character' | 'prop'; colors: string[] }, now: number, colorIndex = 0): Actor | null {
  if (t.actors.filter((a) => a.removingT0 === undefined).length >= MAX_ACTORS) return null;
  const [x, y] = freeSlot(t, art.kind);
  const a: Actor = {
    id: `a${t.nextId++}`, assetId: art.id, kind: art.kind, color: art.colors[colorIndex % art.colors.length],
    x, y, scale: art.kind === 'character' ? 1.5 : 1.1, flip: false, spawnT: now, lastMoveT: -10,
  };
  t.actors.push(a);
  if (a.kind === 'character') t.speakerId = a.id;
  return a;
}

export function removeActor(t: Theater, id: string, now: number) {
  const a = t.actors.find((x) => x.id === id);
  if (a && a.removingT0 === undefined) a.removingT0 = now;
  if (t.speakerId === id) t.speakerId = [...t.actors].reverse().find((x) => x.kind === 'character' && x.removingT0 === undefined && x.id !== id)?.id ?? null;
}

export const REMOVE_SECONDS = 0.25;
/** Drop puppets whose shrink-away animation has finished. */
export function prune(t: Theater, now: number) {
  t.actors = t.actors.filter((a) => a.removingT0 === undefined || now - a.removingT0 < REMOVE_SECONDS);
}

/** Topmost puppet under the finger. Generous (big fingers): roughly the visible body. */
export function hitActor(t: Theater, x: number, y: number): Actor | undefined {
  for (let i = t.actors.length - 1; i >= 0; i--) {
    const a = t.actors[i];
    if (a.removingT0 !== undefined) continue;
    const r = OBJ_BASE * a.scale * 0.42;
    if (Math.abs(x - a.x) <= r && Math.abs(y - a.y) <= r * 1.05) return a;
  }
  return undefined;
}

/** Move a puppet with the finger, keeping it on stage, and make it face the way it is walking. */
export function moveActor(a: Actor, x: number, y: number, now: number) {
  const nx = Math.min(STAGE_W - 60, Math.max(60, x));
  const ny = Math.min(STAGE_H - 40, Math.max(110, y));
  if (nx - a.x > 6) a.flip = false;
  else if (a.x - nx > 6) a.flip = true;
  a.x = nx;
  a.y = ny;
  a.lastMoveT = now;
}

export const inTrash = (x: number, y: number) => x >= TRASH.x && x <= TRASH.x + TRASH.w && y >= TRASH.y && y <= TRASH.y + TRASH.h;

/** A touch counts as a "tap" (not a drag) if it barely moved and was quick. */
export function isTap(distance: number, ms: number): boolean {
  return distance < 16 && ms < 600;
}

/** Cycle through the reactions so tapping the same friend again does something different. */
export function nextReaction(a: Actor, pick: number): Reaction {
  const last = a.reaction?.kind;
  const options = REACTIONS.filter((r) => r !== last);
  return options[Math.floor(Math.abs(pick) * options.length) % options.length];
}

export function react(a: Actor, kind: Reaction, now: number) {
  a.reaction = { kind, t0: now };
}

/** How the current reaction offsets a puppet at time `now`. All zeros when it has finished. */
export function reactionOffset(a: Actor, now: number): { dy: number; rot: number; scaleMul: number } {
  const r = a.reaction;
  if (!r) return { dy: 0, rot: 0, scaleMul: 1 };
  const p = (now - r.t0) / REACTION_SECONDS[r.kind];
  if (p < 0 || p >= 1) return { dy: 0, rot: 0, scaleMul: 1 };
  const fade = 1 - p;
  switch (r.kind) {
    case 'hop': return { dy: -Math.abs(Math.sin(p * Math.PI * 2)) * 110 * fade, rot: 0, scaleMul: 1 };
    case 'wiggle': return { dy: 0, rot: Math.sin(p * Math.PI * 6) * 16 * fade, scaleMul: 1 };
    case 'spin': return { dy: 0, rot: (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2) * 360, scaleMul: 1 };
    case 'squash': return { dy: 0, rot: 0, scaleMul: 1 + Math.sin(p * Math.PI * 3) * 0.2 * fade };
  }
}

const idle = (a: Actor): Behavior => {
  if (a.assetId === 'sun') return 'pulse';
  if (a.kind === 'character' || a.assetId === 'balloon' || a.assetId === 'butterfly' || a.assetId === 'cloud') return 'float';
  return 'none';
};

/** Turn the live theater into a Project the normal renderer can draw (one pose per puppet, this instant). */
export function toProject(t: Theater, now: number): Project {
  const objects: SceneObject[] = t.actors.map((a) => {
    const o = reactionOffset(a, now);
    const walking = now - a.lastMoveT < 0.15;
    const shrink = a.removingT0 === undefined ? 1 : Math.max(0.001, 1 - (now - a.removingT0) / REMOVE_SECONDS);
    return {
      id: a.id, name: a.assetId, kind: a.kind, assetId: a.assetId, color: a.color,
      start: a.spawnT, end: FAR_FUTURE, behavior: idle(a), entrance: 'pop',
      keyframes: [{
        t: 0, x: a.x, y: a.y + o.dy + (walking ? Math.sin(now * 18) * 7 : 0),
        scale: a.scale * o.scaleMul * shrink, rot: o.rot + (walking ? Math.sin(now * 12) * 4 : 0),
        opacity: 1, flip: a.flip, ease: 'linear',
      }],
    };
  });
  return {
    version: 1, title: 'Theater', duration: FAR_FUTURE, duckMusic: false, objects, audio: [],
    backgrounds: [{ id: 'bg', bgId: t.backgroundId, start: 0, end: FAR_FUTURE, transition: 'cut' }],
  };
}

/** Puppets open their mouths while they react to a tap, so they look alive without any voice. */
export function isReacting(a: Actor, now: number): boolean {
  return !!a.reaction && now - a.reaction.t0 < REACTION_SECONDS[a.reaction.kind];
}
