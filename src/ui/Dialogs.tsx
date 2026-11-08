import { useEffect, useRef, useState } from 'react';
import { elevenVoices, getElevenKey, setElevenKey } from '../audio';
import { countBrowserVoices, exportVideo, pickMime } from '../exporter';
import { fmtTime } from '../model';
import { safeName } from '../projectFile';
import { pause } from '../transport';
import { useStore } from '../store';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <header><h2>{title}</h2><button className="btn small" onClick={onClose} aria-label="Close">✕</button></header>
        {children}
      </div>
    </div>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState(getElevenKey());
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Settings" onClose={onClose}>
      <h4>ElevenLabs voices (optional)</h4>
      <p className="hint">
        Paste your own ElevenLabs API key to generate studio-quality voices that <b>are</b> included in exported videos.
        The key is stored only in this browser and sent only to elevenlabs.io. Don’t use this on a shared computer.
      </p>
      <input type="password" autoComplete="off" placeholder="ElevenLabs API key" value={key} onChange={(e) => setKey(e.target.value.trim())} />
      <div className="row-btns">
        <button className="btn primary" onClick={() => { setElevenKey(key); setMsg(key ? 'Saved.' : 'Key removed.'); }}>Save</button>
        <button className="btn" disabled={!key || busy} onClick={async () => {
          setBusy(true);
          try {
            const v = await elevenVoices(key);
            setElevenKey(key);
            setMsg(`Works! ${v.length} voices available. Saved.`);
          } catch (e) {
            setMsg(e instanceof TypeError ? 'Could not reach ElevenLabs. Check your connection.' : (e as Error).message);
          } finally { setBusy(false); }
        }}>{busy ? 'Testing…' : 'Test & save'}</button>
      </div>
      {msg && <p className="hint" role="status">{msg}</p>}
    </Modal>
  );
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const [height, setHeight] = useState<720 | 1080>(720);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [ext, setExt] = useState<'mp4' | 'webm'>('mp4');
  const [skipped, setSkipped] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const mime = pickMime();
  const silent = countBrowserVoices(project);

  const urlRef = useRef('');
  urlRef.current = url;
  useEffect(() => () => { abort.current?.abort(); if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const run = async () => {
    pause();
    setPhase('running');
    setProgress(0);
    setError('');
    abort.current = new AbortController();
    try {
      const r = await exportVideo(project, { height, fps: 30, signal: abort.current.signal, onProgress: (f, l) => { setProgress(f); setLabel(l); } });
      setUrl(URL.createObjectURL(r.blob));
      setExt(r.ext);
      setSkipped(r.skippedBrowserVoices);
      setPhase('done');
    } catch (e) {
      if ((e as Error).name === 'AbortError') { setPhase('idle'); return; }
      setError((e as Error).message);
      setPhase('error');
    }
  };

  const close = () => {
    // Esc or a stray click must not throw away a recording that's minutes in.
    if (phase === 'running' && !window.confirm('Stop the export? Progress so far will be lost.')) return;
    abort.current?.abort();
    onClose();
  };

  return (
    <Modal title="Export video" onClose={close}>
      {phase === 'idle' && (
        <>
          <p><b>{project.title}</b> · {fmtTime(project.duration).replace(/\.\d$/, '')} long</p>
          {!mime && <p className="error">This browser can’t record video. Try the latest Chrome, Edge or Safari.</p>}
          <label className="field">Quality
            <select value={height} onChange={(e) => setHeight(Number(e.target.value) as 720 | 1080)}>
              <option value={720}>HD 720p (recommended)</option>
              <option value={1080}>Full HD 1080p</option>
            </select>
          </label>
          <ul className="notes">
            <li>Exporting runs in <b>real time</b>: about {Math.ceil(project.duration)} seconds. Keep this tab open and visible until it finishes.</li>
            {silent > 0 && <li className="warn">⚠ {silent} voice clip{silent > 1 ? 's use' : ' uses'} a computer voice, which browsers can’t record. {silent > 1 ? 'They' : 'It'} will be <b>silent</b> in the video. Re-do {silent > 1 ? 'them' : 'it'} with ElevenLabs or the microphone.</li>}
            {project.audio.length === 0 && <li>No sound added yet. The video will be silent.</li>}
            {mime && !/avc1/.test(mime) && <li>This browser saves <b>.webm</b> (or a non-H.264 file). YouTube and computers play it; for iPads/iPhones convert it to .mp4 with <code>scripts/to-mp4.sh</code> (see README). Chrome on desktop usually saves a ready-to-share .mp4.</li>}
          </ul>
          <button className="btn primary big" disabled={!mime} onClick={run}>🎬 Start export</button>
        </>
      )}
      {phase === 'running' && (
        <>
          <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}><span style={{ width: `${progress * 100}%` }} /></div>
          <p>{label}</p>
          <button className="btn" onClick={() => abort.current?.abort()}>Cancel</button>
        </>
      )}
      {phase === 'done' && (
        <>
          <video src={url} controls className="preview-video" />
          {skipped > 0 && <p className="hint warn">{skipped} computer-voice clip{skipped > 1 ? 's are' : ' is'} silent in this file.</p>}
          <div className="row-btns">
            <a className="btn primary" href={url} download={`${safeName(project.title)}.${ext}`}>⬇ Download .{ext}</a>
            <button className="btn" onClick={() => { URL.revokeObjectURL(url); setUrl(''); setPhase('idle'); }}>Make another</button>
          </div>
        </>
      )}
      {phase === 'error' && (
        <>
          <p className="error" role="alert">{error}</p>
          <button className="btn" onClick={() => setPhase('idle')}>Back</button>
        </>
      )}
    </Modal>
  );
}
