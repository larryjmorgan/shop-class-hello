import { useEffect, useMemo, useRef, useState } from 'react';
import { CHARACTERS, artById, type ArtAsset } from '../assets';
import { resumeAudio } from '../audio';
import { forgetArt } from '../render';
import { MAX_PAINTED, PAINT_SIZE, blankSvg, deletePainted, getPainted, listPainted, newPaintedId, savePainted } from './painted';
import { TheaterAudio } from './theaterAudio';

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const face = { mouthOpen: false, blink: false };

export const PAINTS: { id: string; color: string; label: string }[] = [
  { id: 'red', color: '#ff4b4b', label: 'Red' },
  { id: 'orange', color: '#ff9f1c', label: 'Orange' },
  { id: 'yellow', color: '#ffe14d', label: 'Yellow' },
  { id: 'green', color: '#4cd964', label: 'Green' },
  { id: 'blue', color: '#3fa9ff', label: 'Blue' },
  { id: 'purple', color: '#a066ff', label: 'Purple' },
  { id: 'pink', color: '#ff7ac8', label: 'Pink' },
  { id: 'brown', color: '#a8693d', label: 'Brown' },
  { id: 'black', color: '#3a3346', label: 'Black' },
  { id: 'rainbow', color: 'rainbow', label: 'Rainbow' },
];
const BRUSH = { big: 30, small: 12 }; // radius, in paint-layer pixels (the layer is 400 x 400)

/**
 * 🖌️ Paint a friend. Step 1: pick a character (or one she painted before). Step 2: paint it with a finger (or several
 * fingers). Paint only sticks to the character, so she can't "go over the lines". ✓ saves it as a new friend that
 * appears in both story makers and puppet play.
 */
export function Painter({ onBack, onFinished, backIcon = '🏠' }: { onBack: () => void; onFinished?: (id: string) => void; backIcon?: string }) {
  const [tick, setTick] = useState(0);
  const painted = useMemo(() => listPainted().reverse(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const [target, setTarget] = useState<{ baseId: string; id?: string } | null>(null);
  const [throwAway, setThrowAway] = useState<string | null>(null);
  const audioRef = useRef<TheaterAudio | null>(null);
  const audio = () => (audioRef.current ??= new TheaterAudio());
  const sound = (id: string, v = 0.6) => { void resumeAudio(); void audio().sfx(id, v); };
  useEffect(() => () => audioRef.current?.dispose(), []);
  const full = painted.length >= MAX_PAINTED;

  if (target) {
    return (
      <PaintCanvas
        key={target.id ?? target.baseId}
        baseId={target.baseId} id={target.id} sound={sound}
        onBack={() => setTarget(null)}
        onSaved={(id) => { setTarget(null); setTick((t) => t + 1); if (onFinished) onFinished(id); }}
      />
    );
  }

  return (
    <div className="painter">
      <div className="t-top">
        <button className="kbtn round" onClick={onBack} aria-label={backIcon === '🏠' ? 'Home' : 'Close'}>{backIcon}</button>
        <span className="maker-step" aria-hidden="true">🖌️</span>
      </div>
      <div className="paint-choose">
        {painted.map((p) => {
          const a = artById(p.id);
          return a && (
            <div key={p.id} className="paint-pick-tile">
              <button className="cast-pick painted" onClick={() => { setTarget({ baseId: p.baseId, id: p.id }); sound('pop', 0.4); }} aria-label={`Paint your ${a.label} again`}>
                <img src={svgUrl(a.svg('#ffffff', face))} alt="" draggable={false} />
                <span className="paint-badge">🎨</span>
              </button>
              <button className="kbtn round small throw" onClick={() => setThrowAway(p.id)} aria-label={`Throw away your painted ${a.label}`}>🗑️</button>
            </div>
          );
        })}
        {CHARACTERS.map((c) => (
          <button key={c.id} className="cast-pick blank" disabled={full} onClick={() => { setTarget({ baseId: c.id }); sound('pop', 0.4); }} aria-label={`Paint ${c.label}`}>
            <img src={svgUrl(blankSvg(c))} alt="" draggable={false} />
          </button>
        ))}
      </div>
      {throwAway && (
        <div className="sticker-picker" role="dialog" aria-label="Throw away this painted friend?">
          <div className="confirm-row">
            <img className="confirm-pic" src={svgUrl(artById(throwAway)!.svg('#ffffff', face))} alt="" draggable={false} />
            <button className="kbtn big danger-kbtn" onClick={() => { deletePainted(throwAway); forgetArt(throwAway); setThrowAway(null); setTick((t) => t + 1); sound('pop'); }} aria-label="Yes, throw it away">🗑️</button>
            <button className="kbtn big good" onClick={() => setThrowAway(null)} aria-label="No, keep it">↩️</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PaintCanvas({ baseId, id, onBack, onSaved, sound }: { baseId: string; id?: string; onBack: () => void; onSaved: (id: string) => void; sound: (id: string, v?: number) => void; backIcon?: string }) {
  const base = CHARACTERS.find((c) => c.id === baseId) as ArtAsset;
  const viewRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const paintC = useMemo(() => Object.assign(document.createElement('canvas'), { width: PAINT_SIZE, height: PAINT_SIZE }), []);
  const tmpC = useMemo(() => Object.assign(document.createElement('canvas'), { width: PAINT_SIZE, height: PAINT_SIZE }), []);
  const baseImg = useRef<HTMLImageElement | null>(null);
  const strokes = useRef(new Map<number, { x: number; y: number }>());
  const undo = useRef<ImageData[]>([]);
  const hue = useRef(0);
  const raf = useRef(0);
  const [paint, setPaint] = useState('rainbow');
  const [size, setSize] = useState<'big' | 'small'>('big');
  const [eraser, setEraser] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [side, setSide] = useState(300);
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState(false);

  const redraw = () => {
    raf.current = 0;
    const v = viewRef.current;
    const img = baseImg.current;
    if (!v || !img) return;
    const ctx = v.getContext('2d')!;
    ctx.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
    ctx.drawImage(img, 0, 0, PAINT_SIZE, PAINT_SIZE);
    const t = tmpC.getContext('2d')!;
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
    t.drawImage(paintC, 0, 0);
    t.globalCompositeOperation = 'destination-in'; // paint only where the character is
    t.drawImage(img, 0, 0, PAINT_SIZE, PAINT_SIZE);
    t.globalCompositeOperation = 'source-over';
    ctx.globalCompositeOperation = 'multiply'; // keeps eyes, mouth and outlines showing through
    ctx.drawImage(tmpC, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  };
  const schedule = () => { if (!raf.current) raf.current = requestAnimationFrame(redraw); };

  // load the white character (and her earlier paint when painting a friend again)
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.src = svgUrl(blankSvg(base));
    void img.decode().then(async () => {
      if (!live) return;
      baseImg.current = img;
      const old = id ? getPainted(id) : undefined;
      if (old) {
        const p = new Image();
        p.src = old.paint;
        await p.decode().catch(() => undefined);
        if (live) paintC.getContext('2d')!.drawImage(p, 0, 0, PAINT_SIZE, PAINT_SIZE);
      }
      schedule();
    });
    return () => { live = false; cancelAnimationFrame(raf.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // keep the canvas square and as big as the space allows
  useEffect(() => {
    const el = areaRef.current!;
    const fit = () => setSide(Math.max(160, Math.floor(Math.min(el.clientWidth, el.clientHeight) - 8)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const at = (e: React.PointerEvent) => {
    const r = viewRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * PAINT_SIZE, y: ((e.clientY - r.top) / r.height) * PAINT_SIZE };
  };
  const dab = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = paintC.getContext('2d')!;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = BRUSH[size] * 2;
    if (eraser) ctx.globalCompositeOperation = 'destination-out';
    if (paint === 'rainbow' && !eraser) {
      hue.current = (hue.current + Math.hypot(to.x - from.x, to.y - from.y) * 0.9 + 2) % 360;
      ctx.strokeStyle = `hsl(${hue.current}, 95%, 60%)`;
    } else {
      ctx.strokeStyle = eraser ? '#000' : PAINTS.find((p) => p.id === paint)!.color;
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + (from.x === to.x && from.y === to.y ? 0.01 : 0), to.y);
    ctx.stroke();
    ctx.restore();
    schedule();
  };
  const down = (e: React.PointerEvent) => {
    if (done) return;
    e.preventDefault();
    viewRef.current!.setPointerCapture(e.pointerId);
    if (strokes.current.size === 0) {
      undo.current.push(paintC.getContext('2d')!.getImageData(0, 0, PAINT_SIZE, PAINT_SIZE));
      if (undo.current.length > 12) undo.current.shift();
      setCanUndo(true);
    }
    const p = at(e);
    strokes.current.set(e.pointerId, p);
    dab(p, p);
  };
  const move = (e: React.PointerEvent) => {
    const last = strokes.current.get(e.pointerId);
    if (!last) return;
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [];
    let prev = last;
    for (const ce of evs.length ? evs : [e.nativeEvent]) {
      const p = at(ce as unknown as React.PointerEvent);
      dab(prev, p);
      prev = p;
    }
    strokes.current.set(e.pointerId, prev);
  };
  const up = (e: React.PointerEvent) => { strokes.current.delete(e.pointerId); };

  const doUndo = () => {
    const snap = undo.current.pop();
    if (snap) paintC.getContext('2d')!.putImageData(snap, 0, 0);
    setCanUndo(undo.current.length > 0);
    schedule();
    sound('pop', 0.4);
  };
  const clearAll = () => {
    const ctx = paintC.getContext('2d')!;
    undo.current.push(ctx.getImageData(0, 0, PAINT_SIZE, PAINT_SIZE)); // ↩️ brings it back
    setCanUndo(true);
    ctx.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
    schedule();
    sound('whoosh', 0.5);
  };
  const finish = () => {
    const img = baseImg.current;
    if (!img) return;
    const out = Object.assign(document.createElement('canvas'), { width: PAINT_SIZE, height: PAINT_SIZE });
    const o = out.getContext('2d')!;
    o.drawImage(paintC, 0, 0);
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(img, 0, 0, PAINT_SIZE, PAINT_SIZE);
    const newId = id ?? newPaintedId(baseId);
    if (!savePainted({ id: newId, baseId, paint: out.toDataURL('image/png') })) { setProblem(true); return; }
    forgetArt(newId);
    setDone(newId);
    sound('yay', 0.7);
    setTimeout(() => onSaved(newId), 1600);
  };

  return (
    <div className="painter">
      <div className="t-top">
        <button className="kbtn round" onClick={onBack} aria-label="Back" disabled={!!done}>⬅️</button>
        <span className="maker-step" aria-hidden="true">🖌️</span>
        <span className="spacer" />
        <button className="kbtn big good paint-done" onClick={finish} disabled={!!done} aria-label="Done painting">✓</button>
      </div>
      {problem && <p className="t-warn" role="alert">⚠️ There’s no room left on this device to keep another painted friend. A grown-up can throw some away.</p>}
      <div className="paint-area">
        <div className="palette" aria-label="Colours">
          {PAINTS.map((p) => (
            <button
              key={p.id} className={`paint-blob${paint === p.id && !eraser ? ' on' : ''}${p.id === 'rainbow' ? ' rainbow' : ''}`}
              style={p.id === 'rainbow' ? undefined : { background: p.color }} aria-label={p.label} aria-pressed={paint === p.id && !eraser}
              onClick={() => { setPaint(p.id); setEraser(false); sound('pop', 0.35); }}
            />
          ))}
        </div>
        <div className="paint-canvas-area" ref={areaRef}>
          <canvas
            ref={viewRef} width={PAINT_SIZE} height={PAINT_SIZE} className={done ? 'wiggle' : ''} style={{ width: side, height: side }}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
            aria-label={`Paint ${base.label} with your finger`}
          />
          {done && <span className="paint-cheer" aria-hidden="true">🎉</span>}
        </div>
        <div className="paint-tools">
          <button className={`kbtn round brush${size === 'big' ? ' on' : ''}`} onClick={() => setSize('big')} aria-label="Big brush" aria-pressed={size === 'big'}><span className="dot big" /></button>
          <button className={`kbtn round brush${size === 'small' ? ' on' : ''}`} onClick={() => setSize('small')} aria-label="Small brush" aria-pressed={size === 'small'}><span className="dot small" /></button>
          <button className={`kbtn round${eraser ? ' on' : ''}`} onClick={() => { setEraser(!eraser); sound('pop', 0.35); }} aria-label="Rubber" aria-pressed={eraser}>🧽</button>
          <button className="kbtn round" onClick={doUndo} disabled={!canUndo} aria-label="Undo">↩️</button>
          <button className="kbtn round" onClick={clearAll} aria-label="Start again">🗑️</button>
        </div>
      </div>
    </div>
  );
}
