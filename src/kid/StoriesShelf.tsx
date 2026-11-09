import { useEffect, useMemo, useState } from 'react';
import { BACKGROUNDS } from '../assets';
import { fmtTime, type Project } from '../model';
import { download, safeName } from '../projectFile';
import { ExportDialog } from '../ui/Dialogs';
import { listMovies, loadMovie, removeMovie, type MovieMeta } from './movies';
import { compileOwnStory, deleteOwnStory, listOwnStories, ownTitle } from './own';
import { ParentGate } from './ParentGate';
import { scenarioById } from './scenarios';
import { compileStory, deleteKidStory, listKidStories, storyTitle } from './story';
import { StoryPlayer } from './StoryPlayer';

/**
 * Her stories. Watching and changing them is for everyone; saving a video, opening in the Studio and deleting are
 * behind the grown-ups lock. Movies recorded by the earlier puppet version are listed too.
 */
interface ShelfItem { kind: 'kid' | 'own'; id: string; title: string; emoji: string; bg?: string; thumb?: string; updatedAt: number; project: Project }

/** Both kinds of story (📖 ready-made and 🎨 her own), newest first. */
function shelfItems(): ShelfItem[] {
  const kid: ShelfItem[] = listKidStories().map((s) => {
    const sc = scenarioById(s.scenarioId)!;
    return { kind: 'kid', id: s.id, title: storyTitle(s), emoji: sc.emoji, bg: sc.cardBg, thumb: s.thumb, updatedAt: s.updatedAt, project: compileStory(s) };
  });
  const own: ShelfItem[] = listOwnStories().map((s) => (
    { kind: 'own', id: s.id, title: ownTitle(s), emoji: '🎨', bg: s.scenes[0]?.bg, thumb: s.thumb, updatedAt: s.updatedAt, project: compileOwnStory(s) }
  ));
  return [...kid, ...own].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function StoriesShelf({ onHome, onNew, onEdit, onEditOwn, onOpenStudio }: { onHome: () => void; onNew: () => void; onEdit: (id: string) => void; onEditOwn: (id: string) => void; onOpenStudio: (p: Project) => void }) {
  const [tick, setTick] = useState(0);
  const stories = useMemo(() => shelfItems(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const movies = useMemo(() => listMovies(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const [watching, setWatching] = useState<Project | null>(null);
  const [movie, setMovie] = useState<{ url: string } | null>(null);
  const [parent, setParent] = useState(false);
  const [gate, setGate] = useState(false);
  const [exporting, setExporting] = useState<Project | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => () => { if (movie) URL.revokeObjectURL(movie.url); }, [movie]);

  const del = (s: ShelfItem) => {
    if (!window.confirm(`Delete “${s.title}” for good? This can’t be undone.`)) return;
    if (s.kind === 'own') deleteOwnStory(s.id);
    else deleteKidStory(s.id);
    setTick((t) => t + 1);
  };

  const playMovie = async (m: MovieMeta) => {
    const blob = await loadMovie(m.id);
    if (!blob) return setMessage('That movie could not be found on this device.');
    setMovie({ url: URL.createObjectURL(blob) });
  };

  return (
    <div className="shelf">
      <div className="t-top">
        <button className="kbtn round" onClick={onHome} aria-label="Home">🏠</button>
        <span className="maker-step" aria-hidden="true">📚</span>
        <span className="spacer" />
        {parent ? (
          <span className="parent-on" role="status">🔓 Grown-up tools on</span>
        ) : (
          <button className="kbtn round small" onClick={() => setGate(true)} aria-label="Grown-ups: video, Studio, delete">🔒</button>
        )}
        <button className="kbtn round" onClick={onNew} aria-label="Make a new story">➕</button>
      </div>

      {stories.length === 0 && movies.length === 0 ? (
        <div className="empty">
          <button className="home-tile play" onClick={onNew} aria-label="Make your first story"><span className="home-icon huge-emoji">➕</span></button>
        </div>
      ) : (
        <div className="shelf-grid">
          {stories.map((s) => {
            const p = s.project;
            return (
              <div key={`${s.kind}:${s.id}`} className="movie">
                <button className="movie-pic" style={{ background: BACKGROUNDS.find((b) => b.id === s.bg)?.thumb }} onClick={() => setWatching(p)} aria-label={`Watch ${s.title}`}>
                  {s.thumb ? <img src={s.thumb} alt="" draggable={false} /> : <span className="scenario-emoji">{s.emoji}</span>}
                  <span className="play-badge">▶</span>
                  <span className="badge-emoji">{s.emoji}</span>
                  <span className="len">{fmtTime(p.duration).replace(/\.\d$/, '')}</span>
                </button>
                <div className="movie-tools">
                  <button className="kbtn round small" onClick={() => (s.kind === 'own' ? onEditOwn : onEdit)(s.id)} aria-label={`Change ${s.title}`}>✏️</button>
                  {parent && (
                    <>
                      <button className="btn small" onClick={() => setExporting(p)} aria-label="Save as a video file">🎬 Video</button>
                      <button className="btn small" onClick={() => onOpenStudio(p)} aria-label="Open in the Studio">🛠 Studio</button>
                      <button className="btn small danger" onClick={() => del(s)} aria-label="Delete this story">🗑 Delete</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {movies.map((m) => (
            <div key={m.id} className="movie">
              <button className="movie-pic" onClick={() => void playMovie(m)} aria-label={`Watch puppet movie, ${fmtTime(m.seconds).replace(/\.\d$/, '')}`}>
                {m.poster ? <img src={m.poster} alt="" draggable={false} /> : <span className="scenario-emoji">🎬</span>}
                <span className="play-badge">▶</span>
                <span className="len">{fmtTime(m.seconds).replace(/\.\d$/, '')}</span>
              </button>
              {parent && (
                <div className="movie-tools">
                  <button className="btn small" onClick={async () => { const b = await loadMovie(m.id); if (b) download(b, `${safeName('puppet-movie')}.${m.ext}`); }} aria-label="Save this movie to the computer">⬇ Save</button>
                  <button className="btn small danger" onClick={async () => { if (window.confirm('Delete this movie for good?')) { await removeMovie(m.id); setTick((t) => t + 1); } }} aria-label="Delete this movie">🗑 Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {message && <p className="t-warn" role="alert">{message}</p>}

      {watching && <StoryPlayer project={watching} onClose={() => setWatching(null)} />}
      {movie && (
        <div className="player" role="dialog" aria-label="Movie player">
          <video src={movie.url} controls autoPlay playsInline />
          <button className="kbtn round close" onClick={() => setMovie(null)} aria-label="Close movie">✖</button>
        </div>
      )}
      {gate && <ParentGate why="Saving videos, opening the Studio and deleting stories are for grown-ups." onClose={() => setGate(false)} onPass={() => { setGate(false); setParent(true); }} />}
      {exporting && <ExportDialog project={exporting} onClose={() => setExporting(null)} />}
    </div>
  );
}
