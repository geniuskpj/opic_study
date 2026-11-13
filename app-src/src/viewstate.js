/* viewstate.js — remember list state (filters, search, scroll) per screen.
 *
 * The router remounts a screen when you come back from a detail page, so without this the search
 * box, the filters and the scroll position are lost (the browser then restores a random offset).
 * State lives in sessionStorage: per tab, gone when the tab closes.
 */
const mem = new Map();
const PREFIX = 'opic.view.';

function write(key, v) {
  mem.set(key, v);
  try { sessionStorage.setItem(PREFIX + key, JSON.stringify(v)); } catch (e) { /* private mode */ }
}

function read(key) {
  if (mem.has(key)) return mem.get(key);
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (raw) { const v = JSON.parse(raw); mem.set(key, v); return v; }
  } catch (e) { /* ignore */ }
  return null;
}

/** Persistent screen state: loadView('questions', {seg:'all'}) */
export function loadView(key, fallback) {
  const v = read(key);
  return v && typeof v === 'object' ? { ...fallback, ...v } : fallback;
}
export function saveView(key, value) { write(key, { ...(read(key) || {}), ...value }); }

/* ---------------------------------------------------------------- scroll */
export function saveScroll(key, y) { saveView(key, { scrollY: Math.max(0, Math.round(y)) }); }
export function clearScroll(key) { saveView(key, { scrollY: 0 }); }

/** Track the window scroll for a screen (throttled to one write per frame). */
export function trackScroll(key) {
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; saveScroll(key, window.scrollY); });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    window.removeEventListener('scroll', onScroll);
    if (raf) cancelAnimationFrame(raf);
    saveScroll(key, window.scrollY);
  };
}

/** Put the window back where the user left it. `deps` re-runs the restore when the list is ready. */
export function restoreScroll(key, deps) {
  const y = (read(key) || {}).scrollY || 0;
  if (!y) return () => {};
  /* two frames: one for the render, one for layout of a long list */
  const a = requestAnimationFrame(() => {
    const b = requestAnimationFrame(() => {
      if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y);
    });
    var cancelB = () => cancelAnimationFrame(b);
    a._cancelB = cancelB;
  });
  return () => { cancelAnimationFrame(a); if (a._cancelB) a._cancelB(); };
}

/* reset helpers for actions where the list genuinely changes */
export const KEYS = {
  questions: 'questions',
  browse: 'browse',
  topics: 'topics',
  library: 'library',
  saved: 'saved',
  exam: 'exam',
  video: 'video',
};
