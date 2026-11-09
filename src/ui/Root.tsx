import { useEffect, useState } from 'react';
import { Home } from '../kid/Home';
import { ParentGate } from '../kid/ParentGate';
import { Shelf } from '../kid/Shelf';
import { Theater } from '../kid/Theater';
import { pause } from '../transport';
import { App } from './App';

type Mode = 'home' | 'theater' | 'shelf' | 'studio';

/**
 * What opens first: the child's home screen. The full grown-up editor ("studio") is behind a small sum,
 * or open the page with #studio at the end of the address to go straight to it.
 */
export function Root() {
  const [mode, setMode] = useState<Mode>(() => (location.hash === '#studio' ? 'studio' : 'home'));
  const [gate, setGate] = useState(false);

  useEffect(() => {
    if (mode !== 'studio') pause(); // never leave editor playback running behind the child screens
  }, [mode]);

  if (mode === 'studio') return <App onKidMode={() => { history.replaceState(null, '', location.pathname + location.search); setMode('home'); }} />;
  return (
    <>
      {mode === 'home' && <Home onPlay={() => setMode('theater')} onMovies={() => setMode('shelf')} onGrownUps={() => setGate(true)} />}
      {mode === 'theater' && <Theater onHome={() => setMode('home')} onShelf={() => setMode('shelf')} />}
      {mode === 'shelf' && <Shelf onHome={() => setMode('home')} onPlay={() => setMode('theater')} />}
      {gate && <ParentGate why="The story editor is for grown-ups." onClose={() => setGate(false)} onPass={() => { setGate(false); setMode('studio'); }} />}
    </>
  );
}
