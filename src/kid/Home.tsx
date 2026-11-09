import { useMemo } from 'react';
import { CHARACTERS } from '../assets';
import { listMovies } from './movies';
import { listKidStories } from './story';

const pic = (id: string, mouthOpen = false) => {
  const c = CHARACTERS.find((x) => x.id === id)!;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.svg(c.colors[0], { mouthOpen, blink: false }))}`;
};

/** The first screen: make a story (biggest), my stories, puppet play, and a small grown-ups lock. */
export function Home({ onMake, onStories, onPuppets, onGrownUps }: { onMake: () => void; onStories: () => void; onPuppets: () => void; onGrownUps: () => void }) {
  const count = useMemo(() => listKidStories().length + listMovies().length, []);
  const latest = useMemo(() => listKidStories()[0], []);
  return (
    <div className="home">
      <button className="home-tile make" onClick={onMake} aria-label="Make a story">
        <span className="friends">
          <img src={pic('bunny', true)} alt="" className="wiggle" draggable={false} />
          <img src={pic('princess')} alt="" className="wiggle late" draggable={false} />
          <img src={pic('dino')} alt="" className="wiggle" draggable={false} />
        </span>
        <span className="home-icon">📖</span>
      </button>
      <div className="home-col">
        <button className="home-tile movies" onClick={onStories} aria-label={`My stories (${count})`}>
          {latest?.thumb ? <img src={latest.thumb} alt="" className="poster" draggable={false} /> : <span className="huge-emoji">📚</span>}
          <span className="home-icon">📚</span>
          {count > 0 && <span className="badge">{count}</span>}
        </button>
        <button className="home-tile play" onClick={onPuppets} aria-label="Puppet play">
          <img src={pic('bear')} alt="" className="wiggle small-friend" draggable={false} />
          <span className="home-icon">🎭</span>
        </button>
      </div>
      <button className="lock" onClick={onGrownUps} aria-label="Grown-ups">🔒</button>
    </div>
  );
}
