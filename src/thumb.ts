import type { Project } from './model';
import { preloadProject, renderFrame } from './render';

const W = 240;
const H = 135;

/** A small JPEG picture of the story for the library screen, taken a moment after the first thing appears. */
export async function makeThumb(p: Project): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  try {
    await preloadProject(p);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { alpha: false });
    if (!g) return null;
    const firstStart = p.objects.length ? Math.min(...p.objects.map((o) => o.start)) : 0;
    renderFrame(g, p, Math.min(firstStart + 1.2, Math.max(0, p.duration - 0.01)), true);
    return c.toDataURL('image/jpeg', 0.62);
  } catch {
    return null;
  }
}
