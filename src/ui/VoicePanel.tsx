import { useEffect, useMemo, useState } from 'react';
import { decodeBlobDuration, elevenSpeak, elevenVoices, getElevenKey } from '../audio';
import { putBlob } from '../db';
import { draftLines, estimateSpeechSeconds, uid, type Project } from '../model';
import { addAudio, getState, getTime, replaceVoiceAudio, useStore } from '../store';

const NOT_SAVED = 'Added, but this browser could not save the audio for later. Export or use “Project → Save file…” before you close this page, or it will be lost.';

/**
 * Lines of dialogue. There is no microphone recording and no robotic computer voice:
 * a line is either a silent written placeholder, or a voice generated with ElevenLabs (optional, needs a key).
 */
export function VoicePanel() {
  const objects = useStore((s) => s.project.objects);
  const characters = objects.filter((o) => o.kind === 'character');
  const selection = useStore((s) => s.selection);
  // (Select the stable list, then derive: a selector that builds a new array every call makes React loop forever.)
  const audioClips = useStore((s) => s.project.audio);
  const drafts = useMemo(() => draftLines({ audio: audioClips } as Project), [audioClips]);

  const [speaker, setSpeaker] = useState<string>('narrator');
  const [text, setText] = useState('');
  const [elVoices, setElVoices] = useState<{ id: string; name: string }[]>([]);
  const [elVoiceId, setElVoiceId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const hasKey = !!getElevenKey();

  // Follow the selected character so "who's talking" is usually already right.
  useEffect(() => {
    if (selection.type === 'object' && characters.some((c) => c.id === selection.id)) setSpeaker(selection.id);
  }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasKey || elVoices.length) return;
    elevenVoices(getElevenKey()).then(
      (v) => { setElVoices(v); setElVoiceId(v[0]?.id ?? ''); setError(''); },
      (e: Error) => setError(e.message),
    );
  }, [hasKey, elVoices.length]);

  const speakerName = speaker === 'narrator' ? 'Narrator' : characters.find((c) => c.id === speaker)?.name ?? 'Narrator';
  const characterId = speaker === 'narrator' ? undefined : speaker;
  const friendly = (e: unknown) => (e instanceof TypeError ? 'Could not reach ElevenLabs (network). Check your connection.' : (e as Error).message);

  const addLine = () => {
    addAudio({ kind: 'voice', start: getTime(), duration: Math.max(0.8, estimateSpeechSeconds(text) + 0.2), volume: 1, label: speakerName, text: text.trim(), characterId, provider: 'draft' });
    setText('');
  };

  const addEleven = async () => {
    setBusy('Generating…');
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
      setError(friendly(e));
    } finally {
      setBusy('');
    }
  };

  /** Give every silent written line a voice, one after another (each uses ElevenLabs credits). */
  const voiceAllDrafts = async () => {
    setError('');
    const todo = drafts.filter((c) => c.text?.trim());
    try {
      for (let i = 0; i < todo.length; i++) {
        setBusy(`Making voice ${i + 1} of ${todo.length}…`);
        const clip = getState().project.audio.find((a) => a.id === todo[i].id);
        if (!clip || clip.provider !== 'draft') continue;
        const blob = await elevenSpeak(clip.text!, elVoiceId, getElevenKey());
        const len = await decodeBlobDuration(blob);
        const key = uid('blob');
        await putBlob(key, blob);
        replaceVoiceAudio(clip.id, { blobKey: key, bufferDuration: len, provider: 'eleven', voiceId: elVoiceId });
      }
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="panel-body">
      {drafts.length > 0 && (
        <div className="draft-banner">
          <span>🔇 <b>{drafts.length}</b> line{drafts.length > 1 ? 's are' : ' is'} written but silent.</span>
          {hasKey && elVoiceId && (
            <button className="btn small primary" disabled={!!busy} onClick={() => void voiceAllDrafts()}>✨ Give {drafts.length > 1 ? 'them' : 'it'} a voice with ElevenLabs</button>
          )}
        </div>
      )}
      <label className="field">Who is talking?
        <select value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
          <option value="narrator">Narrator (no mouth)</option>
          {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="What do they say?" />
      <button className="btn" disabled={!text.trim()} onClick={addLine} title="A silent line: the character's mouth moves, nothing is heard">📝 Add as a silent line</button>

      {hasKey ? (
        <>
          <label className="field">ElevenLabs voice
            <select value={elVoiceId} onChange={(e) => setElVoiceId(e.target.value)}>
              {elVoices.length === 0 && <option value="">Loading voices…</option>}
              {elVoices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <button className="btn primary" disabled={!!busy || !text.trim() || !elVoiceId} onClick={() => void addEleven()}>{busy || '✨ Make it speak with ElevenLabs'}</button>
          <p className="hint">Each line uses ElevenLabs credits. The audio is saved in this browser and included in the exported video.</p>
        </>
      ) : (
        <p className="hint">To hear lines spoken, add your ElevenLabs API key in ⚙ Settings. There is no microphone recording and no computer voice.</p>
      )}
      {busy && hasKey && <p className="hint" role="status">{busy}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
