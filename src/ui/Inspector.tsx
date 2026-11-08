import { artById, bgById } from '../assets';
import {
  addKeyframeAt, deleteKeyframe, deleteSelection, duplicateObject, moveLayer, mutate, posePatch, select, setAutoKey, setKeyframeEase,
  updateAudio, updateBackground, updateObject, useStore, useTime,
} from '../store';
import { activeAt, findKeyframeIndex, fmtTime, samplePose, type Behavior, type Ease, type Entrance } from '../model';

const EASES: [Ease, string][] = [['ease', 'Smooth'], ['linear', 'Steady'], ['bounce', 'Bouncy'], ['elastic', 'Springy'], ['hold', 'Jump (no tween)']];
const BEHAVIORS: [Behavior, string][] = [['none', 'None'], ['wiggle', 'Wiggle'], ['bounce', 'Hop'], ['float', 'Float'], ['spin', 'Spin'], ['pulse', 'Pulse']];
const ENTRANCES: [Entrance, string][] = [['pop', 'Pop in'], ['fade', 'Fade in'], ['slide', 'Slide in'], ['none', 'Instant']];

function Num({ label, value, step = 1, min, max, onChange }: { label: string; value: number; step?: number; min?: number; max?: number; onChange: (v: number) => void }) {
  return (
    <label className="num">
      <span>{label}</span>
      <input type="number" step={step} min={min} max={max} value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }} />
    </label>
  );
}

export function Inspector() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const selectedKfT = useStore((s) => s.selectedKfT);
  const autoKey = useStore((s) => s.autoKey);
  const t = useTime();

  if (selection.type === 'none') {
    return (
      <aside className="inspector">
        <h3>Inspector</h3>
        <div className="tips">
          <p><b>Make something move</b></p>
          <ol>
            <li>Add a character from the left.</li>
            <li>Slide the playhead to a new time.</li>
            <li>Drag the character on the stage — a ◆ keyframe appears and it will glide there.</li>
          </ol>
          <p>Click anything on stage or in the timeline to edit it. <kbd>Space</kbd> plays, <kbd>Delete</kbd> removes.</p>
        </div>
        <label className="check"><input type="checkbox" checked={project.duckMusic} onChange={(e) => updateObjectsDuck(e.target.checked)} /> Lower the music while someone talks</label>
      </aside>
    );
  }

  if (selection.type === 'object') {
    const o = project.objects.find((x) => x.id === selection.id);
    if (!o) return null;
    const art = artById(o.assetId);
    const raw = samplePose(o.keyframes, t);
    const onStage = activeAt(o.start, o.end, t);
    const kfIdx = findKeyframeIndex(o.keyframes, t);
    const kfSel = selectedKfT !== null ? findKeyframeIndex(o.keyframes, selectedKfT) : -1;
    const set = (patch: Parameters<typeof posePatch>[2]) => posePatch(o.id, t, patch, true, `pose:${o.id}:${Object.keys(patch).join()}`);
    return (
      <aside className="inspector">
        <h3>{o.kind === 'text' ? '🔤' : art?.emoji} {o.name}</h3>
        <label className="field">Name<input value={o.name} onChange={(e) => updateObject(o.id, (x) => { x.name = e.target.value; }, true, `name:${o.id}`)} /></label>
        {o.kind === 'text' && (
          <label className="field">Words<textarea rows={2} value={o.text ?? ''} onChange={(e) => updateObject(o.id, (x) => { x.text = e.target.value; }, true, `text:${o.id}`)} /></label>
        )}
        <div className="swatches" aria-label="Colour">
          {(o.kind === 'text' ? ['#ffe066', '#ffffff', '#ff8fc7', '#7fe0ff', '#9dffa6', '#ffb36b'] : art?.colors ?? []).map((c) => (
            <button key={c} className={o.color === c ? 'on' : ''} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => updateObject(o.id, (x) => { x.color = c; })} />
          ))}
        </div>

        <div className="kf-bar">
          <label className="check"><input type="checkbox" checked={autoKey} onChange={(e) => setAutoKey(e.target.checked)} /> Animate (auto-keyframe)</label>
          <span className="muted">{autoKey ? 'Changes at this time create ◆ keyframes.' : 'Changes move the whole path, no new keyframes.'}</span>
        </div>
        {!onStage && <p className="hint warn">Playhead is outside this object’s bar ({fmtTime(o.start)}–{fmtTime(o.end)}).</p>}
        <div className="nums">
          <Num label="X" value={raw.x} onChange={(v) => set({ x: v })} />
          <Num label="Y" value={raw.y} onChange={(v) => set({ y: v })} />
          <Num label="Size" value={raw.scale} step={0.1} min={0.1} max={8} onChange={(v) => set({ scale: Math.max(0.1, v) })} />
          <Num label="Turn°" value={raw.rot} onChange={(v) => set({ rot: v })} />
          <Num label="Opacity" value={raw.opacity} step={0.1} min={0} max={1} onChange={(v) => set({ opacity: Math.min(1, Math.max(0, v)) })} />
        </div>
        <div className="row-btns">
          <button className="btn small" onClick={() => set({ flip: !raw.flip })}>↔ Flip</button>
          <button className="btn small" onClick={() => addKeyframeAt(o.id, t)} disabled={kfIdx >= 0 || !onStage} title="Add a keyframe at the playhead with the current pose">◆ Key here</button>
          <button className="btn small" onClick={() => kfSel >= 0 && deleteKeyframe(o.id, selectedKfT!)} disabled={kfSel < 0 || o.keyframes.length <= 1}>Remove ◆</button>
        </div>
        {kfSel >= 0 && (
          <label className="field">Motion after this ◆
            <select value={o.keyframes[kfSel].ease} onChange={(e) => setKeyframeEase(o.id, selectedKfT!, e.target.value as Ease)}>
              {EASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
        <label className="field">While on stage
          <select value={o.behavior} onChange={(e) => updateObject(o.id, (x) => { x.behavior = e.target.value as Behavior; })}>
            {BEHAVIORS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">Arrives
          <select value={o.entrance} onChange={(e) => updateObject(o.id, (x) => { x.entrance = e.target.value as Entrance; })}>
            {ENTRANCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <div className="row-btns">
          <button className="btn small" onClick={() => moveLayer(o.id, 1)}>▲ Forward</button>
          <button className="btn small" onClick={() => moveLayer(o.id, -1)}>▼ Back</button>
          <button className="btn small" onClick={() => duplicateObject(o.id)}>⧉ Copy</button>
          <button className="btn small danger" onClick={deleteSelection}>🗑 Delete</button>
        </div>
      </aside>
    );
  }

  if (selection.type === 'bg') {
    const b = project.backgrounds.find((x) => x.id === selection.id);
    if (!b) return null;
    const def = bgById(b.bgId);
    return (
      <aside className="inspector">
        <h3>{def?.emoji} {def?.label}</h3>
        <p className="muted">{fmtTime(b.start)} → {fmtTime(b.end)}</p>
        <label className="field">How it starts
          <select value={b.transition} onChange={(e) => updateBackground(b.id, (x) => { x.transition = e.target.value as 'cut' | 'fade'; })}>
            <option value="cut">Cut</option>
            <option value="fade">Cross-fade</option>
          </select>
        </label>
        <p className="hint">Add another scene at a later time from the Scenes tab. Drag the bar edges to adjust.</p>
        <button className="btn small danger" onClick={deleteSelection}>🗑 Delete scene</button>
      </aside>
    );
  }

  const c = project.audio.find((x) => x.id === selection.id);
  if (!c) return null;
  return (
    <aside className="inspector">
      <h3>{c.kind === 'voice' ? '🎤' : c.kind === 'music' ? '🎵' : '🔊'} {c.label}</h3>
      <p className="muted">{fmtTime(c.start)} → {fmtTime(c.start + c.duration)} {c.provider === 'browser' && '· computer voice (preview only)'}</p>
      {c.kind === 'voice' && (
        <label className="field">Words
          <textarea rows={3} value={c.text ?? ''} onChange={(e) => updateAudio(c.id, (x) => { x.text = e.target.value; }, true, `atext:${c.id}`)} />
          {c.provider !== 'browser' && <small>Editing the text doesn’t change recorded audio.</small>}
        </label>
      )}
      {c.kind === 'voice' && (
        <label className="field">Speaker
          <select value={c.characterId ?? ''} onChange={(e) => updateAudio(c.id, (x) => { x.characterId = e.target.value || undefined; })}>
            <option value="">Narrator</option>
            {project.objects.filter((o) => o.kind === 'character').map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}
      <label className="field">Volume {Math.round(c.volume * 100)}%
        <input type="range" min={0} max={1.5} step={0.05} value={c.volume} onChange={(e) => updateAudio(c.id, (x) => { x.volume = Number(e.target.value); }, true, `vol:${c.id}`)} />
      </label>
      <Num label="Start (s)" value={c.start} step={0.1} min={0} onChange={(v) => updateAudio(c.id, (x) => { x.start = Math.max(0, v); }, true, `astart:${c.id}`)} />
      <Num label="Length (s)" value={c.duration} step={0.1} min={0.3} onChange={(v) => updateAudio(c.id, (x) => { x.duration = Math.max(0.3, v); }, true, `adur:${c.id}`)} />
      <button className="btn small danger" onClick={() => { deleteSelection(); select({ type: 'none' }); }}>🗑 Delete</button>
    </aside>
  );
}

function updateObjectsDuck(v: boolean) {
  mutate((p) => { p.duckMusic = v; });
}
