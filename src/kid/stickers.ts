// Stickers she can put on the friends she paints. A few are hers from the start; every finished round in Learn
// earns one more, so the two things she likes most feed each other.

export const STICKERS_ALL: { id: string; e: string; label: string }[] = [
  { id: 'crown', e: '👑', label: 'crown' }, { id: 'bow', e: '🎀', label: 'bow' }, { id: 'star', e: '⭐', label: 'star' },
  { id: 'heart', e: '❤️', label: 'heart' },
  // earned in Learn
  { id: 'glasses', e: '🕶️', label: 'sunglasses' }, { id: 'tophat', e: '🎩', label: 'top hat' }, { id: 'flower', e: '🌸', label: 'flower' },
  { id: 'rainbow', e: '🌈', label: 'rainbow' }, { id: 'sparkles', e: '✨', label: 'sparkles' }, { id: 'balloon', e: '🎈', label: 'balloon' },
  { id: 'cherries', e: '🍒', label: 'cherries' }, { id: 'lolly', e: '🍭', label: 'lollipop' }, { id: 'ladybird', e: '🐞', label: 'ladybird' },
  { id: 'gem', e: '💎', label: 'gem' }, { id: 'cupcake', e: '🧁', label: 'cupcake' }, { id: 'clover', e: '🍀', label: 'clover' },
  { id: 'sun', e: '☀️', label: 'sun' }, { id: 'moon', e: '🌙', label: 'moon' }, { id: 'unicorn', e: '🦄', label: 'unicorn' },
  { id: 'medal', e: '🏅', label: 'medal' },
];
export const STARTER_STICKERS = ['crown', 'bow', 'star', 'heart'];
const KEY = 'storybox.stickers';

const valid = (id: unknown): id is string => typeof id === 'string' && STICKERS_ALL.some((s) => s.id === id);

function readEarned(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter(valid) : [];
  } catch {
    return [];
  }
}
function writeEarned(ids: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify([...new Set(ids)])); } catch { /* storage full: the sticker just isn't kept */ }
}

/** Every sticker she has, in a stable order (starters first). */
export function ownedStickers(): typeof STICKERS_ALL {
  const have = new Set([...STARTER_STICKERS, ...readEarned()]);
  return STICKERS_ALL.filter((s) => have.has(s.id));
}
export const earnedStickerIds = (): string[] => readEarned();
export const stickerById = (id: string) => STICKERS_ALL.find((s) => s.id === id);

/** A new sticker for a finished Learn round, or null once she has them all. */
export function earnSticker(rng: () => number = Math.random): (typeof STICKERS_ALL)[number] | null {
  const have = new Set([...STARTER_STICKERS, ...readEarned()]);
  const left = STICKERS_ALL.filter((s) => !have.has(s.id));
  if (!left.length) return null;
  const s = left[Math.floor(rng() * left.length) % left.length];
  writeEarned([...readEarned(), s.id]);
  return s;
}

/** From a backup: keep every sticker either copy has. */
export function mergeStickers(raw: unknown): void {
  if (!Array.isArray(raw)) return;
  writeEarned([...readEarned(), ...raw.filter(valid)]);
}
