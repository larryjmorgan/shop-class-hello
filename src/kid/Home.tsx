import { useMemo } from 'react';
import { CHARACTERS } from '../assets';
import { FilmIcon } from './icons';
import { listMovies } from './movies';

const bunny = CHARACTERS.find((c) => c.id === 'bunny')!;
const bear = CHARACTERS.find((c) => c.id === 'bear')!;
const pic = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** The first screen: two giant pictures and a small grown-ups lock. */
export function Home({ onPlay, onMovies, onGrownUps }: { onPlay: () => void; onMovies: () => void; onGrownUps: () => void }) {
  const movies = useMemo(() => listMovies(), []);
  const latest = movies[0];
  return (
    <div className="home">
      <button className="home-tile play" onClick={onPlay} aria-label="Play: make a puppet movie">
        <span className="friends">
          <img src={pic(bunny.svg(bunny.colors[0], { mouthOpen: true, blink: false }))} alt="" className="wiggle" draggable={false} />
          <img src={pic(bear.svg(bear.colors[0], { mouthOpen: false, blink: false }))} alt="" className="wiggle late" draggable={false} />
        </span>
        <span className="home-icon">🎭</span>
      </button>
      <button className="home-tile movies" onClick={onMovies} aria-label={`My movies (${movies.length})`}>
        {latest?.poster ? <img src={latest.poster} alt="" className="poster" draggable={false} /> : <span className="big-icon"><FilmIcon /></span>}
        <span className="home-icon corner"><FilmIcon /></span>
        {movies.length > 0 && <span className="badge">{movies.length}</span>}
      </button>
      <button className="lock" onClick={onGrownUps} aria-label="Grown-ups">🔒</button>
    </div>
  );
}
