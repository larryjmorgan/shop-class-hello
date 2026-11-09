// Audio for the Puppet Theater: sound effects + optional music + (while recording) her live voice,
// mixed into one stream for the recording. Her voice is NOT played back through the speakers (no feedback squeal).

import { MicError, getAudioContext, loadBuffer, resumeAudio } from '../audio';
import { pickMime } from '../exporter';
import { rms } from './puppet';

export type MicStatus = 'ok' | 'denied' | 'unavailable';

export class TheaterAudio {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly recDest: MediaStreamAudioDestinationNode;
  private readonly musicGain: GainNode;
  private musicSrc: AudioBufferSourceNode | null = null;
  private mic: { stream: MediaStream; node: MediaStreamAudioSourceNode; analyser: AnalyserNode; buf: Float32Array<ArrayBuffer> } | null = null;
  private keepAlive: ConstantSourceNode | null = null;

  constructor() {
    this.ctx = getAudioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.recDest = this.ctx.createMediaStreamDestination();
    this.master.connect(this.recDest);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.3; // music stays well under her voice
    this.musicGain.connect(this.master);
  }

  async sfx(id: string, volume = 0.9): Promise<void> {
    await resumeAudio();
    const buf = await loadBuffer({ id: 'x', kind: 'sfx', preset: id, start: 0, duration: 1, volume: 1, label: '' });
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.master);
    src.start();
  }

  async setMusic(id: string | null): Promise<void> {
    const old = this.musicSrc;
    this.musicSrc = null;
    if (old) {
      try { old.stop(this.ctx.currentTime + 0.15); } catch { /* already stopped */ }
    }
    if (!id) return;
    await resumeAudio();
    const buf = await loadBuffer({ id: 'x', kind: 'music', preset: id, start: 0, duration: 1, volume: 1, label: '' });
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.musicGain);
    src.start();
    this.musicSrc = src;
  }

  /** Open the microphone (only while recording). Never throws. */
  async startMic(): Promise<MicStatus> {
    this.stopMic();
    if (!navigator.mediaDevices?.getUserMedia) return 'unavailable';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const node = this.ctx.createMediaStreamSource(stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 1024;
      const gain = this.ctx.createGain();
      gain.gain.value = 1.4; // children often speak softly...
      const limiter = this.ctx.createDynamicsCompressor(); // ...and then shout, so squash the loud bits instead of clipping them
      limiter.threshold.value = -14;
      limiter.knee.value = 6;
      limiter.ratio.value = 14;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      node.connect(analyser);
      node.connect(gain).connect(limiter).connect(this.recDest); // to the recording only, not the speakers
      this.mic = { stream, node, analyser, buf: new Float32Array(new ArrayBuffer(analyser.fftSize * 4)) };
      return 'ok';
    } catch (e) {
      return (e as DOMException)?.name === 'NotFoundError' ? 'unavailable' : 'denied';
    }
  }

  /** 0 (silent) .. ~1 (loud); 0 when the microphone is off. */
  micLevel(): number {
    if (!this.mic) return 0;
    this.mic.analyser.getFloatTimeDomainData(this.mic.buf);
    return rms(this.mic.buf);
  }

  get micOn(): boolean {
    return !!this.mic;
  }

  stopMic(): void {
    if (!this.mic) return;
    this.mic.stream.getTracks().forEach((t) => t.stop());
    try { this.mic.node.disconnect(); } catch { /* ignore */ }
    this.mic = null;
  }

  /** An inaudible constant signal so the recorded audio track runs for the whole movie, even in silence. */
  startKeepAlive(): void {
    if (this.keepAlive) return;
    const k = this.ctx.createConstantSource();
    k.offset.value = 0.0001;
    k.connect(this.recDest);
    k.start();
    this.keepAlive = k;
  }

  stopKeepAlive(): void {
    try { this.keepAlive?.stop(); this.keepAlive?.disconnect(); } catch { /* ignore */ }
    this.keepAlive = null;
  }

  dispose(): void {
    this.stopMic();
    this.stopKeepAlive();
    void this.setMusic(null);
    try { this.master.disconnect(); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Recording the stage + audio into a movie file
// ---------------------------------------------------------------------------

export interface TheaterClip {
  blob: Blob;
  mime: string;
  ext: 'mp4' | 'webm';
  seconds: number;
  poster: string;
}

export interface TheaterRecording {
  stop: () => Promise<TheaterClip>;
  /** Throw it away. */
  cancel: () => void;
  elapsed: () => number;
}

function poster(canvas: HTMLCanvasElement): string {
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = 135;
  c.getContext('2d')?.drawImage(canvas, 0, 0, 240, 135);
  return c.toDataURL('image/jpeg', 0.62);
}

export function startTheaterRecording(canvas: HTMLCanvasElement, audio: TheaterAudio): TheaterRecording {
  const mime = pickMime();
  if (!mime) throw new MicError('This browser cannot record video. Please use a recent Chrome or Edge.');
  audio.startKeepAlive();
  const stream = canvas.captureStream(30);
  audio.recDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start(1000);
  const t0 = performance.now();
  const release = () => {
    audio.stopKeepAlive();
    stream.getTracks().forEach((t) => t.stop());
  };
  return {
    elapsed: () => (performance.now() - t0) / 1000,
    cancel: () => {
      rec.onstop = null;
      if (rec.state !== 'inactive') rec.stop();
      release();
    },
    stop: () =>
      new Promise((resolve) => {
        const seconds = (performance.now() - t0) / 1000;
        const pic = poster(canvas);
        rec.onstop = () => {
          release();
          const actual = rec.mimeType || mime;
          const isMp4 = actual.startsWith('video/mp4');
          resolve({ blob: new Blob(chunks, { type: isMp4 ? 'video/mp4' : 'video/webm' }), mime: actual, ext: isMp4 ? 'mp4' : 'webm', seconds, poster: pic });
        };
        rec.stop();
      }),
  };
}
