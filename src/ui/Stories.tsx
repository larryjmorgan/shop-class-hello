import { useEffect, useMemo, useState } from 'react';
import { listStories } from '../library';
import { fmtTime } from '../model';
import { deleteStory, duplicateStory, flushSave, newSampleStory, newStory, openStory, setTime, useStore } from '../store';
import { pause } from '../transport';
import { Modal } from './Dialogs';

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} days ago`;
  return new Date(ms).toLocaleDateString();
}

export function StoriesDialog({ onClose }: { onClose: () => void }) {
  const currentId = useStore((s) => s.currentId);
  const [tick, setTick] = useState(0);

  // Make sure the library shows the very latest title/length of the story that is open.
  useEffect(() => {
    flushSave();
    setTick((t) => t + 1);
  }, []);
  const stories = useMemo(() => listStories(), [tick, currentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchTo = (fn: () => unknown) => {
    pause();
    setTime(0);
    fn();
    onClose();
  };

  return (
    <Modal title="My stories" onClose={onClose} wide>
      <p className="hint">Every story is saved in this browser automatically. Opening or starting another story never loses the one you were on.</p>
      <div className="stories">
        <button className="story-card new" onClick={() => switchTo(() => newStory())}>
          <span className="plus">＋</span>
          <b>New story</b>
        </button>
        {stories.map((m) => {
          const open = m.id === currentId;
          return (
            <div key={m.id} className={`story-card${open ? ' current' : ''}`}>
              <button
                className="story-pic"
                onClick={() => (open ? onClose() : switchTo(() => { if (!openStory(m.id)) alert('This story could not be opened because its saved data is damaged. You can delete it.'); }))}
                aria-label={`Open ${m.title}`}
              >
                {m.thumb ? <img src={m.thumb} alt="" /> : <span className="nothumb">🎬</span>}
              </button>
              <div className="story-info">
                <b title={m.title}>{m.title || 'Untitled'}</b>
                <small>{open ? 'Open now · ' : ''}{fmtTime(m.duration).replace(/\.\d$/, '')} · {timeAgo(m.updatedAt)}</small>
              </div>
              <div className="row-btns">
                <button className="btn small" onClick={() => { duplicateStory(m.id); setTick((t) => t + 1); }}>⧉ Copy</button>
                <button
                  className="btn small danger"
                  onClick={async () => {
                    if (!window.confirm(`Delete “${m.title}” for good? This can’t be undone.`)) return;
                    if (open) { pause(); setTime(0); }
                    await deleteStory(m.id);
                    setTick((t) => t + 1);
                  }}
                >🗑 Delete</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="row-btns">
        <button className="btn small" onClick={() => switchTo(() => newSampleStory())}>🐰 Add the sample story</button>
      </div>
    </Modal>
  );
}
