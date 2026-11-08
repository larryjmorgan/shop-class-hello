import { useEffect, useRef } from 'react';
import { OBJ_BASE, STAGE_H, STAGE_W, activeAt, samplePose, type SceneObject } from '../model';
import { measureObject, objectPoseAt, onImageLoaded, renderFrame } from '../render';
import { beginGesture, getState, getTime, isPlaying, posePatch, select, subscribe, subscribeTime, useStore, useTime } from '../store';

type Drag =
  | { kind: 'move'; id: string; t: number; px: number; py: number; x: number; y: number }
  | { kind: 'scale'; id: string; t: number; cx: number; cy: number; d0: number; s0: number }
  | { kind: 'rotate'; id: string; t: number; cx: number; cy: number; a0: number; r0: number };

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const t = useTime();

  // Draw whenever the project, playhead or a lazily-loaded image changes (coalesced to one draw per frame).
  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!;
    let queued = false;
    const draw = () => {
      queued = false;
      renderFrame(ctx, getState().project, getTime(), !isPlaying());
    };
    const queue = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(draw);
    };
    queue();
    const offs = [subscribe(queue), subscribeTime(queue), onImageLoaded(queue)];
    return () => offs.forEach((o) => o());
  }, []);

  const toStage = (e: { clientX: number; clientY: number }) => {
    const r = overlayRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * STAGE_W, y: ((e.clientY - r.top) / r.height) * STAGE_H };
  };

  const hit = (x: number, y: number): SceneObject | undefined => {
    const { objects } = getState().project;
    const tt = getTime();
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (!activeAt(o.start, o.end, tt)) continue;
      const pose = objectPoseAt(o, tt, true);
      const m = measureObject(o);
      const rad = (-pose.rot * Math.PI) / 180;
      const dx = x - pose.x, dy = y - pose.y;
      const lx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / pose.scale;
      const ly = (dx * Math.sin(rad) + dy * Math.cos(rad)) / pose.scale;
      const pad = o.kind === 'text' ? 0 : -OBJ_BASE * 0.08; // characters have transparent margins
      if (Math.abs(lx) <= m.w / 2 + pad && Math.abs(ly) <= m.h / 2 + pad) return o;
    }
    return undefined;
  };

  const onDown = (e: React.PointerEvent) => {
    const p = toStage(e);
    const h = hit(p.x, p.y);
    if (!h) {
      select({ type: 'none' });
      return;
    }
    select({ type: 'object', id: h.id });
    const tt = getTime();
    const base = samplePose(h.keyframes, tt);
    beginGesture();
    drag.current = { kind: 'move', id: h.id, t: tt, px: p.x, py: p.y, x: base.x, y: base.y };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const startHandle = (e: React.PointerEvent, kind: 'scale' | 'rotate', o: SceneObject) => {
    e.stopPropagation();
    const tt = getTime();
    const base = samplePose(o.keyframes, tt);
    const shown = objectPoseAt(o, tt, true);
    const p = toStage(e);
    beginGesture();
    if (kind === 'scale') drag.current = { kind, id: o.id, t: tt, cx: shown.x, cy: shown.y, d0: Math.hypot(p.x - shown.x, p.y - shown.y) || 1, s0: base.scale };
    else drag.current = { kind, id: o.id, t: tt, cx: shown.x, cy: shown.y, a0: Math.atan2(p.y - shown.y, p.x - shown.x), r0: base.rot };
    overlayRef.current!.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toStage(e);
    if (d.kind === 'move') posePatch(d.id, d.t, { x: d.x + p.x - d.px, y: d.y + p.y - d.py }, false);
    else if (d.kind === 'scale') posePatch(d.id, d.t, { scale: Math.min(8, Math.max(0.1, (d.s0 * Math.hypot(p.x - d.cx, p.y - d.cy)) / d.d0)) }, false);
    else {
      let r = d.r0 + ((Math.atan2(p.y - d.cy, p.x - d.cx) - d.a0) * 180) / Math.PI;
      if (e.shiftKey) r = Math.round(r / 15) * 15;
      posePatch(d.id, d.t, { rot: r }, false);
    }
  };

  const sel = selection.type === 'object' ? project.objects.find((o) => o.id === selection.id) : undefined;
  const visible = sel && activeAt(sel.start, sel.end, t);
  let box: JSX.Element | null = null;
  if (sel && visible) {
    const pose = objectPoseAt(sel, t, true);
    const m = measureObject(sel);
    const w = m.w * pose.scale, h = m.h * pose.scale;
    box = (
      <g transform={`translate(${pose.x} ${pose.y}) rotate(${pose.rot})`}>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={14} className="sel-box" />
        <line x1={0} y1={-h / 2} x2={0} y2={-h / 2 - 34} className="sel-line" />
        <circle cx={0} cy={-h / 2 - 40} r={13} className="handle rot" onPointerDown={(e) => startHandle(e, 'rotate', sel)} />
        <rect x={w / 2 - 12} y={h / 2 - 12} width={24} height={24} rx={6} className="handle scl" onPointerDown={(e) => startHandle(e, 'scale', sel)} />
      </g>
    );
  }

  return (
    <div className="stage-wrap">
      <div className="stage" style={{ aspectRatio: `${STAGE_W} / ${STAGE_H}` }}>
        <canvas ref={canvasRef} width={STAGE_W} height={STAGE_H} aria-label="Animation stage" />
        <svg
          ref={overlayRef}
          className="overlay"
          viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          {box}
        </svg>
        {sel && !visible && <div className="stage-hint">“{sel.name}” isn’t on stage at this moment. Move the playhead into its bar.</div>}
      </div>
    </div>
  );
}
