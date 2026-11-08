import { artById, bgById } from './assets';
import {
  OBJ_BASE, STAGE_H, STAGE_W, activeAt, blinkAt, easeOutBack, hashSeed, mouthOpenAt, samplePose, speakingClip,
  type Pose, type Project, type SceneObject,
} from './model';

// ---------- SVG image cache ----------

const imageCache = new Map<string, HTMLImageElement>();
const loading = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

export function onImageLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function variantKey(assetId: string, color: string, mouth: boolean, blink: boolean) {
  return `${assetId}|${color}|${mouth ? 1 : 0}${blink ? 1 : 0}`;
}

function requestImage(assetId: string, color: string, mouth: boolean, blink: boolean): HTMLImageElement | null {
  const key = variantKey(assetId, color, mouth, blink);
  const hit = imageCache.get(key);
  if (hit && hit.complete && hit.naturalWidth > 0) return hit;
  if (!loading.has(key)) {
    const art = artById(assetId);
    if (!art) return null;
    const img = new Image();
    imageCache.set(key, img);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art.svg(color, { mouthOpen: mouth, blink }))}`;
    loading.set(
      key,
      img.decode().then(
        () => listeners.forEach((l) => l()),
        () => {
          imageCache.delete(key);
        },
      ),
    );
  }
  return null;
}

/** Make sure every face variant of every art piece used in the project is decoded (needed before exporting). */
export async function preloadProject(p: Project): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const o of p.objects) {
    if (o.kind === 'text') continue;
    const variants = o.kind === 'character' ? [[false, false], [true, false], [false, true], [true, true]] : [[false, false]];
    for (const [m, b] of variants) {
      requestImage(o.assetId, o.color, m, b);
      const p2 = loading.get(variantKey(o.assetId, o.color, m, b));
      if (p2) jobs.push(p2);
    }
  }
  await Promise.all(jobs);
}

// ---------- pose with idle behaviours / entrance ----------

/**
 * `settle`: while editing (paused), treat the very first instant of an object as fully arrived,
 * otherwise a freshly added "pop in" object has scale 0 and can't be seen or grabbed.
 */
export function objectPoseAt(o: SceneObject, t: number, settle = false): Pose {
  const pose = samplePose(o.keyframes, t);
  const a = t - o.start;
  switch (o.behavior) {
    case 'wiggle': pose.rot += Math.sin(a * 9) * 7; break;
    case 'bounce': pose.y -= Math.abs(Math.sin(a * 5)) * 38; break;
    case 'float': pose.y += Math.sin(a * 2) * 16; pose.rot += Math.sin(a * 1.3) * 3; break;
    case 'spin': pose.rot += a * 120; break;
    case 'pulse': pose.scale *= 1 + Math.sin(a * 6) * 0.07; break;
    default: break;
  }
  const p = Math.min(1, Math.max(0, a / 0.45));
  if (p < 1 && !(settle && a < 0.06)) {
    if (o.entrance === 'pop') pose.scale *= Math.max(0.001, easeOutBack(p));
    else if (o.entrance === 'fade') pose.opacity *= p;
    else if (o.entrance === 'slide') pose.x -= (1 - easeOutBack(p)) * 420;
  }
  return pose;
}

const TEXT_MAX_W = 1160; // keep long captions inside the 1280px stage

/** Lines, and the shrink factor that makes them fit the stage width (1 = no shrink). */
function textLayout(ctx: CanvasRenderingContext2D, o: SceneObject) {
  ctx.save();
  ctx.font = textFont(o);
  const lines = (o.text ?? '').split('\n');
  const raw = Math.max(40, ...lines.map((l) => ctx.measureText(l).width));
  ctx.restore();
  return { lines, raw, fit: Math.min(1, TEXT_MAX_W / (raw + 24)) };
}

export function textMetrics(ctx: CanvasRenderingContext2D, o: SceneObject): { w: number; h: number } {
  const { lines, raw, fit } = textLayout(ctx, o);
  return { w: (raw + 24) * fit, h: (lines.length * TEXT_SIZE * 1.15 + 16) * fit };
}

export const TEXT_SIZE = 96;
const textFont = (_o: SceneObject) => `800 ${TEXT_SIZE}px "Baloo 2", "Arial Rounded MT Bold", "Chalkboard SE", "Comic Sans MS", ui-rounded, system-ui, sans-serif`;

// ---------- frame rendering ----------

let measureCtx: CanvasRenderingContext2D | null = null;
export function measureObject(o: SceneObject): { w: number; h: number } {
  if (o.kind === 'text') {
    measureCtx ??= document.createElement('canvas').getContext('2d')!;
    return textMetrics(measureCtx, o);
  }
  return { w: OBJ_BASE, h: OBJ_BASE };
}

export function renderFrame(ctx: CanvasRenderingContext2D, p: Project, time: number, settle = false): void {
  // Clips are active on [start, end), so exactly at the end of the story nothing is "on" and the frame
  // would be blank. Hold the last real frame instead (the exported video's final frame, and the end of preview).
  const t = Math.min(time, Math.max(0, p.duration - 0.001));
  const scale = ctx.canvas.width / STAGE_W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, STAGE_W, STAGE_H);
  drawBackground(ctx, p, t);

  for (const o of p.objects) {
    if (!activeAt(o.start, o.end, t)) continue;
    const pose = objectPoseAt(o, t, settle);
    if (pose.opacity <= 0.001) continue;
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate((pose.rot * Math.PI) / 180);
    ctx.scale(pose.flip ? -pose.scale : pose.scale, pose.scale);
    ctx.globalAlpha = Math.min(1, pose.opacity);
    if (o.kind === 'text') {
      drawText(ctx, o);
    } else {
      const talking = o.kind === 'character' && !!speakingClip(p, o.id, t) && mouthOpenAt(t);
      const blink = o.kind === 'character' && blinkAt(t, hashSeed(o.id));
      const img = requestImage(o.assetId, o.color, talking, blink) ?? requestImage(o.assetId, o.color, false, false);
      if (img) {
        ctx.drawImage(img, -OBJ_BASE / 2, -OBJ_BASE / 2, OBJ_BASE, OBJ_BASE);
      }
    }
    ctx.restore();
  }
}

function drawText(ctx: CanvasRenderingContext2D, o: SceneObject) {
  const { lines, fit } = textLayout(ctx, o);
  ctx.scale(fit, fit);
  ctx.font = textFont(o);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const lh = TEXT_SIZE * 1.15;
  lines.forEach((line, i) => {
    const y = (i - (lines.length - 1) / 2) * lh;
    ctx.lineWidth = 16;
    ctx.strokeStyle = 'rgba(40,20,70,.85)';
    ctx.strokeText(line, 0, y);
    ctx.fillStyle = o.color;
    ctx.fillText(line, 0, y);
  });
}

function drawBackground(ctx: CanvasRenderingContext2D, p: Project, t: number) {
  const clips = p.backgrounds;
  const cur = clips.find((b) => activeAt(b.start, b.end, t));
  if (!cur) {
    ctx.fillStyle = '#f3ecff';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    return;
  }
  const FADE = 0.7;
  const def = bgById(cur.bgId);
  const since = t - cur.start;
  if (cur.transition === 'fade' && since < FADE) {
    const prev = clips.find((b) => b.id !== cur.id && b.end <= cur.start + 0.001 && cur.start - b.end < 0.05);
    const prevDef = prev ? bgById(prev.bgId) : undefined;
    if (prevDef) prevDef.draw(ctx, STAGE_W, STAGE_H, t);
    else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    }
    ctx.save();
    ctx.globalAlpha = since / FADE;
    def?.draw(ctx, STAGE_W, STAGE_H, t);
    ctx.restore();
  } else {
    def?.draw(ctx, STAGE_W, STAGE_H, t);
  }
}
