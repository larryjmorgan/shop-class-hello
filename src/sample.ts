import type { Keyframe, Project, SceneObject } from './model';

const kf = (t: number, x: number, y: number, scale = 1, rot = 0, ease: Keyframe['ease'] = 'ease', flip = false): Keyframe => ({ t, x, y, scale, rot, opacity: 1, flip, ease });

const obj = (o: Partial<SceneObject> & Pick<SceneObject, 'id' | 'name' | 'kind' | 'assetId' | 'color' | 'start' | 'end' | 'keyframes'>): SceneObject => ({
  behavior: 'none', entrance: 'pop', ...o,
});

export const SAMPLE_PROJECT: Project = {
  version: 1,
  title: "Bunny's Big Day (sample)",
  duration: 30,
  duckMusic: true,
  backgrounds: [
    { id: 'bg1', bgId: 'meadow', start: 0, end: 18, transition: 'cut' },
    { id: 'bg2', bgId: 'party', start: 18, end: 30, transition: 'fade' },
  ],
  objects: [
    obj({ id: 'sun', name: 'Sun', kind: 'prop', assetId: 'sun', color: '#ffd23f', start: 0, end: 18, keyframes: [kf(0, 1130, 120, 0.8)], behavior: 'pulse' }),
    obj({ id: 'cloud', name: 'Cloud', kind: 'prop', assetId: 'cloud', color: '#ffffff', start: 0, end: 18, keyframes: [kf(0, 200, 150, 0.8, 0, 'linear'), kf(18, 800, 190, 0.8)], entrance: 'fade' }),
    obj({ id: 'tree', name: 'Tree', kind: 'prop', assetId: 'tree', color: '#4cc26b', start: 0, end: 18, keyframes: [kf(0, 1090, 440, 1.9)], entrance: 'none' }),
    obj({
      id: 'bunny', name: 'Bunny', kind: 'character', assetId: 'bunny', color: '#f4f0f7', start: 1, end: 30, behavior: 'none',
      keyframes: [kf(1, -150, 500, 1.3, 0), kf(4, 380, 500, 1.3, 0, 'bounce'), kf(12, 380, 500, 1.3, 0, 'ease'), kf(13, 620, 470, 1.3, 8, 'bounce'), kf(18, 640, 500, 1.3, 0, 'ease'), kf(19, 400, 500, 1.3, 0)],
    }),
    obj({
      id: 'bear', name: 'Bear', kind: 'character', assetId: 'bear', color: '#b97a4a', start: 7, end: 30, entrance: 'slide',
      keyframes: [kf(7, 1420, 500, 1.5, 0, 'ease', true), kf(10, 860, 500, 1.5, 0, 'bounce', true), kf(19, 860, 500, 1.5, 0, 'ease', true)],
    }),
    obj({ id: 'balloon', name: 'Balloon', kind: 'prop', assetId: 'balloon', color: '#ff5d73', start: 18, end: 30, keyframes: [kf(18, 220, 330, 1), kf(30, 240, 260, 1)], behavior: 'float' }),
    obj({ id: 'balloon2', name: 'Balloon 2', kind: 'prop', assetId: 'balloon', color: '#5db5ff', start: 18.5, end: 30, keyframes: [kf(18.5, 1050, 340, 1)], behavior: 'float' }),
    obj({
      id: 'title', name: 'Text: Title', kind: 'text', assetId: 'text', color: '#ffe066', text: "Bunny's Big Day", start: 0, end: 4.5,
      keyframes: [kf(0, 640, 250, 1)], behavior: 'float',
    }),
    obj({
      id: 'party', name: 'Text: Party', kind: 'text', assetId: 'text', color: '#ffffff', text: 'Party time!', start: 19, end: 26,
      keyframes: [kf(19, 640, 120, 1)], behavior: 'pulse',
    }),
  ],
  audio: [
    { id: 'm1', kind: 'music', start: 0, duration: 30, volume: 0.8, label: 'Sunny Day', preset: 'sunny' },
    { id: 's1', kind: 'sfx', start: 1.1, duration: 0.8, volume: 0.8, label: 'Whoosh', preset: 'whoosh' },
    { id: 's2', kind: 'sfx', start: 18.1, duration: 1.8, volume: 0.9, label: 'Ta-da!', preset: 'tada' },
    { id: 'v1', kind: 'voice', start: 4.6, duration: 3.6, volume: 1, label: 'Bunny', characterId: 'bunny', provider: 'draft', text: "Hi! I'm Bunny. Today is a very special day!" },
    { id: 'v2', kind: 'voice', start: 10.6, duration: 3.2, volume: 1, label: 'Bear', characterId: 'bear', provider: 'draft', text: 'Hello Bunny! Are you ready for the party?' },
    { id: 'v3', kind: 'voice', start: 14.2, duration: 2.0, volume: 1, label: 'Bunny', characterId: 'bunny', provider: 'draft', text: "Yes! Let's go!" },
  ],
};
