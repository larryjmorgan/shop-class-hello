import { useEffect, useMemo, useRef, useState } from 'react';
import { CHARACTERS } from '../assets';
import { resumeAudio } from '../audio';
import {
  ACTIVITIES, ROUND, TRACE, colourTask, countTask, getLevel, isVowel, letterTask, matchMisses, matchTask, readingTask, recordRound, shapeById, shapeTask, type Activity, type ColourTask,
} from './learn';
import { earnSticker, type STICKERS_ALL } from './stickers';
import { TheaterAudio } from './theaterAudio';

type Sound = (id: string, v?: number) => void;
const charPic = (id: string) => {
  const c = CHARACTERS.find((x) => x.id === id) ?? CHARACTERS[0];
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.svg(c.colors[0], { mouthOpen: true, blink: false }))}`;
};

/** Wiggle an element (a wrong tap). Nothing else happens: no crosses, no buzzers. */
function useShake(): [string | null, (k: string) => void] {
  const [k, setK] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(t.current), []);
  return [k, (key) => { setK(key); clearTimeout(t.current); t.current = setTimeout(() => setK(null), 500); }];
}

/** 🧮 The Learn corner: four activities. */
export function Learn({ onHome }: { onHome: () => void }) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const audioRef = useRef<TheaterAudio | null>(null);
  const sound: Sound = (id, v = 0.6) => { void resumeAudio(); void (audioRef.current ??= new TheaterAudio()).sfx(id, v); };
  useEffect(() => () => audioRef.current?.dispose(), []);

  if (activity) return <Round key={activity} activity={activity} sound={sound} onBack={() => setActivity(null)} />;
  return (
    <div className="learn-screen">
      <div className="t-top">
        <button className="kbtn round" onClick={onHome} aria-label="Home">🏠</button>
        <span className="maker-step" aria-hidden="true">🧮</span>
      </div>
      <div className="learn-hub">
        <button className="learn-tile letters" onClick={() => { setActivity('letters'); sound('pop', 0.4); }} aria-label="Letters">
          <span className="lt-big letter">a</span><span className="lt-row">👆</span>
          <span className="tile-name inflow">Letters</span>
        </button>
        <button className="learn-tile reading" onClick={() => { setActivity('reading'); sound('pop', 0.4); }} aria-label="Reading">
          <span className="lt-word"><b>c</b><b className="v">a</b><b>t</b></span><span className="lt-row">🐱</span>
          <span className="tile-name inflow">Reading</span>
        </button>
        <button className="learn-tile count" onClick={() => { setActivity('count'); sound('pop', 0.4); }} aria-label="Counting">
          <span className="lt-big">1 2 3</span><span className="lt-row">🍎🍎🍎</span>
          <span className="tile-name inflow">Counting</span>
        </button>
        <button className="learn-tile colours" onClick={() => { setActivity('colours'); sound('pop', 0.4); }} aria-label="Colours">
          <span className="lt-tablets"><i style={{ background: '#e53935' }} /><i style={{ background: '#fdd835' }} /><i style={{ background: '#1e88e5' }} /></span>
          <span className="tile-name inflow">Colours</span>
        </button>
        <button className="learn-tile shapes" onClick={() => { setActivity('shapes'); sound('pop', 0.4); }} aria-label="Shapes">
          <svg viewBox="0 0 300 100" className="lt-shapes" aria-hidden="true">
            <circle cx="50" cy="50" r="40" fill="#e53935" /><rect x="110" y="10" width="80" height="80" fill="#1e88e5" /><path d="M250 8 L294 92 H206 Z" fill="#43a047" />
          </svg>
          <span className="tile-name inflow">Shapes</span>
        </button>
        <button className="learn-tile match" onClick={() => { setActivity('match'); sound('pop', 0.4); }} aria-label="Matching">
          <span className="lt-cards"><i>🐶</i><i className="back" /><i>🐶</i></span>
          <span className="tile-name inflow">Matching</span>
        </button>
      </div>
    </div>
  );
}

/** One round: a few tasks with a star for each, then a little party. */
function Round({ activity, sound, onBack }: { activity: Activity; sound: Sound; onBack: () => void }) {
  const [level, setLevel] = useState(() => getLevel(activity));
  const [i, setI] = useState(0);
  const [round, setRound] = useState(0);
  const misses = useRef(0);
  const [prize, setPrize] = useState<(typeof STICKERS_ALL)[number] | null>(null);
  const total = ROUND[activity];
  const party = i >= total;
  const dancer = useMemo(() => CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id, [round]); // eslint-disable-line react-hooks/exhaustive-deps

  const solved = (m: number) => {
    misses.current += m;
    const next = i + 1;
    setI(next);
    if (next >= total) { recordRound(activity, misses.current); setPrize(earnSticker()); sound('yay', 0.8); }
  };
  const again = () => { setLevel(getLevel(activity)); misses.current = 0; setI(0); setRound((r) => r + 1); };
  const label = ACTIVITIES.find((a) => a.id === activity)!.label;

  return (
    <div className={`learn-screen ${activity}`}>
      <div className="t-top">
        <button className="kbtn round" onClick={onBack} aria-label="Back">⬅️</button>
        <span className="maker-step" aria-hidden="true">{ACTIVITIES.find((a) => a.id === activity)!.icon}</span>
        <span className="stars" aria-label={`${Math.min(i, total)} of ${total} done`}>
          {Array.from({ length: total }, (_, k) => <span key={k} className={k < i ? 'on' : ''}>⭐</span>)}
        </span>
      </div>
      {party ? (
        <div className="learn-party" role="status" aria-label="Well done!">
          <span className="confetti" aria-hidden="true">🎉</span>
          <img src={charPic(dancer)} alt="" className="dance" draggable={false} />
          <span className="confetti late" aria-hidden="true">🎊</span>
          {prize && (
            <div className="prize" role="img" aria-label={`New sticker: ${prize.label}`}>
              <span className="prize-sticker">{prize.e}</span>
              <span className="prize-for" aria-hidden="true">➜ 🖌️</span>
            </div>
          )}
          <div className="party-buttons">
            <button className="kbtn big good" onClick={again} aria-label={`Play ${label} again`}>🔁</button>
            <button className="kbtn big" onClick={onBack} aria-label="Back to Learn">⬅️</button>
          </div>
        </div>
      ) : activity === 'count' ? (
        <CountTaskView key={`${round}-${i}`} level={level} sound={sound} onSolved={solved} />
      ) : activity === 'letters' ? (
        <LetterTaskView key={`${round}-${i}`} level={level} sound={sound} onSolved={solved} />
      ) : activity === 'reading' ? (
        <ReadingTaskView key={`${round}-${i}`} level={level} sound={sound} onSolved={solved} />
      ) : activity === 'match' ? (
        <MatchTaskView key={`${round}-${i}`} level={level} sound={sound} onSolved={solved} />
      ) : activity === 'colours' ? (
        <ColourTaskView key={`${round}-${i}`} level={level} sound={sound} onSolved={solved} />
      ) : (
        <ShapeTaskView key={`${round}-${i}`} level={level} sound={sound} onSolved={solved} />
      )}
    </div>
  );
}

type TaskProps = { level: number; sound: Sound; onSolved: (misses: number) => void };
let lastCount: number | undefined;
let lastColour: string | undefined;
const recentLetters: string[] = [];
const recentWords: string[] = [];

/** 🃏 Cards lie face down; turn two to find a pair. Pairs stay face up; a wrong pair turns back over. */
function MatchTaskView({ level, sound, onSolved }: TaskProps) {
  const cards = useMemo(() => matchTask(level), [level]);
  const pairs = cards.length / 2;
  const [open, setOpen] = useState<number[]>([]); // the (up to two) cards turned this go
  const [found, setFound] = useState<string[]>([]);
  const mismatches = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const tap = (k: number) => {
    if (open.length >= 2 || open.includes(k) || found.includes(cards[k])) return;
    const now = [...open, k];
    setOpen(now);
    sound('pop', 0.4);
    if (now.length < 2) return;
    const [a, b] = now;
    if (cards[a] === cards[b]) {
      const f = [...found, cards[a]];
      timer.current = setTimeout(() => {
        setFound(f);
        setOpen([]);
        sound('twinkle', 0.6);
        if (f.length === pairs) timer.current = setTimeout(() => onSolved(matchMisses(mismatches.current, pairs)), 900);
      }, 400);
    } else {
      mismatches.current++;
      timer.current = setTimeout(() => { setOpen([]); sound('boing', 0.25); }, 1000);
    }
  };

  return (
    <div className="learn-task match-task">
      <div className={`match-grid n${cards.length}`}>
        {cards.map((pic, k) => {
          const up = open.includes(k) || found.includes(pic);
          return (
            <button
              key={k} className={`match-card${up ? ' up' : ''}${found.includes(pic) ? ' found' : ''}`} onClick={() => tap(k)}
              aria-label={up ? `Card ${pic}` : 'Card, face down'}
            >
              <span className="face" aria-hidden="true">{up ? pic : ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 📖 First reading. She taps the letters of a short word left to right (a grown-up says each sound with her; each
 * letter has a picture clue for its sound). Level 1: then the picture appears. Level 2: pick the picture for the word.
 * Level 3: pick it from look-alike words (cat / hat / bat), without the clues.
 */
function ReadingTaskView({ level, sound, onSolved }: TaskProps) {
  const task = useMemo(() => {
    const t = readingTask(level, Math.random, recentWords);
    recentWords.push(t.word);
    if (recentWords.length > 8) recentWords.shift();
    return t;
  }, [level]);
  const letters = [...task.word];
  const [lit, setLit] = useState(0); // letters sounded out so far
  const [right, setRight] = useState<string | null>(null);
  const [shaking, shake] = useShake();
  const misses = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const after = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  const read = lit >= letters.length;

  const tapLetter = (k: number) => {
    if (read) return;
    if (k !== lit) { shake(`l${lit}`); return; } // "this one next": left to right
    const n = lit + 1;
    setLit(n);
    sound(n >= letters.length ? 'twinkle' : 'pop', 0.5);
    if (n >= letters.length && task.choices.length === 0) {
      after(1300, () => { setRight(task.word); sound('yay', 0.7); });
      after(3000, () => onSolved(0));
    }
  };
  const choose = (w: string) => {
    if (!read || right) return;
    if (w === task.word) { setRight(w); sound('yay', 0.7); after(1500, () => onSolved(misses.current)); }
    else { misses.current++; shake(w); sound('boing', 0.35); }
  };
  const showCue = (k: number) => task.cueMode === 'always' || (task.cueMode === 'after' && k < lit);

  return (
    <div className="learn-task reading-task">
      <div className={`word-row${read ? ' blended' : ''}`}>
        {letters.map((l, k) => (
          <button
            key={k} onClick={() => tapLetter(k)} aria-label={`Letter ${l}`}
            className={`letter-tile ${isVowel(l) ? 'vowel' : 'consonant'}${k < lit ? ' lit' : ''}${k === lit && !read ? ' next' : ''}${shaking === `l${k}` ? ' shake' : ''}`}
          >
            <span className="lt-char">{l}</span>
            <span className="lt-cue" aria-hidden="true">{showCue(k) ? task.cues[k] : ''}</span>
          </button>
        ))}
      </div>
      {task.choices.length === 0 ? (
        <div className="reveal">
          {right ? <span className="reveal-pic" role="img" aria-label={`It says ${task.word}`}>{task.pic}</span> : <span className="reveal-q" aria-hidden="true">?</span>}
        </div>
      ) : (
        <div className={`pic-choices${read ? ' show' : ''}`}>
          {task.choices.map((c) => (
            <button
              key={c.word} disabled={!read} onClick={() => choose(c.word)} aria-label={`Picture: ${c.word}`}
              className={`pic-choice${shaking === c.word ? ' shake' : ''}${right === c.word ? ' right' : ''}`}
            >{c.pic}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 🔢 Tap each thing to count it (each gets its number), then tap the matching numeral. */
function CountTaskView({ level, sound, onSolved }: TaskProps) {
  const task = useMemo(() => { const t = countTask(level, Math.random, lastCount); lastCount = t.n; return t; }, [level]);
  const [order, setOrder] = useState<number[]>([]); // order[k] = which count number item k got (0 = not yet)
  const [right, setRight] = useState<number | null>(null);
  const [shaking, shake] = useShake();
  const misses = useRef(0);
  const counted = order.filter(Boolean).length;
  const done = counted >= task.n;

  const tapThing = (k: number) => {
    if (order[k]) return;
    const o = [...order];
    o[k] = counted + 1;
    setOrder(o);
    sound(counted + 1 >= task.n ? 'twinkle' : 'pop', 0.5);
  };
  const choose = (n: number) => {
    if (right !== null) return;
    if (n === task.n) { setRight(n); sound('yay', 0.6); setTimeout(() => onSolved(misses.current), 1100); }
    else { misses.current++; shake(`n${n}`); sound('boing', 0.35); }
  };

  return (
    <div className="learn-task">
      <div className={`count-tray n${task.n}`}>
        {Array.from({ length: task.n }, (_, k) => (
          <button key={k} className={`count-thing${order[k] ? ' counted' : ''}`} onClick={() => tapThing(k)} aria-label={order[k] ? `Counted ${order[k]}` : 'Count me'}>
            <span className="thing">{task.thing}</span>
            {order[k] ? <span className="count-badge">{order[k]}</span> : null}
          </button>
        ))}
      </div>
      <div className={`count-choices${done ? ' show' : ''}`} aria-hidden={!done}>
        {task.choices.map((n) => (
          <button
            key={n} className={`numeral${shaking === `n${n}` ? ' shake' : ''}${right === n ? ' right' : ''}`} disabled={!done}
            onClick={() => choose(n)} aria-label={`Number ${n}`}
          >{n}</button>
        ))}
      </div>
    </div>
  );
}

/** 🔤 Trace the letter with a finger, like a sandpaper letter. When it is traced, its picture pops up. */
function LetterTaskView({ level, sound, onSolved }: TaskProps) {
  const L = useMemo(() => { const t = letterTask(Math.random, recentLetters); recentLetters.push(t.l); if (recentLetters.length > 8) recentLetters.shift(); return t; }, []);
  const S = 400;
  const { cover, brush } = TRACE[level - 1] ?? TRACE[0];
  const viewRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const paintC = useMemo(() => Object.assign(document.createElement('canvas'), { width: S, height: S }), []);
  const maskC = useMemo(() => Object.assign(document.createElement('canvas'), { width: S, height: S }), []);
  const samples = useRef<number[]>([]); // pixel indexes inside the letter
  const strokes = useRef(new Map<number, { x: number; y: number }>());
  const hue = useRef(Math.random() * 360);
  const moves = useRef(0);
  const [side, setSide] = useState(300);
  const [done, setDone] = useState(false);

  const redraw = () => {
    const v = viewRef.current;
    if (!v) return;
    const ctx = v.getContext('2d')!;
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(maskC, 0, 0); // the letter, in "sandpaper" colour
    ctx.save();
    const tmp = document.createElement('canvas');
    tmp.width = S; tmp.height = S;
    const t = tmp.getContext('2d')!;
    t.drawImage(paintC, 0, 0);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(maskC, 0, 0);
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  };

  useEffect(() => {
    const m = maskC.getContext('2d')!;
    m.fillStyle = '#c9bde6';
    m.font = '700 300px "Andika", "Century Gothic", "Avenir Next", system-ui, sans-serif';
    m.textAlign = 'center';
    m.textBaseline = 'alphabetic';
    const box = m.measureText(L.l);
    const h = box.actualBoundingBoxAscent + box.actualBoundingBoxDescent;
    m.fillText(L.l, S / 2, S / 2 + h / 2 - box.actualBoundingBoxDescent);
    const d = m.getImageData(0, 0, S, S).data;
    const pts: number[] = [];
    for (let y = 0; y < S; y += 5) for (let x = 0; x < S; x += 5) if (d[(y * S + x) * 4 + 3] > 128) pts.push(y * S + x);
    samples.current = pts;
    redraw();
    const el = areaRef.current!;
    const fit = () => setSide(Math.max(160, Math.floor(Math.min(el.clientWidth, el.clientHeight) - 8)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const check = () => {
    if (done || !samples.current.length) return;
    const d = paintC.getContext('2d')!.getImageData(0, 0, S, S).data;
    const hit = samples.current.filter((i) => d[i * 4 + 3] > 0).length;
    if (hit / samples.current.length >= cover) {
      setDone(true);
      sound('yay', 0.7);
      setTimeout(() => onSolved(0), 1800);
    }
  };
  const at = (e: { clientX: number; clientY: number }) => {
    const r = viewRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * S, y: ((e.clientY - r.top) / r.height) * S };
  };
  const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const ctx = paintC.getContext('2d')!;
    hue.current = (hue.current + Math.hypot(b.x - a.x, b.y - a.y) * 0.6 + 1) % 360;
    ctx.strokeStyle = `hsl(${hue.current}, 90%, 55%)`;
    ctx.lineWidth = brush * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x + (a.x === b.x && a.y === b.y ? 0.01 : 0), b.y);
    ctx.stroke();
    redraw();
  };
  const down = (e: React.PointerEvent) => {
    if (done) return;
    e.preventDefault();
    viewRef.current!.setPointerCapture(e.pointerId);
    const p = at(e);
    strokes.current.set(e.pointerId, p);
    line(p, p);
  };
  const move = (e: React.PointerEvent) => {
    const last = strokes.current.get(e.pointerId);
    if (!last || done) return;
    const p = at(e);
    line(last, p);
    strokes.current.set(e.pointerId, p);
    if (++moves.current % 12 === 0) check();
  };
  const up = (e: React.PointerEvent) => { if (strokes.current.delete(e.pointerId)) check(); };
  const clear = () => { paintC.getContext('2d')!.clearRect(0, 0, S, S); redraw(); sound('whoosh', 0.4); };

  return (
    <div className="learn-task letter-task">
      <div className="trace-area" ref={areaRef}>
        <canvas
          ref={viewRef} width={S} height={S} style={{ width: side, height: side }} className={done ? 'traced' : ''}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label={`Trace the letter ${L.l}`}
        />
      </div>
      <div className="trace-tools">
        <span className="letter-pic-slot">{done && <span className="letter-pic" role="img" aria-label={`${L.l} is for ${L.word}`}>{L.pic}</span>}</span>
        <button className="kbtn round" onClick={clear} disabled={done} aria-label="Start this letter again">↩️</button>
      </div>
    </div>
  );
}

/** 🎨 Find the tablet that is the same colour. */
function ColourTaskView({ level, sound, onSolved }: TaskProps) {
  const task: ColourTask = useMemo(() => { const t = colourTask(level, Math.random, lastColour); lastColour = t.target.id; return t; }, [level]);
  const [right, setRight] = useState(false);
  const [shaking, shake] = useShake();
  const misses = useRef(0);
  const choose = (id: string) => {
    if (right) return;
    if (id === task.target.id) { setRight(true); sound('twinkle', 0.6); setTimeout(() => onSolved(misses.current), 1000); }
    else { misses.current++; shake(id); sound('boing', 0.35); }
  };
  const tablet = (hex: string) => ({ background: `linear-gradient(90deg, #c9975b 0 13%, ${hex} 13% 87%, #c9975b 87%)` });
  return (
    <div className="learn-task colour-task">
      <div className="tablet-pair">
        <div className="tablet big" style={tablet(task.target.hex)} aria-label="Find this colour" role="img" />
        {right && <div className="tablet big match" style={tablet(task.target.hex)} aria-hidden="true" />}
      </div>
      <div className="tablet-choices">
        {task.choices.map((c) => (
          <button
            key={c.id} className={`tablet${shaking === c.id ? ' shake' : ''}${right && c.id === task.target.id ? ' gone' : ''}`}
            style={tablet(c.hex)} onClick={() => choose(c.id)} aria-label={c.label}
          />
        ))}
      </div>
    </div>
  );
}

/** 🔷 Drag each shape into its hole (or tap a shape, then tap its hole). */
function ShapeTaskView({ level, sound, onSolved }: TaskProps) {
  const ids = useMemo(() => shapeTask(level), [level]);
  const trayOrder = useMemo(() => [...ids].sort(() => Math.random() - 0.5), [ids]);
  const [placed, setPlaced] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [shaking, shake] = useShake();
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const holes = useRef(new Map<string, HTMLDivElement>());
  const misses = useRef(0);

  const tryPlace = (id: string, hole: string) => {
    if (id === hole) {
      const p = [...placed, id];
      setPlaced(p);
      setSelected(null);
      sound('pop', 0.6);
      if (p.length === ids.length) { setTimeout(() => sound('twinkle', 0.6), 200); setTimeout(() => onSolved(misses.current), 1100); }
    } else {
      misses.current++;
      shake(id);
      sound('boing', 0.35);
    }
  };
  const holeAt = (x: number, y: number) => {
    for (const [hid, el] of holes.current) {
      if (placed.includes(hid)) continue;
      const r = el.getBoundingClientRect();
      const padX = r.width * 0.3, padY = r.height * 0.3; // little fingers: be generous
      if (x >= r.left - padX && x <= r.right + padX && y >= r.top - padY && y <= r.bottom + padY) return hid;
    }
    return null;
  };

  const down = (id: string) => (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, moved: false };
    setDrag({ id, dx: 0, dy: 0 });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag || !start.current) return;
    const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y;
    if (Math.hypot(dx, dy) > 12) start.current.moved = true;
    setDrag({ ...drag, dx, dy });
  };
  const up = (e: React.PointerEvent) => {
    if (!drag || !start.current) return;
    const { id } = drag;
    const moved = start.current.moved;
    setDrag(null);
    start.current = null;
    if (!moved) { setSelected(selected === id ? null : id); sound('pop', 0.3); return; }
    const h = holeAt(e.clientX, e.clientY);
    if (h) tryPlace(id, h); // dropped on a hole; anywhere else it just slides home
  };

  const shapeSvg = (id: string, fill: string, cls = '') => (
    <svg viewBox="0 0 100 100" className={cls} aria-hidden="true"><path d={shapeById(id).path} fill={fill} /></svg>
  );
  return (
    <div className="learn-task shape-task">
      <div className="shape-board">
        {ids.map((id) => (
          <div key={id} ref={(el) => { if (el) holes.current.set(id, el); else holes.current.delete(id); }} className="shape-hole"
            onClick={() => selected && !placed.includes(id) && tryPlace(selected, id)} role="button" aria-label={`${shapeById(id).label} hole`}>
            {shapeSvg(id, placed.includes(id) ? shapeById(id).color : 'rgba(60, 40, 110, .55)', placed.includes(id) ? 'in' : '')}
          </div>
        ))}
      </div>
      <div className="shape-tray">
        {trayOrder.map((id) => placed.includes(id) ? <div key={id} className="shape-piece empty" /> : (
          <button
            key={id} className={`shape-piece${selected === id ? ' selected' : ''}${shaking === id ? ' shake' : ''}${drag?.id === id ? ' dragging' : ''}`}
            style={drag?.id === id ? { transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.1)` } : undefined}
            onPointerDown={down(id)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { setDrag(null); start.current = null; }}
            aria-label={shapeById(id).label} aria-pressed={selected === id}
          >{shapeSvg(id, shapeById(id).color)}</button>
        ))}
      </div>
    </div>
  );
}
