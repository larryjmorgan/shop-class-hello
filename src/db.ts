// Tiny IndexedDB wrapper for audio blobs (recordings, generated voices, imported files).

const DB_NAME = 'storybox';
const STORE = 'blobs';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const memory = new Map<string, Blob>(); // fallback if IndexedDB is blocked (e.g. private mode)

export async function putBlob(key: string, blob: Blob): Promise<void> {
  memory.set(key, blob);
  try {
    await tx('readwrite', (s) => s.put(blob, key));
  } catch {
    /* kept in memory only */
  }
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  const m = memory.get(key);
  if (m) return m;
  try {
    const b = (await tx('readonly', (s) => s.get(key))) as Blob | undefined;
    if (b) memory.set(key, b);
    return b;
  } catch {
    return undefined;
  }
}

export async function deleteBlob(key: string): Promise<void> {
  memory.delete(key);
  try {
    await tx('readwrite', (s) => s.delete(key));
  } catch {
    /* ignore */
  }
}
