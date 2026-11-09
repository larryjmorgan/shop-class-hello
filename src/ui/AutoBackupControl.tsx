import { resumeAutoBackup, savedAt, turnOffAutoBackup, turnOnAutoBackup, useAutoBackup } from '../autoBackup';

/** For grown-ups: turn automatic backup on/off, see when it last saved, resume it after a reload. */
export function AutoBackupControl({ compact = false }: { compact?: boolean }) {
  const s = useAutoBackup();
  if (s.state === 'unsupported') {
    return compact ? null : <span className="auto-backup muted" role="note">Automatic backup needs <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer">Google Chrome</a> or Microsoft Edge on a computer. Until then, use 💾 Back up everything.</span>;
  }
  if (s.state === 'off') {
    return (
      <span className="auto-backup">
        <button className="btn" onClick={() => void turnOnAutoBackup()} aria-label="Turn on automatic backup">🔄 Turn on automatic backup…</button>
        {!compact && <small> Pick a file once (for example in iCloud Drive); it is kept up to date by itself.</small>}
      </span>
    );
  }
  if (s.state === 'paused') {
    return (
      <span className="auto-backup warn" role="status">
        ⏸ Automatic backup is paused.
        <button className="btn primary" onClick={() => void resumeAutoBackup()} aria-label="Resume automatic backup">▶ Resume</button>
        {!compact && <small> If Chrome offers “Allow on every visit”, choose it so this isn’t needed next time.</small>}
      </span>
    );
  }
  if (s.state === 'error') {
    return (
      <span className="auto-backup warn" role="status">
        ⚠️ {s.message}
        <button className="btn" onClick={() => void turnOnAutoBackup()} aria-label="Choose the backup file">Choose file…</button>
        <button className="btn" onClick={() => void turnOffAutoBackup()} aria-label="Turn off automatic backup">Turn off</button>
      </span>
    );
  }
  return (
    <span className="auto-backup ok" role="status">
      🔄 Automatic backup is on: <b>{s.fileName}</b> ({s.state === 'saving' ? 'saving…' : `saved ${savedAt(s.lastSaved)}`})
      {!compact && (
        <>
          <button className="btn small" onClick={() => void turnOnAutoBackup()} aria-label="Change the backup file">Change file…</button>
          <button className="btn small" onClick={() => void turnOffAutoBackup()} aria-label="Turn off automatic backup">Turn off</button>
        </>
      )}
    </span>
  );
}
