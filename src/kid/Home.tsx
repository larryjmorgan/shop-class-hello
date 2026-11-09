import { useMemo } from 'react';
import { CHARACTERS } from '../assets';
import { listMovies } from './movies';
import { listOwnStories } from './own';
import { listKidStories } from './story';

const pic = (id: string, mouthOpen = false) => {
  const c = CHARACTERS.find((x) => x.id === id)!;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.svg(c.colors[0], { mouthOpen, blink: false }))}`;
};

/**
 * The first screen. Two ways to make a story (the biggest tiles): 📖 Story time (pick a ready-made story) and
 * 🎨 My own story (build it scene by scene), then my stories, puppet play, and a small grown-ups lock.
 */
export function Home({ onMake, onOwn, onStories, onPuppets, onGrownUps }: { onMake: () => void; onOwn: () => void; onStories: () => void; onPuppets: () => void; onGrownUps: () => void }) {
  const count = useMemo(() => listKidStories().length + listOwnStories().length + listMovies().length, []);
  const latest = useMemo(() => [...listKidStories(), ...listOwnStories()].sort((a, b) => b.updatedAt - a.updatedAt)[0], []);
  return (
    <div className="home">
      <div className="home-col make-col">
        <button className="home-tile make" onClick={onMake} aria-label="Story time">
          <span className="friends">
            <img src={pic('bunny', true)} alt="" className="wiggle" draggable={false} />
            <img src={pic('princess')} alt="" className="wiggle late" draggable={false} />
            <img src={pic('dino')} alt="" className="wiggle" draggable={false} />
          </span>
          <span className="home-icon">📖</span>
        </button>
        <button className="home-tile own" onClick={onOwn} aria-label="My own story">
          <span className="friends">
            <img src={pic('unicorn')} alt="" className="wiggle late" draggable={false} />
            <img src={pic('puppy', true)} alt="" className="wiggle" draggable={false} />
            <img src={pic('penguin')} alt="" className="wiggle late" draggable={false} />
          </span>
          <span className="home-icon">🎨</span>
        </button>
      </div>
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
