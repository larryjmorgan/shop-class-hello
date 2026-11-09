// Story scenarios for the kids' Story Maker. Each scenario is a few scenes; each scene has a backdrop, default
// music, some props and a little script ("beats") of what the characters do. Scripts refer to roles
// ("star" = first character picked, "friends" = everyone else, "all"), so they work with 1 to 4 characters.

import type { Behavior } from '../model';

export type Who = 'all' | 'star' | 'friends';

export type Act =
  | 'enter-left' | 'enter-right' | 'enter-top'
  | 'exit-left' | 'exit-right' | 'exit-up' | 'exit-down'
  | 'hop' | 'dance' | 'spin' | 'wave' | 'stretch' | 'sleep' | 'wake' | 'walk-to';

export interface Beat {
  /** seconds from the start of the scene */
  at: number;
  who: Who;
  act: Act;
  /** how long (dance), or how many hops (~0.75 s each) */
  dur?: number;
  /** walk-to: where to go, as a fraction of the stage width (0 = left edge, 1 = right edge) */
  to?: number;
  /** a sound effect played once at this moment */
  sfx?: string;
}

export type PropMove = 'none' | 'pop' | 'rise' | 'drift-left' | 'drift-right' | 'launch';

export interface ScenePropDef {
  id: string;
  x: number;
  y: number;
  scale?: number;
  /** which of the prop's colours */
  color?: number;
  /** seconds from the start of the scene when it appears / starts moving */
  at?: number;
  move?: PropMove;
  dur?: number;
  sfx?: string;
  behavior?: Behavior;
}

export interface SceneDef {
  bg: string;
  seconds: number;
  music: string | null;
  /** 'wide' keeps the middle of the stage free (e.g. for a cake) */
  layout?: 'normal' | 'wide';
  /** under the sea / in space: characters bob gently and sit higher */
  floaty?: boolean;
  props?: ScenePropDef[];
  beats: Beat[];
}

export interface Scenario {
  id: string;
  title: string;
  emoji: string;
  /** backdrop shown on the scenario's picture card */
  cardBg: string;
  defaultCast: string[];
  scenes: SceneDef[];
  /** what everyone does on the "The End" card */
  ending: 'hop' | 'sleep';
}

/** Music a child can pick for a scene, in the order the 🎵 button cycles through them. */
export const MUSIC_CHOICES: { id: string | null; icon: string; label: string }[] = [
  { id: null, icon: '🎵', label: 'Music: off' },
  { id: 'sunny', icon: '☀️', label: 'Sunny music' },
  { id: 'silly', icon: '🕺', label: 'Silly dance music' },
  { id: 'adventure', icon: '🗺️', label: 'Adventure music' },
  { id: 'twinkle', icon: '⭐', label: 'Twinkle Twinkle' },
  { id: 'lullaby', icon: '🌙', label: 'Sleepy music' },
];

export const musicChoice = (id: string | null) => MUSIC_CHOICES.find((m) => m.id === id) ?? MUSIC_CHOICES[0];

/** Things a child can add to any scene ("stickers"). */
export const STICKERS = ['balloon', 'heart', 'star', 'flower', 'butterfly', 'cake', 'ball', 'apple', 'sun', 'moon', 'cloud', 'rainbow', 'tree', 'house', 'fish', 'rocket'];

export const SCENARIOS: Scenario[] = [
  {
    id: 'birthday', title: 'Birthday Party', emoji: '🎂', cardBg: 'party', defaultCast: ['bunny', 'bear'], ending: 'hop',
    scenes: [
      {
        bg: 'bedroom', seconds: 9, music: 'sunny',
        beats: [
          { at: 0, who: 'star', act: 'sleep' },
          { at: 2.4, who: 'friends', act: 'enter-right', sfx: 'whoosh' },
          { at: 4.2, who: 'friends', act: 'wave' },
          { at: 4.4, who: 'star', act: 'wake', sfx: 'pop' },
          { at: 5.3, who: 'star', act: 'hop', dur: 2, sfx: 'boing' },
          { at: 7.1, who: 'all', act: 'exit-right', sfx: 'whoosh' },
        ],
      },
      {
        bg: 'party', seconds: 10, music: 'silly',
        props: [
          { id: 'balloon', x: 190, y: 290, behavior: 'float' },
          { id: 'balloon', x: 1090, y: 290, color: 1, behavior: 'float' },
        ],
        beats: [
          { at: 0, who: 'all', act: 'enter-left', sfx: 'whoosh' },
          { at: 2.1, who: 'all', act: 'hop', sfx: 'yay' },
          { at: 3.4, who: 'all', act: 'dance', dur: 3.2 },
          { at: 7.0, who: 'star', act: 'spin', sfx: 'whoosh' },
          { at: 8.2, who: 'friends', act: 'spin' },
        ],
      },
      {
        bg: 'party', seconds: 10, music: 'sunny', layout: 'wide',
        props: [{ id: 'cake', x: 640, y: 500, scale: 1.1, at: 0.8, move: 'pop', sfx: 'tada' }],
        beats: [
          { at: 1.8, who: 'all', act: 'hop', dur: 2, sfx: 'yay' },
          { at: 3.8, who: 'all', act: 'wave' },
          { at: 5.3, who: 'all', act: 'dance', dur: 2.6 },
          { at: 8.3, who: 'all', act: 'hop', sfx: 'boing' },
        ],
      },
    ],
  },
  {
    id: 'beach', title: 'Beach Day', emoji: '🏖️', cardBg: 'beach', defaultCast: ['kitty', 'dino'], ending: 'hop',
    scenes: [
      {
        bg: 'meadow', seconds: 8, music: 'sunny',
        props: [{ id: 'sun', x: 1110, y: 120, scale: 0.8 }],
        beats: [
          { at: 0, who: 'all', act: 'enter-left', sfx: 'whoosh' },
          { at: 2.2, who: 'all', act: 'wave' },
          { at: 3.8, who: 'star', act: 'hop', dur: 2, sfx: 'boing' },
          { at: 6.0, who: 'all', act: 'exit-right', sfx: 'whoosh' },
        ],
      },
      {
        bg: 'beach', seconds: 10, music: 'adventure',
        props: [{ id: 'ball', x: 640, y: 560, scale: 0.6, behavior: 'bounce' }],
        beats: [
          { at: 0, who: 'all', act: 'enter-left', sfx: 'whoosh' },
          { at: 2.2, who: 'all', act: 'hop', sfx: 'splash' },
          { at: 3.6, who: 'all', act: 'dance', dur: 3 },
          { at: 7.2, who: 'star', act: 'spin', sfx: 'whoosh' },
          { at: 8.4, who: 'all', act: 'wave' },
        ],
      },
      {
        bg: 'night', seconds: 9, music: 'lullaby',
        props: [{ id: 'moon', x: 1060, y: 160, scale: 0.9, at: 0.4, move: 'rise', dur: 3 }],
        beats: [
          { at: 3.4, who: 'all', act: 'wave' },
          { at: 5.0, who: 'all', act: 'stretch' },
          { at: 6.6, who: 'all', act: 'sleep', sfx: 'twinkle' },
        ],
      },
    ],
  },
  {
    id: 'bedtime', title: 'Bedtime', emoji: '🌙', cardBg: 'night', defaultCast: ['bear', 'bunny'], ending: 'sleep',
    scenes: [
      {
        bg: 'bedroom', seconds: 9, music: 'twinkle',
        beats: [
          { at: 0, who: 'all', act: 'enter-left', sfx: 'whoosh' },
          { at: 2.2, who: 'all', act: 'stretch' },
          { at: 4.0, who: 'all', act: 'wave' },
          { at: 5.8, who: 'star', act: 'hop', sfx: 'boing' },
          { at: 7.0, who: 'friends', act: 'hop' },
        ],
      },
      {
        bg: 'night', seconds: 9, music: 'twinkle',
        props: [
          { id: 'moon', x: 1060, y: 160, scale: 0.9, at: 0.2, move: 'rise', dur: 2.5 },
          { id: 'star', x: 300, y: 150, scale: 0.5, at: 2.6, move: 'pop', sfx: 'twinkle', behavior: 'pulse' },
          { id: 'star', x: 780, y: 110, scale: 0.4, at: 3.4, move: 'pop', color: 2, behavior: 'pulse' },
        ],
        beats: [
          { at: 4.4, who: 'all', act: 'wave' },
          { at: 6.2, who: 'star', act: 'spin' },
          { at: 7.4, who: 'friends', act: 'spin' },
        ],
      },
      {
        bg: 'bedroom', seconds: 9, music: 'lullaby',
        beats: [
          { at: 1.2, who: 'all', act: 'stretch' },
          { at: 3.2, who: 'all', act: 'sleep', sfx: 'twinkle' },
        ],
      },
    ],
  },
  {
    id: 'space', title: 'Space Trip', emoji: '🚀', cardBg: 'space', defaultCast: ['robot', 'bunny'], ending: 'hop',
    scenes: [
      {
        bg: 'meadow', seconds: 8, music: 'adventure',
        props: [{ id: 'rocket', x: 1090, y: 420, scale: 1.7, at: 5.9, move: 'launch', sfx: 'whoosh' }],
        beats: [
          { at: 0, who: 'all', act: 'enter-left', sfx: 'whoosh' },
          { at: 2.2, who: 'all', act: 'hop', sfx: 'boing' },
          { at: 3.4, who: 'all', act: 'walk-to', to: 0.72, dur: 1.6 },
          { at: 5.9, who: 'all', act: 'exit-up' },
        ],
      },
      {
        bg: 'space', seconds: 10, music: 'twinkle', floaty: true,
        props: [
          { id: 'rocket', x: 0, y: 150, scale: 0.8, move: 'drift-right' },
          { id: 'star', x: 220, y: 140, scale: 0.4, behavior: 'pulse' },
        ],
        beats: [
          { at: 0, who: 'all', act: 'enter-top', sfx: 'whoosh' },
          { at: 2.6, who: 'all', act: 'spin', sfx: 'whoosh' },
          { at: 4.2, who: 'all', act: 'dance', dur: 3 },
          { at: 8.0, who: 'all', act: 'wave' },
        ],
      },
      {
        bg: 'space', seconds: 9, music: 'adventure', floaty: true,
        props: [{ id: 'star', x: 1000, y: 130, scale: 0.5, at: 1, move: 'pop', sfx: 'twinkle', behavior: 'pulse' }],
        beats: [
          { at: 1.6, who: 'all', act: 'wave' },
          { at: 3.4, who: 'star', act: 'spin', sfx: 'whoosh' },
          { at: 4.6, who: 'friends', act: 'spin' },
          { at: 6.4, who: 'all', act: 'exit-right', sfx: 'whoosh' },
        ],
      },
    ],
  },
  {
    id: 'sea', title: 'Under the Sea', emoji: '🐠', cardBg: 'underwater', defaultCast: ['kitty', 'princess'], ending: 'hop',
    scenes: [
      {
        bg: 'beach', seconds: 8, music: 'sunny',
        beats: [
          { at: 0, who: 'all', act: 'enter-left', sfx: 'whoosh' },
          { at: 2.2, who: 'all', act: 'wave' },
          { at: 3.8, who: 'all', act: 'hop', sfx: 'splash' },
          { at: 5.6, who: 'all', act: 'exit-down', sfx: 'splash' },
        ],
      },
      {
        bg: 'underwater', seconds: 10, music: 'lullaby', floaty: true,
        props: [
          { id: 'fish', x: 0, y: 190, scale: 0.6, move: 'drift-left' },
          { id: 'fish', x: 0, y: 290, scale: 0.45, color: 2, move: 'drift-right' },
        ],
        beats: [
          { at: 0, who: 'all', act: 'enter-top', sfx: 'whoosh' },
          { at: 2.8, who: 'all', act: 'dance', dur: 3 },
          { at: 6.4, who: 'star', act: 'spin', sfx: 'whoosh' },
          { at: 7.8, who: 'all', act: 'wave' },
        ],
      },
      {
        bg: 'underwater', seconds: 9, music: 'silly', floaty: true,
        props: [
          { id: 'star', x: 640, y: 610, scale: 0.45, color: 1, at: 1, move: 'pop', sfx: 'twinkle' },
          { id: 'fish', x: 0, y: 150, scale: 0.5, color: 1, move: 'drift-right' },
        ],
        beats: [
          { at: 2.0, who: 'all', act: 'hop', sfx: 'boing' },
          { at: 3.4, who: 'all', act: 'dance', dur: 3 },
          { at: 7.2, who: 'all', act: 'wave' },
        ],
      },
    ],
  },
  {
    id: 'picnic', title: 'Forest Picnic', emoji: '🍎', cardBg: 'forest', defaultCast: ['dino', 'bear'], ending: 'hop',
    scenes: [
      {
        bg: 'forest', seconds: 9, music: 'adventure',
        beats: [
          { at: 0, who: 'all', act: 'enter-left', sfx: 'whoosh' },
          { at: 2.4, who: 'all', act: 'hop', sfx: 'boing' },
          { at: 3.8, who: 'all', act: 'wave' },
          { at: 6.6, who: 'all', act: 'exit-right', sfx: 'whoosh' },
        ],
      },
      {
        bg: 'forest', seconds: 10, music: 'sunny', layout: 'wide',
        props: [
          { id: 'apple', x: 570, y: 610, scale: 0.45, at: 1, move: 'pop', sfx: 'pop' },
          { id: 'apple', x: 710, y: 610, scale: 0.45, color: 2, at: 1.5, move: 'pop' },
          { id: 'butterfly', x: 0, y: 220, scale: 0.55, move: 'drift-right' },
        ],
        beats: [
          { at: 0, who: 'all', act: 'enter-left', sfx: 'whoosh' },
          { at: 2.6, who: 'all', act: 'hop', sfx: 'yay' },
          { at: 4.0, who: 'all', act: 'dance', dur: 3 },
          { at: 7.6, who: 'friends', act: 'spin' },
          { at: 8.6, who: 'star', act: 'wave' },
        ],
      },
      {
        bg: 'meadow', seconds: 9, music: 'sunny',
        props: [{ id: 'rainbow', x: 640, y: 250, scale: 2.4, at: 1, move: 'pop', sfx: 'twinkle' }],
        beats: [
          { at: 2.4, who: 'all', act: 'hop', dur: 2, sfx: 'boing' },
          { at: 4.2, who: 'all', act: 'dance', dur: 3 },
          { at: 7.6, who: 'all', act: 'wave' },
        ],
      },
    ],
  },
];

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id);
