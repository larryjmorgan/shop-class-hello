import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { requestPersistentStorage } from './db';
import { flushSave } from './store';
import { App } from './ui/App';
import './ui/styles.css';

// Don't lose the last half-second of edits if the tab is closed or the tablet is put to sleep.
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushSave());
requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
