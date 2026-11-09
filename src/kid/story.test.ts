import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const m = new Map<string, string>();
  const s = { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() };
  (globalThis as unknown as { localStorage: typeof s }).localStorage = s;
  return s;
});

import { CHARACTERS, artById } from '../assets';
import { MAX_DURATION, normalizeProject, samplePose } from '../model';
import { MUSIC_CHOICES, SCENARIOS, STICKERS, scenarioById } from './scenarios';
import {
  MAX_CAST, MAX_SCENE_PROPS, addSceneProp, castNames, compileStory, cycleCastColor, deleteKidStory, getKidStory, listKidStories, newKidStory, nextMusic,
  normalizeKidStory, placeStickers, removeSceneProp, saveKidStory, setSceneMusic, slotsX, storyTitle, toggleCast, type KidStory,
} from './story';

const castOf = (ids: string[], base: KidStory) => ids.reduce((s, id) => toggleCast(s, id), { ...base, cast: [] as KidStory['cast'] });

describe('scenario content is sound', () => {
  it('every scenario uses real backdrops, props, music and characters', () => {
    for (const sc of SCENARIOS) {
      expect(sc.scenes.length).toBeGreaterThanOrEqual(3);
      expect(sc.defaultCast.every((id) => artById(id)?.kind === 'character')).toBe(true);
      for (const s of sc.scenes) {
        expect(MUSIC_CHOICES.some((m) => m.id === s.music)).toBe(true);
        for (const p of s.props ?? []) expect(artById(p.id)?.kind).toBe('prop');
        for (const b of s.beats) expect(b.at).toBeLessThan(s.seconds);
      }
    }
    expect(STICKERS.every((id) => artById(id)?.kind === 'prop')).toBe(true);
  });
});

describe('compileStory', () => {
  for (const sc of SCENARIOS) {
    for (const castSize of [0, 1, 2, 3, 4]) {
      it(`${sc.id} with ${castSize} character(s) makes a valid movie`, () => {
        const ids = CHARACTERS.map((c) => c.id).slice(0, castSize);
        const story = castOf(ids, newKidStory(sc));
        const p = compileStory(story);
        // the Studio can open it unchanged
        const again = normalizeProject(JSON.parse(JSON.stringify(p)))!;
        expect(again).not.toBeNull();
        expect(again.objects).toHaveLength(p.objects.length);
        expect(again.audio).toHaveLength(p.audio.length);
        expect(p.duration).toBeLessThanOrEqual(MAX_DURATION);
        expect(Number.isInteger(p.duration)).toBe(true);
        // no voices anywhere
        expect(p.audio.every((a) => a.kind === 'music' || a.kind === 'sfx')).toBe(true);
        // keyframes strictly in order and inside each object's time
        for (const o of p.objects) {
          expect(o.keyframes.length).toBeGreaterThan(0);
          for (let k = 1; k < o.keyframes.length; k++) expect(o.keyframes[k].t).toBeGreaterThan(o.keyframes[k - 1].t);
          expect(o.start).toBeGreaterThanOrEqual(0);
          expect(o.end).toBeLessThanOrEqual(p.duration + 1e-9);
          expect(o.keyframes[o.keyframes.length - 1].t).toBeLessThanOrEqual(o.end + 1e-6);
        }
        // backgrounds tile the whole story with no gaps or overlaps
        const bgs = [...p.backgrounds].sort((a, b) => a.start - b.start);
        expect(bgs[0].start).toBe(0);
        for (let k = 1; k < bgs.length; k++) expect(bgs[k].start).toBeCloseTo(bgs[k - 1].end, 6);
        expect(bgs[bgs.length - 1].end).toBe(p.duration);
        // every picked character is in the title, every scene and the end
        const segments = sc.scenes.length + 2;
        expect(p.objects.filter((o) => o.kind === 'character')).toHaveLength(castSize * segments);
      });
    }
  }

  it('characters are on stage (visible) at the middle of the scenes where they are not entering/leaving', () => {
    const sc = scenarioById('birthday')!;
    const p = compileStory(castOf(['bunny', 'bear'], newKidStory(sc)));
    // scene 2 (party, index 1) starts with everyone entering from the left; 5s in they must be on stage
    const s2 = p.objects.filter((o) => o.id.startsWith('s2c'));
    expect(s2).toHaveLength(2);
    for (const o of s2) {
      const pose = samplePose(o.keyframes, o.start + 5);
      expect(pose.x).toBeGreaterThan(100);
      expect(pose.x).toBeLessThan(1180);
    }
    // ...and before their entrance they wait off stage, not popping up in the middle
    for (const o of s2) expect(samplePose(o.keyframes, o.start).x).toBeLessThan(0);
  });

  it('the music follows her choice for each scene (and "off" means no music there)', () => {
    const sc = scenarioById('beach')!;
    let s = castOf(['kitty'], newKidStory(sc));
    s = setSceneMusic(s, 0, 'silly');
    s = setSceneMusic(s, 1, null);
    const p = compileStory(s);
    const music = p.audio.filter((a) => a.kind === 'music');
    expect(music.map((m) => m.preset)).toEqual(['silly', sc.scenes[2].music]);
    expect(music[0].start).toBe(0); // first scene's music also plays under the title card
    const last = music[music.length - 1];
    expect(last.start + last.duration).toBe(p.duration); // last scene's music carries on under "The End"
  });

  it('her stickers appear in the scene she added them to, in free spots', () => {
    const sc = scenarioById('picnic')!;
    let s = castOf(['dino'], newKidStory(sc));
    s = addSceneProp(s, 0, 'balloon');
    s = addSceneProp(s, 0, 'cake');
    const p = compileStory(s);
    const scene1 = p.objects.filter((o) => o.id.startsWith('s1p'));
    expect(scene1.map((o) => o.assetId).sort()).toEqual(['balloon', 'cake']);
    const placed = placeStickers(['balloon', 'heart', 'star'], []);
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect(Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y)).toBeGreaterThan(160);
  });

  it('the title names the story and its stars; the bedtime story ends asleep', () => {
    const s = castOf(['bear', 'bunny'], newKidStory(scenarioById('bedtime')!));
    const p = compileStory(s);
    expect(p.objects.find((o) => o.id === 'title')!.text).toContain('Bear & Bunny');
    expect(p.objects.some((o) => o.text === 'The End')).toBe(true);
    expect(p.objects.some((o) => o.text === 'Zzz')).toBe(true);
    // asleep = eyes closed, for exactly as long as the "Zzz" shows
    const sleepers = p.objects.filter((o) => o.kind === 'character' && o.asleep?.length);
    expect(sleepers.length).toBeGreaterThan(0);
    for (const o of sleepers) {
      const zz = p.objects.filter((z) => z.text === 'Zzz' && z.id.startsWith(o.id + 'z'));
      expect(o.asleep!.map(([a, b]) => [a, b])).toEqual(zz.map((z) => [z.start, z.end]));
    }
    expect(storyTitle(s)).toBe('Bedtime with Bear & Bunny');
  });

  it('wide scenes keep the middle free for the cake', () => {
    for (let n = 1; n <= 4; n++) for (const x of slotsX(n, 'wide')) expect(Math.abs(x - 640)).toBeGreaterThan(150);
    expect(slotsX(1)).toEqual([640]);
  });
});

describe('editing a story', () => {
  const base = newKidStory(scenarioById('birthday')!);

  it('starts with the scenario’s friends and music', () => {
    expect(base.cast.map((c) => c.assetId)).toEqual(['bunny', 'bear']);
    expect(base.scenes.map((s) => s.music)).toEqual(scenarioById('birthday')!.scenes.map((s) => s.music));
  });

  it('toggling picks and un-picks characters, up to the maximum, never props', () => {
    let s = toggleCast(base, 'bunny');
    expect(s.cast.map((c) => c.assetId)).toEqual(['bear']);
    s = toggleCast(s, 'kitty'); s = toggleCast(s, 'robot'); s = toggleCast(s, 'dino'); s = toggleCast(s, 'princess');
    expect(s.cast).toHaveLength(MAX_CAST);
    expect(toggleCast(base, 'cake').cast).toEqual(base.cast);
    expect(castNames(toggleCast(toggleCast(base, 'kitty'), 'dino'))).toBe('Bunny, Bear, Kitty & Dino');
  });

  it('colour dot cycles through that character’s colours', () => {
    const c0 = base.cast[0].color;
    const s = cycleCastColor(base, 'bunny');
    expect(s.cast[0].color).not.toBe(c0);
    expect(artById('bunny')!.colors).toContain(s.cast[0].color);
  });

  it('music cycles through every choice and back', () => {
    const seen = new Set<string | null>();
    let m: string | null = null;
    for (let i = 0; i < MUSIC_CHOICES.length; i++) { seen.add(m); m = nextMusic(m); }
    expect(seen.size).toBe(MUSIC_CHOICES.length);
    expect(m).toBeNull();
  });

  it('stickers: only real stickers, at most a few per scene, and removable', () => {
    let s = base;
    for (let i = 0; i < 6; i++) s = addSceneProp(s, 1, 'balloon');
    expect(s.scenes[1].props).toHaveLength(MAX_SCENE_PROPS);
    expect(addSceneProp(base, 1, 'bunny').scenes[1].props).toEqual([]);
    s = removeSceneProp(s, 1, 0);
    expect(s.scenes[1].props).toHaveLength(MAX_SCENE_PROPS - 1);
    expect(s.scenes[0].props).toEqual([]); // other scenes untouched
  });
});

describe('my stories shelf', () => {
  beforeEach(() => fake.clear());

  it('saves, lists newest first, loads and deletes', () => {
    const a = newKidStory(scenarioById('beach')!, 1);
    const b = newKidStory(scenarioById('space')!, 2);
    saveKidStory(a, 100);
    saveKidStory(b, 200);
    expect(listKidStories().map((s) => s.id)).toEqual([b.id, a.id]);
    saveKidStory(setSceneMusic(a, 0, 'silly'), 300); // editing moves it to the front
    expect(listKidStories()[0].id).toBe(a.id);
    expect(getKidStory(a.id)!.scenes[0].music).toBe('silly');
    deleteKidStory(a.id);
    expect(listKidStories().map((s) => s.id)).toEqual([b.id]);
  });

  it('repairs or drops damaged saved stories instead of crashing', () => {
    fake.setItem('storybox.kidstories', JSON.stringify([
      { id: 'ok', scenarioId: 'beach', cast: [{ assetId: 'kitty', color: 'bad' }, { assetId: 'cake' }], scenes: [{ music: 'nope', props: ['balloon', 'bunny'] }] },
      { id: 'gone', scenarioId: 'deleted-scenario' },
      null,
    ]));
    const list = listKidStories();
    expect(list.map((s) => s.id)).toEqual(['ok']);
    expect(list[0].cast).toEqual([{ assetId: 'kitty', color: artById('kitty')!.colors[0] }]);
    expect(list[0].scenes).toHaveLength(scenarioById('beach')!.scenes.length);
    expect(list[0].scenes[0]).toEqual({ music: scenarioById('beach')!.scenes[0].music, props: ['balloon'] });
    expect(normalizeKidStory('x')).toBeNull();
    fake.setItem('storybox.kidstories', '{oops');
    expect(listKidStories()).toEqual([]);
  });
});
