import { getAudioContext, preloadAudio, resumeAudio, startPlayback, type PlayHandle } from './audio';
import { preloadProject } from './render';
import { getState, getTime, isPlaying, setPlaying, setTime } from './store';

let handle: PlayHandle | null = null;
let raf = 0;
let token = 0;

export async function play(): Promise<void> {
  if (isPlaying()) return;
  const my = ++token;
  const project = getState().project;
  if (getTime() >= project.duration - 0.05) setTime(0);
  await resumeAudio();
  await Promise.all([preloadAudio(project), preloadProject(project)]);
  if (my !== token) return;
  const from = getTime();
  handle = await startPlayback(project, from, getAudioContext().destination, { speakers: true });
  if (my !== token) {
    handle.stop();
    handle = null;
    return;
  }
  const wall0 = handle.wallStart; // locks the picture to when the audio is really heard
  setPlaying(true);
  const loop = () => {
    const t = Math.max(from, from + (performance.now() - wall0) / 1000);
    const end = getState().project.duration; // read live so changing the length mid-play is safe
    if (t >= end) {
      pause();
      setTime(end);
      return;
    }
    setTime(t);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

export function pause(): void {
  token++;
  cancelAnimationFrame(raf);
  handle?.stop();
  handle = null;
  setPlaying(false);
}

export function toggle(): void {
  if (isPlaying()) pause();
  else void play();
}

export function seek(t: number): void {
  const was = isPlaying();
  if (was) pause();
  setTime(t);
  if (was) void play();
}
