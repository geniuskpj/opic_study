/* audio-store.js — persistent store for recorded answers.
 *
 * Recordings are binary: base64 in localStorage would cost ~4/3 of the size and blow the ~5 MB
 * quota after two or three takes (evicting stars and progress with it). IndexedDB stores Blobs
 * natively with a quota measured in hundreds of MB, which is what this needs. Feedback text stays
 * in localStorage next to the rest of the user state.
 *
 * Every operation is raced against a timeout and failures degrade to memory-only, so a broken or
 * slow IDB can never hang the recorder.
 */
const DB = 'opic-audio';
const STORE = 'clips';
const VERSION = 1;
const OP_TIMEOUT = 2500;

let dbp = null;
let broken = false;
let mem = new Map();   // fallback when IDB is unavailable

function open() {
  if (broken) return Promise.reject(new Error('idb unavailable'));
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB, VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb open failed'));
  }).catch((e) => { broken = true; throw e; });
  return dbp;
}

function tx(mode, fn) {
  return Promise.race([
    open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let out;
      try { out = fn(store); } catch (e) { reject(e); return; }
      // an IDBRequest always exposes `result`; a miss is undefined, and put/delete resolve undefined
      t.oncomplete = () => resolve(out && typeof out === 'object' && 'result' in out ? out.result : undefined);
      t.onerror = () => reject(t.error || new Error('idb tx failed'));
      t.onabort = () => reject(t.error || new Error('idb tx aborted'));
    })),
    new Promise((_, rej) => setTimeout(() => rej(new Error('idb timeout')), OP_TIMEOUT)),
  ]).catch((e) => { throw e; });
}

export function idbAvailable() { return !broken; }

export async function putClip(key, blob) {
  mem.set(key, blob);
  try { await tx('readwrite', (s) => s.put(blob, key)); return true; }
  catch (e) { broken = true; return false; }
}

export async function getClip(key) {
  try {
    const hit = await tx('readonly', (s) => s.get(key));
    if (hit) return hit;
  } catch (e) { /* fall through to memory */ }
  return mem.get(key) || null;
}

export async function delClip(key) {
  mem.delete(key);
  try { await tx('readwrite', (s) => s.delete(key)); } catch (e) { /* ignore */ }
}

export async function listClips() {
  try {
    const keys = await tx('readonly', (s) => s.getAllKeys());
    return keys || [];
  } catch (e) { return [...mem.keys()]; }
}

/** Remove clips that no longer belong to any stored answer entry. */
export async function pruneClips(validKeys) {
  const have = await listClips();
  const dead = have.filter((k) => !validKeys.includes(k));
  for (const k of dead) await delClip(k);
  return dead.length;
}

export const clipKey = (examId, qid, entryId) => `${examId}|${qid}|${entryId}`;

const withTimeout = (p, ms, fb) => Promise.race([p, new Promise((r) => setTimeout(() => r(fb), ms))]).catch(() => fb);

let estimateCache = null;
/** {usage, quota} for this origin — IDB shares a slice of free disk, unlike localStorage's ~5 MB.
 *  Both calls are bounded: a stalled storage API must never leave the UI on "확인 중…". */
export async function estimate(force) {
  if (estimateCache && !force) return estimateCache;
  const out = { usage: 0, quota: 0, persisted: false };
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await withTimeout(navigator.storage.estimate(), 3000, null);
      if (e) { out.usage = e.usage || 0; out.quota = e.quota || 0; }
    }
    if (navigator.storage && navigator.storage.persisted) {
      out.persisted = !!(await withTimeout(navigator.storage.persisted(), 3000, false));
    }
  } catch (err) { /* ignore */ }
  estimateCache = out;
  return out;
}

/** Ask the browser to keep this origin's data (not evicted under pressure). */
export async function requestPersist() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; }
  catch (e) { return false; }
}

export async function clearClips() {
  mem.clear();
  try { await tx('readwrite', (s) => s.clear()); return true; } catch (e) { return false; }
}
