// Tiny IndexedDB wrapper for audio blobs (recordings, generated voices, imported files).

const DB_NAME = 'storybox';
const STORE = 'blobs';

let dbPromise: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => { dbPromise = null; }); // allow a retry later
  return dbPromise;
}

/** Resolves only once the transaction has COMMITTED (a request "success" can still be rolled back, e.g. quota). */
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error ?? req.error);
    t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
  });
}

const memory = new Map<string, Blob>(); // fallback if IndexedDB is blocked (e.g. private mode)

/** Keeps the blob in memory always. Returns true only if it was also saved durably on this device. */
export async function putBlob(key: string, blob: Blob): Promise<boolean> {
  memory.set(key, blob);
  try {
    await run('readwrite', (s) => s.put(blob, key));
    return true;
  } catch {
    return false;
  }
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  const m = memory.get(key);
  if (m) return m;
  try {
    const b = (await run('readonly', (s) => s.get(key))) as Blob | undefined;
    if (b) memory.set(key, b);
    return b;
  } catch {
    return undefined;
  }
}

export async function deleteBlob(key: string): Promise<void> {
  memory.delete(key);
  try {
    await run('readwrite', (s) => s.delete(key));
  } catch {
    /* nothing to delete, or storage blocked */
  }
}

/** Ask the browser not to evict our data when the device is low on space (best effort; Safari may ignore). */
export function requestPersistentStorage(): void {
  try { void navigator.storage?.persist?.(); } catch { /* not supported */ }
}

// Small non-blob values that must survive reloads but can't go in localStorage (e.g. a file handle for automatic
// backups). Kept in the same object store under a "value:" prefix, so no database upgrade is needed.
export async function putValue(key: string, value: unknown): Promise<boolean> {
  try {
    await run('readwrite', (s) => s.put(value, `value:${key}`));
    return true;
  } catch {
    return false;
  }
}
export async function getValue<T>(key: string): Promise<T | undefined> {
  try {
    return (await run('readonly', (s) => s.get(`value:${key}`))) as T | undefined;
  } catch {
    return undefined;
  }
}
export async function deleteValue(key: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(`value:${key}`));
  } catch {
    /* ignore */
  }
}
