import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const m = new Map<string, string>();
  const s = { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() };
  (globalThis as unknown as { localStorage: typeof s }).localStorage = s;
  return s;
});

import { CHARACTERS, artById } from '../assets';
import { normalizeProject, samplePose } from '../model';
import {
  ACTIONS, MAX_OWN_SCENES, MAX_SCENE_ACTORS, OWN_SCENE_SECONDS, addActor, addOwnProp, addScene, compileOwnStory, cycleActorColor,
  deleteOwnStory, getOwnStory, listOwnStories, newOwnStory, normalizeOwnStory, ownSceneStart, ownTitle, removeActor, removeScene, saveOwnStory,
  setAction, setOwnMusic, setSceneBg, type OwnStory,
} from './own';
import { END_SECONDS, TITLE_SECONDS } from './story';

const withFriends = (ids: string[]) => ids.reduce((s, id) => addActor(s, 0, id), { ...newOwnStory(), scenes: [{ ...newOwnStory().scenes[0], actors: [] }] } as OwnStory);

describe('there are more characters now', () => {
  it('nine friends, all real characters', () => {
    expect(CHARACTERS.map((c) => c.id)).toEqual(['bunny', 'bear', 'kitty', 'robot', 'dino', 'princess', 'puppy', 'unicorn', 'penguin']);
  });
});

describe('every action, for every friend position, makes a sound movie', () => {
  for (const a of ACTIONS) {
    it(`${a.label}`, () => {
      let s = withFriends(['bunny', 'bear', 'kitty', 'unicorn']);
      for (let k = 0; k < 4; k++) s = setAction(s, 0, k, a.id);
      const p = compileOwnStory(s);
      expect(normalizeProject(JSON.parse(JSON.stringify(p)))).not.toBeNull();
      const scene = p.objects.filter((o) => /^s1c\d$/.test(o.id));
      expect(scene).toHaveLength(4);
      for (const o of scene) {
        for (let k = 1; k < o.keyframes.length; k++) expect(o.keyframes[k].t).toBeGreaterThan(o.keyframes[k - 1].t);
        // the action really moves (or resizes) the friend at some point during the scene
        const poses = Array.from({ length: 80 }, (_, k) => samplePose(o.keyframes, o.start + (k / 80) * OWN_SCENE_SECONDS));
        const change = (q: (typeof poses)[0]) => Math.abs(q.x - poses[0].x) + Math.abs(q.y - poses[0].y) + Math.abs(q.rot - poses[0].rot) + 100 * Math.abs(q.scale - poses[0].scale);
        expect(poses.some((q) => change(q) > 1)).toBe(true);
        // ...and FINISHES before the scene ends (nothing is cut off mid-move): back at rest at the end
        if (a.id !== 'walk' && a.id !== 'sleep') {
          const endPose = samplePose(o.keyframes, o.end - 0.01);
          const restX = samplePose(o.keyframes, o.start + 0.01);
          const settled = samplePose(o.keyframes, o.end - 0.3);
          expect(Math.abs(endPose.x - restX.x)).toBeLessThan(1);
          expect(Math.abs(endPose.scale - restX.scale)).toBeLessThan(0.01);
          expect(Math.abs((((endPose.rot % 360) + 360) % 360) - (((restX.rot % 360) + 360) % 360))).toBeLessThan(1);
          expect(Math.abs(endPose.y - settled.y)).toBeLessThan(1); // not mid-hop at the cut
        }
      }
    });
  }

  it('“walk in” starts off stage and ends on stage; “sleep” closes the eyes', () => {
    let s = withFriends(['puppy', 'penguin']);
    s = setAction(s, 0, 1, 'sleep');
    const p = compileOwnStory(s);
    const walker = p.objects.find((o) => o.id === 's1c0')!;
    expect(samplePose(walker.keyframes, walker.start).x).toBeLessThan(0);
    expect(samplePose(walker.keyframes, walker.start + 3).x).toBeGreaterThan(100);
    expect(p.objects.find((o) => o.id === 's1c1')!.asleep?.length).toBeGreaterThan(0);
  });
});

describe('story length = number of scenes', () => {
  it('each scene adds the same amount of time', () => {
    let s = withFriends(['bunny']);
    const d1 = compileOwnStory(s).duration;
    s = addScene(s, 0).story;
    s = addScene(s, 1).story;
    expect(s.scenes).toHaveLength(3);
    const d3 = compileOwnStory(s).duration;
    expect(d3 - d1).toBe(2 * OWN_SCENE_SECONDS);
    expect(d1).toBe(TITLE_SECONDS + OWN_SCENE_SECONDS + END_SECONDS);
    expect(ownSceneStart(2)).toBe(TITLE_SECONDS + 2 * OWN_SCENE_SECONDS);
  });

  it('a new scene continues the story (same place and friends) right after the current one, up to the maximum', () => {
    let s = setSceneBg(withFriends(['bear', 'dino']), 0, 'beach');
    const r = addScene(s, 0);
    expect(r.index).toBe(1);
    expect(r.story.scenes[1].bg).toBe('beach');
    expect(r.story.scenes[1].actors.map((a) => a.assetId)).toEqual(['bear', 'dino']);
    s = r.story;
    for (let k = 0; k < 10; k++) s = addScene(s, 0).story;
    expect(s.scenes).toHaveLength(MAX_OWN_SCENES);
  });

  it('removing scenes never leaves a story with no scenes', () => {
    let s = addScene(withFriends(['bunny']), 0).story;
    s = removeScene(s, 0);
    expect(s.scenes).toHaveLength(1);
    expect(removeScene(s, 0).scenes).toHaveLength(1);
  });
});

describe('editing a scene', () => {
  it('friends: up to 4 per scene, only characters, two of the same get different colours', () => {
    let s = withFriends(['bunny', 'bunny']);
    expect(s.scenes[0].actors[0].color).not.toBe(s.scenes[0].actors[1].color);
    s = addActor(s, 0, 'cake');
    expect(s.scenes[0].actors).toHaveLength(2);
    for (let k = 0; k < 5; k++) s = addActor(s, 0, 'puppy');
    expect(s.scenes[0].actors).toHaveLength(MAX_SCENE_ACTORS);
    s = removeActor(s, 0, 0);
    expect(s.scenes[0].actors).toHaveLength(MAX_SCENE_ACTORS - 1);
  });

  it('colour, backdrop, music and stickers', () => {
    let s = withFriends(['unicorn']);
    const c0 = s.scenes[0].actors[0].color;
    s = cycleActorColor(s, 0, 0);
    expect(s.scenes[0].actors[0].color).not.toBe(c0);
    expect(artById('unicorn')!.colors).toContain(s.scenes[0].actors[0].color);
    expect(setSceneBg(s, 0, 'not-a-place').scenes[0].bg).toBe(s.scenes[0].bg);
    s = setSceneBg(setOwnMusic(s, 0, 'twinkle'), 0, 'space');
    for (let k = 0; k < 5; k++) s = addOwnProp(s, 0, 'rocket');
    const p = compileOwnStory(s);
    expect(p.audio.filter((a) => a.kind === 'music').map((a) => a.preset)).toEqual(['twinkle']);
    expect(p.objects.filter((o) => o.id.startsWith('s1p'))).toHaveLength(3);
    expect(p.backgrounds.find((b) => b.id === 'bg0')!.bgId).toBe('space');
  });

  it('a scene with no friends still works (just the place, music and stickers)', () => {
    const s = removeActor(withFriends(['bunny']), 0, 0);
    expect(() => compileOwnStory(s)).not.toThrow();
    expect(ownTitle(s)).toBe('My Story');
  });

  it('the title names everyone in the story', () => {
    let s = withFriends(['puppy', 'penguin']);
    s = addScene(s, 0).story;
    s = addActor(s, 1, 'unicorn');
    expect(ownTitle(s)).toBe('My Story with Puppy, Penguin & Unicorn');
  });
});

describe('saved stories', () => {
  beforeEach(() => fake.clear());

  it('save, list newest first, load, delete', () => {
    const a = newOwnStory(1);
    const b = newOwnStory(2);
    saveOwnStory(a, 10);
    saveOwnStory(b, 20);
    expect(listOwnStories().map((s) => s.id)).toEqual([b.id, a.id]);
    expect(getOwnStory(a.id)!.scenes).toHaveLength(1);
    deleteOwnStory(b.id);
    expect(listOwnStories().map((s) => s.id)).toEqual([a.id]);
  });

  it('repairs damaged saves', () => {
    fake.setItem('storybox.ownstories', JSON.stringify([
      { id: 'x', scenes: [{ bg: 'nowhere', music: 'nope', actors: [{ assetId: 'cake' }, { assetId: 'puppy', color: 'bad', action: 'teleport' }], props: ['heart', 'bunny'] }] },
      { id: 'empty', scenes: [] },
      'junk',
    ]));
    const [s] = listOwnStories();
    expect(listOwnStories()).toHaveLength(1);
    expect(s.scenes[0]).toEqual({ bg: 'meadow', music: null, actors: [{ assetId: 'puppy', color: artById('puppy')!.colors[0], action: 'walk' }], props: ['heart'] });
    expect(normalizeOwnStory(null)).toBeNull();
  });
});
