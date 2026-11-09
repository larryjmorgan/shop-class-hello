import { useEffect, useRef, useState } from 'react';
import { getAudioContext, preloadAudio, resumeAudio, startPlayback, type PlayHandle } from '../audio';
import { STAGE_H, STAGE_W, type Project } from '../model';
import { preloadProject, renderFrame } from '../render';
import { useFit16x9 } from './useFit';

/** Plays a story full-screen with music and sounds. Big buttons: pause/play, close; at the end: again / done. */
export function StoryPlayer({ project, onClose, onDone }: { project: Project; onClose: () => void; onDone?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handle = useRef<PlayHandle | null>(null);
  const raf = useRef(0);
  const pos = useRef(0);
  const token = useRef(0);
  const [state, setState] = useState<'loading' | 'playing' | 'paused' | 'ended'>('loading');
  const [progress, setProgress] = useState(0);
  const [areaRef, size] = useFit16x9(4);

  const draw = (t: number) => {
    const ctx = canvasRef.current?.getContext('2d', { alpha: false });
    if (ctx) renderFrame(ctx, project, t);
  };

  const stop = () => {
    token.current++;
    cancelAnimationFrame(raf.current);
    handle.current?.stop();
    handle.current = null;
  };

  const play = async (from: number) => {
    stop();
    const my = token.current;
    setState('loading');
    await resumeAudio();
    await Promise.all([preloadAudio(project), preloadProject(project)]);
    if (my !== token.current) return;
    handle.current = await startPlayback(project, from, getAudioContext().destination);
    if (my !== token.current) { handle.current.stop(); return; }
    const wall0 = handle.current.wallStart;
    setState('playing');
    const loop = () => {
      const t = Math.max(from, from + (performance.now() - wall0) / 1000);
      pos.current = Math.min(t, project.duration);
      draw(pos.current);
      setProgress(pos.current / project.duration);
      if (t >= project.duration) {
        stop();
        setState('ended');
        return;
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    draw(0);
    void play(0);
    return stop;
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  const pause = () => { stop(); setState('paused'); };

  return (
    <div className="player story-player" role="dialog" aria-label="Story player" data-state={state}>
      <div className="sp-stage" ref={areaRef}>
        <canvas ref={canvasRef} width={STAGE_W} height={STAGE_H} style={{ width: size.w, height: size.h }} aria-label="Story" />
      </div>
      <div className="sp-progress"><span style={{ width: `${progress * 100}%` }} /></div>
      <div className="sp-controls">
        {state === 'ended' ? (
          <>
            <button className="kbtn big" onClick={() => void play(0)} aria-label="Watch again">🔁</button>
            <button className="kbtn big good" onClick={onDone ?? onClose} aria-label="Done">✅</button>
          </>
        ) : state === 'paused' ? (
          <button className="kbtn big" onClick={() => void play(pos.current)} aria-label="Play">▶️</button>
        ) : (
          <button className="kbtn big" onClick={pause} disabled={state === 'loading'} aria-label="Pause">⏸️</button>
        )}
      </div>
      <button className="kbtn round close" onClick={onClose} aria-label="Close story">✖</button>
    </div>
  );
}
