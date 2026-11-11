import { useEffect, useMemo, useRef, useState } from 'react';
import { CHARACTERS, artById, type ArtAsset } from '../assets';
import { resumeAudio } from '../audio';
import { forgetArt } from '../render';
import { ownedStickers, stickerById } from './stickers';
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
 * appears in Story time (and the Studio).
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

type Mode = 'brush' | 'fill' | 'sticker' | 'eraser';
type Pt = { x: number; y: number };
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const STICKER_SIZE = { big: 130, small: 76 };

function PaintCanvas({ baseId, id, onBack, onSaved, sound }: { baseId: string; id?: string; onBack: () => void; onSaved: (id: string) => void; sound: (id: string, v?: number) => void; backIcon?: string }) {
  const base = CHARACTERS.find((c) => c.id === baseId) as ArtAsset;
  const viewRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const mk = () => Object.assign(document.createElement('canvas'), { width: PAINT_SIZE, height: PAINT_SIZE });
  const paintC = useMemo(mk, []);
  const stickC = useMemo(mk, []); // stickers: drawn on top, not trimmed to the shape
  const tmpC = useMemo(mk, []);
  const baseImg = useRef<HTMLImageElement | null>(null);
  const strokes = useRef(new Map<number, Pt>());
  const undo = useRef<{ paint: ImageData; stick: ImageData }[]>([]);
  const hue = useRef(0);
  const raf = useRef(0);
  const owned = useMemo(() => ownedStickers(), []);
  const [paint, setPaint] = useState('rainbow');
  const [mode, setMode] = useState<Mode>('brush');
  const [sticker, setSticker] = useState<string | null>(null);
  const [size, setSize] = useState<'big' | 'small'>('big');
  const [mirror, setMirror] = useState(false);
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
    ctx.drawImage(stickC, 0, 0);
  };
  const schedule = () => { if (!raf.current) raf.current = requestAnimationFrame(redraw); };

  // load the white character (and her earlier paint and stickers when painting a friend again)
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.src = svgUrl(blankSvg(base));
    const load = async (url: string | undefined, c: HTMLCanvasElement) => {
      if (!url) return;
      const p = new Image();
      p.src = url;
      await p.decode().catch(() => undefined);
      if (live) c.getContext('2d')!.drawImage(p, 0, 0, PAINT_SIZE, PAINT_SIZE);
    };
    void img.decode().then(async () => {
      if (!live) return;
      baseImg.current = img;
      const old = id ? getPainted(id) : undefined;
      await load(old?.paint, paintC);
      await load(old?.stickers, stickC);
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

  const at = (e: { clientX: number; clientY: number }): Pt => {
    const r = viewRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * PAINT_SIZE, y: ((e.clientY - r.top) / r.height) * PAINT_SIZE };
  };
  const mirrored = (p: Pt): Pt => ({ x: PAINT_SIZE - p.x, y: p.y });
  const colour = () => {
    if (paint !== 'rainbow') return PAINTS.find((p) => p.id === paint)!.color;
    return `hsl(${hue.current}, 95%, 60%)`;
  };
  const line = (ctx: CanvasRenderingContext2D, a: Pt, b: Pt) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x + (a.x === b.x && a.y === b.y ? 0.01 : 0), b.y);
    ctx.stroke();
  };
  const dab = (from: Pt, to: Pt) => {
    const targets = mode === 'eraser' ? [paintC, stickC] : [paintC];
    if (paint === 'rainbow') hue.current = (hue.current + Math.hypot(to.x - from.x, to.y - from.y) * 0.9 + 2) % 360;
    for (const c of targets) {
      const ctx = c.getContext('2d')!;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = BRUSH[size] * 2;
      if (mode === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; } else ctx.strokeStyle = colour();
      line(ctx, from, to);
      if (mirror) line(ctx, mirrored(from), mirrored(to)); // 🦋 both sides at once
      ctx.restore();
    }
    schedule();
  };
  const fillAll = () => {
    const ctx = paintC.getContext('2d')!;
    ctx.save();
    if (paint === 'rainbow') {
      const g = ctx.createLinearGradient(0, 0, 0, PAINT_SIZE);
      ['#ff4b4b', '#ff9f1c', '#ffe14d', '#4cd964', '#3fa9ff', '#a066ff'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
      ctx.fillStyle = g;
    } else ctx.fillStyle = colour();
    ctx.fillRect(0, 0, PAINT_SIZE, PAINT_SIZE);
    ctx.restore();
    schedule();
    sound('whoosh', 0.5);
  };
  const stamp = (p: Pt) => {
    const st = sticker ? stickerById(sticker) : undefined;
    if (!st) return;
    const ctx = stickC.getContext('2d')!;
    const px = STICKER_SIZE[size];
    ctx.save();
    ctx.font = `${px}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(st.e, p.x, p.y);
    if (mirror && Math.abs(p.x - PAINT_SIZE / 2) > px * 0.4) ctx.fillText(st.e, PAINT_SIZE - p.x, p.y);
    ctx.restore();
    schedule();
    sound('pop', 0.6);
  };
  const snapshot = () => {
    undo.current.push({
      paint: paintC.getContext('2d')!.getImageData(0, 0, PAINT_SIZE, PAINT_SIZE),
      stick: stickC.getContext('2d')!.getImageData(0, 0, PAINT_SIZE, PAINT_SIZE),
    });
    if (undo.current.length > 12) undo.current.shift();
    setCanUndo(true);
  };
  const down = (e: React.PointerEvent) => {
    if (done) return;
    e.preventDefault();
    if (strokes.current.size === 0) snapshot();
    const p = at(e);
    if (mode === 'fill') return fillAll();
    if (mode === 'sticker') return stamp(p);
    viewRef.current!.setPointerCapture(e.pointerId);
    strokes.current.set(e.pointerId, p);
    dab(p, p);
  };
  const move = (e: React.PointerEvent) => {
    const last = strokes.current.get(e.pointerId);
    if (!last) return;
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [];
    let prev = last;
    for (const ce of evs.length ? evs : [e.nativeEvent]) {
      const p = at(ce);
      dab(prev, p);
      prev = p;
    }
    strokes.current.set(e.pointerId, prev);
  };
  const up = (e: React.PointerEvent) => { strokes.current.delete(e.pointerId); };

  const doUndo = () => {
    const snap = undo.current.pop();
    if (snap) {
      paintC.getContext('2d')!.putImageData(snap.paint, 0, 0);
      stickC.getContext('2d')!.putImageData(snap.stick, 0, 0);
    }
    setCanUndo(undo.current.length > 0);
    schedule();
    sound('pop', 0.4);
  };
  const clearAll = () => {
    snapshot(); // ↩️ brings it back
    paintC.getContext('2d')!.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
    stickC.getContext('2d')!.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
    schedule();
    sound('whoosh', 0.5);
  };
  const hasStickers = () => {
    const d = stickC.getContext('2d')!.getImageData(0, 0, PAINT_SIZE, PAINT_SIZE).data;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 0) return true;
    return false;
  };
  const finish = () => {
    const img = baseImg.current;
    if (!img) return;
    const out = mk();
    const o = out.getContext('2d')!;
    o.drawImage(paintC, 0, 0);
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(img, 0, 0, PAINT_SIZE, PAINT_SIZE);
    const newId = id ?? newPaintedId(baseId);
    const stickers = hasStickers() ? stickC.toDataURL('image/png') : undefined;
    if (!savePainted({ id: newId, baseId, paint: out.toDataURL('image/png'), stickers })) { setProblem(true); return; }
    forgetArt(newId);
    setDone(newId);
    sound('yay', 0.7);
    setTimeout(() => onSaved(newId), 1600);
  };
  const pickColour = (c: string) => {
    setPaint(c);
    if (mode !== 'fill') setMode('brush');
    sound('pop', 0.35);
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
              key={p.id} className={`paint-blob${paint === p.id && (mode === 'brush' || mode === 'fill') ? ' on' : ''}${p.id === 'rainbow' ? ' rainbow' : ''}`}
              style={p.id === 'rainbow' ? undefined : { background: p.color }} aria-label={p.label} aria-pressed={paint === p.id && (mode === 'brush' || mode === 'fill')}
              onClick={() => pickColour(p.id)}
            />
          ))}
        </div>
        <div className="paint-center">
          <div className="paint-canvas-area" ref={areaRef}>
            <canvas
              ref={viewRef} width={PAINT_SIZE} height={PAINT_SIZE} className={`${done ? 'wiggle' : ''} mode-${mode}`} style={{ width: side, height: side }}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
              aria-label={`Paint ${base.label} with your finger`}
            />
            {mirror && <span className="mirror-line" style={{ height: side }} aria-hidden="true" />}
            {done && <span className="paint-cheer" aria-hidden="true">🎉</span>}
          </div>
          <div className="sticker-strip" aria-label="Stickers">
            {owned.map((st) => (
              <button
                key={st.id} className={`sticker-btn${mode === 'sticker' && sticker === st.id ? ' on' : ''}`} aria-label={`Sticker: ${st.label}`}
                aria-pressed={mode === 'sticker' && sticker === st.id} onClick={() => { setSticker(st.id); setMode('sticker'); sound('pop', 0.35); }}
              >{st.e}</button>
            ))}
          </div>
        </div>
        <div className="paint-tools">
          <button className={`kbtn round brush${size === 'big' ? ' on' : ''}`} onClick={() => setSize('big')} aria-label="Big brush" aria-pressed={size === 'big'}><span className="dot big" /></button>
          <button className={`kbtn round brush${size === 'small' ? ' on' : ''}`} onClick={() => setSize('small')} aria-label="Small brush" aria-pressed={size === 'small'}><span className="dot small" /></button>
          <button className={`kbtn round${mode === 'fill' ? ' on' : ''}`} onClick={() => { setMode(mode === 'fill' ? 'brush' : 'fill'); sound('pop', 0.35); }} aria-label="Paint it all" aria-pressed={mode === 'fill'}>🪣</button>
          <button className={`kbtn round${mirror ? ' on' : ''}`} onClick={() => { setMirror(!mirror); sound('twinkle', 0.35); }} aria-label="Mirror: paint both sides" aria-pressed={mirror}>🦋</button>
          <button className={`kbtn round${mode === 'eraser' ? ' on' : ''}`} onClick={() => { setMode(mode === 'eraser' ? 'brush' : 'eraser'); sound('pop', 0.35); }} aria-label="Rubber" aria-pressed={mode === 'eraser'}>🧽</button>
          <button className="kbtn round" onClick={doUndo} disabled={!canUndo} aria-label="Undo">↩️</button>
          <button className="kbtn round" onClick={clearAll} aria-label="Start again">🗑️</button>
        </div>
      </div>
    </div>
  );
}
