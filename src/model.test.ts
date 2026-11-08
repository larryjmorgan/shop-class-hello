import { describe, expect, it } from 'vitest';
import { applyEase, assignLanes, countDropped, fmtTime, findKeyframeIndex, fitToDuration, emptyProject, normalizeProject, samplePose, upsertKeyframe, type Keyframe } from './model';

const kf = (t: number, x: number, ease: Keyframe['ease'] = 'linear'): Keyframe => ({ t, x, y: 100, scale: 1, rot: 0, opacity: 1, flip: false, ease });

describe('easing', () => {
  it('hits endpoints for every curve', () => {
    for (const e of ['linear', 'ease', 'bounce', 'elastic', 'hold'] as const) {
      expect(applyEase(e, 0)).toBeCloseTo(0, 5);
      expect(applyEase(e, 1)).toBeCloseTo(1, 5);
    }
  });
  it('hold stays at the start value until the next keyframe', () => {
    expect(applyEase('hold', 0.99)).toBe(0);
  });
});

describe('samplePose', () => {
  const ks = [kf(0, 0), kf(10, 100)];
  it('interpolates linearly between keyframes', () => {
    expect(samplePose(ks, 5).x).toBeCloseTo(50);
  });
  it('clamps before the first and after the last keyframe', () => {
    expect(samplePose(ks, -3).x).toBe(0);
    expect(samplePose(ks, 99).x).toBe(100);
  });
  it('uses the easing of the segment start', () => {
    const k2 = [kf(0, 0, 'hold'), kf(10, 100)];
    expect(samplePose(k2, 9).x).toBe(0);
  });
});

describe('upsertKeyframe', () => {
  const pose = { x: 5, y: 5, scale: 1, rot: 0, opacity: 1, flip: false };
  it('adds a sorted keyframe and does not mutate the input', () => {
    const ks = [kf(0, 0), kf(10, 100)];
    const out = upsertKeyframe(ks, 4, pose);
    expect(out.map((k) => k.t)).toEqual([0, 4, 10]);
    expect(ks).toHaveLength(2);
  });
  it('replaces a keyframe that is within a frame of the target time', () => {
    const ks = [kf(0, 0), kf(4, 40)];
    const out = upsertKeyframe(ks, 4.01, pose);
    expect(out).toHaveLength(2);
    expect(out[1].x).toBe(5);
    expect(findKeyframeIndex(out, 4)).toBe(1);
  });
});

describe('assignLanes', () => {
  it('puts overlapping clips on different lanes and reuses free lanes', () => {
    const items = [
      { id: 'a', s: 0, e: 5 },
      { id: 'b', s: 3, e: 6 },
      { id: 'c', s: 5, e: 8 },
    ];
    const { lanes, count } = assignLanes(items, (i) => i.s, (i) => i.e);
    expect(lanes.get('a')).toBe(0);
    expect(lanes.get('b')).toBe(1);
    expect(lanes.get('c')).toBe(0);
    expect(count).toBe(2);
  });
});

describe('fitToDuration', () => {
  it('trims clips that overrun a shortened project', () => {
    const p = emptyProject();
    p.duration = 10;
    p.audio.push({ id: 'x', kind: 'music', start: 8, duration: 20, volume: 1, label: 'm' });
    p.backgrounds.push({ id: 'b', bgId: 'meadow', start: 0, end: 30, transition: 'cut' });
    const out = fitToDuration(p);
    expect(out.audio[0].duration).toBeCloseTo(2);
    expect(out.backgrounds[0].end).toBe(10);
  });

  it('removes clips that start at/after the new end instead of leaving invisible orphans', () => {
    const p = emptyProject();
    p.duration = 10;
    p.audio.push({ id: 'late', kind: 'voice', start: 100, duration: 4, volume: 1, label: 'v' });
    p.audio.push({ id: 'edge', kind: 'voice', start: 9.9, duration: 4, volume: 1, label: 'v' }); // < 0.3s would remain
    p.audio.push({ id: 'ok', kind: 'voice', start: 2, duration: 4, volume: 1, label: 'v' });
    const out = fitToDuration(p);
    expect(out.audio.map((a) => a.id)).toEqual(['ok']);
    expect(countDropped(p, 10)).toBe(2);
    expect(countDropped(p, 180)).toBe(0);
  });
});

describe('normalizeProject', () => {
  it('rejects things that are not StoryBox projects', () => {
    expect(normalizeProject(null)).toBeNull();
    expect(normalizeProject({ version: 2 })).toBeNull();
    expect(normalizeProject('x')).toBeNull();
  });
  it('repairs missing arrays and drops malformed entries instead of crashing later', () => {
    const out = normalizeProject({
      version: 1, duration: 9999,
      objects: [{ id: 'a', start: 0, end: 5, keyframes: [{ t: 0, x: 1, y: 2 }] }, { id: 'bad', start: 0, end: 5, keyframes: [] }, null],
      audio: [{ id: 'm', kind: 'music', start: 0, duration: 4 }, { id: 'weird', kind: 'nope', start: 0, duration: 4 }],
    })!;
    expect(out.duration).toBe(180);
    expect(out.backgrounds).toEqual([]);
    expect(out.objects.map((o) => o.id)).toEqual(['a']);
    expect(out.objects[0].entrance).toBe('pop');
    expect(out.audio.map((a) => a.id)).toEqual(['m']);
    expect(out.audio[0].volume).toBe(1);
  });
});

describe('fmtTime', () => {
  it('never shows 60 seconds', () => {
    expect(fmtTime(59.97)).toBe('1:00.0');
    expect(fmtTime(119.96)).toBe('2:00.0');
    expect(fmtTime(0)).toBe('0:00.0');
    expect(fmtTime(65.25)).toBe('1:05.3'); // rounds to tenths
    expect(fmtTime(-3)).toBe('0:00.0');
  });
});

describe('normalizeProject colours', () => {
  it('replaces anything that is not a #rrggbb colour (it is spliced into SVG markup)', () => {
    const mk = (color: unknown) => normalizeProject({ version: 1, duration: 30, objects: [{ id: 'a', color, start: 0, end: 5, keyframes: [{ t: 0, x: 1, y: 2 }] }] })!.objects[0].color;
    expect(mk('#ff00aa')).toBe('#ff00aa');
    expect(mk('"><script>')).toBe('#ffffff');
    expect(mk(undefined)).toBe('#ffffff');
  });
});
