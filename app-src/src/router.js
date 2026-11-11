/* router.js — 30-line hash router + tiny store hook. Kept separate so screens and the
   session never import the app shell (no circular imports). */
import { useEffect, useState } from 'preact/hooks';
import { store } from './core.js';

export function parseHash() {
  const raw = (location.hash || '#/home').replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  const [a, b] = segs;
  if (!a || a === 'home') return { name: 'home', query };
  if (a === 'shadow') return { name: 'shadow', query };
  if (a === 'topics') return { name: 'topics', query };
  if (a === 'topic') return { name: 'topic', arg: decodeURIComponent(b || ''), query };
  if (a === 'v') return { name: 'video', arg: b, query };
  if (a === 's') return { name: 'session', arg: b, query };
  if (a === 'questions') return { name: 'questions', query };
  if (a === 'q') return { name: 'question', arg: b, query };
  if (a === 'exam') return b !== undefined ? { name: 'examRun', arg: b, query } : { name: 'exam', query };
  if (a === 'lib') return { name: 'library', arg: b || 'expr', query };
  if (a === 'doc') return { name: 'doc', arg: decodeURIComponent(b || ''), query };
  if (a === 'saved') return { name: 'saved', query };
  return { name: 'home', query };
}

export function go(path) {
  if (location.hash === '#' + path) return;
  location.hash = path;
}

export function useRoute() {
  const [r, setR] = useState(parseHash());
  useEffect(() => {
    const on = () => setR(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export function useStore() {
  const [, force] = useState(0);
  useEffect(() => store.sub(() => force((n) => n + 1)), []);
  return store.state;
}

export function applyTheme(mode) {
  const m = mode || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', m);
}
