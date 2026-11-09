import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProject } from './model';
import { addAudio, addKeyframeAt, replaceVoiceAudio, addObject, beginGesture, deleteKeyframe, deleteSelectedKeyframe, getState, loadProject, mutate, posePatch, redo, select, setAutoKey, setDuration, setTitle, undo } from './store';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  loadProject(emptyProject());
  setAutoKey(true);
});
afterEach(() => vi.useRealTimers());

describe('undo history', () => {
  it('merges rapid keyed edits (typing a title) into one undo step', () => {
    for (const t of ['M', 'My', 'My s', 'My story']) setTitle(t);
    expect(getState().past).toHaveLength(1);
    undo();
    expect(getState().project.title).toBe('My Story');
  });

  it('starts a new step after a pause, or for un-keyed edits', () => {
    setTitle('a');
    vi.setSystemTime(Date.now() + 5000);
    setTitle('ab');
    expect(getState().past).toHaveLength(2);
    mutate((p) => { p.duckMusic = false; });
    mutate((p) => { p.duckMusic = true; });
    expect(getState().past).toHaveLength(4);
  });

  it('a gesture is one step, and redo survives until a real edit', () => {
    setTitle('x');
    undo();
    expect(getState().future).toHaveLength(1);
    redo();
    expect(getState().project.title).toBe('x');
    beginGesture();
    mutate((p) => { p.title = 'dragged1'; }, false);
    mutate((p) => { p.title = 'dragged2'; }, false);
    expect(getState().past).toHaveLength(2);
  });
});

describe('story length', () => {
  it('shortening removes clips that start after the new end, and undo restores them', () => {
    loadProject({ ...emptyProject(), duration: 60 });
    addAudio({ kind: 'voice', start: 40, duration: 3, volume: 1, label: 'late' });
    addAudio({ kind: 'voice', start: 2, duration: 3, volume: 1, label: 'early' });
    setDuration(30);
    expect(getState().project.audio.map((a) => a.label)).toEqual(['early']);
    undo();
    expect(getState().project.audio).toHaveLength(2);
    expect(getState().project.duration).toBe(60);
  });

  it('clamps to the 3:00 maximum and the 5s minimum', () => {
    setDuration(9999);
    expect(getState().project.duration).toBe(180);
    setDuration(1);
    expect(getState().project.duration).toBe(5);
  });
});

describe('addAudio', () => {
  it('grows the story instead of silently cutting a spoken line short', () => {
    loadProject({ ...emptyProject(), duration: 30 });
    addAudio({ kind: 'voice', start: 28, duration: 5, volume: 1, label: 'v' });
    const p = getState().project;
    expect(p.duration).toBe(33);
    expect(p.audio[0].duration).toBe(5);
  });

  it('still trims music that overruns (music loops to fill, so trimming is expected)', () => {
    loadProject({ ...emptyProject(), duration: 30 });
    addAudio({ kind: 'music', start: 28, duration: 20, volume: 1, label: 'm', preset: 'sunny' });
    const p = getState().project;
    expect(p.duration).toBe(30);
    expect(p.audio[0].duration).toBeCloseTo(2);
  });

  it('never extends past 3:00', () => {
    loadProject({ ...emptyProject(), duration: 175 });
    addAudio({ kind: 'voice', start: 170, duration: 30, volume: 1, label: 'v' });
    expect(getState().project.duration).toBe(180);
  });
});

describe('keyframes', () => {
  it('"Key here" adds a keyframe even when auto-key is off', () => {
    loadProject({ ...emptyProject(), duration: 30 });
    const id = addObject('character', 'bunny', 0)!;
    setAutoKey(false);
    addKeyframeAt(id, 5);
    const o = getState().project.objects.find((x) => x.id === id)!;
    expect(o.keyframes.map((k) => k.t)).toEqual([0, 5]);
    expect(getState().selectedKfT).toBe(5);
  });
});

describe('keyframe deletion', () => {
  const setup = () => {
    loadProject({ ...emptyProject(), duration: 30 });
    const id = addObject('character', 'bunny', 0)!;
    addKeyframeAt(id, 5);
    return id;
  };

  it('Delete removes a real selected keyframe and reports the key press as used', () => {
    const id = setup();
    select({ type: 'object', id }, 5);
    expect(deleteSelectedKeyframe()).toBe(true);
    expect(getState().project.objects[0].keyframes.map((k) => k.t)).toEqual([0]);
    expect(getState().selectedKfT).toBeNull();
  });

  it('a stale selection (keyframe no longer exists) falls through, so Delete can remove the object', () => {
    const id = setup();
    select({ type: 'object', id }, 17.3);
    expect(deleteSelectedKeyframe()).toBe(false);
    expect(getState().selectedKfT).toBeNull();
  });

  it('deleting the only keyframe is a no-op and records no undo step', () => {
    loadProject({ ...emptyProject(), duration: 30 });
    const id = addObject('prop', 'sun', 0)!;
    const before = getState().past.length;
    deleteKeyframe(id, 0);
    expect(getState().project.objects[0].keyframes).toHaveLength(1);
    expect(getState().past.length).toBe(before);
  });

  it('undo clears the keyframe selection', () => {
    const id = setup();
    select({ type: 'object', id }, 5);
    undo();
    expect(getState().selectedKfT).toBeNull();
  });
});

describe('posePatch outside the object bar', () => {
  it('snaps the edit to the nearest edge instead of making a stray early keyframe', () => {
    loadProject({ ...emptyProject(), duration: 30 });
    const id = addObject('character', 'bunny', 10)!;
    posePatch(id, 2, { x: 999 }); // playhead is before the object starts
    const ks = getState().project.objects[0].keyframes;
    expect(ks.map((k) => k.t)).toEqual([10]);
    expect(ks[0].x).toBe(999);
  });
});

describe('music near the end', () => {
  it('makes room instead of silently adding nothing', () => {
    loadProject({ ...emptyProject(), duration: 30 });
    addAudio({ kind: 'music', start: 29.9, duration: 20, volume: 1, label: 'm', preset: 'sunny' });
    const p = getState().project;
    expect(p.audio).toHaveLength(1);
    expect(p.duration).toBeGreaterThanOrEqual(32);
  });
});

describe('replaceVoiceAudio (re-recording a line with your own voice)', () => {
  const setup = () => {
    loadProject({ ...emptyProject(), duration: 30 });
    const id = addAudio({ kind: 'voice', start: 4, duration: 3, volume: 1, label: 'Bunny', text: 'Hello there', characterId: 'bunny-id', provider: 'draft' });
    return id;
  };

  it('keeps the words, speaker and start time, and swaps in the recording', () => {
    const id = setup();
    replaceVoiceAudio(id, { blobKey: 'blob_1', bufferDuration: 2.4, rate: 1 });
    const c = getState().project.audio.find((a) => a.id === id)!;
    expect(c).toMatchObject({ provider: 'mic', blobKey: 'blob_1', text: 'Hello there', characterId: 'bunny-id', start: 4, bufferDuration: 2.4, rate: 1 });
    expect(c.duration).toBeCloseTo(2.4);
    expect(c.voiceId).toBeUndefined();
  });

  it('a squeaky take (rate 1.3) is shorter on the timeline than the raw recording', () => {
    const id = setup();
    replaceVoiceAudio(id, { blobKey: 'b', bufferDuration: 3.9, rate: 1.3 });
    expect(getState().project.audio.find((a) => a.id === id)!.duration).toBeCloseTo(3);
  });

  it('grows the story if the new take runs past the end, and is one undo step', () => {
    loadProject({ ...emptyProject(), duration: 10 });
    const id = addAudio({ kind: 'voice', start: 8, duration: 1, volume: 1, label: 'v', provider: 'draft', text: 't' });
    const before = getState().past.length;
    replaceVoiceAudio(id, { blobKey: 'b', bufferDuration: 5, rate: 1 });
    expect(getState().project.duration).toBe(13);
    expect(getState().past.length).toBe(before + 1);
    undo();
    expect(getState().project.audio[0].provider).toBe('draft');
  });

  it('ignores ids that are not voice lines', () => {
    loadProject({ ...emptyProject(), duration: 30 });
    const id = addAudio({ kind: 'sfx', start: 1, duration: 1, volume: 1, label: 'pop', preset: 'pop' });
    replaceVoiceAudio(id, { blobKey: 'b', bufferDuration: 2, rate: 1 });
    expect(getState().project.audio.find((a) => a.id === id)!.provider).toBeUndefined();
  });
});
