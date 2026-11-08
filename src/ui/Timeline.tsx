import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { artById, bgById } from '../assets';
import { assignLanes, clamp, findKeyframeIndex, fmtTime, snap, type AudioClip, type BackgroundClip, type SceneObject } from '../model';
import {
  beginGesture, deleteKeyframe, getState, moveKeyframe, moveObjectClip, select, updateAudio, updateBackground,
  useStore, useTime, usePlaying,
} from '../store';
import { seek } from '../transport';

const LABEL_W = 148;
const ROW_H = 36;

type Mode = 'm' | 'l' | 'r';

interface BarProps {
  left: number;
  width: number;
  className: string;
  label: React.ReactNode;
  selected: boolean;
  noLeftResize?: boolean;
  pps: number;
  onBegin: (mode: Mode) => void;
  onDrag: (dt: number, mode: Mode) => void;
  children?: React.ReactNode;
  title?: string;
}

function Bar({ left, width, className, label, selected, noLeftResize, pps, onBegin, onDrag, children, title }: BarProps) {
  const st = useRef<{ x: number; mode: Mode; moved: boolean } | null>(null);
  return (
    <div
      className={`bar ${className}${selected ? ' selected' : ''}`}
      style={{ left, width: Math.max(10, width), top: 3, height: ROW_H - 6 }}
      title={title}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const mode: Mode = x < 8 && !noLeftResize ? 'l' : x > rect.width - 8 ? 'r' : 'm';
        st.current = { x: e.clientX, mode, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
        onBegin(mode);
      }}
      onPointerMove={(e) => {
        const s = st.current;
        if (!s) return;
        const dt = snap((e.clientX - s.x) / pps);
        if (!s.moved && Math.abs(e.clientX - s.x) < 3) return;
        if (!s.moved) {
          s.moved = true;
          beginGesture();
        }
        onDrag(dt, s.mode);
      }}
      onPointerUp={() => (st.current = null)}
      onPointerCancel={() => (st.current = null)}
    >
      {!noLeftResize && <span className="grip l" />}
      <span className="bar-label">{label}</span>
      <span className="grip r" />
      {children}
    </div>
  );
}

export function Timeline({ tall, onToggleTall }: { tall: boolean; onToggleTall: () => void }) {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const selectedKfT = useStore((s) => s.selectedKfT);
  const scroller = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(14);
  const fitted = useRef(false);

  useLayoutEffect(() => {
    if (fitted.current || !scroller.current) return;
    fitted.current = true;
    setPps(clamp((scroller.current.clientWidth - LABEL_W - 40) / project.duration, 6, 90));
  }, [project.duration]);

  const contentW = project.duration * pps;
  const dur = project.duration;
  const fitToWindow = () => setPps(clamp(((scroller.current?.clientWidth ?? 800) - LABEL_W - 40) / dur, 4, 120));

  const voiceLanes = useMemo(() => assignLanes(project.audio.filter((a) => a.kind === 'voice'), (a) => a.start, (a) => a.start + a.duration), [project.audio]);
  const musicLanes = useMemo(() => assignLanes(project.audio.filter((a) => a.kind === 'music'), (a) => a.start, (a) => a.start + a.duration), [project.audio]);
  const sfxLanes = useMemo(() => assignLanes(project.audio.filter((a) => a.kind === 'sfx'), (a) => a.start, (a) => a.start + a.duration), [project.audio]);

  const scrub = (e: React.PointerEvent, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    seek(clamp((e.clientX - r.left) / pps, 0, dur));
  };
  const scrubHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      (e.currentTarget as HTMLElement & { _s?: boolean })._s = true;
      scrub(e, e.currentTarget);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.currentTarget as HTMLElement & { _s?: boolean })._s) scrub(e, e.currentTarget);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLElement & { _s?: boolean })._s = false;
    },
  };

  // ruler ticks
  const tickStep = pps >= 60 ? 1 : pps >= 30 ? 2 : pps >= 14 ? 5 : 10;
  const ticks: number[] = [];
  for (let s = 0; s <= dur; s += tickStep) ticks.push(s);

  const audioRows = (kind: AudioClip['kind'], lanes: { lanes: Map<string, number>; count: number }, label: string, emoji: string) => {
    const clips = project.audio.filter((a) => a.kind === kind);
    return Array.from({ length: lanes.count }, (_, lane) => (
      <div className="row" key={`${kind}${lane}`} style={{ height: ROW_H }}>
        <div className="row-label">{lane === 0 ? `${emoji} ${label}` : ''}</div>
        <div className="lane" style={{ width: contentW }} {...scrubHandlers}>
          {clips.filter((c) => lanes.lanes.get(c.id) === lane).map((c) => <AudioBar key={c.id} clip={c} pps={pps} selected={selection.type === 'audio' && selection.id === c.id} />)}
        </div>
      </div>
    ));
  };

  const objectsTopFirst = [...project.objects].reverse();

  return (
    <div className="timeline">
      <div className="tl-toolbar">
        <strong>Timeline</strong>
        <span className="muted">Drag bars to move · drag edges to trim · click the ruler to jump · ◆ = keyframes</span>
        <span className="spacer" />
        <button className="btn small" onClick={onToggleTall} aria-pressed={tall} title="Show more tracks at once">{tall ? '⇩ Shorter' : '⇧ Taller'}</button>
        <button className="btn small" onClick={fitToWindow} title="Zoom so the whole story fits">Fit</button>
        <label className="zoom">
          Zoom
          <input type="range" min={4} max={120} value={pps} onChange={(e) => setPps(Number(e.target.value))} />
        </label>
      </div>
      <div className="tl-scroll" ref={scroller}>
        <div className="tl-inner" style={{ width: LABEL_W + contentW + 40 }}>
          <div className="row ruler" style={{ height: 28 }}>
            <div className="row-label">{fmtTime(dur).replace(/\.\d$/, '')} total</div>
            <div className="lane" style={{ width: contentW }} {...scrubHandlers}>
              {ticks.map((s) => (
                <span key={s} className="tick" style={{ left: s * pps }}>
                  {s % 60 === 0 || tickStep < 5 || s % (tickStep * 2) === 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : ''}
                </span>
              ))}
            </div>
          </div>

          <div className="row" style={{ height: ROW_H }}>
            <div className="row-label">🖼️ Backgrounds</div>
            <div className="lane" style={{ width: contentW }} {...scrubHandlers}>
              {project.backgrounds.map((b) => (
                <BgBar key={b.id} clip={b} pps={pps} dur={dur} selected={selection.type === 'bg' && selection.id === b.id} />
              ))}
            </div>
          </div>

          {objectsTopFirst.map((o) => (
            <ObjectRow key={o.id} o={o} pps={pps} contentW={contentW} selected={selection.type === 'object' && selection.id === o.id} selectedKfT={selectedKfT} scrubHandlers={scrubHandlers} />
          ))}
          {project.objects.length === 0 && (
            <div className="row" style={{ height: ROW_H }}>
              <div className="row-label muted">🎭 Characters</div>
              <div className="lane empty" style={{ width: contentW }} {...scrubHandlers}>Add a character or prop from the left to see it here</div>
            </div>
          )}

          {audioRows('voice', voiceLanes, 'Voices', '🎤')}
          {audioRows('music', musicLanes, 'Music', '🎵')}
          {audioRows('sfx', sfxLanes, 'Sounds', '🔊')}

          <Playhead scroller={scroller} pps={pps} />
        </div>
      </div>
    </div>
  );
}

function BgBar({ clip: b, pps, dur, selected }: { clip: BackgroundClip; pps: number; dur: number; selected: boolean }) {
  const def = bgById(b.bgId);
  const origin = useRef(b); // a ref: the drag start must survive the re-renders a drag causes
  return (
    <Bar
      pps={pps} className="bg" selected={selected}
      left={b.start * pps} width={(b.end - b.start) * pps}
      label={`${def?.emoji ?? ''} ${def?.label ?? b.bgId}${b.transition === 'fade' ? ' ⟿' : ''}`}
      onBegin={() => { select({ type: 'bg', id: b.id }); origin.current = { ...(getState().project.backgrounds.find((x) => x.id === b.id) ?? b) }; }}
      onDrag={(dt, mode) => updateBackground(b.id, (c) => {
        const o = origin.current;
        const len = o.end - o.start;
        if (mode === 'm') { c.start = clamp(o.start + dt, 0, dur - len); c.end = c.start + len; }
        else if (mode === 'l') c.start = clamp(o.start + dt, 0, o.end - 0.5);
        else c.end = clamp(o.end + dt, o.start + 0.5, dur);
      }, false)}
    />
  );
}

function ObjectRow({ o, pps, contentW, selected, selectedKfT, scrubHandlers }: { o: SceneObject; pps: number; contentW: number; selected: boolean; selectedKfT: number | null; scrubHandlers: object }) {
  const art = artById(o.assetId);
  const origin = useRef<SceneObject>(o);
  return (
    <div className={`row${selected ? ' row-selected' : ''}`} style={{ height: ROW_H }}>
      <div className="row-label clickable" onClick={() => select({ type: 'object', id: o.id })} title={o.name}>
        {o.kind === 'text' ? '🔤' : art?.emoji} {o.name}
      </div>
      <div className="lane" style={{ width: contentW }} {...scrubHandlers}>
        <Bar
          pps={pps} className={`obj ${o.kind}`} selected={selected}
          left={o.start * pps} width={(o.end - o.start) * pps} label={o.name}
          onBegin={() => { select({ type: 'object', id: o.id }); origin.current = structuredClone(getState().project.objects.find((x) => x.id === o.id) ?? o); }}
          onDrag={(dt, mode) => moveObjectClip(o.id, mode === 'r' ? 0 : dt, mode === 'l' ? 0 : dt, origin.current)}
        />
        {o.keyframes.map((k, i) => (
          <Keyframe key={i} o={o} t={k.t} pps={pps} selected={selected && selectedKfT !== null && Math.abs(selectedKfT - k.t) < 0.02} />
        ))}
      </div>
    </div>
  );
}

function Keyframe({ o, t, pps, selected }: { o: SceneObject; t: number; pps: number; selected: boolean }) {
  const st = useRef<{ x: number; t0: number; cur: number; moved: boolean } | null>(null);
  return (
    <div
      className={`kf${selected ? ' selected' : ''}`}
      style={{ left: t * pps - 7, top: ROW_H / 2 - 7 }}
      title={`Keyframe at ${t.toFixed(1)}s (drag to retime, Delete to remove)`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        st.current = { x: e.clientX, t0: t, cur: t, moved: false };
        select({ type: 'object', id: o.id }, t);
        seek(t);
      }}
      onPointerMove={(e) => {
        const s = st.current;
        if (!s || Math.abs(e.clientX - s.x) < 3) return;
        if (!s.moved) {
          s.moved = true;
          beginGesture();
        }
        const nt = clamp(snap(s.t0 + (e.clientX - s.x) / pps), 0, getState().project.duration);
        const cur = getState().project.objects.find((x) => x.id === o.id);
        if (cur && findKeyframeIndex(cur.keyframes.filter((k) => Math.abs(k.t - s.cur) > 0.001), nt) >= 0) return; // don't stack two keyframes
        moveKeyframe(o.id, s.cur, nt);
        s.cur = nt;
        seek(nt);
      }}
      onPointerUp={() => (st.current = null)}
      onDoubleClick={() => deleteKeyframe(o.id, t)}
    />
  );
}

function AudioBar({ clip, pps, selected }: { clip: AudioClip; pps: number; selected: boolean }) {
  const origin = useRef(clip);
  const dur = () => getState().project.duration;
  const emoji = clip.kind === 'voice' ? '🎤' : clip.kind === 'music' ? '🎵' : '🔊';
  const label = clip.kind === 'voice' ? `${clip.label}: ${clip.text ?? ''}` : clip.label;
  return (
    <Bar
      pps={pps} className={`aud ${clip.kind}${clip.provider === 'browser' ? ' preview-only' : ''}`} selected={selected}
      left={clip.start * pps} width={clip.duration * pps} label={`${emoji} ${label}`}
      title={clip.provider === 'browser' ? 'Browser voice: you will hear it in preview, but it is not included in the exported video' : label}
      noLeftResize={clip.kind !== 'music'}
      onBegin={() => { select({ type: 'audio', id: clip.id }); origin.current = { ...(getState().project.audio.find((x) => x.id === clip.id) ?? clip) }; }}
      onDrag={(dt, mode) => updateAudio(clip.id, (c) => {
        const o = origin.current;
        if (mode === 'm') c.start = clamp(o.start + dt, 0, dur() - o.duration);
        else if (mode === 'l') {
          const end = o.start + o.duration;
          c.start = clamp(o.start + dt, 0, end - 0.3);
          c.duration = end - c.start;
        } else c.duration = clamp(o.duration + dt, 0.3, dur() - o.start);
      }, false)}
    />
  );
}

function Playhead({ scroller, pps }: { scroller: React.RefObject<HTMLDivElement>; pps: number }) {
  const t = useTime();
  const playing = usePlaying();
  const x = LABEL_W + t * pps;
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing) return;
    if (x > el.scrollLeft + el.clientWidth - 60 || x < el.scrollLeft + LABEL_W) el.scrollLeft = Math.max(0, x - LABEL_W - 80);
  }, [x, playing, scroller]);
  return (
    <div className="playhead" style={{ left: x }}>
      <span className="ph-flag">{t.toFixed(1)}s</span>
    </div>
  );
}
