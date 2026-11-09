import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { requestPersistentStorage } from './db';
import './kid/painted'; // her painted friends, registered before anything is drawn
import { flushSave } from './store';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Root } from './ui/Root';
import './ui/styles.css';
import './kid/kid.css';

// Don't lose the last half-second of edits if the tab is closed or the tablet is put to sleep.
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushSave());
requestPersistentStorage();

// Offline support + "Add to Home Screen". Production builds only, so development is never served from a cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((e) => console.warn('Offline mode unavailable:', e));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>,
);
