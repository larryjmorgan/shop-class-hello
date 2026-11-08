import { useEffect, useRef, useState } from 'react';
import { MicError, decodeBlobDuration, startMicRecording, type MicRecording } from '../audio';
import { putBlob } from '../db';
import { fmtTime, overlappingVoiceLines, uid } from '../model';
import { replaceVoiceAudio, useStore } from '../store';
import { Modal } from './Dialogs';

type Phase = 'ready' | 'recording' | 'review' | 'saving';
interface Take {
  blob: Blob;
  url: string;
  len: number;
}

const MIN_TAKE = 0.4; // seconds: shorter than this is almost certainly an accidental tap

/**
 * Walks through voice lines one at a time: shows the words, records the user's voice, lets them
 * listen back, then swaps the sound in (words, speaker and start time stay as they were).
 */
export function NarrationDialog({ clipIds, onClose }: { clipIds: string[]; onClose: () => void }) {
  const project = useStore((s) => s.project);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [take, setTake] = useState<Take | null>(null);
  const [effect, setEffect] = useState('1');
  const [error, setError] = useState('');
  const [secs, setSecs] = useState(0);
  const [recorded, setRecorded] = useState<string[]>([]);
  const recRef = useRef<MicRecording | null>(null);
  const takeRef = useRef<Take | null>(null);
  takeRef.current = take;

  // Lines are fixed when the helper opens, but each is looked up live (so a title/length edit can't desync it).
  const lines = clipIds.map((id) => project.audio.find((a) => a.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
  const clip = lines[index];
  const finished = index >= lines.length;

  // Never leave the microphone running or leak a recording when the dialog closes.
  useEffect(() => () => {
    recRef.current?.cancel();
    if (takeRef.current) URL.revokeObjectURL(takeRef.current.url);
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return;
    setSecs(0);
    const t0 = Date.now();
    const id = window.setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  const dropTake = () => {
    if (takeRef.current) URL.revokeObjectURL(takeRef.current.url);
    setTake(null);
  };

  const goTo = (i: number) => {
    recRef.current?.cancel();
    recRef.current = null;
    dropTake();
    setError('');
    setPhase('ready');
    setIndex(Math.max(0, i));
  };

  const start = async () => {
    setError('');
    dropTake();
    try {
      recRef.current = await startMicRecording();
      setPhase('recording');
    } catch (e) {
      setError(e instanceof MicError ? e.message : 'The microphone could not be started.');
    }
  };

  const stop = async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    setPhase('saving');
    try {
      const blob = await rec.stop();
      const len = await decodeBlobDuration(blob);
      if (len < MIN_TAKE) {
        setError('That was very short. Press Record and try again.');
        setPhase('ready');
        return;
      }
      setTake({ blob, len, url: URL.createObjectURL(blob) });
      setPhase('review');
    } catch {
      setError('That recording could not be read. Please try again.');
      setPhase('ready');
    }
  };

  const keep = async () => {
    if (!take || !clip) return;
    setPhase('saving');
    const key = uid('blob');
    const saved = await putBlob(key, take.blob);
    replaceVoiceAudio(clip.id, { blobKey: key, bufferDuration: take.len, rate: Number(effect) });
    setRecorded((r) => [...r, clip.id]);
    dropTake();
    if (!saved) setError('Kept, but this browser could not save the sound for later. Use Project → Save file… before closing the page.');
    setPhase('ready');
    setIndex((i) => i + 1);
  };

  if (finished) {
    const overlaps = overlappingVoiceLines(project).filter((c) => clipIds.includes(c.id));
    return (
      <Modal title="All done! 🎉" onClose={onClose}>
        <p>
          You recorded <b>{recorded.length}</b> of {lines.length} line{lines.length === 1 ? '' : 's'}.
          {recorded.length < lines.length && ' The others still use the computer voice, which is silent in the finished video.'}
        </p>
        {overlaps.length > 0 && (
          <p className="hint warn">
            Some recordings are longer than the old ones and now overlap another line ({overlaps.map((c) => fmtTime(c.start)).join(', ')}).
            Drag the pink bars apart in the timeline.
          </p>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row-btns">
          <button className="btn primary big" onClick={onClose}>Back to my story</button>
          <button className="btn" onClick={() => goTo(0)}>Go through the lines again</button>
        </div>
      </Modal>
    );
  }

  if (!clip) return null; // all lines were deleted while the dialog was open

  const busy = phase === 'saving';
  return (
    <Modal title={`Record your lines · ${index + 1} of ${lines.length}`} onClose={onClose}>
      <div className="dots" aria-hidden="true">
        {lines.map((l, i) => (
          <span key={l.id} className={`${i === index ? 'now' : ''}${recorded.includes(l.id) ? ' done' : ''}`} />
        ))}
      </div>
      <p className="muted">
        <b>{clip.label}</b> says this at {fmtTime(clip.start)}{clip.provider === 'browser' ? ' (currently a computer voice)' : ' (replacing the current recording)'}:
      </p>
      <blockquote className="script">{clip.text?.trim() || '(No words were saved for this line. Just say it your way!)'}</blockquote>

      {phase === 'ready' && (
        <>
          <label className="field">Voice effect
            <select value={effect} onChange={(e) => setEffect(e.target.value)}>
              <option value="1">My normal voice</option>
              <option value="1.3">Squeaky (like a bunny)</option>
              <option value="0.8">Deep (like a big bear)</option>
            </select>
          </label>
          <button className="btn primary big" onClick={start} disabled={busy}>● Record</button>
          <p className="hint">Press Record, read the line out loud, then press Stop.</p>
        </>
      )}
      {phase === 'recording' && (
        <>
          <p className="recording" role="status"><span className="dot" /> Recording… {secs}s</p>
          <button className="btn danger big" onClick={stop}>■ Stop</button>
        </>
      )}
      {phase === 'review' && take && (
        <>
          <p className="muted">Listen to your take ({take.len.toFixed(1)}s):</p>
          <audio src={take.url} controls autoPlay className="take-audio" />
          <div className="row-btns">
            <button className="btn primary big" onClick={keep}>✓ Keep this one</button>
            <button className="btn" onClick={() => { dropTake(); setPhase('ready'); }}>↺ Try again</button>
          </div>
        </>
      )}
      {phase === 'saving' && <p className="muted">Saving…</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="row-btns nav">
        <button className="btn small" onClick={() => goTo(index - 1)} disabled={index === 0 || busy}>← Back</button>
        <button className="btn small" onClick={() => goTo(index + 1)} disabled={busy}>Skip this line →</button>
        <span className="spacer" />
        <button className="btn small" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
