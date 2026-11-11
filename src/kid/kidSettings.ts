// Grown-up settings for the kids' corner: her first name (used in Learn) and a play-time limit with a gentle break.

const NAME_KEY = 'storybox.childname';
const LIMIT_KEY = 'storybox.timelimit';
const USAGE_KEY = 'storybox.playtime';

export const TIME_LIMITS = [0, 10, 15, 20, 30]; // minutes; 0 = no limit
/** After this long away from the app, the play-time count starts again. */
export const REST_RESETS_MS = 60 * 60 * 1000;
/** The little 🌙 shows for the last two minutes. */
export const WARN_MS = 2 * 60 * 1000;

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

// ---------- her name ----------
/** Letters only, first letter capital ("emma" / " EMMA " -> "Emma"), at most 12 letters. */
export function cleanName(raw: string): string {
  const letters = (raw.normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-zA-Z]/g) ?? []).join('').slice(0, 12).toLowerCase();
  return letters ? letters[0].toUpperCase() + letters.slice(1) : '';
}
export const getChildName = (): string => cleanName(get(NAME_KEY) ?? '');
export function setChildName(raw: string): string {
  const n = cleanName(raw);
  set(NAME_KEY, n);
  return n;
}
/** The different lowercase letters in her name ("Anna" -> ["a", "n"]). */
export const nameLetters = (name = getChildName()) => [...new Set(name.toLowerCase())];

// ---------- play-time limit ----------
export function getTimeLimit(): number {
  const n = Number(get(LIMIT_KEY));
  return TIME_LIMITS.includes(n) ? n : 0;
}
export const setTimeLimit = (min: number) => { if (TIME_LIMITS.includes(min)) set(LIMIT_KEY, String(min)); };

export interface Usage { usedMs: number; lastActive: number; extraMs: number }
export function readUsage(): Usage {
  try {
    const u = JSON.parse(get(USAGE_KEY) || '{}');
    return { usedMs: Number(u.usedMs) || 0, lastActive: Number(u.lastActive) || 0, extraMs: Number(u.extraMs) || 0 };
  } catch {
    return { usedMs: 0, lastActive: 0, extraMs: 0 };
  }
}
export const writeUsage = (u: Usage) => set(USAGE_KEY, JSON.stringify(u));

/**
 * Add the time since the last tick. A long gap (the iPad was put away) starts a fresh count, so closing and
 * reopening the app straight away does not.
 */
export function tick(u: Usage, now: number, maxStepMs = 5000): Usage {
  if (!u.lastActive || now - u.lastActive >= REST_RESETS_MS) return { usedMs: 0, lastActive: now, extraMs: 0 };
  const step = Math.max(0, Math.min(now - u.lastActive, maxStepMs)); // a sleeping tab doesn't count as play
  return { ...u, usedMs: u.usedMs + step, lastActive: now };
}
/** 'play' | 'soon' (last two minutes) | 'rest' */
export function breakState(u: Usage, limitMin: number): 'play' | 'soon' | 'rest' {
  if (!limitMin) return 'play';
  const left = limitMin * 60_000 + u.extraMs - u.usedMs;
  return left <= 0 ? 'rest' : left <= WARN_MS ? 'soon' : 'play';
}
/** A grown-up gives ten more minutes, counted from now. */
export const moreTime = (u: Usage, limitMin: number, ms = 10 * 60_000): Usage =>
  ({ ...u, extraMs: Math.max(u.extraMs, u.usedMs - limitMin * 60_000) + ms });
/** A grown-up starts the count again. */
export const resetUsage = (now: number): Usage => ({ usedMs: 0, lastActive: now, extraMs: 0 });
