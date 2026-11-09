import { useEffect, useState } from 'react';
import { Home } from '../kid/Home';
import { ParentGate } from '../kid/ParentGate';
import { StoriesShelf } from '../kid/StoriesShelf';
import { StoryMaker } from '../kid/StoryMaker';
import { Theater } from '../kid/Theater';
import type { Project } from '../model';
import { newStory, setTime } from '../store';
import { pause } from '../transport';
import { App } from './App';

type Mode = 'home' | 'make' | 'stories' | 'puppets' | 'studio';

/**
 * What opens first: the child's home screen. The full grown-up editor ("Studio") is behind a small sum,
 * or open the page with #studio at the end of the address to go straight to it.
 */
export function Root() {
  const [mode, setMode] = useState<Mode>(() => (location.hash === '#studio' ? 'studio' : 'home'));
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [gate, setGate] = useState(false);

  useEffect(() => {
    if (mode !== 'studio') pause(); // never leave editor playback running behind the child screens
  }, [mode]);

  const make = (id?: string) => {
    setEditing(id);
    setMode('make');
  };
  const openInStudio = (p: Project) => {
    newStory(structuredClone(p)); // a copy: the kid's story stays as it is
    setTime(0);
    setMode('studio');
  };

  if (mode === 'studio') return <App onKidMode={() => { history.replaceState(null, '', location.pathname + location.search); setMode('home'); }} />;
  return (
    <>
      {mode === 'home' && <Home onMake={() => make()} onStories={() => setMode('stories')} onPuppets={() => setMode('puppets')} onGrownUps={() => setGate(true)} />}
      {mode === 'make' && <StoryMaker key={editing ?? 'new'} storyId={editing} onHome={() => setMode('home')} onShelf={() => setMode('stories')} />}
      {mode === 'stories' && <StoriesShelf onHome={() => setMode('home')} onNew={() => make()} onEdit={(id) => make(id)} onOpenStudio={openInStudio} />}
      {mode === 'puppets' && <Theater onHome={() => setMode('home')} />}
      {gate && <ParentGate why="The Studio is for grown-ups." onClose={() => setGate(false)} onPass={() => { setGate(false); setMode('studio'); }} />}
    </>
  );
}
