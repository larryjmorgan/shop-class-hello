import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BACKGROUNDS, CHARACTERS, PROPS, type ArtAsset } from '../assets';
import { resumeAudio } from '../audio';
import { STAGE_H, STAGE_W, mouthOpenAt } from '../model';
import { renderFrame } from '../render';
import { MAX_RECORD_SECONDS } from './limits';
import { saveMovie } from './movies';
import {
  TRASH, addActor, hitActor, inTrash, isTalking, isTap, moveActor, newTheater, nextReaction, prune, react, removeActor, REACTION_SOUND, toProject,
  type Actor, type Theater as TheaterState,
} from './puppet';
import { TheaterAudio, startTheaterRecording, type MicStatus, type TheaterRecording } from './theaterAudio';

type Phase = 'setup' | 'countdown' | 'recording' | 'saving' | 'review';

const MUSIC_CYCLE: { id: string | null; icon: string; label: string }[] = [
  { id: null, icon: '🎵', label: 'Music: off' },
  { id: 'sunny', icon: '☀️', label: 'Sunny music' },
  { id: 'lullaby', icon: '🌙', label: 'Sleepy music' },
  { id: 'adventure', icon: '🗺️', label: 'Adventure music' },
  { id: 'silly', icon: '🕺', label: 'Silly music' },
];

const thumbUrl = (a: ArtAsset) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(a.svg(a.colors[0], { mouthOpen: false, blink: false }))}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Drag {
  actorId: string;
  offX: number;
  offY: number;
  startX: number;
  startY: number;
  startedAt: number;
  moved: boolean;
}

export function Theater({ onHome, onShelf }: { onHome: () => void; onShelf: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<TheaterState>(newTheater());
  const clock0 = useRef(performance.now());
  const audioRef = useRef<TheaterAudio | null>(null);
  const recRef = useRef<TheaterRecording | null>(null);
  const drags = useRef(new Map<number, Drag>());
  const talking = useRef(false);
  const alive = useRef(true);
  const phaseRef = useRef<Phase>('setup');

  const [phase, setPhaseState] = useState<Phase>('setup');
  const [bg, setBg] = useState('meadow');
  const [view, setView] = useState<{ id: string; assetId: string; x: number; y: number }[]>([]);
  const [lastReaction, setLastReaction] = useState('');
  const [trashHot, setTrashHot] = useState(false);
  const [music, setMusic] = useState(0);
  const [count, setCount] = useState(3);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [micState, setMicState] = useState<MicStatus | null>(null);
  const [review, setReview] = useState<{ url: string } | null>(null);
  const [saveProblem, setSaveProblem] = useState(false);
  const [full, setFull] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 360 });

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const now = () => (performance.now() - clock0.current) / 1000;
  const sync = useCallback(() => setView(world.current.actors.filter((a) => a.removingT0 === undefined).map((a) => ({ id: a.id, assetId: a.assetId, x: Math.round(a.x), y: Math.round(a.y) }))), []);

  const audio = () => (audioRef.current ??= new TheaterAudio());

  // ---- the draw loop (also what gets recorded) ----
  useEffect(() => {
    alive.current = true;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    let raf = 0;
    const loop = () => {
      const t = now();
      prune(world.current, t);
      if (phaseRef.current === 'recording' && audioRef.current) talking.current = isTalking(talking.current, audioRef.current.micLevel());
      else talking.current = false;
      const speaker = world.current.speakerId;
      renderFrame(ctx, toProject(world.current, t), t, false, { mouthOpen: (o) => talking.current && o.id === speaker && mouthOpenAt(t) });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive.current = false;
      cancelAnimationFrame(raf);
      recRef.current?.cancel();
      audioRef.current?.dispose();
    };
  }, []);

  useEffect(() => () => { if (review) URL.revokeObjectURL(review.url); }, [review]);

  // Fit the 16:9 stage into the space that is left, on any screen shape (landscape, portrait, laptop).
  useEffect(() => {
    const el = areaRef.current!;
    const fit = () => {
      const pad = 8;
      const aw = Math.max(120, el.clientWidth - pad * 2);
      const ah = Math.max(70, el.clientHeight - pad * 2);
      const w = Math.floor(Math.min(aw, (ah * STAGE_W) / STAGE_H));
      setSize({ w, h: Math.floor((w * STAGE_H) / STAGE_W) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- pointer handling: drag puppets, tap to react, drop in the bin ----
  const toStage = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * STAGE_W, y: ((e.clientY - r.top) / r.height) * STAGE_H };
  };

  const doReact = (a: Actor) => {
    const kind = nextReaction(a, Math.random());
    react(a, kind, now());
    setLastReaction(kind);
    void audio().sfx(REACTION_SOUND[kind], 0.8);
  };

  const onDown = (e: React.PointerEvent) => {
    if (phaseRef.current !== 'setup' && phaseRef.current !== 'recording') return;
    void resumeAudio();
    const p = toStage(e);
    const a = hitActor(world.current, p.x, p.y);
    if (!a) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (a.kind === 'character') world.current.speakerId = a.id;
    // bring to front so it is never hidden behind a friend
    world.current.actors = [...world.current.actors.filter((x) => x !== a), a];
    drags.current.set(e.pointerId, { actorId: a.id, offX: p.x - a.x, offY: p.y - a.y, startX: p.x, startY: p.y, startedAt: performance.now(), moved: false });
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drags.current.get(e.pointerId);
    if (!d) return;
    const a = world.current.actors.find((x) => x.id === d.actorId);
    if (!a) return;
    const p = toStage(e);
    if (!d.moved && Math.hypot(p.x - d.startX, p.y - d.startY) > 16) d.moved = true;
    if (!d.moved) return;
    moveActor(a, p.x - d.offX, p.y - d.offY, now());
    const hot = inTrash(p.x, p.y);
    setTrashHot((h) => (h === hot ? h : hot));
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drags.current.get(e.pointerId);
    drags.current.delete(e.pointerId);
    if (!d) return;
    const a = world.current.actors.find((x) => x.id === d.actorId);
    setTrashHot(false);
    if (!a) return;
    const p = toStage(e);
    const dist = Math.hypot(p.x - d.startX, p.y - d.startY);
    if (isTap(dist, performance.now() - d.startedAt)) doReact(a);
    else if (d.moved && inTrash(p.x, p.y)) {
      removeActor(world.current, a.id, now());
      void audio().sfx('pop', 0.7);
    }
    sync();
  };

  // ---- adding things ----
  const addArt = (art: ArtAsset) => {
    void resumeAudio();
    const same = world.current.actors.filter((a) => a.assetId === art.id && a.removingT0 === undefined).length;
    const a = addActor(world.current, art, now(), same);
    if (!a) {
      setFull(true);
      setTimeout(() => setFull(false), 1500);
      return;
    }
    void audio().sfx('pop', 0.7);
    sync();
  };

  const pickBackground = (id: string) => {
    world.current.backgroundId = id;
    setBg(id);
    void resumeAudio();
    void audio().sfx('twinkle', 0.5);
  };

  const cycleMusic = () => {
    const next = (music + 1) % MUSIC_CYCLE.length;
    setMusic(next);
    void audio().setMusic(MUSIC_CYCLE[next].id);
  };

  // ---- recording ----
  const finish = useCallback(async () => {
    const rec = recRef.current;
    if (!rec || phaseRef.current !== 'recording') return;
    recRef.current = null;
    setPhase('saving');
    const clip = await rec.stop();
    audioRef.current?.stopMic();
    if (!alive.current) return;
    const saved = await saveMovie(clip.blob, { seconds: clip.seconds, ext: clip.ext, mime: clip.mime, poster: clip.poster });
    if (!alive.current) return;
    setSaveProblem(!saved.saved);
    setReview({ url: URL.createObjectURL(clip.blob) });
    setPhase('review');
  }, []);

  const startRecording = async () => {
    if (phaseRef.current !== 'setup') return;
    const a = audio();
    await resumeAudio();
    setPhase('countdown');
    setMicState(await a.startMic()); // may show the browser's "allow microphone?" question
    for (const n of [3, 2, 1]) {
      if (!alive.current) return;
      setCount(n);
      void a.sfx('pop', 0.5);
      await sleep(900);
    }
    if (!alive.current) return;
    try {
      recRef.current = startTheaterRecording(canvasRef.current!, a);
    } catch {
      a.stopMic();
      setPhase('setup');
      return;
    }
    setSeconds(0);
    setPhase('recording');
  };

  // while recording: timer, level meter, auto-stop at the limit, and stop safely if the page is hidden
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = window.setInterval(() => {
      const el = recRef.current?.elapsed() ?? 0;
      setSeconds(el);
      setLevel(audioRef.current?.micLevel() ?? 0);
      if (el >= MAX_RECORD_SECONDS) void finish();
    }, 150);
    const hidden = () => document.visibilityState === 'hidden' && void finish();
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [phase, finish]);

  const again = () => {
    setReview(null);
    setPhase('setup');
  };

  const meter = Math.min(1, level * 9);
  const recording = phase === 'recording';
  const sceneItems = useMemo(() => [...CHARACTERS, ...PROPS], []);

  return (
    <div className={`theater phase-${phase}`}>
      <div className="t-top">
        {phase === 'setup' && (
          <button className="kbtn round" onClick={onHome} aria-label="Home">🏠</button>
        )}
        <span className="spacer" />
        {phase === 'setup' && (
          <button className="kbtn round" onClick={onShelf} aria-label="My movies">🎞️</button>
        )}
      </div>

      {recording && (
        <div className="t-progress" role="progressbar" aria-label="Recording time" aria-valuenow={Math.round(seconds)} aria-valuemax={MAX_RECORD_SECONDS}>
          <span style={{ width: `${Math.min(100, (seconds / MAX_RECORD_SECONDS) * 100)}%` }} />
        </div>
      )}

      <div className="t-middle">
        {phase === 'setup' && (
          <div className="t-bgs" aria-label="Backdrops">
            {BACKGROUNDS.map((b) => (
              <button key={b.id} className={`t-bg${bg === b.id ? ' on' : ''}`} style={{ background: b.thumb }} onClick={() => pickBackground(b.id)} aria-label={b.label} />
            ))}
          </div>
        )}

        <div className="t-stage-area" ref={areaRef}>
          <div className={`t-canvas-wrap${recording ? ' rec' : ''}`} style={{ width: size.w, height: size.h }} data-actors={JSON.stringify(view)} data-reaction={lastReaction} data-background={bg}>
            <canvas
              ref={canvasRef} width={STAGE_W} height={STAGE_H} aria-label="Puppet stage"
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            />
            {(phase === 'setup' || recording) && (
              <div
                className={`t-trash${trashHot ? ' hot' : ''}`} aria-label="Put away"
                style={{ left: `${(TRASH.x / STAGE_W) * 100}%`, top: `${(TRASH.y / STAGE_H) * 100}%`, width: `${(TRASH.w / STAGE_W) * 100}%`, height: `${(TRASH.h / STAGE_H) * 100}%` }}
              >🗑️</div>
            )}
            {full && <div className="t-toast" role="status">🙈</div>}
            {phase === 'countdown' && <div className="t-count" role="status" aria-live="assertive" aria-label={`Starting in ${count}`}>{count}</div>}
            {recording && (
              <div className="t-mic" aria-label={micState === 'ok' ? 'Microphone is listening' : 'No microphone'}>
                <span className={micState === 'ok' ? 'mic-ok' : 'mic-off'} style={{ transform: `scale(${1 + meter * 0.7})` }}>{micState === 'ok' ? '🎤' : '🔇'}</span>
              </div>
            )}
            {phase === 'saving' && <div className="t-count small" role="status">💾</div>}
            {phase === 'review' && review && (
              <div className="t-review">
                <video src={review.url} controls autoPlay playsInline />
                {saveProblem && <p className="t-warn" role="alert">⚠️ Couldn’t save it on this device. Ask a grown-up to download it from My movies right now.</p>}
                <div className="t-review-btns">
                  <button className="kbtn big good" onClick={onShelf} aria-label="Done, see my movies">✅</button>
                  <button className="kbtn big" onClick={again} aria-label="Make another movie">🎭</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {phase === 'setup' && (
        <div className="t-bottom">
          <div className="t-tray" aria-label="Friends and things">
            {sceneItems.map((a) => (
              <button key={a.id} className="t-tile" onClick={() => addArt(a)} aria-label={`Add ${a.label}`}>
                <img src={thumbUrl(a)} alt="" draggable={false} />
              </button>
            ))}
          </div>
          <button className={`kbtn round music${music === 0 ? ' off' : ''}`} onClick={cycleMusic} aria-label={MUSIC_CYCLE[music].label}>{MUSIC_CYCLE[music].icon}</button>
          <button className="rec-btn" onClick={() => void startRecording()} aria-label="Record a movie"><span /></button>
        </div>
      )}
      {recording && (
        <div className="t-bottom rec-only">
          <button className="stop-btn" onClick={() => void finish()} aria-label="Stop recording"><span /></button>
        </div>
      )}
    </div>
  );
}
