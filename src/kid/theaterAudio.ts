// Sound for the kids' screens: short sound effects and gentle music. There is no microphone anywhere.

import { getAudioContext, loadBuffer, resumeAudio } from '../audio';

export class TheaterAudio {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly musicGain: GainNode;
  private musicSrc: AudioBufferSourceNode | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.ctx = getAudioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.35;
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

  /** Loop a music preset (null = stop). With `seconds`, it stops by itself (a short preview). */
  async setMusic(id: string | null, seconds?: number): Promise<void> {
    clearTimeout(this.stopTimer);
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
    if (seconds) this.stopTimer = setTimeout(() => { if (this.musicSrc === src) void this.setMusic(null); }, seconds * 1000);
  }

  dispose(): void {
    clearTimeout(this.stopTimer);
    void this.setMusic(null);
    try { this.master.disconnect(); } catch { /* ignore */ }
  }
}
