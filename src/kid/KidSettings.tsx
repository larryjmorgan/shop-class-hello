import { useState } from 'react';
import { settingsChanged } from './BreakTime';
import { TIME_LIMITS, getChildName, getTimeLimit, readUsage, resetUsage, setChildName, setTimeLimit, writeUsage } from './kidSettings';

/** Grown-up settings on the shelf: her first name (for Learn) and a play-time limit. */
export function KidSettings({ onChanged }: { onChanged?: () => void }) {
  const [name, setName] = useState(getChildName());
  const [savedName, setSavedName] = useState(getChildName());
  const [limit, setLimit] = useState(getTimeLimit());
  const played = Math.round(readUsage().usedMs / 60_000);
  return (
    <div className="kid-settings">
      <form className="ks-row" onSubmit={(e) => { e.preventDefault(); const n = setChildName(name); setName(n); setSavedName(n); onChanged?.(); settingsChanged(); }}>
        <label htmlFor="ks-name">👧 Her first name</label>
        <input id="ks-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emma" maxLength={20} autoComplete="off" />
        <button className="btn" type="submit" disabled={name === savedName}>Save name</button>
        <small>{savedName ? `Learn uses “${savedName}” (My name, and in Letters and Reading).` : 'Used in Learn: a My name game, and her letters come up more often.'}</small>
      </form>
      <div className="ks-row" role="group" aria-label="Play time limit">
        <span>⏱ Play time</span>
        {TIME_LIMITS.map((m) => (
          <button key={m} className={`btn small${limit === m ? ' primary' : ''}`} aria-pressed={limit === m} onClick={() => { setTimeLimit(m); setLimit(m); onChanged?.(); settingsChanged(); }}>
            {m ? `${m} min` : 'No limit'}
          </button>
        ))}
        <button className="btn small" onClick={() => { writeUsage(resetUsage(Date.now())); onChanged?.(); settingsChanged(); }}>🔄 Reset</button>
        <small>{limit ? `About ${played} min played so far. A 🌙 shows near the end; then a friend says goodbye. After an hour away it starts again.` : 'No limit.'}</small>
      </div>
    </div>
  );
}
