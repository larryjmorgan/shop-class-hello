import { useEffect, useMemo, useState } from 'react';
import { safeName, download } from '../projectFile';
import { fmtTime } from '../model';
import { listMovies, loadMovie, removeMovie, type MovieMeta } from './movies';
import { FilmIcon } from './icons';
import { ParentGate } from './ParentGate';

/** All the movies she has made. Playing is free; downloading and deleting are for grown-ups. */
export function Shelf({ onHome, onPlay }: { onHome: () => void; onPlay: () => void }) {
  const [tick, setTick] = useState(0);
  const movies = useMemo(() => listMovies(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const [playing, setPlaying] = useState<{ meta: MovieMeta; url: string } | null>(null);
  const [parent, setParent] = useState(false);
  const [gate, setGate] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => () => { if (playing) URL.revokeObjectURL(playing.url); }, [playing]);

  const open = async (meta: MovieMeta) => {
    const blob = await loadMovie(meta.id);
    if (!blob) {
      setMessage('This movie could not be found on this device.');
      return;
    }
    setPlaying({ meta, url: URL.createObjectURL(blob) });
  };

  const save = async (meta: MovieMeta) => {
    const blob = await loadMovie(meta.id);
    if (!blob) return setMessage('This movie could not be found on this device.');
    download(blob, `${safeName('puppet-movie')}-${new Date(meta.createdAt).toISOString().slice(0, 10)}.${meta.ext}`);
  };

  const del = async (meta: MovieMeta) => {
    if (!window.confirm('Delete this movie for good? This can’t be undone.')) return;
    await removeMovie(meta.id);
    setTick((t) => t + 1);
  };

  return (
    <div className="shelf">
      <div className="t-top">
        <button className="kbtn round" onClick={onHome} aria-label="Home">🏠</button>
        <span className="spacer" />
        {parent ? (
          <span className="parent-on" role="status">🔓 Grown-up tools on</span>
        ) : (
          <button className="kbtn round small" onClick={() => setGate(true)} aria-label="Grown-ups: save or delete movies">🔒</button>
        )}
        <button className="kbtn round" onClick={onPlay} aria-label="Make a movie">🎭</button>
      </div>

      {movies.length === 0 ? (
        <div className="empty">
          <button className="home-tile play" onClick={onPlay} aria-label="Make your first movie"><span className="big-icon"><FilmIcon /></span><span className="home-icon">🎭</span></button>
        </div>
      ) : (
        <div className="shelf-grid">
          {movies.map((m) => (
            <div key={m.id} className="movie">
              <button className="movie-pic" onClick={() => void open(m)} aria-label={`Watch movie, ${fmtTime(m.seconds).replace(/\.\d$/, '')}`}>
                {m.poster ? <img src={m.poster} alt="" draggable={false} /> : <span>🎬</span>}
                <span className="play-badge">▶</span>
                <span className="len">{fmtTime(m.seconds).replace(/\.\d$/, '')}</span>
              </button>
              {parent && (
                <div className="movie-tools">
                  <button className="btn small" onClick={() => void save(m)} aria-label="Save this movie to the computer">⬇ Save</button>
                  <button className="btn small danger" onClick={() => void del(m)} aria-label="Delete this movie">🗑 Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {message && <p className="t-warn" role="alert">{message}</p>}

      {playing && (
        <div className="player" role="dialog" aria-label="Movie player">
          <video src={playing.url} controls autoPlay playsInline />
          <button className="kbtn round close" onClick={() => setPlaying(null)} aria-label="Close movie">✖</button>
        </div>
      )}
      {gate && <ParentGate why="Saving or deleting movies is for grown-ups." onClose={() => setGate(false)} onPass={() => { setGate(false); setParent(true); }} />}
    </div>
  );
}
