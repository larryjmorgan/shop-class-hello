import { useEffect, useMemo, useRef, useState } from 'react';
import { BACKGROUNDS, CHARACTERS, artById } from '../assets';
import { resumeAudio } from '../audio';
import { OBJ_BASE, STAGE_H, STAGE_W, type Project } from '../model';
import { objectPoseAt, onImageLoaded, renderFrame } from '../render';
import { makeThumb } from '../thumb';
import {
  ACTIONS, MAX_OWN_SCENES, MAX_SCENE_ACTORS, OWN_SCENE_SECONDS, actionById, addActor, addOwnProp, addScene, compileOwnStory, cycleActorColor, getOwnStory,
  newOwnStory, ownSceneStart, removeActor, removeOwnProp, removeScene, saveOwnStory, setAction, setOwnMusic, setOwnThumb, setSceneBg, type OwnStory,
} from './own';
import { STICKERS, musicChoice } from './scenarios';
import { MAX_SCENE_PROPS, nextMusic } from './story';
import { StoryPlayer } from './StoryPlayer';
import { TheaterAudio } from './theaterAudio';
import { useFit16x9 } from './useFit';

const pic = (assetId: string, color?: string) => {
  const a = artById(assetId);
  return a ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(a.svg(color ?? a.colors[0], { mouthOpen: false, blink: false }))}` : '';
};

/**
 * The big preview: plays the chosen scene over and over (restarting whenever she changes something, so she
 * sees the change straight away). Tap a friend to pick it.
 */
function SceneLoop({ project, scene, selected, onPick, version }: { project: Project; scene: number; selected: number | null; onPick: (i: number | null) => void; version: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const t0 = useRef(performance.now());
  const tNow = useRef(0);
  const [areaRef, size] = useFit16x9(6);
  const start = ownSceneStart(scene);

  useEffect(() => { t0.current = performance.now(); }, [version, scene]);

  useEffect(() => {
    const ctx = ref.current!.getContext('2d', { alpha: false })!;
    let raf = 0;
    const loop = () => {
      const t = start + (((performance.now() - t0.current) / 1000) % OWN_SCENE_SECONDS);
      tNow.current = t;
      renderFrame(ctx, project, t);
      // a soft yellow ring at the feet of the friend she picked
      const o = selected === null ? undefined : project.objects.find((x) => x.id === `s${scene + 1}c${selected}`);
      if (o && t >= o.start && t < o.end) {
        const p = objectPoseAt(o, t);
        ctx.save();
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 10;
        ctx.setLineDash([22, 12]);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + OBJ_BASE * p.scale * 0.46, OBJ_BASE * p.scale * 0.36, 26, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const off = onImageLoaded(() => undefined);
    return () => { cancelAnimationFrame(raf); off(); };
  }, [project, scene, selected, start]);

  const tap = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * STAGE_W;
    const y = ((e.clientY - r.top) / r.height) * STAGE_H;
    const friends = project.objects.filter((o) => new RegExp(`^s${scene + 1}c(\\d)$`).test(o.id));
    for (let k = friends.length - 1; k >= 0; k--) {
      const o = friends[k];
      const t = tNow.current;
      if (t < o.start || t >= o.end) continue;
      const p = objectPoseAt(o, t);
      const rad = OBJ_BASE * p.scale * 0.45; // generous: little fingers
      if (Math.abs(x - p.x) <= rad && Math.abs(y - p.y) <= rad * 1.1) return onPick(Number(o.id.slice(o.id.lastIndexOf('c') + 1)));
    }
    onPick(null);
  };

  return (
    <div className="own-stage" ref={areaRef}>
      <canvas ref={ref} width={STAGE_W} height={STAGE_H} style={{ width: size.w, height: size.h }} onPointerDown={tap} aria-label="Scene preview: tap a friend to choose what it does" />
    </div>
  );
}

/** "My own story": build the story scene by scene. Pictures only; saved automatically. */
export function OwnStoryMaker({ storyId, onHome, onShelf }: { storyId?: string; onHome: () => void; onShelf: () => void }) {
  const [story, setStory] = useState<OwnStory>(() => (storyId && getOwnStory(storyId)) || newOwnStory());
  const [scene, setScene] = useState(0);
  const [actor, setActor] = useState<number | null>(null);
  const [picker, setPicker] = useState<'friends' | 'stickers' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [saveProblem, setSaveProblem] = useState(false);
  const audioRef = useRef<TheaterAudio | null>(null);
  const thumbTimer = useRef<ReturnType<typeof setTimeout>>();
  const audio = () => (audioRef.current ??= new TheaterAudio());
  const sound = (id?: string, v = 0.6) => { if (id) { void resumeAudio(); void audio().sfx(id, v); } };

  useEffect(() => () => { audioRef.current?.dispose(); clearTimeout(thumbTimer.current); }, []);

  // Save every change (it's hers from her first change; just opening and leaving saves nothing), and refresh the
  // shelf picture shortly after.
  const opened = useRef(story);
  useEffect(() => {
    if (story === opened.current) return;
    setSaveProblem(!saveOwnStory(story));
    clearTimeout(thumbTimer.current);
    const s = story;
    thumbTimer.current = setTimeout(async () => {
      const t = await makeThumb(compileOwnStory(s));
      if (t) setOwnThumb(s.id, t);
    }, 1200);
  }, [story]);

  const project = useMemo(() => compileOwnStory(story), [story]);
  const sc = story.scenes[Math.min(scene, story.scenes.length - 1)];
  const version = JSON.stringify(sc);
  const sel = actor !== null && actor < sc.actors.length ? actor : null;

  const goScene = (i: number) => { setScene(i); setActor(null); setConfirmDelete(false); sound('pop', 0.4); };
  const newScene = () => {
    const r = addScene(story, scene);
    setStory(r.story);
    setScene(r.index);
    setActor(null);
    sound('twinkle');
  };

  return (
    <div className="maker own">
      <div className="t-top">
        <button className="kbtn round" onClick={onHome} aria-label="Home">🏠</button>
        <span className="maker-step" aria-hidden="true">🎨</span>
        <div className="own-scenes" aria-label="Scenes">
          {story.scenes.map((s, i) => (
            <button key={i} className={`own-scene-btn${i === scene ? ' on' : ''}`} style={{ background: BACKGROUNDS.find((b) => b.id === s.bg)?.thumb }} onClick={() => goScene(i)} aria-label={`Scene ${i + 1}`} aria-pressed={i === scene}>
              <span>{i + 1}</span>
            </button>
          ))}
          <button className="kbtn round add-scene" onClick={newScene} disabled={story.scenes.length >= MAX_OWN_SCENES} aria-label="Add a scene">➕</button>
        </div>
        <span className="spacer" />
        <button className="kbtn round" onClick={onShelf} aria-label="My stories">📚</button>
      </div>

      <div className="own-middle">
        <div className="t-bgs" aria-label="Backdrops">
          {BACKGROUNDS.map((b) => (
            <button key={b.id} className={`t-bg${sc.bg === b.id ? ' on' : ''}`} style={{ background: b.thumb }} onClick={() => { setStory(setSceneBg(story, scene, b.id)); sound('twinkle', 0.4); }} aria-label={`Backdrop: ${b.label}`} />
          ))}
        </div>
        <SceneLoop project={project} scene={scene} selected={sel} version={version} onPick={(i) => { setActor(i); if (i !== null) sound('pop', 0.4); }} />
      </div>

      {saveProblem && <p className="t-warn" role="alert">⚠️ This story couldn’t be saved on this device (storage is full or blocked).</p>}

      {sel === null ? (
        <div className="own-tray" aria-label="This scene">
          <div className="own-friends">
            {sc.actors.map((a, i) => (
              <button key={i} className="friend-chip" onClick={() => { setActor(i); sound('pop', 0.4); }} aria-label={`Choose what ${artById(a.assetId)?.label} does`}>
                <img src={pic(a.assetId, a.color)} alt="" draggable={false} />
                <span className="action-badge">{actionById(a.action).icon}</span>
              </button>
            ))}
            {sc.actors.length < MAX_SCENE_ACTORS && (
              <button className="kbtn round add-friend" onClick={() => setPicker('friends')} aria-label="Add a friend to this scene">➕</button>
            )}
          </div>
          <div className="own-scene-tools">
            <button className={`kbtn round${sc.music ? '' : ' off'}`} onClick={() => { const m = nextMusic(sc.music); setStory(setOwnMusic(story, scene, m)); void audio().setMusic(m, 4); }} aria-label={`Music: ${musicChoice(sc.music).label}`}>
              {musicChoice(sc.music).icon}
            </button>
            <button className="kbtn round" onClick={() => setPicker('stickers')} disabled={sc.props.length >= MAX_SCENE_PROPS} aria-label="Add something to this scene">⭐</button>
            {sc.props.map((p, k) => (
              <button key={k} className="sticker-chip" onClick={() => setStory(removeOwnProp(story, scene, k))} aria-label={`Remove ${artById(p)?.label}`}>
                <img src={pic(p)} alt="" draggable={false} /><span>✖</span>
              </button>
            ))}
            {story.scenes.length > 1 && <button className="kbtn round small danger-kbtn" onClick={() => setConfirmDelete(true)} aria-label="Remove this scene">🗑️</button>}
          </div>
          <button className="play-btn" onClick={() => { void audio().setMusic(null); setPlaying(true); }} aria-label="Play my story">▶</button>
        </div>
      ) : (
        <div className="own-tray picking" aria-label={`What does ${artById(sc.actors[sel].assetId)?.label} do?`}>
          <img className="picked" src={pic(sc.actors[sel].assetId, sc.actors[sel].color)} alt="" draggable={false} />
          <div className="actions">
            {ACTIONS.map((a) => (
              <button
                key={a.id} className={`action-btn${sc.actors[sel].action === a.id ? ' on' : ''}`} aria-label={a.label} aria-pressed={sc.actors[sel].action === a.id}
                onClick={() => { setStory(setAction(story, scene, sel, a.id)); sound(a.sound, 0.5); }}
              >{a.icon}</button>
            ))}
          </div>
          <div className="picked-tools">
            {(artById(sc.actors[sel].assetId)?.colors.length ?? 0) > 1 && (
              <button className="color-dot inline" style={{ background: sc.actors[sel].color }} onClick={() => setStory(cycleActorColor(story, scene, sel))} aria-label="Change colour" />
            )}
            <button className="kbtn round small" onClick={() => { setStory(removeActor(story, scene, sel)); setActor(null); sound('pop', 0.5); }} aria-label="Take this friend out of the scene">🗑️</button>
            <button className="kbtn big good" onClick={() => setActor(null)} aria-label="Done">✓</button>
          </div>
        </div>
      )}

      {picker && (
        <div className="sticker-picker" role="dialog" aria-label={picker === 'friends' ? 'Add a friend' : 'Add something'}>
          <div className="sticker-grid">
            {(picker === 'friends' ? CHARACTERS.map((c) => c.id) : STICKERS).map((id) => (
              <button key={id} className="t-tile" aria-label={`Add ${artById(id)?.label}`} onClick={() => {
                if (picker === 'friends') {
                  const next = addActor(story, scene, id);
                  setStory(next);
                  setActor(next.scenes[scene].actors.length - 1); // straight to "what does it do?"
                  sound('boing');
                } else {
                  setStory(addOwnProp(story, scene, id));
                  sound('pop');
                }
                setPicker(null);
              }}>
                <img src={pic(id)} alt="" draggable={false} />
              </button>
            ))}
          </div>
          <button className="kbtn round close" onClick={() => setPicker(null)} aria-label="Close">✖</button>
        </div>
      )}

      {confirmDelete && (
        <div className="sticker-picker" role="dialog" aria-label="Remove this scene?">
          <div className="confirm-row">
            <button className="kbtn big danger-kbtn" onClick={() => { setStory(removeScene(story, scene)); setScene(Math.max(0, scene - 1)); setConfirmDelete(false); sound('pop'); }} aria-label="Yes, remove the scene">🗑️</button>
            <button className="kbtn big good" onClick={() => setConfirmDelete(false)} aria-label="No, keep it">↩️</button>
          </div>
        </div>
      )}

      {playing && <StoryPlayer project={project} onClose={() => setPlaying(false)} onDone={() => { setPlaying(false); onShelf(); }} />}
    </div>
  );
}
