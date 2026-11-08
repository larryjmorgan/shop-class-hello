import { useEffect, useRef, useState } from 'react';
import { MAX_DURATION, MIN_DURATION, clamp, countDropped, fmtTime } from '../model';
import { download, projectFromFile, projectToFile, safeName } from '../projectFile';
import {
  closeNarration, deleteSelection, deleteSelectedKeyframe, getState, getTime, newSampleStory, newStory, redo, setDuration, setTime, setTitle, undo, useStore, usePlaying, useTime,
} from '../store';
import { pause, seek, toggle } from '../transport';
import { ExportDialog, Modal, SettingsDialog } from './Dialogs';
import { Inspector } from './Inspector';
import { Library } from './Library';
import { NarrationDialog } from './Narration';
import { Stage } from './Stage';
import { StoriesDialog } from './Stories';
import { Timeline } from './Timeline';

/** Length box: edit freely, apply on Enter/blur (applying per keystroke turned "90" into a 9-second story first). */
function LengthInput() {
  const duration = useStore((s) => s.project.duration);
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const commit = () => {
    if (cancelled.current) { cancelled.current = false; setDraft(null); return; }
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
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur(); } }}
    />
  );
}

/** True when the focused element takes typed text (so single-key shortcuts must stay out of the way). */
function isTyping(el: HTMLElement): boolean {
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return true;
  // Sliders/checkboxes/buttons don't take typed text, so shortcuts still work while they have focus.
  return el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'file'].includes((el as HTMLInputElement).type);
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
  const saveFailed = useStore((s) => s.saveFailed);
  const narration = useStore((s) => s.narration);
  const [dialog, setDialog] = useState<'none' | 'export' | 'settings' | 'help' | 'stories'>('none');
  const [tall, setTall] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A dialog is open: Space/Delete/arrows must not play, delete or scrub the story hidden behind it.
      if (document.querySelector('.modal-back')) return;
      const el = e.target as HTMLElement;
      const inputType = el.tagName === 'INPUT' ? (el as HTMLInputElement).type : '';
      const typing = isTyping(el);
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
    // Some browsers fire a button's click on Space *key-up*; stop that, or Space would play AND re-press the focused button.
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space' && !document.querySelector('.modal-back') && !isTyping(e.target as HTMLElement)) e.preventDefault(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return (
    <div className={`app${tall ? ' tall' : ''}${saveFailed ? ' has-banner' : ''}`}>
      <header className="topbar">
        <div className="brand">🎬 <span>StoryBox</span></div>
        <input className="title" value={project.title} onChange={(e) => setTitle(e.target.value)} aria-label="Story title" />
        <label className="dur" title={`Stories can be ${MIN_DURATION}s to ${MAX_DURATION / 60} minutes`}>
          Length
          <LengthInput />s
          <small>max 3:00</small>
        </label>
        <span className="spacer" />
        <button className="btn" onClick={() => setDialog('stories')} title="All your stories">📚 My stories</button>
        <button className="btn" onClick={undo} disabled={!canUndo} title="Ctrl/⌘+Z">↶ Undo</button>
        <button className="btn" onClick={redo} disabled={!canRedo} title="Ctrl/⌘+Shift+Z">↷ Redo</button>
        <details className="menu">
          <summary className="btn">📁 Project ▾</summary>
          <div className="menu-pop" onClick={(e) => ((e.currentTarget.parentElement as HTMLDetailsElement).open = false)}>
            <button onClick={() => setDialog('stories')}>📚 My stories…</button>
            <button onClick={() => { pause(); setTime(0); newStory(); }}>✨ New story</button>
            <button onClick={() => { pause(); setTime(0); newSampleStory(); }}>🐰 New story from the sample</button>
            <button onClick={async () => {
              try { download(await projectToFile(getState().project), `${safeName(getState().project.title)}.storybox.json`); }
              catch { alert('Sorry, the project file could not be created.'); }
            }}>💾 Save file…</button>
            <button onClick={() => fileRef.current?.click()}>📂 Add a story from a file…</button>
          </div>
        </details>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const imported = await projectFromFile(f); // validated first, then added as a NEW story (nothing is replaced)
            pause(); setTime(0); newStory(imported);
          } catch (err) { alert((err as Error).message); }
        }} />
        <button className="btn" onClick={() => setDialog('settings')} title="ElevenLabs key">⚙ Settings</button>
        <button className="btn" onClick={() => setDialog('help')} aria-label="Help">?</button>
        <button className="btn primary" onClick={() => setDialog('export')}>🎬 Export video</button>
      </header>
      {saveFailed && (
        <div className="banner" role="alert">⚠ Your story couldn’t be autosaved (browser storage is full or blocked). Use <b>Project → Save file…</b> now so you don’t lose your work.</div>
      )}
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
      {dialog === 'stories' && <StoriesDialog onClose={() => setDialog('none')} />}
      {narration && <NarrationDialog clipIds={narration} onClose={closeNarration} />}
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
