// "Learn": short, picture-only activities in the spirit of Montessori materials for ages 3-5 — counting objects and
// matching the numeral (cards and counters), tracing lowercase letters with a finger (sandpaper letters), matching
// colour tablets, fitting shapes into their holes (geometric insets), and first reading: sounding out short words
// letter by letter and matching them to pictures. No failing: a wrong tap just wiggles. Each activity has 3 levels
// that adjust by themselves.

export type Activity = 'count' | 'letters' | 'reading' | 'colours' | 'shapes' | 'match';
export const ACTIVITIES: { id: Activity; icon: string; label: string }[] = [
  { id: 'count', icon: '🔢', label: 'Counting' },
  { id: 'letters', icon: '🔤', label: 'Letters' },
  { id: 'reading', icon: '📖', label: 'Reading' },
  { id: 'colours', icon: '🎨', label: 'Colours' },
  { id: 'shapes', icon: '🔷', label: 'Shapes' },
  { id: 'match', icon: '🃏', label: 'Matching' },
];
/** Tasks in one round (then a little party). */
export const ROUND: Record<Activity, number> = { count: 5, letters: 4, reading: 4, colours: 6, shapes: 3, match: 3 };
export const MAX_LEVEL = 3;

export type Rng = () => number;
const pick = <T,>(a: readonly T[], rng: Rng): T => a[Math.floor(rng() * a.length) % a.length];
export function shuffle<T>(a: readonly T[], rng: Rng = Math.random): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

// ---------- levels (saved per activity) ----------
const KEY = 'storybox.learn';
function readLevels(): Partial<Record<Activity, number>> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export function getLevel(a: Activity): number {
  const n = Number(readLevels()[a]);
  return Number.isInteger(n) && n >= 1 && n <= MAX_LEVEL ? n : 1;
}
export const allLevels = (): Partial<Record<Activity, number>> => Object.fromEntries(ACTIVITIES.map((a) => [a.id, getLevel(a.id)]));
/** From a backup: keep the higher level of each activity. */
export function mergeLevels(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const cur = readLevels();
  const out: Partial<Record<Activity, number>> = { ...cur };
  for (const { id } of ACTIVITIES) {
    const n = Number((raw as Record<string, unknown>)[id]);
    if (Number.isInteger(n) && n >= 1 && n <= MAX_LEVEL) out[id] = Math.max(n, getLevel(id));
  }
  try { localStorage.setItem(KEY, JSON.stringify(out)); } catch { /* ignore */ }
}

/** A round with no wrong taps moves up a level; 3 or more wrong taps moves down. Returns the new level. */
export function recordRound(a: Activity, misses: number): number {
  const cur = getLevel(a);
  const next = misses === 0 ? Math.min(MAX_LEVEL, cur + 1) : misses >= 3 ? Math.max(1, cur - 1) : cur;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readLevels(), [a]: next }));
  } catch {
    /* storage full or blocked: levels just don't stick */
  }
  return next;
}

// ---------- counting ----------
export const COUNT_THINGS = ['🍎', '🐞', '⭐', '🎈', '🐟', '🌸', '🚗', '🦆', '🍓', '🐢'];
export const COUNT_MAX = [3, 5, 10];
export interface CountTask { n: number; thing: string; choices: number[] }
export function countTask(level: number, rng: Rng = Math.random, prevN?: number): CountTask {
  const max = COUNT_MAX[level - 1] ?? 3;
  let n = 1 + Math.floor(rng() * max);
  if (n === prevN && max > 1) n = (n % max) + 1; // not the same number twice in a row
  const others = shuffle(Array.from({ length: max }, (_, i) => i + 1).filter((x) => x !== n), rng).slice(0, 2);
  return { n, thing: pick(COUNT_THINGS, rng), choices: [n, ...others].sort((a, b) => a - b) };
}

// ---------- letters ----------
// Lowercase first, each with a picture of something that starts with its sound (x: something that ends with it).
export const LETTERS: { l: string; pic: string; word: string }[] = [
  { l: 'a', pic: '🍎', word: 'apple' }, { l: 'b', pic: '🐻', word: 'bear' }, { l: 'c', pic: '🐱', word: 'cat' },
  { l: 'd', pic: '🐶', word: 'dog' }, { l: 'e', pic: '🥚', word: 'egg' }, { l: 'f', pic: '🐟', word: 'fish' },
  { l: 'g', pic: '🍇', word: 'grapes' }, { l: 'h', pic: '🎩', word: 'hat' }, { l: 'i', pic: '🦎', word: 'iguana' },
  { l: 'j', pic: '🧃', word: 'juice' }, { l: 'k', pic: '🪁', word: 'kite' }, { l: 'l', pic: '🍋', word: 'lemon' },
  { l: 'm', pic: '🌙', word: 'moon' }, { l: 'n', pic: '👃', word: 'nose' }, { l: 'o', pic: '🐙', word: 'octopus' },
  { l: 'p', pic: '🐷', word: 'pig' }, { l: 'q', pic: '👑', word: 'queen' }, { l: 'r', pic: '🌈', word: 'rainbow' },
  { l: 's', pic: '☀️', word: 'sun' }, { l: 't', pic: '🐢', word: 'turtle' }, { l: 'u', pic: '☂️', word: 'umbrella' },
  { l: 'v', pic: '🎻', word: 'violin' }, { l: 'w', pic: '🍉', word: 'watermelon' }, { l: 'x', pic: '📦', word: 'box' },
  { l: 'y', pic: '🪀', word: 'yo-yo' }, { l: 'z', pic: '🦓', word: 'zebra' },
];
/** How much of the letter must be traced, and how wide her finger paints, per level. */
export const TRACE = [{ cover: 0.55, brush: 34 }, { cover: 0.65, brush: 28 }, { cover: 0.75, brush: 24 }];
export function letterTask(rng: Rng = Math.random, avoid: string[] = []) {
  const pool = LETTERS.filter((x) => !avoid.includes(x.l));
  return pick(pool.length ? pool : LETTERS, rng);
}

// ---------- colours ----------
export const COLOURS: { id: string; hex: string; label: string }[] = [
  { id: 'red', hex: '#e53935', label: 'Red' }, { id: 'yellow', hex: '#fdd835', label: 'Yellow' }, { id: 'blue', hex: '#1e88e5', label: 'Blue' },
  { id: 'green', hex: '#43a047', label: 'Green' }, { id: 'orange', hex: '#fb8c00', label: 'Orange' }, { id: 'purple', hex: '#8e24aa', label: 'Purple' },
  { id: 'pink', hex: '#f48fb1', label: 'Pink' }, { id: 'brown', hex: '#8d6e63', label: 'Brown' }, { id: 'black', hex: '#263238', label: 'Black' },
  { id: 'white', hex: '#fafafa', label: 'White' }, { id: 'grey', hex: '#9e9e9e', label: 'Grey' },
];
export interface Tablet { id: string; hex: string; label: string }
export interface ColourTask { target: Tablet; choices: Tablet[] }
const SHADE_HUES = [{ h: 4, label: 'red' }, { h: 210, label: 'blue' }, { h: 120, label: 'green' }, { h: 280, label: 'purple' }, { h: 32, label: 'orange' }];
export function colourTask(level: number, rng: Rng = Math.random, prevId?: string): ColourTask {
  if (level >= 3) {
    // shades of one colour, light to dark: finding the exact same one takes careful looking
    const hue = pick(SHADE_HUES, rng);
    const shades = [78, 62, 46, 30].map((l, i) => ({ id: `${hue.label}${i}`, hex: `hsl(${hue.h}, 70%, ${l}%)`, label: `${hue.label} shade ${i + 1}` }));
    const target = pick(shades.filter((s) => s.id !== prevId), rng);
    return { target, choices: shuffle(shades, rng) };
  }
  const pool = level === 1 ? COLOURS.slice(0, 3) : COLOURS;
  const target = pick(pool.filter((c) => c.id !== prevId), rng);
  const others = shuffle(pool.filter((c) => c.id !== target.id), rng).slice(0, level === 1 ? 2 : 3);
  return { target, choices: shuffle([target, ...others], rng) };
}

// ---------- shapes ----------
const poly = (n: number, r: number, rot = -Math.PI / 2, inner?: number) => {
  const pts: string[] = [];
  const k = inner ? n * 2 : n;
  for (let i = 0; i < k; i++) {
    const rr = inner && i % 2 ? inner : r;
    const a = rot + (i * 2 * Math.PI) / k;
    pts.push(`${(50 + rr * Math.cos(a)).toFixed(1)} ${(50 + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
};
/** Paths in a 100 x 100 box. */
export const SHAPES: { id: string; label: string; color: string; path: string }[] = [
  { id: 'circle', label: 'Circle', color: '#e53935', path: 'M50 6 A44 44 0 1 1 49.99 6 Z' },
  { id: 'square', label: 'Square', color: '#1e88e5', path: 'M10 10 H90 V90 H10 Z' },
  { id: 'triangle', label: 'Triangle', color: '#43a047', path: 'M50 8 L95 90 H5 Z' },
  { id: 'rectangle', label: 'Rectangle', color: '#fb8c00', path: 'M4 26 H96 V74 H4 Z' },
  { id: 'star', label: 'Star', color: '#fdd835', path: poly(5, 47, -Math.PI / 2, 20) },
  { id: 'heart', label: 'Heart', color: '#ec407a', path: 'M50 90 C22 68 4 52 4 32 C4 16 16 6 30 6 C40 6 47 12 50 20 C53 12 60 6 70 6 C84 6 96 16 96 32 C96 52 78 68 50 90 Z' },
  { id: 'oval', label: 'Oval', color: '#8e24aa', path: 'M50 20 A46 30 0 1 1 49.99 20 Z' },
  { id: 'hexagon', label: 'Hexagon', color: '#00897b', path: poly(6, 46, 0) },
  { id: 'diamond', label: 'Diamond', color: '#5e35b1', path: 'M50 4 L90 50 L50 96 L10 50 Z' },
];
export const SHAPE_COUNT = [3, 4, 5];
export function shapeTask(level: number, rng: Rng = Math.random): string[] {
  const pool = level === 1 ? SHAPES.slice(0, 4) : level === 2 ? SHAPES.slice(0, 6) : SHAPES;
  return shuffle(pool, rng).slice(0, SHAPE_COUNT[level - 1] ?? 3).map((s) => s.id);
}
export const shapeById = (id: string) => SHAPES.find((s) => s.id === id)!;

// ---------- reading ----------
// Short words she can sound out letter by letter (mostly consonant-vowel-consonant), each with a picture.
export const WORDS: { word: string; pic: string }[] = [
  { word: 'cat', pic: '🐱' }, { word: 'dog', pic: '🐶' }, { word: 'sun', pic: '☀️' }, { word: 'pig', pic: '🐷' },
  { word: 'bus', pic: '🚌' }, { word: 'hat', pic: '🎩' }, { word: 'bed', pic: '🛏️' }, { word: 'fox', pic: '🦊' },
  { word: 'hen', pic: '🐔' }, { word: 'bug', pic: '🐛' }, { word: 'box', pic: '📦' }, { word: 'van', pic: '🚐' },
  { word: 'pen', pic: '🖊️' }, { word: 'ant', pic: '🐜' }, { word: 'web', pic: '🕸️' }, { word: 'bat', pic: '🦇' },
  { word: 'rat', pic: '🐀' }, { word: 'nut', pic: '🥜' }, { word: 'egg', pic: '🥚' }, { word: 'cup', pic: '☕' },
  { word: 'log', pic: '🪵' }, { word: 'map', pic: '🗺️' }, { word: 'tub', pic: '🛁' }, { word: 'pan', pic: '🍳' },
  { word: 'leg', pic: '🦵' }, { word: 'kid', pic: '🧒' },
];
/** A second picture for a letter's sound, used when the usual one would give the answer away (c is 🐱 but the word is "cat"). */
const ALT_CUE: Record<string, string> = { c: '🥕', d: '🦆', s: '🧦', p: '🍕', h: '🐴', e: '🐘', x: '🦊' };
/** The picture clue for one letter's sound, never the same picture as the word's answer. */
export function letterCue(l: string, avoidPic: string): string {
  const main = LETTERS.find((x) => x.l === l)?.pic ?? '';
  return main !== avoidPic ? main : ALT_CUE[l] && ALT_CUE[l] !== avoidPic ? ALT_CUE[l] : '';
}
export interface ReadingTask {
  word: string;
  pic: string;
  cues: string[]; // one picture per letter
  /** level 1: just sound it out and see the picture; 2-3: then pick the right picture */
  choices: { word: string; pic: string }[];
  /** when the letter clues show: 1 always, 2 after tapping each letter, 3 never */
  cueMode: 'always' | 'after' | 'never';
}
const similar = (a: string, b: string) => (a.slice(1) === b.slice(1) ? 3 : 0) + (a[0] === b[0] ? 2 : 0) + (a[2] === b[2] ? 1 : 0);
export function readingTask(level: number, rng: Rng = Math.random, avoid: string[] = []): ReadingTask {
  const pool = WORDS.filter((w) => !avoid.includes(w.word));
  const t = pick(pool.length ? pool : WORDS, rng);
  const cues = [...t.word].map((l) => letterCue(l, t.pic));
  if (level <= 1) return { ...t, cues, choices: [], cueMode: 'always' };
  const others = WORDS.filter((w) => w.word !== t.word);
  // level 3: look-alike words (cat / hat / bat), so every letter matters
  const ranked = level >= 3 ? shuffle(others, rng).sort((a, b) => similar(t.word, b.word) - similar(t.word, a.word)) : shuffle(others, rng);
  return { ...t, cues, choices: shuffle([t, ...ranked.slice(0, 2)], rng), cueMode: level >= 3 ? 'never' : 'after' };
}
export const isVowel = (l: string) => 'aeiou'.includes(l);

// ---------- matching (memory pairs) ----------
export const MATCH_PICS = ['🐶', '🐱', '🐰', '🐻', '🦁', '🐸', '🐵', '🐷', '🍎', '🍌', '🍓', '🍉', '🚗', '🚀', '⭐', '🌈'];
export const MATCH_PAIRS = [3, 4, 6];
/** Cards face down; turn two at a time to find the pairs. Returns the pictures in card order. */
export function matchTask(level: number, rng: Rng = Math.random): string[] {
  const n = MATCH_PAIRS[level - 1] ?? 3;
  const faces = shuffle(MATCH_PICS, rng).slice(0, n);
  return shuffle([...faces, ...faces], rng);
}
/** Turning cards that don't match is part of the game; only count misses beyond one per pair. */
export const matchMisses = (mismatches: number, pairs: number) => Math.max(0, mismatches - pairs);
