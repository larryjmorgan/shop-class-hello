import { useEffect, useRef, useState } from 'react';
import { BACKGROUNDS, CHARACTERS, PROPS, type ArtAsset } from '../assets';
import { MUSIC, SFX, getAudioContext, decodeBlobDuration, musicLoopSeconds, resumeAudio, loadBuffer } from '../audio';
import { putBlob } from '../db';
import { uid } from '../model';
import { addAudio, addBackground, addObject, addText, getTime, useStore } from '../store';
import { VoicePanel } from './VoicePanel';

const TABS = [
  ['characters', '🐰', 'Characters'],
  ['props', '🌳', 'Props'],
  ['backgrounds', '🖼️', 'Scenes'],
  ['text', '🔤', 'Text'],
  ['voice', '🎤', 'Voice'],
  ['music', '🎵', 'Music'],
  ['sfx', '🔊', 'Sounds'],
] as const;
type Tab = (typeof TABS)[number][0];

function ArtGrid({ items, kind }: { items: ArtAsset[]; kind: 'character' | 'prop' }) {
  return (
    <div className="grid">
      {items.map((a) => (
        <button key={a.id} className="tile" onClick={() => addObject(kind, a.id, getTime())} title={`Add ${a.label} at the playhead`}>
          <img alt="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(a.svg(a.colors[0], { mouthOpen: false, blink: false }))}`} />
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

function TextPanel() {
  const [text, setText] = useState('Once upon a time…');
  return (
    <div className="panel-body">
      <p className="hint">Titles and captions. Text appears at the playhead and lasts 5 seconds (change it in the timeline).</p>
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={80} />
      <button className="btn primary" disabled={!text.trim()} onClick={() => addText(text.trim(), getTime())}>＋ Add text</button>
    </div>
  );
}

function MusicPanel() {
  const duration = useStore((s) => s.project.duration);
  const fileRef = useRef<HTMLInputElement>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const src = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => () => src.current?.stop(), []);

  const preview = async (kind: 'music' | 'sfx', preset: string) => {
    src.current?.stop();
    if (playing === preset) return setPlaying(null);
    const ac = await resumeAudio();
    const buf = await loadBuffer({ id: 'x', kind, preset, start: 0, duration: 1, volume: 1, label: '' });
    if (!buf) return;
    const s = ac.createBufferSource();
    s.buffer = buf;
    s.connect(ac.destination);
    s.onended = () => setPlaying((p) => (p === preset ? null : p));
    s.start();
    src.current = s;
    setPlaying(preset);
    if (kind === 'music') setTimeout(() => { try { s.stop(); } catch { /* done */ } }, 8000);
  };

  return (
    <div className="panel-body">
      <p className="hint">Music loops to fill the clip and automatically dips under voices. Drag its right edge to make it longer.</p>
      <div className="list">
        {MUSIC.map((m) => (
          <div className="list-item" key={m.id}>
            <span className="emoji">{m.emoji}</span>
            <span className="grow">{m.label}<small>{Math.round(musicLoopSeconds(m.id))}s loop</small></span>
            <button className="btn small" onClick={() => preview('music', m.id)}>{playing === m.id ? '■' : '▶'}</button>
            <button className="btn small primary" onClick={() => {
              const start = getTime();
              addAudio({ kind: 'music', start, duration: Math.max(2, duration - start), volume: 0.8, label: m.label, preset: m.id });
            }}>Add</button>
          </div>
        ))}
      </div>
      <h4>Your own audio</h4>
      <input ref={fileRef} type="file" accept="audio/*" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        try {
          const key = uid('blob');
          await putBlob(key, f);
          const len = await decodeBlobDuration(f);
          const start = getTime();
          addAudio({ kind: 'music', start, duration: Math.min(len, Math.max(1, duration - start)), volume: 0.8, label: f.name.replace(/\.[^.]+$/, ''), blobKey: key, provider: 'file', bufferDuration: len });
        } catch { alert('Could not read that audio file.'); }
      }} />
      <button className="btn" onClick={() => fileRef.current?.click()}>📂 Import audio file…</button>
      <p className="hint">Only use music you own or have permission to use.</p>
    </div>
  );
}

function SfxPanel() {
  return (
    <div className="panel-body">
      <p className="hint">Click to hear it. “Add” drops it on the timeline at the playhead.</p>
      <div className="grid">
        {SFX.map((s) => (
          <div key={s.id} className="tile sfx">
            <span className="big">{s.emoji}</span>
            <span>{s.label}</span>
            <div className="row-btns">
              <button className="btn small" onClick={async () => {
                const ac = await resumeAudio();
                const buf = await loadBuffer({ id: 'x', kind: 'sfx', preset: s.id, start: 0, duration: 1, volume: 1, label: '' });
                if (!buf) return;
                const n = ac.createBufferSource();
                n.buffer = buf;
                n.connect(getAudioContext().destination);
                n.start();
              }}>▶</button>
              <button className="btn small primary" onClick={() => addAudio({ kind: 'sfx', start: getTime(), duration: s.seconds, volume: 0.9, label: s.label, preset: s.id })}>Add</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Library() {
  const [tab, setTab] = useState<Tab>('characters');
  return (
    <aside className="library">
      <nav className="tabs" role="tablist">
        {TABS.map(([id, emoji, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <span>{emoji}</span>
            <small>{label}</small>
          </button>
        ))}
      </nav>
      <div className="panel">
        {tab === 'characters' && <ArtGrid items={CHARACTERS} kind="character" />}
        {tab === 'props' && <ArtGrid items={PROPS} kind="prop" />}
        {tab === 'backgrounds' && (
          <div className="grid">
            {BACKGROUNDS.map((b) => (
              <button key={b.id} className="tile bgtile" onClick={() => addBackground(b.id, getTime())} title="Starts at the playhead">
                <span className="bgthumb" style={{ background: b.thumb }} />
                <span>{b.label}</span>
              </button>
            ))}
          </div>
        )}
        {tab === 'text' && <TextPanel />}
        {tab === 'voice' && <VoicePanel />}
        {tab === 'music' && <MusicPanel />}
        {tab === 'sfx' && <SfxPanel />}
      </div>
    </aside>
  );
}
