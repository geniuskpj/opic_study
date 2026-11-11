/* main.jsx — boot, hash router, app shell. */
import { h, render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  loadPack, checkVersion, store, tts, progress, PACK, stars, resetAll, exportUser, importUser,
} from './core.js';
import {
  IconHome, IconWave, IconQuiz, IconBook, IconSearch, IconGear, IconClose, Sheet, Seg, Btn, IconBtn, Toast, useToast,
} from './ui.jsx';
import { Home, Browse, VideoDetail, TopicList, TopicGroups, Questions, QuestionDetail, ExamList, ExamRun, Library, DocReader, Saved } from './screens.jsx';
import { Session } from './session.jsx';
import { go, useRoute, useStore, applyTheme } from './router.js';

/* ------------------------------------------------------------------ nav */
const NAV = [
  { id: 'home', label: '홈', icon: IconHome },
  { id: 'shadow', label: '쉐도잉', icon: IconWave },
  { id: 'questions', label: '문제', icon: IconQuiz },
  { id: 'library', label: '자료', icon: IconBook },
];
const navFor = (n) => (n === 'video' || n === 'session' || n === 'topics' || n === 'topic' ? 'shadow'
  : n === 'question' || n === 'exam' || n === 'examRun' ? 'questions'
    : n === 'doc' ? 'library' : n);

/* ------------------------------------------------------------------ settings sheet */
function SettingsSheet({ onClose, onToast }) {
  const s = store.state.settings;
  const [voices, setVoices] = useState(() => tts.voices());
  useEffect(() => {
    const t = setInterval(() => { const v = tts.voices(); if (v.length) { setVoices(v); clearInterval(t); } }, 250);
    return () => clearInterval(t);
  }, []);
  const set = (patch) => store.patch((st) => { st.settings = { ...st.settings, ...patch }; });
  const fileRef = { current: null };
  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportUser(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `opic-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    onToast('진행 상황을 내보냈습니다');
  };
  const doImport = (file) => {
    const fr = new FileReader();
    fr.onload = () => {
      try { importUser(JSON.parse(String(fr.result))); onToast('가져왔습니다'); onClose(); }
      catch (e) { onToast('파일을 읽을 수 없습니다'); }
    };
    fr.readAsText(file);
  };
  return h(Sheet, { title: '설정', onClose },
    h('div', { class: 'section-head' }, h('h2', null, '화면')),
    h(Seg, {
      full: true, value: s.theme || 'system',
      options: [{ value: 'system', label: '시스템' }, { value: 'light', label: '라이트' }, { value: 'dark', label: '다크' }],
      onChange: (v) => { set({ theme: v === 'system' ? null : v }); applyTheme(v === 'system' ? null : v); },
    }),
    h('div', { class: 'section-head mt6' }, h('h2', null, '음성')),
    h('div', { class: 't-s dim' }, '문장을 읽어 주는 목소리'),
    h('select', { class: 'mt2', value: s.voice || '', onChange: (e) => set({ voice: e.currentTarget.value || null }) },
      h('option', { value: '' }, '자동 (영어 음성)'),
      voices.filter((v) => /^en/i.test(v.lang)).map((v) => h('option', { key: v.name, value: v.name }, `${v.name} · ${v.lang}`))),
    h('div', { class: 'section-head mt5' }, h('h2', null, '읽기 속도')),
    h(Seg, {
      full: true, value: String(s.rate),
      options: [{ value: '0.8', label: '0.8×' }, { value: '0.92', label: '1×' }, { value: '1.05', label: '1.1×' }],
      onChange: (v) => set({ rate: Number(v) }),
    }),
    h('div', { class: 'section-head mt5' }, h('h2', null, '따라 말할 시간')),
    h(Seg, {
      full: true, value: s.gap,
      options: [{ value: 'short', label: '짧게' }, { value: 'auto', label: '자동' }, { value: 'long', label: '길게' }],
      onChange: (v) => set({ gap: v }),
    }),
    h('div', { class: 'row mt4' },
      h(ChipToggle, { on: s.auto, label: '자동 진행', onClick: () => set({ auto: !s.auto }) }),
      h(ChipToggle, { on: s.hide, label: '문장 가리기', onClick: () => set({ hide: !s.hide }) })),
    h('div', { class: 'section-head mt6' }, h('h2', null, '데이터')),
    h('p', { class: 't-s dim' }, `콘텐츠 버전 ${PACK.version || '-'} · 저장된 데이터 약 ${(((localStorage.getItem('opic.pack.v2') || '').length) / 1024).toFixed(0)} KB`),
    h('div', { class: 'row wrap mt3' },
      h(Btn, { onClick: () => { localStorage.removeItem('opic.pack.v2'); location.reload(); } }, '데이터 다시 받기'),
      h(Btn, { onClick: doExport }, '진행 내보내기'),
      h(Btn, {
        onClick: () => {
          const inp = document.createElement('input');
          inp.type = 'file'; inp.accept = 'application/json';
          inp.onchange = () => inp.files[0] && doImport(inp.files[0]);
          inp.click();
        },
      }, '진행 가져오기'),
      h(Btn, { variant: '', onClick: () => { if (confirm('별표와 진행 상황을 모두 지울까요?')) { resetAll(); location.reload(); } } }, '전체 초기화')),
    h('p', { class: 't-cap dim3 mt4' }, '별표와 진행 상황은 이 브라우저에만 저장됩니다. iOS에서 홈 화면에 추가하면 저장 기간이 늘어납니다.'));
}

const ChipToggle = ({ on, label, onClick }) =>
  h('button', { class: `chip ${on ? 'on' : ''}`, onClick }, label);

/* ------------------------------------------------------------------ global search */
function SearchSheet({ onClose }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  useEffect(() => {
    if (!q.trim()) { setRes(null); return; }
    const t = setTimeout(async () => {
      const { search } = await import('./core.js');
      setRes(search(q));
    }, 80);
    return () => clearTimeout(t);
  }, [q]);
  const Section = ({ title, items, render }) => (items && items.length)
    ? h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, `${title} ${items.length}`)),
      h('div', { class: 'list' }, items.map(render)))
    : null;
  return h(Sheet, { title: '검색', onClose },
    h('input', {
      type: 'search', placeholder: '문장 · 문제 · 표현 검색', value: q, autofocus: true,
      onInput: (e) => setQ(e.currentTarget.value),
    }),
    res ? h('div', null,
      h(Section, {
        title: '문장', items: res.sent,
        render: (r) => h('button', { key: r.id, class: 'rowitem', onClick: () => { onClose(); go(`/s/${r.gid}`); } },
          h('div', { class: 'grow' }, h('div', { class: 'rt en' }, r.text), h('div', { class: 'rs' }, r.sub))),
      }),
      h(Section, {
        title: '구', items: res.phrase,
        render: (r) => h('button', { key: r.id, class: 'rowitem', onClick: () => { onClose(); go(`/s/${r.id}`); } },
          h('div', { class: 'grow' }, h('div', { class: 'rt' }, r.text), h('div', { class: 'rs' }, r.sub))),
      }),
      h(Section, {
        title: '문제', items: res.q,
        render: (r) => h('button', { key: r.id, class: 'rowitem', onClick: () => { onClose(); go(`/q/${r.id}`); } },
          h('div', { class: 'grow' }, h('div', { class: 'rt' }, r.title), h('div', { class: 'rs en' }, r.text.slice(0, 80))),
          r.hasAns ? h('span', { class: 'dot' }) : null),
      }),
      h(Section, {
        title: '표현', items: res.expr,
        render: (r) => h('button', { key: r.id, class: 'rowitem', onClick: () => { onClose(); go(`/lib/expr?topic=${encodeURIComponent(r.topic)}`); } },
          h('div', { class: 'grow' }, h('div', { class: 'rt' }, r.text), h('div', { class: 'rs' }, `${r.sub} · ${r.topic}`))),
      }),
      (!res.sent.length && !res.q.length && !res.expr.length && !res.phrase.length) ? h('p', { class: 'dim mt4' }, '결과가 없습니다') : null
    ) : h('p', { class: 'dim mt4' }, '영어 문장, 한국어 뜻, 주제 이름으로 찾을 수 있습니다.'));
}

/* ------------------------------------------------------------------ app */
function App() {
  const route = useRoute();
  const st = useStore();
  const [settings, setSettings] = useState(false);
  const [search, setSearch] = useState(false);
  const [toastMsg, toast] = useToast();
  applyTheme(st.settings.theme);

  const nav = navFor(route.name);
  const isSession = route.name === 'session';

  const screen = (() => {
    switch (route.name) {
      case 'home': return h(Home, {
        toast, openSearch: () => setSearch(true), openSettings: () => setSettings(true),
      });
      case 'shadow': return h(Browse, { openSearch: () => setSearch(true) });
      case 'video': return h(VideoDetail, { id: route.arg });
      case 'topics': return h(TopicList, {});
      case 'topic': return h(TopicGroups, { name: route.arg });
      case 'session': return h(Session, { gid: route.arg, from: route.query.from, at: route.query.i, toast });
      case 'questions': return h(Questions, { openSearch: () => setSearch(true) });
      case 'question': return h(QuestionDetail, { id: Number(route.arg), toast });
      case 'exam': return h(ExamList, {});
      case 'examRun': return h(ExamRun, { index: /^m\d+$/.test(route.arg) ? route.arg : Number(route.arg) });
      case 'library': return h(Library, { seg: route.arg, topic: route.query.topic, openSearch: () => setSearch(true) });
      case 'doc': return h(DocReader, { file: route.arg });
      case 'saved': return h(Saved, { toast });
      default: return h(Home, {
        toast, openSearch: () => setSearch(true), openSettings: () => setSettings(true),
      });
    }
  })();

  return h('div', null,
    h(SettingsSheetHost, { open: settings, onClose: () => setSettings(false), onToast: toast }),
    search ? h(SearchSheet, { onClose: () => setSearch(false) }) : null,
    h(Toast, { msg: toastMsg }),
    screen,
    !isSession && h('nav', { class: 'bottomnav' },
      NAV.map((n) => h('button', {
        key: n.id, class: nav === n.id ? 'on' : '', onClick: () => go('/' + n.id), 'aria-current': nav === n.id ? 'page' : null,
      }, h(n.icon, { size: 22 }), h('span', null, n.label)))));

  function SettingsSheetHost({ open, onClose, onToast }) {
    return open ? h(SettingsSheet, { onClose, onToast }) : null;
  }
}

/* ------------------------------------------------------------------ boot */
function Boot() {
  const [state, setState] = useState({ phase: 'load', pct: 0, bytes: 0, fromCache: false, error: null, update: null });
  useEffect(() => {
    (async () => {
      store.load();
      applyTheme(store.state.settings.theme);
      try {
        const r = await loadPack((p) => setState((s) => ({ ...s, pct: p })));
        setState((s) => ({ ...s, phase: 'ready', fromCache: r.fromCache, bytes: r.bytes }));
        checkVersion().then((v) => {
          if (v) {
            setState((s) => ({ ...s, update: v }));
            store.patch(() => {});
          }
        });
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
      } catch (e) {
        setState((s) => ({ ...s, phase: 'error', error: String(e) }));
      }
    })();
  }, []);

  if (state.phase !== 'ready') {
    return h('div', { class: 'screen' },
      h('div', { class: 'section' },
        h('h1', { class: 't-title' }, state.phase === 'error' ? '데이터를 불러오지 못했습니다' : '자료를 준비하고 있어요'),
        state.phase === 'error'
          ? h('div', null, h('p', { class: 'dim t-s' }, state.error), h(Btn, { variant: 'primary', onClick: () => location.reload() }, '다시 시도'))
          : h('div', null,
            h('p', { class: 'dim t-s' }, '처음 한 번만 내려받습니다 (약 0.6 MB). 다음부터는 브라우저에 저장된 자료로 바로 열려요.'),
            h('div', { class: 'bar mt4' }, h('i', { style: `width:${Math.round(state.pct * 100)}%` })),
            h('p', { class: 't-cap dim3 mt2' }, `${Math.round(state.pct * 100)}%`))));
  }

  return h('div', null,
    state.update
      ? h('div', { class: 'banner' },
        h('span', null, '새 자료가 있습니다'),
        h(Btn, { onClick: () => { localStorage.removeItem('opic.pack.v2'); location.reload(); } }, '받기'))
      : null,
    h(App, { key: 'app' }));
}

render(h(Boot, null), document.getElementById('app'));
