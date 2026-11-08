import { describe, expect, it } from 'vitest';
import { applyEase, assignLanes, findKeyframeIndex, fitToDuration, emptyProject, samplePose, upsertKeyframe, type Keyframe } from './model';

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
});
