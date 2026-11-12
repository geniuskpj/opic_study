/* screens.jsx — home, browse, questions, exam, library, docs, saved. */
import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  PACK, idx, progress, store, tts, stars, sentId, exprId, SITE, search, topicLabel, hash32,
} from './core.js';
import { go, useStore } from './router.js';
import { AnswerRecorder, Feedback } from './recorder.jsx';
import { answers } from './core.js';
import {
  IconStar, IconStarFill, IconSearch, IconGear, IconChevR, IconBack, IconPlay, IconDoc, IconTimer,
  IconList, IconCheck, IconRefresh, Btn, IconBtn, Chip, Seg, Ring, Empty, Sheet, SearchField, IconClose,
} from './ui.jsx';

const AppBar = ({ title, sub, back, right, onBack }) =>
  h('header', { class: 'appbar' },
    back ? h(IconBtn, { icon: IconBack, label: '뒤로', onClick: () => (onBack ? onBack() : history.back()) }) : null,
    h('div', { class: 'grow col', style: 'min-width:0' },
      h('div', { class: 'title nowrap' }, title),
      sub ? h('div', { class: 'sub nowrap' }, sub) : null),
    right);

const StarBtn = ({ on, onClick, label = '별표' }) =>
  h(IconBtn, { icon: on ? IconStarFill : IconStar, label, on, onClick });

const topicHead = (t, n) => h('div', { class: 'topic-head' }, h('span', null, t), h('span', { class: 'dim3 t-cap' }, ` ${n}`));

/* ------------------------------------------------------------------ home */
export function Home({ openSearch, openSettings, toast }) {
  const st = useStore();
  const counts = progress.counts();
  const due = progress.dueGroups(6);

  const recent = useMemo(() => {
    let best = null;
    for (const g of idx.allGroups) {
      const p = progress.get(g.gid);
      const at = p.lastDoneAt || 0;
      if (at && (!best || at > best.at)) best = { g, at };
    }
    if (best) return best.g;
    const first = idx.allGroups.find((g) => progress.get(g.gid).state !== 'done');
    return first || idx.allGroups[0];
  }, [st.prog, st.today]);

  return h('div', null,
    h(AppBar, {
      title: 'OPIc Study', sub: `${counts.done} / ${counts.total} 그룹 완료 · 오늘 ${st.today.count}회`,
      right: h('div', { class: 'row' },
        h(IconBtn, { icon: IconSearch, label: '검색', onClick: openSearch }),
        h(IconBtn, { icon: IconGear, label: '설정', onClick: openSettings })),
    }),
    h('div', { class: 'screen' },
      h('div', { class: 'card' },
        h('div', { class: 'row' },
          h(Ring, {
            value: counts.total ? counts.done / counts.total : 0, size: 52, done: counts.done === counts.total,
            text: `${counts.done}`,
          }),
          h('div', { class: 'grow' },
            h('div', { class: 't-cap dim' }, '이어서 연습'),
            h('div', { class: 't-ts en nowrap' }, recent ? recent.phrase : '그룹 없음'),
            h('div', { class: 't-cap dim3' }, recent ? `${recent.video.short} · ${recent.count}문장` : ''))),
        h('div', { class: 'row mt3', style: 'gap:8px' },
          h(Btn, { variant: 'primary', wide: true, onClick: () => go(`/s/${recent.gid}`) }, '이어하기'),
          h(Btn, { wide: true, onClick: () => go('/shadow') }, '그룹 고르기'))),

      due.length ? h('div', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', null, '복습할 그룹'), h('span', { class: 't-cap dim3' }, `${due.length}개`)),
        h('div', { class: 'list' }, due.map((g) => h('button', {
          key: g.gid, class: 'rowitem', onClick: () => go(`/s/${g.gid}?from=due`),
        },
          h('div', { class: 'grow' },
            h('div', { class: 'rt en' }, g.phrase),
            h('div', { class: 'rs' }, `${g.video.short} · ${progress.get(g.gid).rating === 'again' ? '다시' : '복습'}`)),
          h(IconChevR, { size: 18 }))))) : null,

      h('div', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', null, '바로가기')),
        h('div', { class: 'list' },
          rowItem('문장 · 패턴 전체', `${idx.rows.length}개 항목 검색 · 쉐도잉 ${idx.allGroups.filter(g => !g.source).length}그룹`, () => go('/shadow')),
          rowItem('기출 문제', `${PACK.questions.length}개 · 답변 ${PACK.questions.filter((q) => q.ans).length}개`, () => go('/questions')),
          rowItem('모의고사', `영상 ${(PACK.mockExams || []).length}개 + 문제집 34세트`, () => go('/exam')),
          rowItem('주제별 문장', `OPIc 주제 ${idx.topicList.length}개로 모아 보기`, () => go('/topics')),
          rowItem('주제별 표현', `표현 자료 ${idx.topics.length}개 주제`, () => go('/lib/expr')),
          rowItem('저장한 문장 · 문제', `${stars.count('sent')}문장 · ${stars.count('q')}문제`, () => go('/saved')))),
      h('p', { class: 't-cap dim3 mt5' },
        '문장 자료: 오픽노잼 섀도잉 영상 · 문제/표현: 오픽GPT 학습실. 개인 학습용으로 정리한 페이지입니다.')));

  function rowItem(t, s, onClick) {
    return h('button', { class: 'rowitem', onClick },
      h('div', { class: 'grow' }, h('div', { class: 'rt' }, t), h('div', { class: 'rs' }, s)),
      h(IconChevR, { size: 18 }));
  }
}

/* ------------------------------------------------------------------ browse (one searchable list) */
export function Browse({ openSearch }) {
  const st = useStore();
  const [q, setQ] = useState('');
  const [src, setSrc] = useState('전체');
  const [topic, setTopic] = useState('전체');
  const [limit, setLimit] = useState(80);

  const topics = useMemo(() => ['전체', ...idx.topicList.map((t) => t.topic)], []);
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows = useMemo(() => idx.rows.filter((r) => {
    if (src !== '전체' && r.src !== src) return false;
    if (topic !== '전체' && r.topic !== topic) return false;
    return tokens.every((t) => r.hay.includes(t));
  }), [src, topic, q]);

  const counts = progress.counts();
  return h('div', null,
    h(AppBar, {
      title: '문장', sub: `${rows.length}개 표시 · 전체 ${idx.rows.length}개 · 완료 ${counts.done}그룹`,
      right: h(IconBtn, { icon: IconSearch, label: '검색', onClick: openSearch }),
    }),
    h('div', { class: 'screen' },
      h(SearchField, {
        value: q, placeholder: '문장 · 구 · 주제 검색 (영어/한국어)',
        onInput: (v) => { setQ(v); setLimit(80); },
      }),
      h('div', { class: 'chiprow mt3' },
        h(Chip, { on: src === '전체', onClick: () => { setSrc('전체'); setLimit(80); } }, `전체 ${idx.rows.length}`),
        idx.sources.map((x) => h(Chip, {
          key: x.label, on: src === x.label, onClick: () => { setSrc(x.label); setLimit(80); },
        }, `${x.label} ${x.count}`))),
      (src === '전체' || src === '쉐도잉') ? h('div', { class: 'chiprow mt2' },
        topics.slice(0, 14).map((t) => h(Chip, {
          key: t, tiny: true, on: topic === t, onClick: () => { setTopic(t); setLimit(80); },
        }, t))) : null,
      h('div', { class: 'list mt4' }, rows.slice(0, limit).map((r) => {
        const pr = r.kind === 'group' ? progress.get(r.gid) : null;
        const sid = 's' + hash32(r.title);
        const href = `/s/${r.gid}${r.kind === 'item' ? `?i=${r.i}` : ''}`;
        return h('div', { key: r.gid + ':' + (r.i == null ? 'g' : r.i), class: 'rowitem' },
          pr ? h('span', { class: `dot ${pr.state === 'done' ? 'done' : pr.state === 'doing' ? '' : 'muted'}` }) : null,
          h('button', {
            class: 'grow col',
            style: 'background:none;border:0;text-align:left;color:inherit;padding:0;cursor:pointer;min-width:0',
            onClick: () => go(href),
          },
            h('div', { class: 'rt en' }, r.title.length > 90 ? r.title.slice(0, 88) + '…' : r.title),
            r.sub ? h('div', { class: 'rs nowrap' }, r.sub) : null,
            h('div', { class: 'rs dim3', style: 'font-size:12px' }, r.src)),
          h(IconBtn, { icon: IconPlay, label: '듣기', sm: true, onClick: () => tts.speak(r.title, { rate: st.settings.rate }) }),
          h(IconBtn, {
            icon: stars.has('sent', sid) ? IconStarFill : IconStar, label: '별표', sm: true,
            on: stars.has('sent', sid), onClick: () => stars.toggle('sent', sid),
          }),
          h(IconBtn, { icon: IconChevR, label: '열기', sm: true, onClick: () => go(href) }));
      }), rows.length ? null : h(Empty, { title: '검색 결과가 없습니다', hint: '영어 문장이나 한국어 뜻으로 찾아보세요.' })),
      rows.length > limit ? h('div', { class: 'mt4' },
        h(Btn, { wide: true, onClick: () => setLimit(limit + 120) }, `더 보기 (${rows.length - limit}개 남음)`)) : null),
    h('div', { class: 'screen', style: 'padding-top:0' },
      h('p', { class: 't-cap dim3' },
        '쉐도잉 = 영상 속 구(phrase) 그룹 · 만능문장 = 선택주제 150문장 · 만능패턴 = 72개 패턴 · 기출 답변 = 오픽 101 모범 답변')));
}

export function TopicList() {
  const st = useStore();
  const total = idx.topicList.reduce((a, t) => a + t.groups.length, 0);
  return h('div', null,
    h(AppBar, { back: true, title: 'OPIc 주제별 문장', sub: `${idx.topicList.length}개 주제 · ${total}개 그룹` }),
    h('div', { class: 'screen' },
      h(Seg, {
        full: true, value: 'topic',
        options: [{ value: 'video', label: '영상별' }, { value: 'topic', label: 'OPIc 주제별' }],
        onChange: (v) => { if (v === 'video') go('/shadow'); },
      }),
      h('p', { class: 't-s dim mt4' }, '기출 문제와 표현 자료에서 쓰는 것과 같은 주제 이름입니다. 시험에 나오는 주제부터 연습해 보세요.'),
      h('div', { class: 'list mt4' }, idx.topicList.map(({ topic, groups }) => {
        const done = groups.filter((g) => progress.get(g.gid).state === 'done').length;
        return h('button', { key: topic, class: 'rowitem', onClick: () => go(`/topic/${encodeURIComponent(topic)}`) },
          h(Ring, { value: groups.length ? done / groups.length : 0, size: 34, stroke: 3, label: false,
            done: done === groups.length }),
          h('div', { class: 'grow' },
            h('div', { class: 'rt' }, topic),
            h('div', { class: 'rs' }, `${groups.length}개 그룹 · ${groups.reduce((a, g) => a + g.count, 0)}문장`)),
          h(IconChevR, { size: 18 }));
      }))));
}

export function TopicGroups({ name }) {
  const st = useStore();
  const groups = idx.topicGroups.get(name) || [];
  const done = groups.filter((g) => progress.get(g.gid).state === 'done').length;
  return h('div', null,
    h(AppBar, {
      back: true, title: name, sub: `${groups.length}개 그룹 · 완료 ${done}`,
      right: h(IconPlay, {
        size: 22, style: 'cursor:pointer;color:var(--accent)',
        onClick: () => {
          const next = groups.find((g) => progress.get(g.gid).state !== 'done') || groups[0];
          if (next) go(`/s/${next.gid}?from=${next.videoId}`);
        },
      }),
    }),
    h('div', { class: 'screen' },
      h('div', { class: 'list' }, groups.map((g) => {
        const p = progress.get(g.gid);
        return h('button', { key: g.gid + g.videoId, class: 'rowitem', onClick: () => go(`/s/${g.gid}?from=${g.videoId}`) },
          h('span', { class: `dot ${p.state === 'done' ? 'done' : p.state === 'doing' ? '' : 'muted'}` }),
          h('div', { class: 'grow' },
            h('div', { class: 'rt en' }, g.phrase),
            h('div', { class: 'rs' }, `${g.video.short} · ${g.count}문장${g.videos.length > 1 ? ` · ${g.videos.length}개 영상` : ''}`)),
          h(IconChevR, { size: 18 }));
      }), groups.length ? null : h(Empty, { title: '이 주제에는 그룹이 없습니다' }))));
}

export function VideoDetail({ id }) {
  const st = useStore();
  const v = PACK.videos.find((x) => x.id === id);
  const [filter, setFilter] = useState('all');
  if (!v) return h('div', { class: 'screen nonav' }, h('p', { class: 'dim' }, '영상을 찾을 수 없습니다.'));
  const gids = idx.videoGroups.get(v.id) || [];
  const list = gids.map((g) => idx.groups.get(g)).filter(Boolean).filter((g) => {
    if (filter === 'todo') return progress.get(g.gid).state !== 'done';
    if (filter === 'star') return g.items.some((it) => stars.has('sent', it.sid));
    return true;
  });
  return h('div', null,
    h(AppBar, {
      back: true, title: v.short, sub: `${v.level} · ${v.count}문장 · ${v.groups.length}그룹`,
      right: h(IconBtn, {
        icon: IconPlay, label: '이어서',
        onClick: () => { const n = progress.nextGroup(v.id); if (n) go(`/s/${n}?from=${v.id}`); },
      }),
    }),
    h('div', { class: 'screen' },
      h('div', { class: 'chiprow mt1' },
        ...[['all', '전체'], ['todo', '미완료'], ['star', '★ 별표']].map(([k, label]) =>
          h(Chip, { key: k, on: filter === k, onClick: () => setFilter(k) }, label))),
      h('div', { class: 'list mt4' }, list.map((g) => {
        const p = progress.get(g.gid);
        return h('button', { key: g.gid, class: 'rowitem', onClick: () => go(`/s/${g.gid}?from=${v.id}`) },
          h('span', { class: `dot ${p.state === 'done' ? 'done' : p.state === 'doing' ? '' : 'muted'}` }),
          h('div', { class: 'grow' },
            h('div', { class: 'rt en' }, g.phrase),
            h('div', { class: 'rs' }, `${g.topic ? g.topic + ' · ' : ''}${g.count}문장${p.passes ? ` · ${p.passes}회` : ''}${p.state === 'done' ? ' · 완료' : ''}`)),
          h(IconChevR, { size: 18 }));
      }), list.length ? null : h(Empty, { title: '해당하는 그룹이 없습니다' }))));
}

/* ------------------------------------------------------------------ questions */
let lastList = [];

export function Questions({ openSearch }) {
  const st = useStore();
  const [seg, setSeg] = useState('all');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState({ type: 'all', topic: 'all' });
  const [sheet, setSheet] = useState(false);

  const rows = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return PACK.questions.filter((x) => {
      if (seg === 'ans' && !x.ans) return false;
      if (seg === 'star' && !stars.has('q', x.id)) return false;
      if (filter.type !== 'all' && x.grp !== filter.type) return false;
      if (filter.topic !== 'all' && x.topic !== filter.topic) return false;
      if (nq && !(x.en + ' ' + x.kr + ' ' + x.title + ' ' + x.topic).toLowerCase().includes(nq)) return false;
      return true;
    });
  }, [seg, q, filter, st.stars.q]);
  lastList = rows.map((r) => r.id);

  const byTopic = useMemo(() => {
    const m = new Map();
    for (const r of rows) { if (!m.has(r.topic)) m.set(r.topic, []); m.get(r.topic).push(r); }
    return [...m.entries()];
  }, [rows]);

  const types = [...new Set(PACK.questions.map((x) => x.grp))];
  const topics = [...new Set(PACK.questions.map((x) => x.topic))].sort();

  if (seg === 'exam') { go('/exam'); setSeg('all'); }

  return h('div', null,
    h(AppBar, {
      title: '문제', sub: `${rows.length}개 표시 중 · 전체 ${PACK.questions.length}개`,
      right: h('div', { class: 'row' },
        h(IconBtn, { icon: IconSearch, label: '검색', onClick: openSearch }),
        h(IconBtn, { icon: IconList, label: '필터', on: filter.type !== 'all' || filter.topic !== 'all', onClick: () => setSheet(true) })),
    }),
    h('div', { class: 'screen' },
      h('div', { class: 'row' },
        h('div', { class: 'grow' },
          h(Seg, {
            full: true, value: seg,
            options: [
              { value: 'all', label: '전체' },
              { value: 'ans', label: '답변' },
              { value: 'star', label: '★' },
              { value: 'exam', label: '모의고사' },
            ],
            onChange: setSeg,
          }))),
      h('div', { class: 'row mt3' }, h('div', { class: 'grow' }, h(SearchField, {
        value: q, onInput: setQ, placeholder: '문제 · 주제 검색',
      }))),
      (filter.type !== 'all' || filter.topic !== 'all')
        ? h('div', { class: 'chiprow mt3' },
          filter.type !== 'all' ? h(Chip, { on: true, onClick: () => setFilter({ ...filter, type: 'all' }) }, filter.type, ' ×') : null,
          filter.topic !== 'all' ? h(Chip, { on: true, onClick: () => setFilter({ ...filter, topic: 'all' }) }, filter.topic, ' ×') : null)
        : null,
      !rows.length ? h(Empty, { title: '조건에 맞는 문제가 없습니다' }) : null,
      byTopic.map(([topic, list]) => h('section', { key: topic, class: 'cv' },
        topicHead(topic, list.length),
        h('div', { class: 'list' }, list.map((x) => h('button', {
          key: x.id, class: 'rowitem', onClick: () => go(`/q/${x.id}`),
        },
          h('div', { class: 'grow' },
            h('div', { class: 'row', style: 'gap:6px' },
              h('span', { class: 'rt grow nowrap' }, x.title),
              (() => { const g = answers.latest('qbank', x.id); return g ? h('span', { class: 'badge' },
                (g.feedback.level_estimate || {}).band || '채점') : x.ans ? h('span', { class: 'dot' }) : null; })()),
            h('div', { class: 'rs', style: 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden' }, x.en)),
          h(IconChevR, { size: 18 })))))) ),

    sheet ? h(Sheet, {
      title: '필터', onClose: () => setSheet(false),
      children: h('div', null,
        h('div', { class: 'section-head' }, h('h2', null, '유형')),
        h('div', { class: 'chiprow wrap' },
          h(Chip, { on: filter.type === 'all', onClick: () => setFilter({ ...filter, type: 'all', topic: 'all' }) }, '전체'),
          types.map((t) => h(Chip, {
            key: t, on: filter.type === t,
            onClick: () => setFilter({ ...filter, type: t, topic: 'all' }),
          }, t))),
        h('div', { class: 'section-head mt6' }, h('h2', null, '주제')),
        h('div', { class: 'chiprow wrap' },
          h(Chip, { on: filter.topic === 'all', onClick: () => setFilter({ ...filter, topic: 'all' }) }, '전체'),
          topics.map((t) => h(Chip, {
            key: t, on: filter.topic === t, onClick: () => setFilter({ ...filter, topic: t }),
          }, t))),
        h('div', { class: 'row mt6' }, h(Btn, { variant: 'primary', wide: true, onClick: () => setSheet(false) }, '적용'))),
    }) : null);
}

export function QuestionDetail({ id, toast, openSettings }) {
  const st = useStore();
  const q = idx.questions.get(id);
  const [reveal, setReveal] = useState(false);
  if (!q) return h('div', { class: 'screen nonav' }, h('p', { class: 'dim' }, '문제를 찾을 수 없습니다.'));
  const pos = lastList.indexOf(id);
  const jump = (d) => { const n = pos + d; if (n >= 0 && n < lastList.length) go(`/q/${lastList[n]}`); };
  const tpl = PACK.banks.typePhrases && PACK.banks.typePhrases[q.kind];
  const speak = (t) => tts.speak(t, { rate: st.settings.rate, voiceName: st.settings.voice });

  return h('div', null,
    h(AppBar, {
      back: true, title: q.title, sub: `${q.grp} · ${q.topic}`,
      right: h('div', { class: 'row' },
        h(StarBtn, { on: stars.has('q', q.id), onClick: () => stars.toggle('q', q.id) }),
        h(IconBtn, { icon: IconChevR, label: '다음 문제', onClick: () => jump(1) })),
    }),
    h('div', { class: 'screen' },
      h('div', { class: 'qmeta' },
        h('span', { class: 'badge' }, q.grp), h('span', { class: 'badge' }, q.kind || '-'), q.cat ? h('span', { class: 'badge' }, q.cat) : null,
        q.page ? h('span', { class: 'badge' }, `book p.${q.page}`) : null),
      h('h1', { class: 't-title en mt3' }, q.en),
      h('div', { class: 'row mt2' },
        h(IconBtn, { icon: IconPlay, label: '질문 듣기', variant: 'bordered', sm: true, onClick: () => speak(q.en) }),
        h('span', { class: 't-cap dim3' }, '질문 듣기')),
      q.kr ? h('p', { class: 't-s dim ko mt2' }, q.kr) : null,
      q.focus ? h('div', { class: 'card mt4' },
        h('div', { class: 't-cap dim' }, '핵심 문장'),
        h('div', { class: 'focus mt1' }, h('b', null, q.focus[0])),
        h('div', { class: 't-s dim ko' }, q.focus[1])) : null,

      q.ans
        ? h('div', { class: 'section' },
          h('div', { class: 'section-head' },
            h('h2', null, '모범 답변'),
            h('div', { class: 'row' },
              h(IconBtn, { icon: IconPlay, label: '답변 듣기', sm: true, variant: 'bordered', onClick: () => speak(q.ans.replace(/\n/g, ' ')) }),
              h(Btn, { onClick: () => setReveal(!reveal) }, reveal ? '가리기' : '보기'))),
          reveal
            ? h('div', { class: 'card' }, h('div', { class: 'ans' },
              q.ans.split('\n').filter(Boolean).map((ln, i) => h('span', { key: i, class: 'ln' }, ln)),
              q.exKr ? h('p', { class: 'ko t-s dim mt4' }, q.exKr) : null))
            : h('div', { class: 'card', style: 'text-align:center' }, h('p', { class: 'dim t-s' }, '답변을 먼저 말해 본 뒤 확인해 보세요')))
        : h('div', { class: 'section' },
          h('div', { class: 'section-head' }, h('h2', null, '답변 만들기')),
          h('div', { class: 'card' },
            h('p', { class: 't-s' }, '이 문제에는 모범 답변이 없습니다. 아래 문장 틀을 조합해 직접 만들어 보세요.'),
            h('div', { class: 'row mt3' },
              h(Btn, { onClick: () => go('/lib/tpl') }, '템플릿 보기'),
              q.topic ? h(Btn, { onClick: () => go(`/lib/expr?topic=${encodeURIComponent(q.topic)}`) }, `${q.topic} 표현`) : null))),

      h('div', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', null, '내 답변 채점'),
          answers.latest('qbank', q.id)
            ? h('span', { class: 'badge' }, (answers.latest('qbank', q.id).feedback.level_estimate || {}).band || '채점됨') : null),
        h(AnswerRecorder, {
          examId: 'qbank', examTitle: `문제집 · ${q.topic}`, qid: q.id, question: q.en,
          topic: q.topic, level: 'IH', onOpenSettings: openSettings,
        })),

      tpl ? h('div', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', null, `${q.kind} 유형 문장`)),
        h('div', { class: 'list' }, tpl.map((r, i) => h('div', { key: i, class: 'rowitem' },
          h('div', { class: 'grow' }, h('div', { class: 'rt en' }, r[0]), h('div', { class: 'rs ko' }, r[1])),
          h(IconBtn, { icon: IconPlay, label: '듣기', sm: true, onClick: () => speak(r[0]) }))))) : null));
}

/* ------------------------------------------------------------------ exam */
export function ExamList() {
  const sets = PACK.exam.comboCatalog || [];
  const mi = PACK.exam.mockIntro;
  const vids = PACK.mockExams || [];
  return h('div', null,
    h(AppBar, { back: true, title: '모의고사', sub: `영상 ${vids.length}개 · 문제집 ${sets.length}세트` }),
    h('div', { class: 'screen' },
      vids.length ? h('div', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', null, '영상 모의고사'),
          h('span', { class: 't-cap dim3' }, `${vids.length}개 · 각 14문항`)),
        h('div', { class: 'list' }, vids.map((e) => h('button', {
          key: e.id, class: 'rowitem', onClick: () => go(`/exam/${e.id}`),
        },
          h('span', { class: 'badge' }, e.id.toUpperCase()),
          h('div', { class: 'grow' },
            h('div', { class: 'rt' }, e.title),
            h('div', { class: 'rs' }, `${e.note} · ${e.minutes}분 · ${e.questions.length}문항`)),
          h(IconChevR, { size: 18 }))))) : null,
      mi ? h('div', { class: 'card' },
        h('div', { class: 't-cap dim' }, '시작 질문'),
        h('div', { class: 't-ts en mt1' }, mi.en),
        h('div', { class: 't-s dim ko' }, mi.kr)) : null,
      h('div', { class: 'section-head mt6' }, h('h2', null, '문제집 세트')),
      h('div', { class: 'list' }, sets.map((row, i) => {
        const first = idx.questions.get(Array.isArray(row[0]) ? row[0][0] : row[0]);
        return h('button', { key: i, class: 'rowitem', onClick: () => go(`/exam/${i}`) },
          h('span', { class: 'badge num' }, `${i + 1}`),
          h('div', { class: 'grow' },
            h('div', { class: 'rt nowrap' }, first ? first.topic : '세트'),
            h('div', { class: 'rs' }, `${row.length}단계 · ${first ? first.title : ''}`)),
          h(IconChevR, { size: 18 }));
      }))));
}

export function ExamRun({ index, openSettings, toast }) {
  const vid = (PACK.mockExams || []).find((e) => e.id === index);
  if (vid) return h(VideoExam, { exam: vid });
  const row = (PACK.exam.comboCatalog || [])[index] || [];
  const [step, setStep] = useState(0);
  const [left, setLeft] = useState(40 * 60);
  const [run, setRun] = useState(false);
  const timer = useRef(0);
  useEffect(() => {
    if (!run) return;
    timer.current = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(timer.current);
  }, [run]);
  const mmss = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;

  const slot = row[step];
  const ids = Array.isArray(slot) ? slot : slot === undefined ? [] : [slot];
  const options = ids.map((id) => idx.questions.get(id)).filter(Boolean);

  return h('div', null,
    h(AppBar, {
      back: true, title: `모의고사 ${index + 1}`, sub: `${step + 1} / ${row.length} 단계`,
      right: h('div', { class: 'row' },
        h('span', { class: 'badge num', style: left < 300 ? 'color:var(--warn)' : '' }, h(IconTimer, { size: 12 }), ' ', mmss),
        h(Btn, { onClick: () => setRun(!run) }, run ? '일시정지' : '시작')),
    }),
    h('div', { class: 'screen' },
      h('div', { class: 'stack' }, row.map((s, i) => {
        const sid = Array.isArray(s) ? s[0] : s;
        const qq = idx.questions.get(sid);
        const on = i === step;
        return h('button', {
          key: i, class: `card tight row`, style: on ? 'border-color:var(--accent)' : 'opacity:.72',
          onClick: () => setStep(i),
        },
          h('span', { class: `dot ${i < step ? 'done' : on ? '' : 'muted'}` }),
          h('div', { class: 'grow col', style: 'text-align:left' },
            h('div', { class: 't-cap dim3' }, `${i + 1}단계${Array.isArray(s) ? ' · 택 1' : ''}`),
            h('div', { class: 't-b nowrap' }, qq ? qq.title : '-')),
          i < step ? h(IconCheck, { size: 18 }) : null);
      })),
      options.length ? h('div', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', null, options.length > 1 ? '이 중 하나' : '질문')),
        options.map((qq) => h('div', { key: qq.id, class: 'card' },
          h('div', { class: 'row' },
            h('div', { class: 't-ts en grow' }, qq.en),
            answers.get(`set${index}`, qq.id) ? h('span', { class: 'badge done' }, '채점 완료') : null),
          h('div', { class: 'row mt3' },
            h(IconBtn, { icon: IconPlay, label: '듣기', variant: 'bordered', sm: true, onClick: () => tts.speak(qq.en, { rate: store.state.settings.rate }) }),
            h(Btn, { onClick: () => go(`/q/${qq.id}`) }, '자세히')),
          h('div', { class: 'mt3' }, h(AnswerRecorder, {
            examId: `set${index}`, examTitle: `문제집 세트 ${index + 1}`, qid: qq.id, question: qq.en,
            topic: qq.topic, nextQid: (options[1] || {}).id, onOpenSettings: openSettings,
          }))))) : null,
      h('div', { class: 'row mt5', style: 'gap:8px' },
        h(Btn, { wide: true, onClick: () => setStep(Math.max(0, step - 1)) }, '← 이전'),
        h(Btn, {
          variant: 'primary', wide: true,
          onClick: () => (step + 1 < row.length ? setStep(step + 1) : setRun(false)),
        }, step + 1 < row.length ? '다음 단계 →' : '종료'))));
}

function VideoExam({ exam, openSettings }) {
  const st = useStore();
  const ids = exam.questions.map((q) => q.no);
  const firstUnanswered = ids.find((id) => !answers.get(exam.id, id));
  const [step, setStep] = useState(() => {
    const idx = exam.questions.findIndex((q) => q.no === firstUnanswered);
    return idx >= 0 ? idx : 0;
  });
  const q = exam.questions[step] || {};
  const doneN = ids.filter((id) => answers.get(exam.id, id)).length;
  const nextId = (exam.questions[step + 1] || {}).no;

  return h('div', null,
    h(AppBar, {
      back: true, title: exam.title,
      sub: `${step + 1} / ${exam.questions.length} · 채점 ${doneN}개 · ${exam.note}`,
      right: h(IconBtn, { icon: IconList, label: '전체 보기', onClick: () => go('/exam') }),
    }),
    h('div', { class: 'screen' },
      h('div', { class: 'card' },
        h('div', { class: 'row' },
          h('div', { class: 't-cap dim grow' }, `Question ${step + 1} of ${exam.questions.length}`),
          answers.get(exam.id, q.no) ? h('span', { class: 'badge done' }, '채점 완료') : null),
        h('h1', { class: 't-title en mt2' }, q.en || ''),
        q.kr ? h('p', { class: 't-s dim ko mt2' }, q.kr) : null,
        h('div', { class: 'row mt3' },
          h(IconBtn, {
            icon: IconPlay, label: '질문 듣기', variant: 'bordered',
            onClick: () => tts.speak(q.en, { rate: st.settings.rate, voiceName: st.settings.voice }),
          }),
          h('span', { class: 't-cap dim3' }, '질문 듣기'),
          q.topic ? h('span', { class: 'badge' }, q.topic) : null,
          q.qid != null ? h(Btn, { onClick: () => go(`/q/${q.qid}`) }, '문제집에서 보기') : null)),

      h('div', { class: 'mt4' },
        h(AnswerRecorder, {
          examId: exam.id, examTitle: `${exam.title} (${exam.note})`, qid: q.no, question: q.en,
          topic: q.topic, level: 'IH', nextQid: nextId, onOpenSettings: openSettings,
        })),

      h('div', { class: 'row mt4', style: 'gap:8px' },
        h(Btn, { wide: true, onClick: () => setStep(Math.max(0, step - 1)) }, '← 이전'),
        h(Btn, {
          variant: 'primary', wide: true,
          onClick: () => setStep(Math.min(exam.questions.length - 1, step + 1)),
        }, '다음 →')),
      firstUnanswered && firstUnanswered !== q.no ? h('div', { class: 'mt3' },
        h(Btn, {
          wide: true,
          onClick: () => {
            const i = exam.questions.findIndex((x) => x.no === firstUnanswered);
            if (i >= 0) setStep(i);
          },
        }, `아직 안 푼 문제로 이동 (#${firstUnanswered})`)) : null,

      h('div', { class: 'section-head mt6' }, h('h2', null, '문항 목록'),
        h('span', { class: 't-cap dim3' }, `${doneN} / ${exam.questions.length} 채점`)),
      h('div', { class: 'list' }, exam.questions.map((qq, i) => h('button', {
        key: i, class: 'rowitem', onClick: () => setStep(i),
      },
        h('span', { class: `dot ${answers.get(exam.id, qq.no) ? 'done' : i === step ? '' : 'muted'}` }),
        h('div', { class: 'grow' }, h('div', { class: 'rt en nowrap' }, qq.en)),
        answers.get(exam.id, qq.no) ? h('span', { class: `badge ${(answers.get(exam.id, qq.no).feedback.level_estimate || {}).band ? '' : ''}` },
          (answers.get(exam.id, qq.no).feedback.level_estimate || {}).band || '완료') : null,
        h('span', { class: 't-cap dim3 num' }, `${i + 1}`))))));
}

/* ------------------------------------------------------------------ library */
export function Library({ seg = 'expr', topic, openSearch }) {
  const [s, setS] = useState(seg);
  useEffect(() => setS(seg), [seg]);
  return h('div', null,
    h(AppBar, {
      title: '자료', sub: '표현 · 템플릿 · 문서',
      right: h(IconBtn, { icon: IconSearch, label: '검색', onClick: openSearch }),
    }),
    h('div', { class: 'screen' },
      h(Seg, {
        full: true, value: s,
        options: [{ value: 'expr', label: '표현' }, { value: 'tpl', label: '템플릿' }, { value: 'docs', label: '문서' }],
        onChange: (v) => go(`/lib/${v}`),
      }),
      s === 'expr' ? h(Expressions, { topic }) : s === 'tpl' ? h(Templates, {}) : h(Docs, {})));
}

function Expressions({ topic }) {
  const st = useStore();
  const [t, setT] = useState(topic || idx.topics[0]);
  const [q, setQ] = useState('');
  useEffect(() => { if (topic) setT(topic); }, [topic]);
  const ph = (PACK.phrases && PACK.phrases[t]) || [];
  const lx = (PACK.lexicon && PACK.lexicon[t]) || [];
  const ex = (PACK.extra && PACK.extra[t]) || [];
  const nq = q.trim().toLowerCase();
  const keep = (row) => !nq || row.join(' ').toLowerCase().includes(nq);

  const Item = ({ id, main, sub, example, exampleKr }) => h('div', { class: 'card tight' },
    h('div', { class: 'row' },
      h('div', { class: 'grow' },
        h('div', { class: 't-b' }, main, sub ? h('span', { class: 'dim t-s' }, '  ', sub) : null),
        example ? h('div', { class: 't-s mt1' }, example) : null,
        exampleKr ? h('div', { class: 't-s dim ko' }, exampleKr) : null),
      h(StarBtn, { on: stars.has('expr', id), onClick: () => stars.toggle('expr', id) }),
      example ? h(IconBtn, { icon: IconPlay, label: '듣기', sm: true, onClick: () => tts.speak(example, { rate: st.settings.rate }) }) : null));

  return h('div', null,
    h('div', { class: 'mt3' }, h(SearchField, { value: q, onInput: setQ, placeholder: '표현 검색' })),
    h('select', { class: 'mt2', value: t, onChange: (e) => setT(e.currentTarget.value) },
      idx.topics.map((x) => h('option', { key: x, value: x }, topicLabel(x)))),
    h('div', { class: 'stack mt4' },
      ph.filter(keep).map((r, i) => h(Item, {
        key: 'p' + i, id: exprId(t, r[0]), main: r[0], sub: r[1],
        example: r.length >= 4 ? r[2] : '', exampleKr: r.length >= 4 ? r[3] : '',
      })),
      lx.filter(keep).map((r, i) => h(Item, {
        key: 'l' + i, id: exprId(t, r[1]), main: r[1], sub: `${r[2] || ''}${r[0] ? ' · ' + r[0] : ''}`,
        example: r.length >= 5 ? r[3] : '', exampleKr: r.length >= 5 ? r[4] : '',
      })),
      ex.filter(keep).map((r, i) => h(Item, {
        key: 'e' + i, id: exprId(t, r[0] + r[2]), main: `${r[0]} ${r[2]}`, sub: `${r[1]} ${r[3]}`,
      }))),
    (!ph.length && !lx.length && !ex.length) ? h(Empty, { title: '이 주제에는 자료가 없습니다' }) : null);
}

function Templates() {
  const st = useStore();
  const B = PACK.banks || {}, D = PACK.drafts || {};
  const List = ({ rows }) => h('div', { class: 'list' }, rows.map((r, i) => h('div', { key: i, class: 'rowitem' },
    h('div', { class: 'grow' }, h('div', { class: 'rt en' }, r[0]), r[1] ? h('div', { class: 'rs ko' }, r[1]) : null),
    h(IconBtn, { icon: IconPlay, label: '듣기', sm: true, onClick: () => tts.speak(r[0], { rate: st.settings.rate }) }))));

  const scene = (title, obj) => !obj ? null : h('div', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, title)),
    h('div', { class: 'stack' }, Object.entries(obj).map(([k, rows]) => h('div', { class: 'card tight' },
      h('div', { class: 't-cap dim' }, k),
      rows.map((r, i) => Array.isArray(r) ? h('div', { key: i, class: 'mt2' },
        h('div', { class: 't-b en' }, r[0]),
        h('div', { class: 't-s dim ko' }, r[1])) : h('div', { key: i, class: 't-b en mt2' }, r))))));

  return h('div', null,
    h('p', { class: 't-s dim mt3' }, '[A|B] 는 현재형/과거형 선택지입니다. 하나씩 골라 말해 보세요.'),
    B.typePhrases ? h('div', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, '유형별 문장 틀')),
      h('div', { class: 'stack' }, Object.entries(B.typePhrases).map(([k, rows]) => {
        const items = rows.map((r, i) => h('div', {
          key: i, class: 'row', style: 'padding:6px 0;border-top:1px solid var(--border)',
        },
          h('div', { class: 'grow' }, h('div', { class: 't-b en' }, r[0]), h('div', { class: 't-s dim ko' }, r[1])),
          h(IconBtn, { icon: IconPlay, label: '듣기', sm: true, onClick: () => tts.speak(r[0], { rate: st.settings.rate }) })));
        return h('div', { key: k, class: 'card tight' },
          h('div', { class: 'row' }, h('div', { class: 't-cap dim grow' }, k), h('span', { class: 'badge' }, `${rows.length}`)),
          h('div', { class: 'mt2' }, items));
      }))) : null,
    scene('장면별 초안', D.sceneBank),
    scene('추가 샘플', D.moreSamples),
    B.rolePhrases ? h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, '롤플레이 전화 표현')), h(List, { rows: B.rolePhrases })) : null,
    B.chipSentences ? h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, '문장 칩')),
      h(List, { rows: Object.entries(B.chipSentences).map(([k, v]) => [v[0], v[1] || k]) })) : null,
    B.defs ? h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, '장소별 기본 틀')),
      h('div', { class: 'stack' }, Object.entries(B.defs).map(([k, d]) => h('div', { class: 'card tight' },
        h('div', { class: 't-cap dim' }, `${k} · ${d.place || ''}`),
        [['desc', '묘사'], ['act', '활동'], ['past', '과거']].map(([key, label]) => d[key] ? h('div', { key, class: 'mt2' },
          h('div', { class: 't-s' }, label), h('div', { class: 't-b en' }, d[key].en), h('div', { class: 't-s dim ko' }, d[key].kr)) : null),
        (d.routine || []).map((r, i) => h('div', { key: 'r' + i, class: 'mt2' }, h('div', { class: 't-b en' }, r.en), h('div', { class: 't-s dim ko' }, r.kr))),
        (d.words || []).length ? h('div', { class: 't-s dim mt2' }, d.words.map((w) => `${w[0]} (${w[1]})`).join(' · ')) : null)))) : null);
}

let DOCS = null;
function Docs() {
  const [docs, setDocs] = useState(DOCS);
  useEffect(() => {
    if (DOCS) return;
    fetch('data/docs.json').then((r) => r.json()).then((d) => { DOCS = d; setDocs(d); }).catch(() => setDocs([]));
  }, []);
  if (!docs) return h('p', { class: 'dim mt4' }, '불러오는 중…');
  return h('div', { class: 'list mt4' }, docs.map((d) => h('button', {
    key: d.file, class: 'rowitem', onClick: () => go(`/doc/${encodeURIComponent(d.file)}`),
  },
    h(IconDoc, { size: 20 }),
    h('div', { class: 'grow' }, h('div', { class: 'rt nowrap' }, d.title), h('div', { class: 'rs' }, `${d.file} · ${Math.round(d.bytes / 1024)} KB`)),
    h(IconChevR, { size: 18 }))));
}

export function DocReader({ file }) {
  const [doc, setDoc] = useState(null);
  const [toc, setToc] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    (async () => {
      const all = DOCS || (DOCS = await (await fetch('data/docs.json')).json());
      const hit = all.find((d) => d.file === file);
      setDoc(hit || { file, title: file, html: '<p>문서를 찾을 수 없습니다.</p>', headings: [] });
    })();
  }, [file]);
  useEffect(() => { window.scrollTo(0, 0); }, [file]);
  return h('div', null,
    h(AppBar, {
      back: true, title: doc ? doc.title : file, sub: file,
      right: doc && doc.headings.length ? h(IconBtn, { icon: IconList, label: '목차', onClick: () => setToc(true) }) : null,
    }),
    h('div', { class: 'screen' },
      doc ? h('article', { class: 'md', ref, dangerouslySetInnerHTML: { __html: doc.html } }) : h('p', { class: 'dim' }, '불러오는 중…')),
    toc && doc ? h(Sheet, {
      title: '목차', onClose: () => setToc(false),
      children: h('div', { class: 'toc' }, doc.headings.map((hh) => h('button', {
        key: hh, onClick: () => {
          setToc(false);
          const el = [...document.querySelectorAll('.md h2')].find((e) => e.textContent.trim() === hh.trim());
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      }, hh))),
    }) : null);
}

/* ------------------------------------------------------------------ saved */
export function Saved({ toast }) {
  const st = useStore();
  const sents = stars.ids('sent').map((sid) => idx.sentences.get(sid)).filter(Boolean);
  const qs = stars.ids('q').map((id) => idx.questions.get(Number(id))).filter(Boolean);
  const exprs = stars.ids('expr');
  const [open, setOpen] = useState('sent');

  return h('div', null,
    h(AppBar, {
      back: true, title: '저장함', sub: `${sents.length}문장 · ${qs.length}문제 · ${exprs.length}표현`,
      right: h(Btn, { onClick: () => toast('설정에서 내보낼 수 있습니다') }, '내보내기'),
    }),
    h('div', { class: 'screen' },
      h(Seg, {
        full: true, value: open,
        options: [{ value: 'sent', label: `문장 ${sents.length}` }, { value: 'q', label: `문제 ${qs.length}` }, { value: 'expr', label: `표현 ${exprs.length}` }],
        onChange: setOpen,
      }),
      body()));

  function body() {
    if (open === 'sent') {
      if (!sents.length) return h(Empty, { title: '저장한 문장이 없습니다', hint: '문장 오른쪽 별표를 눌러 저장하세요.' });
      return h('div', { class: 'list mt4' }, sents.map((s) => h('div', { key: s.sid, class: 'rowitem' },
        h('div', { class: 'grow' },
          h('div', { class: 'rt en' }, s.en),
          h('div', { class: 'rs' }, s.group.phrase)),
        h(IconBtn, { icon: IconPlay, label: '듣기', sm: true, onClick: () => tts.speak(s.en, { rate: st.settings.rate }) }),
        h(IconBtn, { icon: IconStarFill, label: '별표 해제', sm: true, on: true, onClick: () => stars.toggle('sent', s.sid) }),
        h(IconBtn, { icon: IconChevR, label: '그룹 열기', sm: true, onClick: () => go(`/s/${s.gid}?from=saved`) }))));
    }
    if (open === 'q') {
      if (!qs.length) return h(Empty, { title: '저장한 문제가 없습니다', hint: '문제 화면의 별표를 눌러 저장하세요.' });
      return h('div', { class: 'list mt4' }, qs.map((q) => h('div', { key: q.id, class: 'rowitem' },
        h('div', { class: 'grow' },
          h('div', { class: 'rt nowrap' }, q.title),
          h('div', { class: 'rs nowrap' }, q.en)),
        h(IconBtn, { icon: IconStarFill, label: '별표 해제', sm: true, on: true, onClick: () => stars.toggle('q', q.id) }),
        h(IconBtn, { icon: IconChevR, label: '열기', sm: true, onClick: () => go(`/q/${q.id}`) }))));
    }
    if (!exprs.length) return h(Empty, { title: '저장한 표현이 없습니다', hint: '표현 카드의 별표를 눌러 저장하세요.' });
    return h('div', { class: 'list mt4' }, exprs.map((id) => h('div', { key: id, class: 'rowitem' },
      h('div', { class: 'grow' }, h('div', { class: 't-b' }, id)),
      h(IconBtn, { icon: IconStarFill, label: '해제', sm: true, on: true, onClick: () => stars.toggle('expr', id) }))));
  }
}
