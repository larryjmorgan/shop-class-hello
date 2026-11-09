import { useEffect, useMemo, useRef, useState } from 'react';
import { BACKGROUNDS, CHARACTERS, artById } from '../assets';
import { resumeAudio } from '../audio';
import { STAGE_H, STAGE_W, type Project } from '../model';
import { onImageLoaded, renderFrame } from '../render';
import { makeThumb } from '../thumb';
import { SCENARIOS, STICKERS, musicChoice, scenarioById } from './scenarios';
import {
  MAX_CAST, MAX_SCENE_PROPS, TITLE_SECONDS, addSceneProp, compileStory, cycleCastColor, getKidStory, newKidStory, nextMusic, removeSceneProp,
  saveKidStory, setKidStoryThumb, setSceneMusic, toggleCast, type KidStory,
} from './story';
import { StoryPlayer } from './StoryPlayer';
import { TheaterAudio } from './theaterAudio';

type Step = 'scenario' | 'cast' | 'board';

const pic = (assetId: string, color?: string) => {
  const a = artById(assetId);
  return a ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(a.svg(color ?? a.colors[0], { mouthOpen: false, blink: false }))}` : '';
};
const bgThumb = (id: string) => BACKGROUNDS.find((b) => b.id === id)?.thumb ?? '#ddd';

/** A small live picture of one scene of the story. */
function ScenePreview({ project, t }: { project: Project; t: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const ctx = ref.current?.getContext('2d', { alpha: false });
      if (ctx) renderFrame(ctx, project, t, true);
    };
    draw();
    return onImageLoaded(draw);
  }, [project, t]);
  return <canvas ref={ref} width={STAGE_W / 4} height={STAGE_H / 4} className="scene-canvas" aria-hidden="true" />;
}

/**
 * The child's story maker: 1) pick a story, 2) pick who is in it, 3) make each scene hers (music, stickers), then watch.
 * Pictures only; everything is saved automatically.
 */
export function StoryMaker({ storyId, onHome, onShelf }: { storyId?: string; onHome: () => void; onShelf: () => void }) {
  const [story, setStory] = useState<KidStory | null>(() => (storyId ? getKidStory(storyId) ?? null : null));
  const [step, setStep] = useState<Step>(() => (storyId && getKidStory(storyId) ? 'board' : 'scenario'));
  const [stickersFor, setStickersFor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [saveProblem, setSaveProblem] = useState(false);
  const audioRef = useRef<TheaterAudio | null>(null);
  const saved = useRef(!!storyId);
  const thumbTimer = useRef<ReturnType<typeof setTimeout>>();
  const audio = () => (audioRef.current ??= new TheaterAudio());

  useEffect(() => () => { audioRef.current?.dispose(); clearTimeout(thumbTimer.current); }, []);

  // Save every change once the story exists (from the "make it yours" step on), and refresh its shelf picture.
  useEffect(() => {
    if (!story || !saved.current) return;
    setSaveProblem(!saveKidStory(story));
    clearTimeout(thumbTimer.current);
    const s = story;
    thumbTimer.current = setTimeout(async () => {
      const t = await makeThumb(compileStory(s));
      if (t) setKidStoryThumb(s.id, t);
    }, 1200);
  }, [story]);

  const project = useMemo(() => (story ? compileStory(story) : null), [story]);
  const sc = story ? scenarioById(story.scenarioId) : undefined;

  const pickScenario = (id: string) => {
    void resumeAudio();
    void audio().sfx('twinkle', 0.6);
    setStory(newKidStory(scenarioById(id)!));
    setStep('cast');
  };

  const goBoard = () => {
    saved.current = true;
    setStory((s) => (s ? { ...s } : s)); // triggers the first save
    setStep('board');
    void audio().sfx('yay', 0.6);
  };

  const changeMusic = (i: number) => {
    if (!story) return;
    const next = nextMusic(story.scenes[i].music);
    setStory(setSceneMusic(story, i, next));
    void audio().setMusic(next, 4); // a short taste of it
  };

  // ---------- step 1: pick a story ----------
  if (step === 'scenario' || !story || !sc || !project) {
    return (
      <div className="maker">
        <div className="t-top">
          <button className="kbtn round" onClick={onHome} aria-label="Home">🏠</button>
          <span className="maker-step" aria-hidden="true">📖</span>
          <span className="spacer" />
        </div>
        <div className="scenario-grid">
          {SCENARIOS.map((s) => (
            <button key={s.id} className="scenario-card" style={{ background: bgThumb(s.cardBg) }} onClick={() => pickScenario(s.id)} aria-label={`Story: ${s.title}`}>
              <span className="scenario-emoji">{s.emoji}</span>
              <span className="scenario-friends">
                {s.defaultCast.map((id) => <img key={id} src={pic(id)} alt="" draggable={false} />)}
              </span>
              <span className="scenario-name">{s.title}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---------- step 2: who is in the story? ----------
  if (step === 'cast') {
    return (
      <div className="maker">
        <div className="t-top">
          <button className="kbtn round" onClick={() => (saved.current ? setStep('board') : setStep('scenario'))} aria-label="Back">◀</button>
          <span className="maker-step" aria-hidden="true">{sc.emoji}</span>
          <span className="spacer" />
          <button className="kbtn big good next" onClick={goBoard} disabled={story.cast.length === 0} aria-label="Next">✓</button>
        </div>
        <div className="cast-grid" aria-label={`Pick up to ${MAX_CAST} friends`}>
          {CHARACTERS.map((c) => {
            const m = story.cast.find((x) => x.assetId === c.id);
            return (
              <div key={c.id} className={`cast-tile${m ? ' on' : ''}`}>
                <button
                  className="cast-pick" aria-pressed={!!m} aria-label={`${m ? 'Remove' : 'Add'} ${c.label}`}
                  onClick={() => { setStory(toggleCast(story, c.id)); void audio().sfx(m ? 'pop' : 'boing', 0.6); }}
                >
                  <img src={pic(c.id, m?.color)} alt="" draggable={false} />
                  {m && <span className="tick">✓</span>}
                </button>
                {m && c.colors.length > 1 && (
                  <button className="color-dot" style={{ background: m.color }} onClick={() => setStory(cycleCastColor(story, c.id))} aria-label={`Change ${c.label}'s colour`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------- step 3: make it yours ----------
  let start = TITLE_SECONDS;
  const sceneTimes = sc.scenes.map((s) => { const t = start + s.seconds * 0.6; start += s.seconds; return t; });

  return (
    <div className="maker">
      <div className="t-top">
        <button className="kbtn round" onClick={onHome} aria-label="Home">🏠</button>
        <span className="maker-step" aria-hidden="true">{sc.emoji}</span>
        <button className="cast-strip" onClick={() => setStep('cast')} aria-label="Change who is in the story">
          {story.cast.map((c) => <img key={c.assetId} src={pic(c.assetId, c.color)} alt="" draggable={false} />)}
          <span className="pencil">✏️</span>
        </button>
        <span className="spacer" />
        <button className="kbtn round" onClick={onShelf} aria-label="My stories">📚</button>
      </div>

      <div className="scene-strip" aria-label="Scenes">
        {sc.scenes.map((_, i) => (
          <div key={i} className="scene-card">
            <div className="scene-pic"><ScenePreview project={project} t={sceneTimes[i]} /><span className="scene-num">{i + 1}</span></div>
            <div className="scene-tools">
              <button className={`kbtn round${story.scenes[i].music ? '' : ' off'}`} onClick={() => changeMusic(i)} aria-label={`Scene ${i + 1} music: ${musicChoice(story.scenes[i].music).label}`}>
                {musicChoice(story.scenes[i].music).icon}
              </button>
              <button className="kbtn round" onClick={() => setStickersFor(i)} disabled={story.scenes[i].props.length >= MAX_SCENE_PROPS} aria-label={`Add something to scene ${i + 1}`}>➕</button>
              {story.scenes[i].props.map((p, k) => (
                <button key={k} className="sticker-chip" onClick={() => setStory(removeSceneProp(story, i, k))} aria-label={`Remove ${artById(p)?.label} from scene ${i + 1}`}>
                  <img src={pic(p)} alt="" draggable={false} /><span>✖</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {saveProblem && <p className="t-warn" role="alert">⚠️ This story couldn’t be saved on this device (storage is full or blocked).</p>}

      <div className="maker-bottom">
        <button className="play-btn" onClick={() => { void audio().setMusic(null); setPlaying(true); }} aria-label="Play my story">▶</button>
      </div>

      {stickersFor !== null && (
        <div className="sticker-picker" role="dialog" aria-label="Add something">
          <div className="sticker-grid">
            {STICKERS.map((id) => (
              <button key={id} className="t-tile" aria-label={`Add ${artById(id)?.label}`} onClick={() => {
                setStory(addSceneProp(story, stickersFor, id));
                void audio().sfx('pop', 0.6);
                setStickersFor(null);
              }}>
                <img src={pic(id)} alt="" draggable={false} />
              </button>
            ))}
          </div>
          <button className="kbtn round close" onClick={() => setStickersFor(null)} aria-label="Close">✖</button>
        </div>
      )}

      {playing && <StoryPlayer project={project} onClose={() => setPlaying(false)} onDone={() => { setPlaying(false); onShelf(); }} />}
    </div>
  );
}
