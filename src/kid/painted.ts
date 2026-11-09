// Friends she painted herself. Each one is a built-in character plus a layer of her paint (a PNG, already trimmed
// to the character's shape). The paint is multiplied over a white copy of the character, so the eyes, mouth and
// outlines stay visible and the painted friend still blinks and talks like the others.
import { CHARACTERS, registerArt, unregisterArt, type ArtAsset } from '../assets';

export const MAX_PAINTED = 20;
export const PAINT_SIZE = 400; // paint layer resolution (the character art is 200 x 200)
const KEY = 'storybox.painted';
const PNG_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/; // it goes inside an SVG attribute, so nothing else

export interface PaintedFriend {
  id: string; // "paint-<baseId>-<random>"
  baseId: string;
  paint: string; // data:image/png
  createdAt: number;
  updatedAt: number;
}

/** The white "colouring page" version of a character. */
export const blankSvg = (base: ArtAsset, face = { mouthOpen: false, blink: false }) => base.svg('#ffffff', face);

export function paintedAsset(p: PaintedFriend): ArtAsset | null {
  const base = CHARACTERS.find((c) => c.id === p.baseId);
  if (!base) return null;
  return {
    id: p.id,
    label: base.label,
    emoji: '🎨',
    kind: 'character',
    colors: ['#ffffff'],
    svg: (_c, face) =>
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 200">` +
      blankSvg(base, face).replace(/^<svg[^>]*>|<\/svg>$/g, '') +
      `<image x="0" y="0" width="200" height="200" href="${p.paint}" xlink:href="${p.paint}" style="mix-blend-mode:multiply"/></svg>`,
  };
}

export const isPainted = (id: string) => id.startsWith('paint-');
/** For screen readers / tests: "painted Bunny" vs "Bunny". */
export const friendLabel = (a: ArtAsset) => (isPainted(a.id) ? `painted ${a.label}` : a.label);

function readAll(): PaintedFriend[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (p): p is PaintedFriend =>
        !!p && typeof p.id === 'string' && isPainted(p.id) && typeof p.paint === 'string' && PNG_URL.test(p.paint) &&
        CHARACTERS.some((c) => c.id === p.baseId) && p.id.split('-')[1] === p.baseId,
    ).map((p) => ({ ...p, createdAt: Number(p.createdAt) || 0, updatedAt: Number(p.updatedAt) || 0 }));
  } catch {
    return [];
  }
}

function writeAll(list: PaintedFriend[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Oldest first (so the newest is registered last and listed first by allCharacters()). */
export const listPainted = (): PaintedFriend[] => readAll().sort((a, b) => a.createdAt - b.createdAt);
export const getPainted = (id: string) => readAll().find((p) => p.id === id);

export function newPaintedId(baseId: string): string {
  return `paint-${baseId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Save (new or painted again) and make it available everywhere. False if the device storage is full. */
export function savePainted(p: Omit<PaintedFriend, 'createdAt' | 'updatedAt'> & { createdAt?: number }, now = Date.now()): boolean {
  const all = readAll();
  const old = all.find((x) => x.id === p.id);
  if (!PNG_URL.test(p.paint) || (!old && all.length >= MAX_PAINTED)) return false;
  const rec: PaintedFriend = { ...p, createdAt: old?.createdAt ?? p.createdAt ?? now, updatedAt: now };
  if (!writeAll([...all.filter((x) => x.id !== p.id), rec])) return false;
  const a = paintedAsset(rec);
  if (a) registerArt(a);
  return true;
}

export function deletePainted(id: string): boolean {
  unregisterArt(id);
  return writeAll(readAll().filter((p) => p.id !== id));
}

/** Make every saved painted friend available to the stories, the Studio and the renderer. */
export function loadPaintedFriends(): void {
  for (const p of listPainted()) {
    const a = paintedAsset(p);
    if (a) registerArt(a);
  }
}
loadPaintedFriends();
