import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProject } from './model';
import { addAudio, addKeyframeAt, addObject, getState, loadProject, mutate, redo, setAutoKey, setDuration, setTitle, undo, beginGesture } from './store';

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
