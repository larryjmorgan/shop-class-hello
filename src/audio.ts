import { getBlob } from './db';
import type { AudioClip, Project } from './model';

// ---------------------------------------------------------------------------
// Shared AudioContext
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
export function getAudioContext(): AudioContext {
  ctx ??= new AudioContext({ sampleRate: 44100 });
  return ctx;
}
export async function resumeAudio(): Promise<AudioContext> {
  const c = getAudioContext();
  if (c.state !== 'running') await c.resume();
  return c;
}

// ---------------------------------------------------------------------------
// Procedural music + sound effects (no audio files needed, and fully exportable)
// ---------------------------------------------------------------------------

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

type Style = 'bouncy' | 'musicbox' | 'march' | 'silly';

interface MusicPreset {
  id: string;
  label: string;
  emoji: string;
  bpm: number;
  beatsPerBar: number;
  style: Style;
  melody: number[][]; // per bar, per beat: midi note or 0 for rest
  chords: number[][]; // per bar: triad (midi)
}

const C = [60, 64, 67], Am = [57, 60, 64], F = [53, 57, 60], G = [55, 59, 62], Dm = [50, 53, 57], Em = [52, 55, 59];

export const MUSIC: MusicPreset[] = [
  {
    id: 'sunny', label: 'Sunny Day', emoji: '☀️', bpm: 112, beatsPerBar: 4, style: 'bouncy',
    melody: [[72, 76, 79, 76], [69, 72, 76, 72], [65, 69, 72, 69], [67, 71, 74, 71], [72, 76, 79, 84], [81, 79, 76, 72], [77, 76, 74, 71], [72, 0, 67, 0]],
    chords: [C, Am, F, G, C, Am, F, C],
  },
  {
    id: 'lullaby', label: 'Sleepy Lullaby', emoji: '🌙', bpm: 72, beatsPerBar: 3, style: 'musicbox',
    melody: [[67, 72, 76], [74, 72, 71], [69, 72, 77], [76, 74, 0], [67, 72, 76], [79, 77, 76], [74, 71, 74], [72, 0, 0]],
    chords: [C, G, F, C, C, F, G, C],
  },
  {
    id: 'adventure', label: 'Big Adventure', emoji: '🗺️', bpm: 126, beatsPerBar: 4, style: 'march',
    melody: [[69, 0, 72, 74], [76, 0, 74, 72], [69, 0, 72, 74], [71, 0, 67, 0], [69, 0, 72, 74], [77, 0, 76, 74], [72, 74, 76, 74], [69, 0, 0, 0]],
    chords: [Am, F, Am, G, Am, F, Dm, Am],
  },
  {
    id: 'silly', label: 'Silly Dance', emoji: '🕺', bpm: 138, beatsPerBar: 4, style: 'silly',
    melody: [[72, 74, 72, 0], [67, 69, 67, 0], [72, 74, 76, 77], [79, 0, 0, 0], [76, 74, 72, 74], [76, 0, 72, 0], [74, 71, 67, 71], [72, 0, 0, 0]],
    chords: [C, C, F, C, Em, Am, G, C],
  },
];
export const musicById = (id: string) => MUSIC.find((m) => m.id === id);

function noiseBuffer(oc: BaseAudioContext, seconds: number): AudioBuffer {
  const b = oc.createBuffer(1, Math.ceil(oc.sampleRate * seconds), oc.sampleRate);
  const d = b.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    d[i] = (seed / 4294967296) * 2 - 1;
  }
  return b;
}

function tone(oc: BaseAudioContext, dest: AudioNode, o: { freq: number; when: number; dur: number; type?: OscillatorType; gain?: number; attack?: number; decayTo?: number; freqEnd?: number; detune?: number }) {
  const osc = oc.createOscillator();
  const g = oc.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, o.when);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, o.when + o.dur);
  if (o.detune) osc.detune.value = o.detune;
  const peak = o.gain ?? 0.2;
  const atk = o.attack ?? 0.01;
  g.gain.setValueAtTime(0.0001, o.when);
  g.gain.linearRampToValueAtTime(peak, o.when + atk);
  g.gain.exponentialRampToValueAtTime(o.decayTo ?? 0.0008, o.when + o.dur);
  osc.connect(g).connect(dest);
  osc.start(o.when);
  osc.stop(o.when + o.dur + 0.05);
}

function noiseHit(oc: BaseAudioContext, dest: AudioNode, nb: AudioBuffer, when: number, dur: number, gain: number, filter: { type: BiquadFilterType; freq: number }) {
  const src = oc.createBufferSource();
  src.buffer = nb;
  const f = oc.createBiquadFilter();
  f.type = filter.type;
  f.frequency.value = filter.freq;
  const g = oc.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.0008, when + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(when);
  src.stop(when + dur + 0.02);
}

/** Scale a rendered buffer so its loudest sample hits `peak` (keeps every preset at a similar loudness). */
export function normalize(buf: AudioBuffer, peak = 0.85): AudioBuffer {
  let max = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
  }
  if (max > 0.0001) {
    const k = peak / max;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
  }
  return buf;
}

export async function synthMusic(preset: MusicPreset): Promise<AudioBuffer> {
  const beat = 60 / preset.bpm;
  const bars = preset.melody.length;
  const total = bars * preset.beatsPerBar * beat;
  const oc = new OfflineAudioContext(2, Math.ceil(total * 44100), 44100);
  const master = oc.createGain();
  master.gain.value = 0.55;
  master.connect(oc.destination);
  const nb = noiseBuffer(oc, 0.5);

  for (let bar = 0; bar < bars; bar++) {
    const chord = preset.chords[bar];
    for (let b = 0; b < preset.beatsPerBar; b++) {
      const when = (bar * preset.beatsPerBar + b) * beat;
      const mel = preset.melody[bar][b];
      const first = b === 0;
      const mid = preset.beatsPerBar === 4 && b === 2;

      switch (preset.style) {
        case 'bouncy':
          if (mel) tone(oc, master, { freq: mtof(mel), when, dur: beat * 0.85, type: 'triangle', gain: 0.22 });
          if (first || mid) chord.forEach((n) => tone(oc, master, { freq: mtof(n), when, dur: beat * 1.6, type: 'sine', gain: 0.07, attack: 0.02 }));
          if (first || mid) tone(oc, master, { freq: mtof(chord[0] - 24), when, dur: beat * 0.9, type: 'sine', gain: 0.22 });
          noiseHit(oc, master, nb, when + beat / 2, 0.05, 0.05, { type: 'highpass', freq: 7000 });
          break;
        case 'musicbox':
          if (mel) {
            tone(oc, master, { freq: mtof(mel), when, dur: beat * 1.8, type: 'sine', gain: 0.2, attack: 0.004 });
            tone(oc, master, { freq: mtof(mel) * 2, when, dur: beat * 0.9, type: 'sine', gain: 0.06, attack: 0.004 });
            tone(oc, master, { freq: mtof(mel) * 3.01, when, dur: beat * 0.35, type: 'sine', gain: 0.025, attack: 0.002 });
          }
          if (first) tone(oc, master, { freq: mtof(chord[0] - 24), when, dur: beat * 2.5, type: 'sine', gain: 0.14, attack: 0.03 });
          else tone(oc, master, { freq: mtof(chord[b % 3]), when: when + beat * 0.5, dur: beat * 1, type: 'sine', gain: 0.05, attack: 0.01 });
          break;
        case 'march':
          if (mel) tone(oc, master, { freq: mtof(mel), when, dur: beat * 0.7, type: 'square', gain: 0.07 });
          tone(oc, master, { freq: mtof(chord[0] - 24), when, dur: beat * 0.45, type: 'triangle', gain: 0.24 });
          tone(oc, master, { freq: mtof(chord[0] - 24), when: when + beat / 2, dur: beat * 0.4, type: 'triangle', gain: 0.18 });
          if (b % 2 === 0) tone(oc, master, { freq: 120, freqEnd: 40, when, dur: 0.16, type: 'sine', gain: 0.5 });
          else noiseHit(oc, master, nb, when, 0.12, 0.2, { type: 'bandpass', freq: 1800 });
          if (first) chord.forEach((n) => tone(oc, master, { freq: mtof(n), when, dur: beat * 3.4, type: 'triangle', gain: 0.045, attack: 0.05 }));
          break;
        case 'silly':
          if (mel) tone(oc, master, { freq: mtof(mel), when, dur: beat * 0.3, type: 'square', gain: 0.08 });
          if (mel) tone(oc, master, { freq: mtof(mel) * 1.5, when: when + beat / 2, dur: beat * 0.2, type: 'square', gain: 0.04 });
          tone(oc, master, { freq: mtof(chord[0] - 24 + (b % 2 ? 7 : 0)), when, dur: beat * 0.4, type: 'triangle', gain: 0.24 });
          if (b % 2 === 0) tone(oc, master, { freq: 130, freqEnd: 45, when, dur: 0.14, type: 'sine', gain: 0.45 });
          noiseHit(oc, master, nb, when + beat / 2, 0.05, 0.08, { type: 'highpass', freq: 6000 });
          break;
      }
    }
  }
  return normalize(await oc.startRendering(), 0.8);
}

export interface SfxPreset { id: string; label: string; emoji: string; seconds: number; build: (oc: BaseAudioContext, dest: AudioNode, nb: AudioBuffer) => void }

export const SFX: SfxPreset[] = [
  { id: 'pop', label: 'Pop', emoji: '💥', seconds: 0.4, build: (oc, d) => tone(oc, d, { freq: 700, freqEnd: 180, when: 0, dur: 0.12, gain: 0.6 }) },
  { id: 'boing', label: 'Boing', emoji: '🪀', seconds: 0.9, build: (oc, d) => {
    const osc = oc.createOscillator();
    const g = oc.createGain();
    const lfo = oc.createOscillator();
    const lg = oc.createGain();
    osc.frequency.setValueAtTime(180, 0);
    osc.frequency.exponentialRampToValueAtTime(520, 0.12);
    osc.frequency.exponentialRampToValueAtTime(150, 0.8);
    lfo.frequency.value = 22;
    lg.gain.value = 40;
    lfo.connect(lg).connect(osc.frequency);
    g.gain.setValueAtTime(0.5, 0);
    g.gain.exponentialRampToValueAtTime(0.001, 0.85);
    osc.connect(g).connect(d);
    osc.start(0); lfo.start(0); osc.stop(0.9); lfo.stop(0.9);
  } },
  { id: 'twinkle', label: 'Twinkle', emoji: '✨', seconds: 1.6, build: (oc, d) => [84, 88, 91, 96, 100].forEach((m, i) => {
    tone(oc, d, { freq: mtof(m), when: i * 0.1, dur: 0.9, gain: 0.16, attack: 0.004 });
    tone(oc, d, { freq: mtof(m) * 2, when: i * 0.1, dur: 0.4, gain: 0.04, attack: 0.004 });
  }) },
  { id: 'whoosh', label: 'Whoosh', emoji: '💨', seconds: 1.0, build: (oc, d, nb) => {
    const src = oc.createBufferSource();
    src.buffer = nb;
    src.loop = true;
    const f = oc.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, 0);
    f.frequency.exponentialRampToValueAtTime(3200, 0.45);
    f.frequency.exponentialRampToValueAtTime(400, 0.95);
    const g = oc.createGain();
    g.gain.setValueAtTime(0.001, 0);
    g.gain.linearRampToValueAtTime(0.5, 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, 0.95);
    src.connect(f).connect(g).connect(d);
    src.start(0); src.stop(1);
  } },
  { id: 'tada', label: 'Ta-da!', emoji: '🎉', seconds: 1.8, build: (oc, d) => {
    [[60, 0], [64, 0], [67, 0], [72, 0.22], [76, 0.22], [79, 0.22], [84, 0.22]].forEach(([m, w]) =>
      tone(oc, d, { freq: mtof(m), when: w, dur: w ? 1.4 : 0.2, type: 'triangle', gain: w ? 0.12 : 0.1, attack: 0.01 }));
  } },
  { id: 'splash', label: 'Splash', emoji: '💦', seconds: 1.0, build: (oc, d, nb) => noiseHit(oc, d, nb, 0, 0.8, 0.6, { type: 'lowpass', freq: 1400 }) },
  { id: 'sad', label: 'Aww', emoji: '😢', seconds: 1.3, build: (oc, d) => {
    tone(oc, d, { freq: mtof(67), freqEnd: mtof(60), when: 0, dur: 1.1, type: 'triangle', gain: 0.25, attack: 0.05 });
  } },
  { id: 'yay', label: 'Yay!', emoji: '🥳', seconds: 1.0, build: (oc, d) => {
    tone(oc, d, { freq: mtof(72), freqEnd: mtof(84), when: 0, dur: 0.5, type: 'square', gain: 0.08, attack: 0.02 });
    tone(oc, d, { freq: mtof(79), freqEnd: mtof(91), when: 0.2, dur: 0.6, type: 'square', gain: 0.06, attack: 0.02 });
  } },
];
export const sfxById = (id: string) => SFX.find((s) => s.id === id);

async function synthSfx(p: SfxPreset): Promise<AudioBuffer> {
  const oc = new OfflineAudioContext(2, Math.ceil(p.seconds * 44100), 44100);
  const master = oc.createGain();
  master.gain.value = 0.9;
  master.connect(oc.destination);
  p.build(oc, master, noiseBuffer(oc, 1));
  return normalize(await oc.startRendering(), 0.8);
}

// ---------------------------------------------------------------------------
// Buffers
// ---------------------------------------------------------------------------

const buffers = new Map<string, Promise<AudioBuffer | null>>();

export function bufferKeyFor(c: AudioClip): string | null {
  if (c.blobKey) return `b:${c.blobKey}`;
  if (c.kind === 'music' && c.preset) return `m:${c.preset}`;
  if (c.kind === 'sfx' && c.preset) return `s:${c.preset}`;
  return null;
}

export function loadBuffer(c: AudioClip): Promise<AudioBuffer | null> {
  const key = bufferKeyFor(c);
  if (!key) return Promise.resolve(null);
  let p = buffers.get(key);
  if (!p) {
    p = (async () => {
      try {
        if (c.blobKey) {
          const blob = await getBlob(c.blobKey);
          if (!blob) return null;
          return await getAudioContext().decodeAudioData(await blob.arrayBuffer());
        }
        if (c.kind === 'music') {
          const pr = musicById(c.preset!);
          return pr ? await synthMusic(pr) : null;
        }
        const sp = sfxById(c.preset!);
        return sp ? await synthSfx(sp) : null;
      } catch (e) {
        console.warn('Could not load audio', key, e);
        return null;
      }
    })();
    buffers.set(key, p);
    // A failed/missing load must not be remembered forever (e.g. the blob arrives later from a project file).
    void p.then((b) => { if (!b && buffers.get(key) === p) buffers.delete(key); });
  }
  return p;
}

export function forgetBuffer(blobKey: string) {
  buffers.delete(`b:${blobKey}`);
}

export async function decodeBlobDuration(blob: Blob): Promise<number> {
  const buf = await getAudioContext().decodeAudioData(await blob.arrayBuffer());
  return buf.duration;
}

export async function preloadAudio(p: Project): Promise<void> {
  await Promise.all(p.audio.map(loadBuffer));
}

/** Length of one loop of a music preset (seconds). */
export function musicLoopSeconds(presetId: string): number {
  const pr = musicById(presetId);
  return pr ? (pr.melody.length * pr.beatsPerBar * 60) / pr.bpm : 0;
}

// ---------------------------------------------------------------------------
// Browser speech (preview only: browsers can't capture it into a video file)
// ---------------------------------------------------------------------------

export function browserVoices(): SpeechSynthesisVoice[] {
  return typeof speechSynthesis === 'undefined' ? [] : speechSynthesis.getVoices();
}

export function speakBrowser(c: Pick<AudioClip, 'text' | 'voiceId' | 'rate' | 'pitch' | 'volume'>, onEnd?: (seconds: number) => void): void {
  if (typeof speechSynthesis === 'undefined' || !c.text) return;
  const u = new SpeechSynthesisUtterance(c.text);
  const v = browserVoices().find((x) => x.voiceURI === c.voiceId);
  if (v) u.voice = v;
  u.rate = c.rate ?? 1;
  u.pitch = c.pitch ?? 1;
  u.volume = Math.min(1, c.volume ?? 1);
  let t0 = 0;
  u.onstart = () => (t0 = performance.now());
  u.onend = () => onEnd?.((performance.now() - t0) / 1000);
  speechSynthesis.speak(u);
}

export function stopBrowserSpeech() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

// ---------------------------------------------------------------------------
// ElevenLabs (optional, needs the user's own API key)
// ---------------------------------------------------------------------------

const KEY_STORAGE = 'storybox.elevenKey';
export const getElevenKey = (): string => {
  try { return localStorage.getItem(KEY_STORAGE) ?? ''; } catch { return ''; }
};
export const setElevenKey = (k: string) => {
  try { k ? localStorage.setItem(KEY_STORAGE, k) : localStorage.removeItem(KEY_STORAGE); } catch { /* ignore */ }
};

async function elevenError(res: Response): Promise<Error> {
  let detail = '';
  try {
    const j = await res.json();
    detail = j?.detail?.message ?? j?.detail ?? '';
    if (typeof detail !== 'string') detail = JSON.stringify(detail);
  } catch { /* ignore */ }
  if (res.status === 401) return new Error('ElevenLabs rejected the API key (401). Check it in Settings.');
  if (res.status === 429) return new Error('ElevenLabs rate/credit limit reached (429).');
  return new Error(`ElevenLabs error ${res.status}${detail ? `: ${detail}` : ''}`);
}

export async function elevenVoices(apiKey: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey } });
  if (!res.ok) throw await elevenError(res);
  const j = await res.json();
  return (j.voices ?? []).map((v: { voice_id: string; name: string }) => ({ id: v.voice_id, name: v.name }));
}

export async function elevenSpeak(text: string, voiceId: string, apiKey: string): Promise<Blob> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
  });
  if (!res.ok) throw await elevenError(res);
  return res.blob();
}

// ---------------------------------------------------------------------------
// Microphone recording
// ---------------------------------------------------------------------------

export async function startMicRecording(): Promise<{ stop: () => Promise<Blob> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
        };
        rec.stop();
      }),
  };
}

// ---------------------------------------------------------------------------
// Playback engine (preview + export share this)
// ---------------------------------------------------------------------------

export interface PlayHandle {
  stop: () => void;
  /** performance.now() value at which project time `fromT` is heard (audio starts slightly after the call). */
  wallStart: number;
}

const DUCK = 0.32;

function mergeIntervals(iv: [number, number][], gap: number): [number, number][] {
  const s = [...iv].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const cur of s) {
    const last = out[out.length - 1];
    if (last && cur[0] - last[1] < gap) last[1] = Math.max(last[1], cur[1]);
    else out.push([cur[0], cur[1]]);
  }
  return out;
}

/** Piecewise-linear gain curve breakpoints for music ducking, as [projectTime, multiplier]. */
export function duckCurve(voice: [number, number][]): [number, number][] {
  const pts: [number, number][] = [];
  for (const [a, b] of mergeIntervals(voice, 0.9)) {
    pts.push([a - 0.25, 1], [a, DUCK], [b, DUCK], [b + 0.5, 1]);
  }
  return pts;
}

export function curveAt(pts: [number, number][], t: number): number {
  if (pts.length === 0 || t <= pts[0][0]) return 1;
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, v0] = pts[i];
    const [t1, v1] = pts[i + 1];
    if (t >= t0 && t <= t1) return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return 1;
}

/**
 * Schedule every clip in the project starting from `fromT`.
 * All buffers must already be loaded (call preloadAudio first).
 * `speakers` = true plays browser-TTS clips through the speech engine (preview only).
 */
export async function startPlayback(p: Project, fromT: number, dest: AudioNode, opts: { speakers: boolean }): Promise<PlayHandle> {
  const ac = getAudioContext();
  const base = ac.currentTime + 0.06;
  const nodes: AudioScheduledSourceNode[] = [];
  const timers: number[] = [];

  // Computer-voice clips are only audible in preview, so they only duck the music there.
  const voiceIv: [number, number][] = p.audio
    .filter((c) => c.kind === 'voice' && (opts.speakers || c.provider !== 'browser'))
    .map((c) => [c.start, c.start + c.duration]);
  const duck = p.duckMusic ? duckCurve(voiceIv) : [];

  for (const clip of p.audio) {
    const clipEnd = clip.start + clip.duration;
    if (clipEnd <= fromT) continue;

    if (clip.provider === 'browser') {
      if (opts.speakers && clip.start >= fromT - 0.01) {
        timers.push(window.setTimeout(() => speakBrowser(clip), Math.max(0, (clip.start - fromT) * 1000)));
      }
      continue;
    }

    const buf = await loadBuffer(clip);
    if (!buf) continue;
    const rate = clip.kind === 'voice' && clip.provider === 'mic' ? clip.rate ?? 1 : 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ac.createGain();
    const vol = clip.volume * (clip.kind === 'music' ? 0.9 : 1);
    src.connect(g).connect(dest);

    const when = base + Math.max(0, clip.start - fromT);
    const intoClip = Math.max(0, fromT - clip.start);
    const playLen = clipEnd - Math.max(clip.start, fromT);
    const endAt = when + playLen;

    if (clip.kind === 'music') {
      src.loop = true;
      src.loopEnd = buf.duration;
      const tAbs = Math.max(clip.start, fromT);
      g.gain.setValueAtTime(vol * (duck.length ? curveAt(duck, tAbs) : 1), base);
      // fade in/out so cuts never click
      const fadeIn = clip.start >= fromT ? 0.4 : 0;
      if (fadeIn) {
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(vol * curveAt(duck, clip.start), when + fadeIn);
      }
      for (const [pt, mult] of duck) {
        if (pt > tAbs + fadeIn && pt < clipEnd) g.gain.linearRampToValueAtTime(vol * mult, base + (pt - fromT));
      }
      const fadeOutStart = Math.max(when + 0.01, endAt - 0.6);
      g.gain.setValueAtTime(vol * curveAt(duck, Math.max(tAbs, clipEnd - 0.6)), fadeOutStart);
      g.gain.linearRampToValueAtTime(0.0001, endAt);
      src.start(when, intoClip % buf.duration);
    } else {
      g.gain.setValueAtTime(vol, when);
      g.gain.setValueAtTime(vol, Math.max(when, endAt - 0.05));
      g.gain.linearRampToValueAtTime(0.0001, endAt);
      src.start(when, Math.min(intoClip * rate, Math.max(0, buf.duration - 0.001)));
    }
    src.stop(endAt + 0.02);
    nodes.push(src);
  }

  return {
    wallStart: performance.now() + (base - ac.currentTime) * 1000,
    stop: () => {
      timers.forEach((t) => clearTimeout(t));
      nodes.forEach((n) => {
        try { n.stop(); } catch { /* already stopped */ }
        n.disconnect();
      });
      if (opts.speakers) stopBrowserSpeech();
    },
  };
}
