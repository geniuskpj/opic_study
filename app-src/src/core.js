/* core.js — data loading, stable ids, persistence, progress, TTS, search.
   No framework here: plain modules so the rest of the app can stay declarative. */

export const SITE = 'https://opicgpt-study-room.cianlong5977.chatgpt.site/';
const PACK_KEY = 'opic.pack.v2';
const USER_KEY = 'opic.user.v2';
const USER_VERSION = 2;

/* ------------------------------------------------------------------ ids */
export function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
/* Stable content ids: never array positions, so content updates cannot scramble stars/progress. */
export const sentId = (en) => 's' + hash32(en);
export const groupId = (phrase, firstEn) => 'g' + hash32(phrase + '|' + firstEn);
export const exprId = (topic, key) => 'e' + hash32(topic + '|' + key);

/* ------------------------------------------------------------------ pack */
export let PACK = null;
export const idx = {
  groups: new Map(),      // gid -> {gid, videoId, gi, phrase, items, count}
  sentences: new Map(),   // sid -> {sid, en, gid}
  questions: new Map(),   // id  -> question
  videoGroups: new Map(), // videoId -> [gid]
  videos: [],             // pack videos (with derived short labels)
  rows: [],               // flat browse list (searchable): groups and single items
  sources: [],            // [{id,label,count}]
  topicGroups: new Map(), // OPIc topic -> [group]
  topicList: [],          // topics ordered by how many groups they hold
  topics: [],             // expression topics
  allGroups: [],
};

/* Video labels for cards/app bars: the raw titles are long Korean sentences. */
const SCENES = ['샤워', '운전', '출근', '퇴근', '집안일', '재활용', 'TV', '회사', '필요하면', '럭키'];
const TOPICS = {
  v00: '카페 · 교통 · 재활용 · 기술 · 여가',
  v01: 'IH 필수 문장',
  v02: 'TV 보며 듣는 IM',
  v03: '샤워하며 듣는 IH',
  v04: '운전하며 듣는 IH',
  v05: '책 · 취미 · 도서관',
  v06: '재활용 · 분리수거',
  v07: '집안일 · 1인 생활',
  v08: '출근하며 듣는 IH',
  v09: '퇴근하며 듣는 IM',
  v10: '회사에서 듣는 IM',
};
export function videoLabel(v) {
  const t = v.title || '';
  const level = v.level || (/\bIH\b/.test(t) ? 'IH' : /\bIM\b/.test(t) ? 'IM' : '');
  const n = (t.match(/(\d+)\s*개/) || [])[1];
  const scene = SCENES.find((s) => t.includes(s));
  const short = /합본/.test(t) ? `${n || 100}문장 합본` : scene ? `${scene} · ${level || 'IH'}` : (t.slice(0, 12).trim() || v.id);
  return { short, level, desc: TOPICS[v.id] || `${v.count}문장` };
}

function buildIndex(pack) {
  idx.groups.clear(); idx.sentences.clear(); idx.questions.clear(); idx.videoGroups.clear();
  idx.allGroups.length = 0; idx.videos = pack.videos;
  for (const v of pack.videos) {
    const label = videoLabel(v);
    v.short = label.short; v.desc = label.desc; v.level = label.level;
    const glist = [];
    v.groups.forEach((g, gi) => {
      const items = g.items.map((it) => ({ ...it, sid: sentId(it.en), en: it.en }));
      const topic = g.topic || '';
      const gid = groupId(g.phrase, items[0].en);
      const existing = idx.groups.get(gid);
      if (existing) {
        /* the same sentences appear in more than one video: one study unit, several sources */
        if (!existing.videos.includes(v.id)) existing.videos.push(v.id);
      } else {
        const rec = { gid, videoId: v.id, video: v, videos: [v.id], gi, phrase: g.phrase, topic, items, count: items.length };
        idx.groups.set(gid, rec);
        idx.allGroups.push(rec);
        for (const it of items) idx.sentences.set(it.sid, { sid: it.sid, en: it.en, gid, group: rec });
      }
      glist.push(gid);
    });
    idx.videoGroups.set(v.id, glist);
  }
  /* ---- extra sources: 강지완 material. Each becomes study units so the same session screen works. */
  const K = pack.kang || {};
  const addGroup = (gid, phrase, topic, source, items, extra) => {
    const rec = { gid, videoId: null, video: null, videos: [], phrase, topic, source, items,
      count: items.length, ...(extra || {}) };
    idx.groups.set(gid, rec);
    idx.allGroups.push(rec);
    items.forEach((it, i) => { it.sid = it.sid || 's' + hash32(it.en); it.gi = i; });
    return rec;
  };
  const chunk = (items, size) => {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  };

  if (K.k2 && K.k2.items) {
    chunk(K.k2.items, 10).forEach((part, ci) => {
      const items = part.map((it) => ({ en: it.en, kr: it.kr || null, sid: 's' + hash32(it.en) }));
      addGroup('g' + hash32('k2#' + ci), `만능문장 ${ci * 10 + 1}–${ci * 10 + items.length}`, '만능문장',
        '만능문장 150', items);
    });
  }
  if (K.k1 && K.k1.items) {
    chunk(K.k1.items, 5).forEach((part, ci) => {
      const items = part.map((it) => ({ en: it.en, kr: it.kr || null, sub: it.topic || null,
        sid: 's' + hash32(it.en) }));
      addGroup('g' + hash32('k1#' + ci), `기출 답변 ${ci * 5 + 1}–${ci * 5 + items.length}`, '기출 답변',
        '기출 답변 101', items);
    });
  }
  if (K.k3 && K.k3.items) {
    K.k3.items.forEach((it) => {
      const items = [{ en: (it.template || '').replace(/\[~\]/g, '…'), sub: '패턴', sid: 's' + hash32(it.template + '#t') }];
      (it.examples || []).forEach((ex) => items.push({ en: ex.en, sub: ex.slot, sid: 's' + hash32(ex.en) }));
      addGroup('g' + hash32('k3#' + it.no), it.template || `패턴 ${it.no}`,
        (it.category || '만능패턴').split(' - ')[0].trim(), '만능패턴 72', items,
        { templateKr: it.templateKr || null, label: `만능패턴 ${it.no}` });
    });
  }

  /* ---- flat browse rows (one per study unit, or per item for the long sentence sets) */
  idx.rows = [];
  const pushRow = (r) => { idx.rows.push(r); };
  for (const g of idx.allGroups) {
    if (g.source === '만능문장 150' || g.source === '기출 답변 101') {
      g.items.forEach((it, i) => pushRow({
        kind: 'item', gid: g.gid, i, src: g.source,
        title: it.en, sub: it.kr || it.sub || '', topic: g.topic,
        hay: [it.en, it.kr, g.topic, g.source].join(' ').toLowerCase(),
      }));
    } else {
      pushRow({
        kind: 'group', gid: g.gid, src: g.source || '쉐도잉', title: g.phrase,
        sub: [g.topic, g.video ? g.video.short : null, `${g.count}문장`].filter(Boolean).join(' · '),
        topic: g.topic, count: g.count, videoId: g.videoId,
        hay: [g.phrase, g.topic, g.video ? g.video.short + ' ' + g.video.title : '', g.source,
          ...g.items.map((x) => x.en + ' ' + (x.kr || ''))].join(' ').toLowerCase(),
      });
    }
  }
  const srcCount = new Map();
  for (const r of idx.rows) srcCount.set(r.src, (srcCount.get(r.src) || 0) + 1);
  idx.sources = [...srcCount.entries()].map(([label, count]) => ({ label, count }));

  for (const g of idx.allGroups) {
    if (!g.topic || g.source) continue;
    if (!idx.topicGroups.has(g.topic)) idx.topicGroups.set(g.topic, []);
    idx.topicGroups.get(g.topic).push(g);
  }
  idx.topicList = [...idx.topicGroups.entries()]
    .map(([topic, groups]) => ({ topic, groups }))
    .sort((a, b) => b.groups.length - a.groups.length || a.topic.localeCompare(b.topic, 'ko'));
  for (const q of pack.questions) idx.questions.set(q.id, q);
  idx.topics = Array.from(new Set([].concat(
    Object.keys(pack.phrases || {}), Object.keys(pack.lexicon || {}), Object.keys(pack.extra || {}))))
    .sort((a, b) => (a.startsWith('@') ? 1 : 0) - (b.startsWith('@') ? 1 : 0) || a.localeCompare(b, 'ko'));
}

export async function loadPack(onProgress) {
  const cached = localStorage.getItem(PACK_KEY);
  if (cached) {
    try {
      const p = JSON.parse(cached);
      if (p && Array.isArray(p.videos)) { PACK = p; buildIndex(p); return { fromCache: true, bytes: cached.length }; }
    } catch (e) { /* re-download below */ }
  }
  const res = await fetch('data/study-pack.json');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const total = Number(res.headers.get('content-length') || 0);
  let text = '';
  if (res.body && res.body.getReader) {
    const rd = res.body.getReader(); const dec = new TextDecoder(); let got = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      got += value.length; text += dec.decode(value, { stream: true });
      onProgress && onProgress(total ? got / total : 0, got, total);
    }
  } else {
    text = await res.text();
    onProgress && onProgress(1, text.length, text.length);
  }
  PACK = JSON.parse(text);
  buildIndex(PACK);
  try { localStorage.setItem(PACK_KEY, text); } catch (e) { /* run from memory */ }
  return { fromCache: false, bytes: text.length };
}

export async function checkVersion() {
  try {
    const r = await fetch('data/version.json', { cache: 'no-store' });
    const v = await r.json();
    return PACK && v.version !== PACK.version ? v : null;
  } catch (e) { return null; }
}

/* ------------------------------------------------------------------ user store */
export function emptyUser() {
  return { v: USER_VERSION, stars: { sent: {}, q: {}, expr: {} }, prog: {}, answers: {}, settings: {
    theme: null, voice: null, rate: 0.92, gap: 'auto', auto: true, hide: false }, today: { date: '', count: 0 } };
}

function migrate(raw) {
  if (!raw || typeof raw !== 'object') return emptyUser();
  const base = emptyUser();
  const u = { ...base, ...raw };
  u.stars = { sent: {}, q: {}, expr: {}, ...(raw.stars || {}) };
  u.prog = raw.prog || {};
  u.answers = raw.answers || {};
  u.settings = { ...base.settings, ...(raw.settings || {}) };
  u.today = { ...base.today, ...(raw.today || {}) };
  u.v = USER_VERSION;
  return u;
}

export const store = {
  state: emptyUser(),
  listeners: new Set(),
  load() {
    try { this.state = migrate(JSON.parse(localStorage.getItem(USER_KEY) || 'null')); }
    catch (e) { this.state = emptyUser(); }
    return this.state;
  },
  save() { try { localStorage.setItem(USER_KEY, JSON.stringify(this.state)); } catch (e) {} },
  emit() { this.listeners.forEach((fn) => fn(this.state)); },
  sub(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  patch(fn) { fn(this.state); this.save(); this.emit(); },
};

export const stars = {
  has(kind, id) { return !!store.state.stars[kind][id]; },
  toggle(kind, id) {
    store.patch((s) => { if (s.stars[kind][id]) delete s.stars[kind][id]; else s.stars[kind][id] = Date.now(); });
  },
  ids(kind) { return Object.keys(store.state.stars[kind]); },
  count(kind) { return Object.keys(store.state.stars[kind]).length; },
};

/* ------------------------------------------------------------------ answers & feedback */
export const answers = {
  key: (examId, qid) => `${examId}:${qid}`,

  /** { entries: [{id, at, ms, feedback, audio}] } — newest last. Older single-result rows migrate. */
  raw(examId, qid) {
    const v = store.state.answers[this.key(examId, qid)];
    if (!v) return null;
    if (Array.isArray(v.entries)) return v;
    if (v.feedback) return { entries: [{ id: 'e' + (v.at || 0), at: v.at || 0, ms: v.ms || 0, feedback: v.feedback }] };
    return { entries: [] };
  },
  entries(examId, qid) { const r = this.raw(examId, qid); return r ? r.entries : []; },
  latest(examId, qid) { const e = this.entries(examId, qid); return e.length ? e[e.length - 1] : null; },
  get(examId, qid) { return this.latest(examId, qid); },

  add(examId, qid, entry) {
    store.patch((s) => {
      const k = this.key(examId, qid);
      const cur = this.raw(examId, qid) || { entries: [] };
      s.answers[k] = { entries: [...cur.entries, entry] };
    });
    return entry;
  },
  remove(examId, qid, entryId) {
    store.patch((s) => {
      const k = this.key(examId, qid);
      const cur = this.raw(examId, qid);
      if (!cur) return;
      const left = cur.entries.filter((e) => e.id !== entryId);
      if (left.length) s.answers[k] = { entries: left };
      else delete s.answers[k];
    });
  },
  clear(examId, qid) { store.patch((s) => { delete s.answers[this.key(examId, qid)]; }); },
  /** drop one entry's recording reference (the clip itself is deleted by the caller) */
  clearAudio(examId, qid, entryId) {
    store.patch((s) => {
      const k = this.key(examId, qid);
      const cur = this.raw(examId, qid);
      if (!cur) return;
      s.answers[k] = { entries: cur.entries.map((e) => {
        if (e.id !== entryId) return e;
        const c = { ...e }; delete c.audio; return c;
      }) };
    });
  },

  /** forget the recordings but keep every grading result */
  stripAudio() {
    store.patch((s) => {
      for (const k of Object.keys(s.answers)) {
        const cur = this.raw(k.split(':')[0], k.split(':')[1]);
        if (!cur) continue;
        s.answers[k] = { entries: cur.entries.map((e) => { const c = { ...e }; delete c.audio; return c; }) };
      }
    });
  },
  clearAll() { store.patch((s) => { s.answers = {}; }); },

  /** every clip key still referenced by a stored entry — used to prune orphaned audio */
  audioKeys() {
    const out = [];
    for (const [k, v] of Object.entries(store.state.answers)) {
      const [examId, qid] = k.split(':');
      for (const e of (v.entries || [])) if (e.audio) out.push(e.audio);
    }
    return out;
  },
  doneCount(examId) {
    return Object.keys(store.state.answers)
      .filter((k) => k.startsWith(examId + ':') && (this.raw(examId, k.split(':')[1]) || { entries: [] }).entries.length)
      .length;
  },
  nextUnanswered(examId, ids) { return ids.find((id) => !this.get(examId, id)) ?? null; },
};

/* ------------------------------------------------------------------ progress */
const DAY = 86400000;
export const progress = {
  get(gid) { return store.state.prog[gid] || { state: 'new', passes: 0, lastDoneAt: 0, due: 0, rating: null }; },
  set(gid, patch) { store.patch((s) => { s.prog[gid] = { ...this.get(gid), ...patch }; }); },
  /* self-rated completion drives a very light spaced repetition: again / ok / know */
  rate(gid, rating) {
    const now = Date.now();
    const due = rating === 'again' ? now : rating === 'ok' ? now + 3 * DAY : now + 7 * DAY;
    store.patch((s) => {
      const prev = s.prog[gid] || { passes: 0 };
      s.prog[gid] = { state: rating === 'again' ? 'doing' : 'done', passes: (prev.passes || 0) + 1,
        lastDoneAt: now, due, rating };
      const today = new Date().toISOString().slice(0, 10);
      if (s.today.date !== today) s.today = { date: today, count: 0 };
      s.today.count += 1;
    });
  },
  videoDone(videoId) {
    const gids = idx.videoGroups.get(videoId) || [];
    return gids.filter((g) => this.get(g).state === 'done').length;
  },
  dueGroups(limit = 20) {
    const now = Date.now();
    return idx.allGroups
      .map((g) => ({ g, p: this.get(g.gid) }))
      .filter((x) => x.p.state !== 'new' && x.p.due && x.p.due <= now)
      .sort((a, b) => a.p.due - b.p.due)
      .slice(0, limit)
      .map((x) => x.g);
  },
  nextGroup(videoId) {
    const gids = idx.videoGroups.get(videoId) || [];
    const undone = gids.find((g) => this.get(g).state !== 'done');
    return undone || gids[0];
  },
  counts() {
    let done = 0, doing = 0;
    for (const g of idx.allGroups) {
      const st = this.get(g.gid).state;
      if (st === 'done') done++; else if (st === 'doing') doing++;
    }
    return { done, doing, total: idx.allGroups.length };
  },
};

export function exportUser() {
  return { app: 'opic-study', exportedAt: new Date().toISOString(), user: store.state };
}
export function importUser(obj) {
  const u = obj && obj.user ? obj.user : obj;
  if (!u || typeof u !== 'object') throw new Error('bad file');
  store.state = migrate(u); store.save(); store.emit();
}
export function resetAll() {
  localStorage.removeItem(USER_KEY); localStorage.removeItem(PACK_KEY);
  store.state = emptyUser(); store.save(); store.emit();
}

/* ------------------------------------------------------------------ speech */
export const tts = {
  cache: new Map(),           // text|rate -> ms
  _u: null,
  voices() { return (window.speechSynthesis && speechSynthesis.getVoices()) || []; },
  pick(name) {
    const vs = this.voices();
    if (name) { const hit = vs.find((v) => v.name === name); if (hit) return hit; }
    return vs.find((v) => /en[-_]US/i.test(v.lang) && /samantha|aria|jenny|zira|female|google us/i.test(v.name)) ||
      vs.find((v) => /en[-_]US/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || vs[0] || null;
  },
  supported() { return typeof window !== 'undefined' && !!window.speechSynthesis; },
  stop() {
    if (!this.supported()) return;
    try { speechSynthesis.cancel(); } catch (e) {}
    this._u = null;
  },
  /* one utterance; returns a cancel function. onend fires for both natural end and watchdog. */
  speak(text, { rate = 0.92, voiceName = null, onstart, onend } = {}) {
    if (!this.supported()) { onend && onend(); return () => {}; }
    this.stop();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = rate;
    const v = this.pick(voiceName);
    if (v) u.voice = v;
    let finished = false;
    let watchdog = 0;
    const done = () => {
      if (finished) return;
      finished = true; clearTimeout(watchdog);
      if (startAt) this.cache.set(text + '|' + rate, Date.now() - startAt);
      onend && onend();
    };
    let startAt = 0;
    u.onstart = () => { startAt = Date.now(); onstart && onstart(); };
    u.onend = done;
    u.onerror = done;
    this._u = u;
    /* Android Chrome sometimes never fires onend: bound it by text length. */
    watchdog = setTimeout(done, 4000 + text.length * 140 / Math.max(0.5, rate));
    try { speechSynthesis.speak(u); } catch (e) { done(); }
    return () => { clearTimeout(watchdog); if (!finished) { finished = true; this.stop(); } };
  },
  /* how long the user gets to repeat the sentence */
  gapMs(text, rate, mode) {
    if (mode === 'short') return 800;
    if (mode === 'long') return 3500;
    const measured = this.cache.get(text + '|' + rate);
    const est = measured || (1200 + text.length * 62 / Math.max(0.5, rate));
    return Math.min(12000, Math.max(1200, Math.round(est * 1.25)));
  },
};

/* ------------------------------------------------------------------ search */
let IDX = null;
export function searchIndex() {
  if (IDX) return IDX;
  const norm = (s) => String(s || '').normalize('NFC').toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim();
  const recs = [];
  for (const g of idx.allGroups) {
    for (const it of g.items) {
      recs.push({ type: 'sent', id: it.sid, gid: g.gid, text: it.en, sub: g.phrase,
        hay: norm(it.en + ' ' + g.phrase), title: it.en });
    }
    recs.push({ type: 'phrase', id: g.gid, gid: g.gid, text: g.phrase, sub: g.video.id,
      hay: norm(g.phrase), title: g.phrase });
  }
  for (const q of PACK.questions) {
    recs.push({ type: 'q', id: q.id, text: q.en, sub: q.topic, hay: norm(q.title + ' ' + q.en + ' ' + q.kr + ' ' + q.topic),
      title: q.title, hasAns: !!q.ans });
  }
  PACK.phrases && Object.entries(PACK.phrases).forEach(([topic, rows]) => rows.forEach((r) => {
    recs.push({ type: 'expr', id: exprId(topic, r[0]), topic, text: r[0], sub: r[1] || '', hay: norm([topic, ...r].join(' ')), title: r[0] });
  }));
  PACK.lexicon && Object.entries(PACK.lexicon).forEach(([topic, rows]) => rows.forEach((r) => {
    recs.push({ type: 'expr', id: exprId(topic, r[1]), topic, text: r[1], sub: r[2] || '', hay: norm([topic, ...r].join(' ')), title: r[1] });
  }));
  IDX = { recs, norm };
  return IDX;
}

export function search(q, limitPerType = 30) {
  const { recs, norm } = searchIndex();
  const tokens = norm(q).split(' ').filter(Boolean);
  if (!tokens.length) return [];
  const hits = [];
  for (const r of recs) {
    if (tokens.every((t) => r.hay.includes(t))) hits.push(r);
    if (hits.length > 1500) break;
  }
  const rank = (r) => (norm(r.title).startsWith(tokens[0]) ? 0 : 1) + (r.type === 'phrase' ? -0.5 : 0);
  hits.sort((a, b) => rank(a) - rank(b) || b.title.length - a.title.length);
  const out = { sent: [], phrase: [], q: [], expr: [] };
  for (const r of hits) if (out[r.type].length < limitPerType) out[r.type].push(r);
  return out;
}

/* ------------------------------------------------------------------ misc */
export function stripMark(en, phrase) {
  if (!phrase) return [{ t: en, hit: false }];
  const i = en.toLowerCase().indexOf(phrase.toLowerCase());
  if (i < 0) return [{ t: en, hit: false }];
  return [{ t: en.slice(0, i), hit: false }, { t: en.slice(i, i + phrase.length), hit: true }, { t: en.slice(i + phrase.length), hit: false }];
}
export const nowISO = () => new Date().toISOString().slice(0, 10);

/* the study site keeps a few internal role-play buckets keyed with '@' */
const AT_LABEL = {
  '@booking': '롤플레이 · 예약', '@purchase': '롤플레이 · 구매', '@problem': '롤플레이 · 문제 해결',
  '@comparison': '롤플레이 · 비교', '@delay': '롤플레이 · 지연', '@interview': '롤플레이 · 면접',
  '@issue': '롤플레이 · 이슈', '@lost': '롤플레이 · 길 잃음', '@medicine': '롤플레이 · 약국',
  '@party': '롤플레이 · 모임', '@plans': '롤플레이 · 약속', '@rental': '롤플레이 · 렌터카',
};
export const topicLabel = (t) => AT_LABEL[t] || t;
