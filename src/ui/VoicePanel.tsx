import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MicError, decodeBlobDuration, elevenSpeak, elevenVoices, getElevenKey, startMicRecording, type MicRecording,
} from '../audio';
import { putBlob } from '../db';
import { draftLines, estimateSpeechSeconds, uid, type Project } from '../model';
import { addAudio, getTime, openNarration, useStore } from '../store';

type Provider = 'mic' | 'eleven';

const NOT_SAVED = 'Added, but this browser could not save the audio for later. Export or use “Project → Save file…” before you close this page, or it will be lost.';

export function VoicePanel() {
  const objects = useStore((s) => s.project.objects);
  const characters = objects.filter((o) => o.kind === 'character');
  const selection = useStore((s) => s.selection);
  // (Select the stable list, then derive: a selector that builds a new array every call makes React loop forever.)
  const audioClips = useStore((s) => s.project.audio);
  const drafts = useMemo(() => draftLines({ audio: audioClips } as Project), [audioClips]);

  // Real voices only: your own (default) or ElevenLabs. Robotic computer voices are deliberately not offered.
  const [provider, setProvider] = useState<Provider>('mic');
  const [speaker, setSpeaker] = useState<string>('narrator');
  const [text, setText] = useState('');
  const [elVoices, setElVoices] = useState<{ id: string; name: string }[]>([]);
  const [elVoiceId, setElVoiceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState<MicRecording | null>(null);
  const [recSeconds, setRecSeconds] = useState(0);
  const [effect, setEffect] = useState('1');
  const recRef = useRef<MicRecording | null>(null);
  recRef.current = recording;
  const hasKey = !!getElevenKey();

  // The microphone must never stay on after you leave this panel or switch tabs.
  useEffect(() => () => recRef.current?.cancel(), []);
  useEffect(() => {
    if (provider !== 'mic' && recRef.current) { recRef.current.cancel(); setRecording(null); }
  }, [provider]);
  useEffect(() => {
    if (!recording) return;
    setRecSeconds(0);
    const t0 = Date.now();
    const id = window.setInterval(() => setRecSeconds(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [recording]);

  // Follow the selected character so "who's talking" is usually already right.
  useEffect(() => {
    if (selection.type === 'object' && characters.some((c) => c.id === selection.id)) setSpeaker(selection.id);
  }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (provider !== 'eleven' || !hasKey || elVoices.length) return;
    elevenVoices(getElevenKey()).then(
      (v) => { setElVoices(v); setElVoiceId(v[0]?.id ?? ''); setError(''); },
      (e: Error) => setError(e.message),
    );
  }, [provider, hasKey, elVoices.length]);

  const speakerName = speaker === 'narrator' ? 'Narrator' : characters.find((c) => c.id === speaker)?.name ?? 'Narrator';
  const characterId = speaker === 'narrator' ? undefined : speaker;

  const addDraft = () => {
    addAudio({ kind: 'voice', start: getTime(), duration: Math.max(0.8, estimateSpeechSeconds(text) + 0.2), volume: 1, label: speakerName, text: text.trim(), characterId, provider: 'draft' });
    setText('');
  };

  const addEleven = async () => {
    setBusy(true);
    setError('');
    try {
      const blob = await elevenSpeak(text, elVoiceId, getElevenKey());
      const len = await decodeBlobDuration(blob);
      const key = uid('blob');
      const saved = await putBlob(key, blob);
      addAudio({ kind: 'voice', start: getTime(), duration: len, bufferDuration: len, volume: 1, label: speakerName, text, characterId, provider: 'eleven', voiceId: elVoiceId, blobKey: key });
      setText('');
      if (!saved) setError(NOT_SAVED);
    } catch (e) {
      setError(e instanceof TypeError ? 'Could not reach ElevenLabs (network or CORS). Check your connection.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleRecord = async () => {
    setError('');
    if (!recording) {
      try {
        setRecording(await startMicRecording());
      } catch (e) {
        setError(e instanceof MicError ? e.message : 'The microphone could not be started.');
      }
      return;
    }
    const rec = recording;
    setRecording(null);
    const blob = await rec.stop();
    try {
      const playbackRate = Number(effect);
      const len = await decodeBlobDuration(blob);
      const key = uid('blob');
      const saved = await putBlob(key, blob);
      addAudio({ kind: 'voice', start: getTime(), duration: len / playbackRate, bufferDuration: len, volume: 1, label: speakerName, text: text.trim() || '(recording)', characterId, provider: 'mic', rate: playbackRate, blobKey: key });
      setText('');
      if (!saved) setError(NOT_SAVED);
    } catch {
      setError('That recording could not be read.');
    }
  };

  return (
    <div className="panel-body">
      {drafts.length > 0 && (
        <div className="draft-banner">
          <span>🔇 <b>{drafts.length}</b> line{drafts.length > 1 ? 's have' : ' has'} <b>no voice yet</b> and {drafts.length > 1 ? 'are' : 'is'} silent in the video.</span>
          <button className="btn small primary" onClick={() => openNarration(drafts.map((c) => c.id))}>🎙 Record my lines…</button>
        </div>
      )}
      <label className="field">Who is talking?
        <select value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
          <option value="narrator">Narrator (no mouth)</option>
          {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>

      <div className="seg two" role="tablist">
        <button className={provider === 'mic' ? 'on' : ''} onClick={() => setProvider('mic')}>🎙 My voice</button>
        <button className={provider === 'eleven' ? 'on' : ''} onClick={() => setProvider('eleven')}>✨ ElevenLabs</button>
      </div>

      <textarea
        rows={provider === 'mic' ? 2 : 4} value={text} onChange={(e) => setText(e.target.value)} maxLength={600}
        placeholder={provider === 'mic' ? 'What will they say? (optional: shown on the timeline)' : 'Type what they say…'}
      />

      {provider === 'mic' && (
        <>
          <label className="field">Voice effect
            <select value={effect} onChange={(e) => setEffect(e.target.value)}>
              <option value="1">Normal</option>
              <option value="1.3">Squeaky (chipmunk)</option>
              <option value="0.8">Deep (big bear)</option>
            </select>
          </label>
          <button className={`btn ${recording ? 'danger' : 'primary'}`} onClick={toggleRecord}>{recording ? `■ Stop & add (${recSeconds}s)` : '● Record'}</button>
          {recording && <p className="recording" role="status"><span className="dot" /> Recording… speak now</p>}
          {!recording && (
            <button className="btn small" disabled={!text.trim()} onClick={addDraft} title="Write the line now and record it later">📝 Add this line to record later</button>
          )}
          <p className="hint">Record your own voice (or your daughter’s!). The clip lands at the playhead.</p>
        </>
      )}

      {provider === 'eleven' && (
        <>
          {!hasKey ? (
            <p className="hint warn">Add your ElevenLabs API key in ⚙ Settings to use studio-quality voices.</p>
          ) : (
            <>
              <label className="field">Voice
                <select value={elVoiceId} onChange={(e) => setElVoiceId(e.target.value)}>
                  {elVoices.length === 0 && <option value="">Loading voices…</option>}
                  {elVoices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </label>
              <button className="btn primary" disabled={busy || !text.trim() || !elVoiceId} onClick={addEleven}>{busy ? 'Generating…' : '✨ Generate & add'}</button>
              <p className="hint">Each generation uses ElevenLabs credits. The audio is saved in this browser and included in the exported video.</p>
            </>
          )}
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
