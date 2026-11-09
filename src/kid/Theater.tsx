import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BACKGROUNDS, CHARACTERS, PROPS, type ArtAsset } from '../assets';
import { resumeAudio } from '../audio';
import { STAGE_H, STAGE_W, mouthOpenAt } from '../model';
import { renderFrame } from '../render';
import {
  TRASH, addActor, hitActor, inTrash, isReacting, isTap, moveActor, newTheater, nextReaction, prune, react, removeActor, REACTION_SOUND, toProject,
  type Actor, type Theater as TheaterState,
} from './puppet';
import { MUSIC_CHOICES } from './scenarios';
import { TheaterAudio } from './theaterAudio';
import { useFit16x9 } from './useFit';

const thumbUrl = (a: ArtAsset) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(a.svg(a.colors[0], { mouthOpen: false, blink: false }))}`;

interface Drag {
  actorId: string;
  offX: number;
  offY: number;
  startX: number;
  startY: number;
  startedAt: number;
  moved: boolean;
}

/** Free play: drag friends around, tap them to make them react, pick a backdrop and music. Nothing is recorded. */
export function Theater({ onHome }: { onHome: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<TheaterState>(newTheater());
  const clock0 = useRef(performance.now());
  const audioRef = useRef<TheaterAudio | null>(null);
  const drags = useRef(new Map<number, Drag>());

  const [bg, setBg] = useState('meadow');
  const [view, setView] = useState<{ id: string; assetId: string; x: number; y: number }[]>([]);
  const [lastReaction, setLastReaction] = useState('');
  const [trashHot, setTrashHot] = useState(false);
  const [music, setMusic] = useState(0);
  const [full, setFull] = useState(false);
  const [areaRef, size] = useFit16x9();

  const now = () => (performance.now() - clock0.current) / 1000;
  const sync = useCallback(() => setView(world.current.actors.filter((a) => a.removingT0 === undefined).map((a) => ({ id: a.id, assetId: a.assetId, x: Math.round(a.x), y: Math.round(a.y) }))), []);
  const audio = () => (audioRef.current ??= new TheaterAudio());

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d', { alpha: false })!;
    let raf = 0;
    const loop = () => {
      const t = now();
      prune(world.current, t);
      renderFrame(ctx, toProject(world.current, t), t, false, {
        mouthOpen: (o) => { const a = world.current.actors.find((x) => x.id === o.id); return !!a && isReacting(a, t) && mouthOpenAt(t); },
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      audioRef.current?.dispose();
    };
  }, []);

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
    void resumeAudio();
    const p = toStage(e);
    const a = hitActor(world.current, p.x, p.y);
    if (!a) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    world.current.actors = [...world.current.actors.filter((x) => x !== a), a]; // bring to front
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
    setTrashHot(false);
    if (!d) return;
    const a = world.current.actors.find((x) => x.id === d.actorId);
    if (!a) return;
    const p = toStage(e);
    if (isTap(Math.hypot(p.x - d.startX, p.y - d.startY), performance.now() - d.startedAt)) doReact(a);
    else if (d.moved && inTrash(p.x, p.y)) {
      removeActor(world.current, a.id, now());
      void audio().sfx('pop', 0.7);
    }
    sync();
  };

  const addArt = (art: ArtAsset) => {
    void resumeAudio();
    const same = world.current.actors.filter((a) => a.assetId === art.id && a.removingT0 === undefined).length;
    if (!addActor(world.current, art, now(), same)) {
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
    void audio().sfx('twinkle', 0.5);
  };

  const cycleMusic = () => {
    const next = (music + 1) % MUSIC_CHOICES.length;
    setMusic(next);
    void audio().setMusic(MUSIC_CHOICES[next].id);
  };

  const sceneItems = useMemo(() => [...CHARACTERS, ...PROPS], []);

  return (
    <div className="theater">
      <div className="t-top">
        <button className="kbtn round" onClick={onHome} aria-label="Home">🏠</button>
        <span className="spacer" />
        <button className={`kbtn round music${music === 0 ? ' off' : ''}`} onClick={cycleMusic} aria-label={MUSIC_CHOICES[music].label}>{MUSIC_CHOICES[music].icon}</button>
      </div>

      <div className="t-middle">
        <div className="t-bgs" aria-label="Backdrops">
          {BACKGROUNDS.map((b) => (
            <button key={b.id} className={`t-bg${bg === b.id ? ' on' : ''}`} style={{ background: b.thumb }} onClick={() => pickBackground(b.id)} aria-label={b.label} />
          ))}
        </div>
        <div className="t-stage-area" ref={areaRef}>
          <div className="t-canvas-wrap" style={{ width: size.w, height: size.h }} data-actors={JSON.stringify(view)} data-reaction={lastReaction} data-background={bg}>
            <canvas
              ref={canvasRef} width={STAGE_W} height={STAGE_H} aria-label="Puppet stage"
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            />
            <div
              className={`t-trash${trashHot ? ' hot' : ''}`} aria-label="Put away"
              style={{ left: `${(TRASH.x / STAGE_W) * 100}%`, top: `${(TRASH.y / STAGE_H) * 100}%`, width: `${(TRASH.w / STAGE_W) * 100}%`, height: `${(TRASH.h / STAGE_H) * 100}%` }}
            >🗑️</div>
            {full && <div className="t-toast" role="status">🙈</div>}
          </div>
        </div>
      </div>

      <div className="t-bottom">
        <div className="t-tray" aria-label="Friends and things">
          {sceneItems.map((a) => (
            <button key={a.id} className="t-tile" onClick={() => addArt(a)} aria-label={`Add ${a.label}`}>
              <img src={thumbUrl(a)} alt="" draggable={false} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
