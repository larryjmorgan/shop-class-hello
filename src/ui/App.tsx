import { useEffect, useRef, useState } from 'react';
import { MAX_DURATION, MIN_DURATION, clamp, countDropped, fmtTime } from '../model';
import { download, projectFromFile, projectToFile, safeName } from '../projectFile';
import {
  deleteSelection, getState, getTime, loadProject, loadSample, newProject, redo, setDuration, setTime, setTitle, undo, useStore, usePlaying, useTime,
} from '../store';
import { pause, seek, toggle } from '../transport';
import { ExportDialog, Modal, SettingsDialog } from './Dialogs';
import { Inspector } from './Inspector';
import { Library } from './Library';
import { Stage } from './Stage';
import { Timeline, deleteSelectedKeyframe } from './Timeline';

/** Length box: edit freely, apply on Enter/blur (applying per keystroke turned "90" into a 9-second story first). */
function LengthInput() {
  const duration = useStore((s) => s.project.duration);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (!Number.isFinite(n) || draft.trim() === '') return;
    const d = clamp(Math.round(n), MIN_DURATION, MAX_DURATION);
    const lost = countDropped(getState().project, d);
    if (lost > 0 && !window.confirm(`Making the story ${d}s long will remove ${lost} item${lost > 1 ? 's' : ''} that start after the new end. (Undo brings them back.) Continue?`)) return;
    setDuration(d);
  };
  return (
    <input
      type="number" min={MIN_DURATION} max={MAX_DURATION} value={draft ?? duration} aria-label="Story length in seconds"
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); } }}
    />
  );
}

function Transport() {
  const t = useTime();
  const playing = usePlaying();
  const dur = useStore((s) => s.project.duration);
  return (
    <div className="transport">
      <button className="btn" onClick={() => seek(0)} title="Back to start" aria-label="Back to start">⏮</button>
      <button className="btn primary play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title="Space">{playing ? '⏸ Pause' : '▶ Play'}</button>
      <span className="clock" aria-live="off">{fmtTime(t)} / {fmtTime(dur)}</span>
      <input className="scrub" type="range" min={0} max={dur} step={0.05} value={t} onChange={(e) => seek(Number(e.target.value))} aria-label="Playhead position" />
    </div>
  );
}

export function App() {
  const project = useStore((s) => s.project);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const [dialog, setDialog] = useState<'none' | 'export' | 'settings' | 'help'>('none');
  const [tall, setTall] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const inputType = el.tagName === 'INPUT' ? (el as HTMLInputElement).type : '';
      // Sliders/checkboxes/buttons don't take typed text, so shortcuts should still work while they have focus.
      const typing = el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable || (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'file'].includes(inputType));
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (typing) return; // let text fields use their own undo
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
      if (typing) return;
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (!deleteSelectedKeyframe()) deleteSelection();
      }
      else if (inputType === 'range') return; // sliders use arrows natively
      else if (e.key === 'ArrowLeft') seek(getTime() - (e.shiftKey ? 1 : 0.1));
      else if (e.key === 'ArrowRight') seek(getTime() + (e.shiftKey ? 1 : 0.1));
      else if (e.key === 'Home') seek(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const confirmDiscard = () => window.confirm('Start over? Your current story is saved in this browser, but this will replace it. Use “Save file” first if you want to keep it.');

  return (
    <div className={`app${tall ? ' tall' : ''}`}>
      <header className="topbar">
        <div className="brand">🎬 <span>StoryBox</span></div>
        <input className="title" value={project.title} onChange={(e) => setTitle(e.target.value)} aria-label="Story title" />
        <label className="dur" title={`Stories can be ${MIN_DURATION}s to ${MAX_DURATION / 60} minutes`}>
          Length
          <LengthInput />s
          <small>max 3:00</small>
        </label>
        <span className="spacer" />
        <button className="btn" onClick={undo} disabled={!canUndo} title="Ctrl/⌘+Z">↶ Undo</button>
        <button className="btn" onClick={redo} disabled={!canRedo} title="Ctrl/⌘+Shift+Z">↷ Redo</button>
        <details className="menu">
          <summary className="btn">📁 Project ▾</summary>
          <div className="menu-pop" onClick={(e) => ((e.currentTarget.parentElement as HTMLDetailsElement).open = false)}>
            <button onClick={() => { if (confirmDiscard()) { pause(); setTime(0); newProject(); } }}>✨ New blank story</button>
            <button onClick={() => { if (confirmDiscard()) { pause(); setTime(0); loadSample(); } }}>🐰 Load sample story</button>
            <button onClick={async () => download(await projectToFile(getState().project), `${safeName(getState().project.title)}.storybox.json`)}>💾 Save file…</button>
            <button onClick={() => fileRef.current?.click()}>📂 Open file…</button>
          </div>
        </details>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try { pause(); setTime(0); loadProject(await projectFromFile(f)); } catch (err) { alert((err as Error).message); }
        }} />
        <button className="btn" onClick={() => setDialog('settings')} title="ElevenLabs key">⚙ Settings</button>
        <button className="btn" onClick={() => setDialog('help')} aria-label="Help">?</button>
        <button className="btn primary" onClick={() => setDialog('export')}>🎬 Export video</button>
      </header>
      <main className="workspace">
        <Library />
        <section className="center">
          <Stage />
          <Transport />
        </section>
        <Inspector />
      </main>
      <Timeline tall={tall} onToggleTall={() => setTall((v) => !v)} />
      {dialog === 'export' && <ExportDialog onClose={() => setDialog('none')} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog('none')} />}
      {dialog === 'help' && (
        <SettingsHelp onClose={() => setDialog('none')} />
      )}
    </div>
  );
}

function SettingsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How StoryBox works" onClose={onClose}>
      <ol className="notes">
        <li><b>Scenes</b>: pick a background; it starts at the playhead.</li>
        <li><b>Characters & props</b>: click to add at the playhead. Drag them on stage; use the round handle to turn and the square to resize.</li>
        <li><b>Animate</b>: move the playhead, then drag something. A ◆ keyframe is made and it glides there. Drag ◆ in the timeline to retime; double-click one to remove it.</li>
        <li><b>Voice</b>: choose who’s talking, type the words. The character’s mouth flaps while their voice plays.</li>
        <li><b>Music &amp; sounds</b>: add loops and effects. Music dips automatically under voices.</li>
        <li><b>Export</b>: records your story to a video file in real time (up to 3 minutes).</li>
      </ol>
      <p className="hint">Shortcuts: Space play/pause · ←/→ nudge playhead (Shift = 1s) · Delete removes the selected item · Ctrl/⌘+Z undo.</p>
    </Modal>
  );
}
