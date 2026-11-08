import { useEffect, useRef, useState } from 'react';
import {
  browserVoices, decodeBlobDuration, elevenSpeak, elevenVoices, getElevenKey, speakBrowser, startMicRecording, stopBrowserSpeech,
} from '../audio';
import { putBlob } from '../db';
import { estimateSpeechSeconds, uid } from '../model';
import { addAudio, getTime, useStore } from '../store';

type Provider = 'browser' | 'eleven' | 'mic';

export function VoicePanel() {
  const objects = useStore((s) => s.project.objects);
  const characters = objects.filter((o) => o.kind === 'character');
  const selection = useStore((s) => s.selection);
  const [provider, setProvider] = useState<Provider>('browser');
  const [speaker, setSpeaker] = useState<string>('narrator');
  const [text, setText] = useState('');
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(browserVoices());
  const [voiceId, setVoiceId] = useState('');
  const [elVoices, setElVoices] = useState<{ id: string; name: string }[]>([]);
  const [elVoiceId, setElVoiceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState<{ stop: () => Promise<Blob> } | null>(null);
  const [effect, setEffect] = useState('1');
  const measured = useRef<{ text: string; seconds: number } | null>(null);
  const hasKey = !!getElevenKey();

  // Follow the selected character so "who's talking" is usually already right.
  useEffect(() => {
    if (selection.type === 'object' && characters.some((c) => c.id === selection.id)) setSpeaker(selection.id);
  }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const load = () => {
      const v = browserVoices().filter((x) => /^en/i.test(x.lang)).concat(browserVoices().filter((x) => !/^en/i.test(x.lang)));
      setVoices(v);
      setVoiceId((cur) => cur || v[0]?.voiceURI || '');
    };
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  useEffect(() => {
    if (provider !== 'eleven' || !hasKey || elVoices.length) return;
    elevenVoices(getElevenKey()).then(
      (v) => { setElVoices(v); setElVoiceId(v[0]?.id ?? ''); setError(''); },
      (e: Error) => setError(e.message),
    );
  }, [provider, hasKey, elVoices.length]);

  const speakerName = speaker === 'narrator' ? 'Narrator' : characters.find((c) => c.id === speaker)?.name ?? 'Narrator';
  const characterId = speaker === 'narrator' ? undefined : speaker;
  const start = () => getTime();

  const preview = async () => {
    setError('');
    stopBrowserSpeech();
    if (provider === 'browser') {
      speakBrowser({ text, voiceId, rate, pitch, volume: 1 }, (s) => (measured.current = { text, seconds: s }));
    } else if (provider === 'eleven') {
      setError('ElevenLabs voices use your credits. Use “Generate & add”, then press play on the timeline.');
    }
  };

  const addBrowser = () => {
    const m = measured.current?.text === text ? measured.current.seconds : estimateSpeechSeconds(text, rate);
    addAudio({ kind: 'voice', start: start(), duration: Math.max(0.8, m + 0.2), volume: 1, label: speakerName, text, characterId, provider: 'browser', voiceId, rate, pitch });
    setText('');
  };

  const addEleven = async () => {
    setBusy(true);
    setError('');
    try {
      const blob = await elevenSpeak(text, elVoiceId, getElevenKey());
      const len = await decodeBlobDuration(blob);
      const key = uid('blob');
      await putBlob(key, blob);
      addAudio({ kind: 'voice', start: start(), duration: len, bufferDuration: len, volume: 1, label: speakerName, text, characterId, provider: 'eleven', voiceId: elVoiceId, blobKey: key });
      setText('');
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
      } catch {
        setError('Microphone access was blocked. Allow it in the browser address bar and try again.');
      }
      return;
    }
    const rec = recording;
    setRecording(null);
    const blob = await rec.stop();
    try {
      const rate = Number(effect);
      const len = await decodeBlobDuration(blob);
      const key = uid('blob');
      await putBlob(key, blob);
      addAudio({ kind: 'voice', start: start(), duration: len / rate, bufferDuration: len, volume: 1, label: speakerName, text: text || '(recording)', characterId, provider: 'mic', rate, blobKey: key });
    } catch {
      setError('That recording could not be read.');
    }
  };

  return (
    <div className="panel-body">
      <label className="field">Who is talking?
        <select value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
          <option value="narrator">Narrator (no mouth)</option>
          {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>

      <div className="seg" role="tablist">
        <button className={provider === 'browser' ? 'on' : ''} onClick={() => setProvider('browser')}>Computer voice</button>
        <button className={provider === 'eleven' ? 'on' : ''} onClick={() => setProvider('eleven')}>ElevenLabs</button>
        <button className={provider === 'mic' ? 'on' : ''} onClick={() => setProvider('mic')}>Microphone</button>
      </div>

      {provider !== 'mic' && (
        <textarea rows={4} placeholder="Type what they say…" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} />
      )}

      {provider === 'browser' && (
        <>
          <label className="field">Voice
            <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
              {voices.length === 0 && <option value="">(default voice)</option>}
              {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
            </select>
          </label>
          <label className="field">Speed {rate.toFixed(2)}×<input type="range" min={0.6} max={1.5} step={0.05} value={rate} onChange={(e) => setRate(Number(e.target.value))} /></label>
          <label className="field">Pitch {pitch.toFixed(1)} <small>(high = squeaky bunny, low = big bear)</small><input type="range" min={0.3} max={2} step={0.1} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} /></label>
          <div className="row-btns">
            <button className="btn" disabled={!text.trim()} onClick={preview}>▶ Hear it</button>
            <button className="btn primary" disabled={!text.trim()} onClick={addBrowser}>＋ Add to timeline</button>
          </div>
          <p className="hint warn">Computer voices play in the editor but browsers can’t record them, so they are <b>silent in the exported video</b>. Use ElevenLabs or your microphone for the final version.</p>
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

      {provider === 'mic' && (
        <>
          <p className="hint">Record your own voice (or your daughter’s!). The clip lands at the playhead.</p>
          <label className="field">Voice effect
            <select value={effect} onChange={(e) => setEffect(e.target.value)}>
              <option value="1">Normal</option>
              <option value="1.3">Squeaky (chipmunk)</option>
              <option value="0.8">Deep (big bear)</option>
            </select>
          </label>
          <button className={`btn ${recording ? 'danger' : 'primary'}`} onClick={toggleRecord}>{recording ? '■ Stop & add' : '● Record'}</button>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
