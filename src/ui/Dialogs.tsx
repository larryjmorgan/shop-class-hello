import { useEffect, useRef, useState } from 'react';
import { elevenVoices, findMissingAudio, getElevenKey, setElevenKey } from '../audio';
import { countDraftLines, exportVideo, pickMime } from '../exporter';
import { fmtTime, type AudioClip, type Project } from '../model';
import { safeName } from '../projectFile';
import { pause } from '../transport';
import { useStore } from '../store';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-label={title}>
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

/** Exports the Studio's open story, or any other story passed in (e.g. a kid's story from the shelf). */
export function ExportDialog({ onClose, project: given }: { onClose: () => void; project?: Project }) {
  const studioProject = useStore((s) => s.project);
  const project = given ?? studioProject;
  const [height, setHeight] = useState<720 | 1080>(720);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [ext, setExt] = useState<'mp4' | 'webm'>('mp4');
  const [skipped, setSkipped] = useState(0);
  const [hiddenTab, setHiddenTab] = useState(false);
  const [missing, setMissing] = useState<AudioClip[]>([]);
  const abort = useRef<AbortController | null>(null);
  const mime = pickMime();
  const silent = countDraftLines(project);

  useEffect(() => { void findMissingAudio(project).then(setMissing); }, [project]);

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
      setSkipped(r.draftLinesWithoutVoice);
      setHiddenTab(r.tabWasHidden);
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
            {silent > 0 && <li className="warn">⚠ {silent} voice clip{silent > 1 ? 's have' : ' has'} no voice yet, so {silent > 1 ? 'they' : 'it'} will be <b>silent</b> in the video.</li>}
            {missing.length > 0 && <li className="warn">⚠ {missing.length} clip{missing.length > 1 ? 's have' : ' has'} lost {missing.length > 1 ? 'their' : 'its'} audio on this device ({missing.slice(0, 3).map((m) => `“${m.label}”`).join(', ')}{missing.length > 3 ? '…' : ''}) and will be silent. Record or generate {missing.length > 1 ? 'them' : 'it'} again.</li>}
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
          {hiddenTab && <p className="hint warn">⚠ This tab was in the background while recording, so parts of the picture may be frozen. Watch the preview; if it looks wrong, export again and keep this tab visible.</p>}
          {skipped > 0 && <p className="hint warn">{skipped} line{skipped > 1 ? 's have' : ' has'} no voice and {skipped > 1 ? 'are' : 'is'} silent in this file.</p>}
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
