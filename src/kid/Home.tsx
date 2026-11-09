import { useMemo } from 'react';
import { useAutoBackup } from '../autoBackup';
import { CHARACTERS } from '../assets';
import { listMovies } from './movies';
import { listOwnStories } from './own';
import { listKidStories } from './story';

const pic = (id: string, mouthOpen = false) => {
  const c = CHARACTERS.find((x) => x.id === id)!;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.svg(c.colors[0], { mouthOpen, blink: false }))}`;
};

/**
 * The first screen, all pictures: 📖 Story time (a ready-made story), 🎨 My own story (scene by scene), 📚 my stories,
 * 🖌️ paint a friend, 🧮 learn, 🎭 puppet play, and a small grown-ups lock.
 */
export function Home({ onMake, onOwn, onStories, onPaint, onLearn, onPuppets, onGrownUps }: {
  onMake: () => void; onOwn: () => void; onStories: () => void; onPaint: () => void; onLearn: () => void; onPuppets: () => void; onGrownUps: () => void;
}) {
  const auto = useAutoBackup().state;
  const needsGrownUp = auto === 'paused' || auto === 'error';
  const count = useMemo(() => listKidStories().length + listOwnStories().length + listMovies().length, []);
  const latest = useMemo(() => [...listKidStories(), ...listOwnStories()].sort((a, b) => b.updatedAt - a.updatedAt)[0], []);
  return (
    <div className="home grid">
      <button className="home-tile make" onClick={onMake} aria-label="Story time">
        <span className="friends">
          <img src={pic('bunny', true)} alt="" className="wiggle" draggable={false} />
          <img src={pic('princess')} alt="" className="wiggle late" draggable={false} />
        </span>
        <span className="home-icon">📖</span>
      </button>
      <button className="home-tile own" onClick={onOwn} aria-label="My own story">
        <span className="friends">
          <img src={pic('unicorn')} alt="" className="wiggle late" draggable={false} />
          <img src={pic('puppy', true)} alt="" className="wiggle" draggable={false} />
        </span>
        <span className="home-icon">🎨</span>
      </button>
      <button className="home-tile movies" onClick={onStories} aria-label={`My stories (${count})`}>
        {latest?.thumb ? <img src={latest.thumb} alt="" className="poster" draggable={false} /> : <span className="huge-emoji">📚</span>}
        <span className="home-icon">📚</span>
        {count > 0 && <span className="badge">{count}</span>}
      </button>
      <button className="home-tile paint" onClick={onPaint} aria-label="Paint a friend">
        <span className="huge-emoji">🖍️</span>
        <span className="home-icon">🖌️</span>
      </button>
      <button className="home-tile learn" onClick={onLearn} aria-label="Learn">
        <span className="learn-peek" aria-hidden="true"><b>1</b><b>a</b><b>▲</b></span>
        <span className="home-icon">🧮</span>
      </button>
      <button className="home-tile play" onClick={onPuppets} aria-label="Puppet play">
        <img src={pic('bear')} alt="" className="wiggle small-friend" draggable={false} />
        <span className="home-icon">🎭</span>
      </button>
      <button className={`lock${needsGrownUp ? ' attention' : ''}`} onClick={onGrownUps} aria-label={needsGrownUp ? 'Grown-ups (backup paused)' : 'Grown-ups'}>🔒</button>
    </div>
  );
}
