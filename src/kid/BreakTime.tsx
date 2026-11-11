import { useEffect, useRef, useState } from 'react';
import { CHARACTERS } from '../assets';
import { resumeAudio } from '../audio';
import { breakState, getTimeLimit, moreTime, readUsage, resetUsage, tick, writeUsage } from './kidSettings';
import { ParentGate } from './ParentGate';
import { TheaterAudio } from './theaterAudio';

const TICK_MS = 5000;
/** Fired when a grown-up changes the time limit or gives more time. */
export const SETTINGS_EVENT = 'storybox-settings';
export const settingsChanged = () => window.dispatchEvent(new Event(SETTINGS_EVENT));

/** Counts play time while a kids' screen is showing and the app is visible. */
export function useBreakTimer(active: boolean) {
  const [state, setState] = useState<'play' | 'soon' | 'rest'>(() => breakState(readUsage(), getTimeLimit()));
  const refresh = (count: boolean) => {
    const u = count ? tick(readUsage(), Date.now()) : readUsage();
    if (count) writeUsage(u);
    setState(breakState(u, getTimeLimit()));
  };
  useEffect(() => {
    if (!active) return;
    refresh(true);
    const id = setInterval(() => { if (document.visibilityState === 'visible') refresh(true); }, TICK_MS);
    const onVis = () => { if (document.visibilityState === 'visible') refresh(true); };
    const onSettings = () => refresh(false);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener(SETTINGS_EVENT, onSettings);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener(SETTINGS_EVENT, onSettings); };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    state,
    /** a grown-up changed the settings or gave more time */
    recheck: () => refresh(false),
  };
}

/** A little moon for the last two minutes, so the end isn't a surprise. */
export function BreakSoon() {
  return <span className="break-soon" role="img" aria-label="Almost time for a break">🌙</span>;
}

/** Time's up: a friend waves goodbye and the kids' screens rest. Only a grown-up can carry on. */
export function BreakScreen({ onChanged }: { onChanged: () => void }) {
  const [gate, setGate] = useState(false);
  const [grownUp, setGrownUp] = useState(false);
  const audio = useRef<TheaterAudio | null>(null);
  const friend = useRef(CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]);
  useEffect(() => {
    void resumeAudio();
    void (audio.current = new TheaterAudio()).sfx('twinkle', 0.5);
    return () => audio.current?.dispose();
  }, []);
  const pic = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(friend.current.svg(friend.current.colors[0], { mouthOpen: false, blink: true }))}`;
  return (
    <div className="break-screen" role="dialog" aria-label="Time for a break">
      <span className="break-moon" aria-hidden="true">🌙</span>
      <span className="break-stars" aria-hidden="true">✨ ⭐ ✨</span>
      <img src={pic} alt="" className="break-friend" draggable={false} />
      <span className="break-wave" aria-hidden="true">👋</span>
      {grownUp ? (
        <div className="break-grownup">
          <button className="btn big primary" onClick={() => { writeUsage(moreTime(readUsage(), getTimeLimit())); settingsChanged(); onChanged(); }}>➕ 10 more minutes</button>
          <button className="btn big" onClick={() => { writeUsage(resetUsage(Date.now())); settingsChanged(); onChanged(); }}>🔄 Start the time again</button>
        </div>
      ) : (
        <button className="lock break-lock" onClick={() => setGate(true)} aria-label="Grown-ups">🔒</button>
      )}
      {gate && <ParentGate why="Only a grown-up can give more play time." onClose={() => setGate(false)} onPass={() => { setGate(false); setGrownUp(true); }} />}
    </div>
  );
}
