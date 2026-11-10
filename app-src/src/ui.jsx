/* ui.jsx — icons + primitives. SVG sprite replaces the emoji from v1. */
import { h } from 'preact';
import { useEffect, useRef, useState, useCallback } from 'preact/hooks';

const I = (paths) => function Icon({ size = 22, ...rest }) {
  const kids = paths.map((d, i) => (typeof d === 'string'
    ? h('path', { key: i, d })
    : h(d[0], { key: i, ...d[1] })));
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', ...rest,
  }, kids);
};

export const IconHome = I(['M3 10.5 12 3l9 7.5', 'M5.5 9.5V21h13V9.5']);
export const IconWave = I(['M3 12h2l2-5 3 10 3-14 3 12 2-3h3']);
export const IconQuiz = I(['M4 5h16v14H4z', 'M8 10h8', 'M8 14h5']);
export const IconBook = I(['M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5z', 'M8 3v18']);
export const IconStar = I([['path', { d: 'M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.8l5.9-.9z', fill: 'none' }]]);
export const IconStarFill = I([['path', { d: 'M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.8l5.9-.9z', fill: 'currentColor' }]]);
export const IconPlay = I([['path', { d: 'M8 5.2v13.6l11-6.8z', fill: 'currentColor', stroke: 'none' }]]);
export const IconPause = I([['path', { d: 'M9 5h2.5v14H9zM12.5 5H15v14h-2.5z', fill: 'currentColor', stroke: 'none' }]]);
export const IconPrev = I(['M15 5l-7 7 7 7', 'M7 5v14']);
export const IconNext = I(['M9 5l7 7-7 7']);
export const IconRepeat = I(['M17 2l4 4-4 4', 'M3 11V9a4 4 0 0 1 4-4h14', 'M7 22l-4-4 4-4', 'M21 13v2a4 4 0 0 1-4 4H3']);
export const IconSearch = I([['circle', { cx: 11, cy: 11, r: 7 }], 'M20 20l-3.5-3.5']);
export const IconClose = I(['M6 6l12 12', 'M18 6L6 18']);
export const IconGear = I([['circle', { cx: 12, cy: 12, r: 3.2 }], 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.4-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z']);
export const IconChevR = I(['M9 5l7 7-7 7']);
export const IconChevL = I(['M15 5l-7 7 7 7']);
export const IconCheck = I(['M4.5 12.5l5 5 10-11']);
export const IconEye = I(['M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z', ['circle', { cx: 12, cy: 12, r: 2.6 }]]);
export const IconEyeOff = I(['M4 4l16 16', 'M9.5 5.9A10.6 10.6 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3 3.8M6.5 7.6A17 17 0 0 0 2 12s3.6 6.5 10 6.5a10.7 10.7 0 0 0 3.4-.5']);
export const IconDoc = I(['M6 3h8l5 5v13H6z', 'M14 3v5h5', 'M9 13h6', 'M9 17h4']);
export const IconTimer = I([['circle', { cx: 12, cy: 13, r: 8 }], 'M12 9v4l2.5 2', 'M9 2h6']);
export const IconDownload = I(['M12 3v12', 'M7 11l5 5 5-5', 'M5 21h14']);
export const IconTrash = I(['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 14h10l1-14']);
export const IconUpload = I(['M12 17V5', 'M7 9l5-5 5 5', 'M5 21h14']);
export const IconRefresh = I(['M20 11a8 8 0 1 0-2.3 6', 'M20 5v6h-6']);
export const IconList = I(['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3.5 6h.01', 'M3.5 12h.01', 'M3.5 18h.01']);
export const IconBack = I(['M15 5l-7 7 7 7']);

/* ------------------------------------------------------------------ primitives */
export const Btn = ({ children, variant = '', wide, ...rest }) =>
  h('button', { class: `btn ${variant} ${wide ? 'wide' : ''}`, ...rest }, children);

export const IconBtn = ({ icon: Ico, label, size, variant = '', on, ...rest }) =>
  h('button', { class: `iconbtn ${variant} ${on ? 'on' : ''}`, 'aria-label': label, title: label, ...rest }, h(Ico, { size }));

export const Chip = ({ children, on, tiny, ...rest }) =>
  h('button', { class: `chip ${tiny ? 'tiny' : ''} ${on ? 'on' : ''}`, ...rest }, children);

export const Seg = ({ options, value, onChange, full }) =>
  h('div', { class: `seg ${full ? 'full' : ''}`, role: 'tablist' },
    options.map((o) => h('button', {
      key: o.value, role: 'tab', 'aria-selected': value === o.value,
      class: value === o.value ? 'on' : '', onClick: () => onChange(o.value),
    }, o.label)));

export const Ring = ({ value, size = 40, stroke = 4, done, label, text }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return h('svg', { class: 'ring', width: size, height: size, viewBox: `0 0 ${size} ${size}` },
    h('circle', { class: 'bg', cx: size / 2, cy: size / 2, r, 'stroke-width': stroke }),
    h('circle', {
      class: `fg ${done ? 'done' : ''}`, cx: size / 2, cy: size / 2, r, 'stroke-width': stroke,
      'stroke-dasharray': c, 'stroke-dashoffset': c * (1 - Math.max(0, Math.min(1, value))),
      transform: `rotate(-90 ${size / 2} ${size / 2})`,
    }),
    label === false ? null : h('text', {
      x: '50%', y: '50%', 'text-anchor': 'middle', 'dominant-baseline': 'central',
      fill: 'currentColor', 'font-size': size * 0.3, 'font-weight': 700,
    }, text != null ? text : `${Math.round(value * 100)}`));
};

export const Empty = ({ title, hint }) =>
  h('div', { class: 'empty' }, h('div', { class: 't-b' }, title), hint && h('div', { class: 't-s mt2' }, hint));

export const SearchField = ({ value, onInput, placeholder }) =>
  h('div', { class: 'searchwrap' },
    h(IconSearch, { size: 18 }),
    h('input', { type: 'search', value, placeholder, onInput: (e) => onInput(e.currentTarget.value) }));

export function Sheet({ title, onClose, children, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return h('div', null,
    h('div', { class: 'scrim', onClick: onClose }),
    h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, ref },
      h('div', { class: 'grab' }),
      h('div', { class: 'sheet-head' },
        h('h2', { class: 'grow' }, title),
        actions,
        h(IconBtn, { icon: IconClose, label: '닫기', onClick: onClose })),
      h('div', { class: 'sheet-body' }, children)));
}

export function Toast({ msg }) {
  if (!msg) return null;
  return h('div', { class: 'toast t-s' }, msg);
}

export function useToast() {
  const [msg, setMsg] = useState('');
  const t = useRef(0);
  const show = useCallback((m) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(''), 1600);
  }, []);
  return [msg, show];
}

export function useScrollTop(key) {
  useEffect(() => { window.scrollTo(0, 0); }, [key]);
}
