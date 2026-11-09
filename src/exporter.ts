import { preloadAudio, resumeAudio, startPlayback } from './audio';
import type { Project } from './model';
import { STAGE_H, STAGE_W } from './model';
import { preloadProject, renderFrame } from './render';

export interface ExportOptions {
  height: 720 | 1080;
  fps: number;
  onProgress: (fraction: number, label: string) => void;
  signal: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  mime: string;
  ext: 'mp4' | 'webm';
  draftLinesWithoutVoice: number;
  /** The tab was in the background at some point, so part of the picture may have frozen. */
  tabWasHidden: boolean;
}

// Prefer H.264 + AAC in MP4 (plays on iPads/phones/YouTube). Fall back to WebM. A bare 'video/mp4'
// is last because some Chromium builds then record VP9 inside an .mp4, which Apple devices may refuse.
const CANDIDATES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

export function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function countDraftLines(p: Project): number {
  return p.audio.filter((a) => a.kind === 'voice' && a.provider === 'draft').length;
}

/**
 * Renders the project in real time into a canvas and records canvas + mixed audio.
 * Real-time means a 3-minute story takes 3 minutes, and the tab must stay visible.
 */
export async function exportVideo(project: Project, opts: ExportOptions): Promise<ExportResult> {
  const mime = pickMime();
  if (!mime) throw new Error('This browser cannot record video. Use a recent Chrome, Edge or Safari.');

  opts.onProgress(0, 'Getting pictures and sounds ready…');
  await preloadProject(project);
  await preloadAudio(project);
  const ac = await resumeAudio();

  const W = Math.round((STAGE_W / STAGE_H) * opts.height);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = opts.height;
  const g = canvas.getContext('2d', { alpha: false })!;
  renderFrame(g, project, 0);

  const audioDest = ac.createMediaStreamDestination();
  // A constant, inaudible (-80 dB) signal keeps the audio track running for the whole video. Without it the recorder
  // stops writing audio once the last sound ends, leaving a shorter audio track than video.
  const keepAlive = ac.createConstantSource();
  keepAlive.offset.value = 0.0001;
  keepAlive.connect(audioDest);
  keepAlive.start();
  const stream = canvas.captureStream(opts.fps);
  audioDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: opts.height === 1080 ? 10_000_000 : 6_000_000, audioBitsPerSecond: 160_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((res) => (rec.onstop = () => res()));

  // Keep the screen awake and notice if the tab is hidden (browsers pause drawing in background tabs).
  let tabWasHidden = document.visibilityState === 'hidden';
  const onVisibility = () => { if (document.visibilityState === 'hidden') tabWasHidden = true; };
  document.addEventListener('visibilitychange', onVisibility);
  let wake: WakeLockSentinel | null = null;
  try { wake = (await navigator.wakeLock?.request('screen')) ?? null; } catch { /* not allowed: fine */ }
  const cleanup = () => {
    try { keepAlive.stop(); keepAlive.disconnect(); } catch { /* already stopped */ }
    document.removeEventListener('visibilitychange', onVisibility);
    void wake?.release().catch(() => undefined);
  };

  rec.start(1000);
  let handle;
  try {
    handle = await startPlayback(project, 0, audioDest);
  } catch (err) {
    cleanup();
    rec.stop();
    stream.getTracks().forEach((tr) => tr.stop());
    throw err;
  }
  const t0 = handle.wallStart;
  const total = project.duration;
  let aborted = false;

  await new Promise<void>((resolve) => {
    const tick = () => {
      if (opts.signal.aborted) {
        aborted = true;
        return resolve();
      }
      const t = Math.min(total, Math.max(0, (performance.now() - t0) / 1000));
      renderFrame(g, project, t);
      opts.onProgress(t / total, `Recording… ${Math.floor(t)}s of ${total}s`);
      if (t >= total) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // hold the final frame briefly so the last audio tail is captured
  if (!aborted) await new Promise((r) => setTimeout(r, 350));
  handle.stop();
  if (rec.state !== 'inactive') rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  cleanup();
  if (aborted) throw new DOMException('Export cancelled', 'AbortError');

  const actual = rec.mimeType || mime;
  const isMp4 = actual.startsWith('video/mp4');
  const type = isMp4 ? 'video/mp4' : 'video/webm';
  return { blob: new Blob(chunks, { type }), mime: actual, ext: isMp4 ? 'mp4' : 'webm', draftLinesWithoutVoice: countDraftLines(project), tabWasHidden };
}
