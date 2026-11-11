/* session.jsx — the focused shadowing session: one phrase group at a time. */
import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { idx, progress, store, tts, stripMark, stars } from './core.js';
import { useStore, go } from './router.js';
import {
  IconChevL, IconChevR, IconClose, IconList, IconNext, IconPlay, IconPause, IconPrev, IconRepeat,
  IconStar, IconStarFill, IconEye, IconEyeOff, Ring, Sheet, IconBtn, Btn, Chip,
} from './ui.jsx';

const SPEEDS = [0.8, 0.92, 1.05];
const REPEATS = [
  { label: '×1', v: 1 }, { label: '×3', v: 3 }, { label: '∞', v: Infinity },
];
const GAPS = [{ v: 'short', label: '짧게' }, { v: 'auto', label: '자동' }, { v: 'long', label: '길게' }];

function buildQueue(gid, from) {
  const all = idx.allGroups;
  if (from === 'due') return progress.dueGroups(60).map((g) => g.gid);
  if (from === 'saved') return all.filter((g) => g.items.some((it) => stars.has('sent', it.sid))).map((g) => g.gid);
  if (from && idx.videoGroups.has(from)) {
    const gids = idx.videoGroups.get(from).slice();
    if (gid && !gids.includes(gid)) gids.unshift(gid);
    return gids;
  }
  return all.map((g) => g.gid);
}

export function Session({ gid, from, at, toast }) {
  const st = useStore();
  const queue = useMemo(() => buildQueue(gid, from), [gid, from]);
  const [cur, setCur] = useState(gid);
  const [si, setSi] = useState(0);
  const [phase, setPhase] = useState('idle');       // idle | speak | gap | end
  const [repeatLeft, setRepeatLeft] = useState(1);
  const [gapPct, setGapPct] = useState(1);
  const [hide, setHide] = useState(st.settings.hide);
  const [revealed, setRevealed] = useState(() => new Set());
  const [listSheet, setListSheet] = useState(false);
  const [speed, setSpeed] = useState(st.settings.rate);
  const [rep, setRep] = useState(1);
  const [gapMode, setGapMode] = useState(st.settings.gap);
  const [auto, setAuto] = useState(st.settings.auto);
  const cancelRef = useRef(null);
  const gapTimer = useRef(0);
  const rafRef = useRef(0);

  const group = idx.groups.get(cur) || idx.groups.get(queue[0]);
  const items = group ? group.items : [];
  const qIndex = Math.max(0, queue.indexOf(group ? group.gid : cur));
  /* a group can belong to several videos (the same sentences are re-uploaded): credit the one we
     came from when the caller passed one, otherwise the group's first source. Never mutated. */
  const video = useMemo(() => {
    if (!group) return null;
    if (from && group.videos.includes(from)) {
      const hit = idx.videos.find((v) => v.id === from);
      if (hit) return hit;
    }
    return group.video;
  }, [group, from]);

  /* the route is the source of truth: deep links, back/forward and in-app links must switch group */
  useEffect(() => {
    if (gid && gid !== cur && idx.groups.has(gid)) { setCur(gid); setSi(0); }
  }, [gid]);
  /* ?i=<n> starts the session on a specific sentence of the unit (used by the browse list) */
  useEffect(() => {
    const n = Number(at);
    const g = idx.groups.get(gid);
    if (g && Number.isFinite(n) && n >= 0 && n < g.items.length) setSi(n);
  }, [gid, at]);

  /* stop speech on route/group change and on unmount */
  useEffect(() => { setSi(0); setPhase('idle'); setRevealed(new Set()); tts.stop(); }, [cur]);
  useEffect(() => () => { tts.stop(); clearTimeout(gapTimer.current); cancelAnimationFrame(rafRef.current); }, []);

  /* keep the screen awake during a session */
  useEffect(() => {
    let lock = null;
    if (navigator.wakeLock) navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { lock && lock.release && lock.release().catch(() => {}); };
  }, []);

  const clearTimers = () => { clearTimeout(gapTimer.current); cancelAnimationFrame(rafRef.current); };

  function startGap() {
    const text = items[si] ? items[si].en : '';
    const ms = tts.gapMs(text, speed, gapMode);
    setPhase('gap');
    const t0 = performance.now();
    const tick = () => {
      const p = Math.max(0, 1 - (performance.now() - t0) / ms);
      setGapPct(p);
      if (p > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    gapTimer.current = setTimeout(() => { setGapPct(1); afterGap(); }, ms);
  }

  function afterGap() {
    if (si + 1 < items.length) {
      setSi(si + 1);
      if (auto) setTimeout(() => play(si + 1), 120);
      else setPhase('idle');
    } else {
      setPhase('end');
    }
  }

  function play(target = si, repeats) {
    if (!items[target]) return;
    clearTimers();
    setPhase('speak');
    const left = repeats === undefined ? rep : repeats;
    setRepeatLeft(left);
    const go2 = (n) => {
      cancelRef.current = tts.speak(items[target].en, {
        rate: speed, voiceName: st.settings.voice,
        onstart: () => setPhase('speak'),
        onend: () => {
          if (n > 1 || n === Infinity) {
            setTimeout(() => go2(n === Infinity ? Infinity : n - 1), 350);
          } else if (auto) {
            startGap();
          } else {
            setPhase('idle');
          }
        },
      });
    };
    go2(left);
  }

  function stop() { clearTimers(); tts.stop(); setPhase('idle'); setGapPct(1); }

  /* the single place the session changes group: the user asked for it, so the URL follows.
     Mounting never writes the URL — otherwise an external navigation gets overwritten. */
  function jumpTo(nextGid) {
    stop();
    setCur(nextGid);
    history.replaceState(null, '', `#/s/${nextGid}${from ? '?from=' + from : ''}`);
  }

  function move(delta) {
    const n = qIndex + delta;
    if (n < 0 || n >= queue.length) { toast('그룹의 끝입니다'); return; }
    jumpTo(queue[n]);
  }

  function rate(rating) {
    progress.rate(group.gid, rating);
    toast(rating === 'again' ? '다시 볼 그룹으로 표시했습니다' : rating === 'ok' ? '3일 뒤 복습' : '7일 뒤 복습');
    if (qIndex + 1 < queue.length) setTimeout(() => jumpTo(queue[qIndex + 1]), 220);
    else { stop(); go('/shadow'); }
  }

  if (!group) return h('div', { class: 'screen nonav' }, h('p', { class: 'dim' }, '그룹을 찾을 수 없습니다.'));

  const curSent = items[si] || items[0];
  const done = phase === 'end';

  return h('div', null,
    h('header', { class: 'appbar' },
      h(IconBtn, { icon: IconClose, label: '닫기', onClick: () => { stop(); history.length > 1 ? history.back() : go('/shadow'); } }),
      h('div', { class: 'grow row', style: 'justify-content:center;gap:6px' },
        h(IconBtn, { icon: IconChevL, label: '이전 그룹', size: 20, onClick: () => move(-1) }),
        h('div', { style: 'text-align:center;min-width:104px' },
          h('div', { class: 'title num' }, `${qIndex + 1} / ${queue.length}`),
          h('div', { class: 'sub nowrap' }, [group.topic, video ? video.short : ''].filter(Boolean).join(' · '))),
        h(IconBtn, { icon: IconChevR, label: '다음 그룹', size: 20, onClick: () => move(1) })),
      h(IconBtn, { icon: IconList, label: '그룹 목록', onClick: () => setListSheet(true) })),

    h('div', { class: 'session' },
      h('div', { class: 'segbar' }, items.map((_, i) =>
        h('i', { key: i, class: i < si || done ? 'done' : i === si ? 'cur' : '' }))),

      h('div', { class: 'phrase-head' },
        h('button', { class: 'tap', onClick: () => tts.speak(group.phrase, { rate: speed, voiceName: st.settings.voice }) },
          h('h1', { class: 'phrase-eyebrow en' }, group.phrase, h('span', { class: 'dim3 t-cap' }, '  🔊'))),
        h('p', { class: 't-cap dim3' },
          [group.topic, `${group.count}문장`, video ? video.short : '', video && video.level ? video.level + ' 목표' : '']
            .filter(Boolean).join(' · '))),

      h('div', { class: 'sentstack' },
        items.map((it, i) => {
          const isCur = i === si;
          const blurred = hide && !revealed.has(i);
          return h('button', {
            key: it.sid, class: `sent ${isCur ? 'cur' : ''} ${blurred ? 'blur' : ''}`,
            onClick: () => {
              if (blurred) { setRevealed(new Set([...revealed, i])); return; }
              setSi(i); if (auto || isCur) play(i);
            },
          },
            h('span', { class: 'txt en' },
              it.sub && isCur ? h('span', { class: 'badge', style: 'margin-right:6px' }, it.sub) : null,
              stripMark(it.en, group.phrase).map((p, k) => p.hit ? h('mark', { key: k }, p.t) : p.t),
              it.kr && isCur ? h('span', { class: 'kr ko' }, it.kr) : null),
            isCur && phase === 'gap' ? h('i', { class: 'gapprog', style: `width:${Math.round(gapPct * 100)}%` }) : null);
        })),

      done
        ? h('div', { class: 'dock' },
          h('p', { class: 't-b', style: 'text-align:center;margin:0 0 12px' }, '그룹 완료! 기억에 남나요?'),
          h('div', { class: 'row', style: 'gap:8px' },
            h(Btn, { wide: true, onClick: () => rate('again') }, '다시'),
            h(Btn, { wide: true, onClick: () => rate('ok') }, '보통'),
            h(Btn, { variant: 'primary', wide: true, onClick: () => rate('know') }, '외움')),
          h('div', { class: 'row mt3', style: 'gap:8px' },
            h(Btn, { wide: true, onClick: () => { setSi(0); setPhase('idle'); } }, '한 번 더'),
            h(Btn, { wide: true, onClick: () => move(1) }, '다음 그룹 →')))
        : h('div', { class: 'dock' },
          h('div', { class: 'chips' },
            h(Chip, { tiny: true, onClick: () => { const i = (SPEEDS.indexOf(speed) + 1) % SPEEDS.length; setSpeed(SPEEDS[i]); } },
              h(IconRepeat, { size: 14 }), `${speed}×`),
            h(Chip, {
              tiny: true,
              onClick: () => { const i = REPEATS.findIndex((r) => r.v === rep); setRep(REPEATS[(i + 1) % REPEATS.length].v); },
            }, h(IconRepeat, { size: 14 }),
              phase === 'speak' && (repeatLeft > 1 || repeatLeft === Infinity)
                ? `반복 ${repeatLeft === Infinity ? '∞' : repeatLeft}/${rep === Infinity ? '∞' : rep}`
                : `반복 ${REPEATS.find((r) => r.v === rep).label}`),
            h(Chip, { tiny: true, on: auto, onClick: () => setAuto(!auto) }, auto ? '자동 진행' : '수동 진행'),
            h(Chip, { tiny: true, on: hide, onClick: () => { setHide(!hide); setRevealed(new Set()); } },
              hide ? h(IconEyeOff, { size: 14 }) : h(IconEye, { size: 14 }), hide ? '가림' : '보임'),
            h(Chip, {
              tiny: true,
              onClick: () => { const i = GAPS.findIndex((g) => g.v === gapMode); setGapMode(GAPS[(i + 1) % GAPS.length].v); },
            }, `쉬는 시간 ${GAPS.find((g) => g.v === gapMode).label}`)),
          h('div', { class: 'transport' },
            h(IconBtn, { icon: IconRepeat, label: '이 문장 반복', variant: 'bordered', onClick: () => play(si) }),
            h(IconBtn, { icon: IconPrev, label: '이전 문장', onClick: () => { stop(); setSi(Math.max(0, si - 1)); } }),
            h('button', {
              class: 'play', 'aria-label': phase === 'speak' ? '정지' : '재생',
              onClick: () => (phase === 'speak' ? stop() : phase === 'gap' ? (clearTimers(), afterGap()) : play()),
            },
              phase === 'gap'
                ? h(Ring, { value: gapPct, size: 72, stroke: 4 })
                : h(phase === 'speak' ? IconPause : IconPlay),
              phase === 'idle' ? h('span', { class: 't-cap dim3', style: 'position:absolute;bottom:-18px;left:0;right:0;text-align:center' }, '듣고 따라 말하기') : null),
            h(IconBtn, { icon: IconNext, label: '다음 문장', onClick: () => { stop(); setSi(Math.min(items.length - 1, si + 1)); } }),
            h(IconBtn, {
              icon: stars.has('sent', curSent.sid) ? IconStarFill : IconStar, label: '별표', on: stars.has('sent', curSent.sid),
              onClick: () => stars.toggle('sent', curSent.sid),
            })),
          h('p', { class: 't-cap dim3', style: 'text-align:center;margin:10px 0 0' },
            phase === 'gap' ? '🎙 지금 따라 말해 보세요' : phase === 'speak' ? '듣는 중…' : '재생을 누르면 문장을 읽어 줍니다'))),

    listSheet ? h(Sheet, {
      title: '그룹 목록', onClose: () => setListSheet(false),
      children: h('div', null, queue.map((g2, i) => {
        const g = idx.groups.get(g2);
        if (!g) return null;
        const p = progress.get(g2);
        return h('button', {
          key: g2, class: 'rowitem', onClick: () => { setListSheet(false); jumpTo(g2); },
        },
          h('span', { class: `dot ${p.state === 'done' ? 'done' : 'muted'}` }),
          h('div', { class: 'grow' },
            h('div', { class: 'rt en' }, g.phrase),
            h('div', { class: 'rs' }, `${g.topic ? g.topic + ' · ' : ''}${g.video.short} · ${g.count}문장${p.state === 'done' ? ' · 완료' : ''}`)),
          h('span', { class: 't-cap dim3 num' }, `${i + 1}`));
      })),
    }) : null);
}
