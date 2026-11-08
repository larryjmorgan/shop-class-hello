import { getBlob, putBlob } from './db';
import { normalizeProject, type Project } from './model';

interface FileFormat {
  app: 'storybox';
  project: Project;
  blobs: Record<string, string>; // key -> data URL
}

const toDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

/** A single self-contained .storybox.json (audio recordings are embedded). */
export async function projectToFile(p: Project): Promise<Blob> {
  const blobs: Record<string, string> = {};
  for (const a of p.audio) {
    if (a.blobKey && !blobs[a.blobKey]) {
      const b = await getBlob(a.blobKey);
      if (b) blobs[a.blobKey] = await toDataUrl(b);
    }
  }
  const out: FileFormat = { app: 'storybox', project: p, blobs };
  return new Blob([JSON.stringify(out)], { type: 'application/json' });
}

export async function projectFromFile(file: File): Promise<Project> {
  let j: FileFormat;
  try {
    j = JSON.parse(await file.text()) as FileFormat;
  } catch {
    throw new Error('That file is not valid JSON, so it can’t be a StoryBox project.');
  }
  const project = j?.app === 'storybox' ? normalizeProject(j.project) : null;
  if (!project) throw new Error('That does not look like a StoryBox project file.');
  for (const [key, url] of Object.entries(j.blobs ?? {})) {
    if (typeof url === 'string' && url.startsWith('data:')) await putBlob(key, await (await fetch(url)).blob());
  }
  return project;
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'story';
