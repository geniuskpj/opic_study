/* recorder.jsx — record one answer, grade it with the learner's own Gemini key, keep the history.
 *
 * Recordings are kept in IndexedDB (audio-store.js) both as a draft (recorded but not graded yet)
 * and attached to every grading entry, so leaving the page never loses a take. */
import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { answers } from './core.js';
import { hasKey, startRecording, blobToWav, scoreAnswer, aiSettings, saveAiSettings, MODEL_CHOICES } from './score.js';
import { getClip, putClip, delClip, clipKey } from './audio-store.js';
import { useStore } from './router.js';
import { holdScreen } from './keepawake.js';
import {
  Btn, IconBtn, Seg, IconPlay, IconPause, IconClose, IconCheck, IconTrash, IconStar, IconChevL, IconChevR,
} from './ui.jsx';

const fmt = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
const fmtSec = (t) => (isFinite(t) && t > 0 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '0:00');
const draftKey = (examId, qid) => `${examId}|${qid}|draft`;

/* ------------------------------------------------------------------ player */
export function Player({ src, onDelete, label }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const a = audio.current;
    if (!a) return undefined;
    const onTime = () => setPos(a.currentTime || 0);
    const onMeta = () => setDur(a.duration || 0);
    const onEnd = () => { setPlaying(false); setPos(0); };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onMeta);
      a.removeEventListener('ended', onEnd);
    };
  }, [src]);

  if (!src) return null;
  return h('div', { class: 'player' },
    h('audio', { ref: audio, src, preload: 'metadata' }),
    h('button', {
      class: 'pbtn', 'aria-label': playing ? '일시정지' : '재생',
      onClick: () => {
        const a = audio.current;
        if (!a) return;
        if (playing) { a.pause(); setPlaying(false); } else { a.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
      },
    }, playing ? h(IconPause, { size: 18 }) : h(IconPlay, { size: 18 })),
    h('input', {
      class: 'pseek', type: 'range', min: 0, max: 100, step: 0.1,
      value: dur ? (pos / dur) * 100 : 0,
      onInput: (e) => {
        const a = audio.current;
        if (!a || !dur) return;
        a.currentTime = (Number(e.currentTarget.value) / 100) * dur;
        setPos(a.currentTime);
      },
    }),
    h('span', { class: 'ptime num' }, `${fmtSec(pos)} / ${fmtSec(dur)}`),
    label ? h('span', { class: 'plabel' }, label) : null,
    onDelete ? h(IconBtn, { icon: IconTrash, label: '녹음 삭제', sm: true, onClick: onDelete }) : null);
}

/* ------------------------------------------------------------------ recorder */
export function AnswerRecorder({ examId, examTitle, qid, question, topic, level, nextQid, onOpenSettings, showHistory = true }) {
  const st = useStore();
  const entries = answers.entries(examId, qid);
  const latest = entries.length ? entries[entries.length - 1] : null;

  const [phase, setPhase] = useState('idle');          // idle | rec | ready | scoring | error
  const [err, setErr] = useState('');
  const [take, setTake] = useState(null);              // {blob, url, ms} — current, ungraded
  const [urls, setUrls] = useState({});                // audioKey -> objectURL
  const [openId, setOpenId] = useState(latest ? latest.id : null);
  const [histOpen, setHistOpen] = useState(false);
  const [, setSt] = useState(0);
  const [mode, setMode] = useState('voice');
  const [typed, setTyped] = useState('');
  const rec = useRef(null);
  const timer = useRef(0);
  const hold = useRef(null);
  const [warn, setWarn] = useState('');

  const shown = entries.find((e) => e.id === openId) || latest;

  /* restore the draft take + the audio of every stored entry for this question */
  useEffect(() => {
    let dead = false;
    setErr(''); setPhase('idle'); setTake(null); setTyped('');
    (async () => {
      const draft = await getClip(draftKey(examId, qid));
      if (!dead && draft instanceof Blob) setTake({ blob: draft, url: URL.createObjectURL(draft), ms: 0 });
      const next = {};
      for (const e of entries) {
        if (!e.audio) continue;
        if (urls[e.audio]) { next[e.audio] = urls[e.audio]; continue; }
        const blob = await getClip(e.audio);
        if (blob instanceof Blob) next[e.audio] = URL.createObjectURL(blob);
      }
      if (!dead && Object.keys(next).length) setUrls((u) => ({ ...u, ...next }));
    })();
    return () => {
      dead = true;
      clearInterval(timer.current);
      if (rec.current) rec.current.cancel();
      if (hold.current) { hold.current.release(); hold.current = null; }
    };
  }, [examId, qid]);

  useEffect(() => { setOpenId(latest ? latest.id : null); }, [latest && latest.id]);

  const tick = () => { if (rec.current) setElapsed(rec.current.elapsed()); };
  const [elapsed, setElapsed] = useState(0);

  function releaseHold() {
    if (hold.current) { hold.current.release(); hold.current = null; }
  }

  /* The browser mutes getUserMedia tracks and suspends the page when the screen locks, which is why
     recording died with the display off. Keep the screen awake, and if the mic is still interrupted
     (another app took it, permission revoked) stop cleanly and keep the audio captured so far. */
  async function onInterrupt(reason) {
    if (!rec.current) return;
    const ms = rec.current.elapsed();
    clearInterval(timer.current);
    const blob = await rec.current.stop();
    rec.current = null;
    setTake({ blob, url: URL.createObjectURL(blob), ms });
    setPhase('ready');
    setWarn(reason === 'hidden'
      ? '화면이 꺼지거나 다른 앱으로 전환되어 녹음이 중단되었습니다. 여기까지 녹음한 내용은 저장했어요.'
      : '마이크가 일시정지되었습니다 (다른 앱이 마이크를 사용 중일 수 있어요). 여기까지 저장했습니다.');
    await putClip(draftKey(examId, qid), blob);
    releaseHold();
  }

  async function begin() {
    setErr(''); setWarn('');
    try {
      hold.current = await holdScreen();
      if (hold.current.kind === 'none') {
        setWarn('이 브라우저는 화면 잠금 방지를 지원하지 않습니다. 녹음 중에는 화면을 켜 두세요.');
      }
      rec.current = await startRecording({ onInterrupt });
      setElapsed(0);
      timer.current = setInterval(tick, 200);
      setPhase('rec');
    } catch (e) {
      releaseHold();
      setErr('마이크를 사용할 수 없습니다: ' + (e.message || e));
      setPhase('error');
    }
  }

  async function stopRec() {
    clearInterval(timer.current);
    const ms = rec.current ? rec.current.elapsed() : 0;
    const blob = await rec.current.stop();
    rec.current = null;
    releaseHold();
    const url = URL.createObjectURL(blob);
    setTake({ blob, url, ms });
    setPhase('ready');
    /* survive navigation: the draft is stored immediately */
    putClip(draftKey(examId, qid), blob);
  }

  function cancelRec() {
    clearInterval(timer.current);
    if (rec.current) { rec.current.cancel(); rec.current = null; }
    releaseHold();
    setPhase('idle');
  }

  async function discardTake() {
    if (take) URL.revokeObjectURL(take.url);
    setTake(null); setPhase('idle');
    await delClip(draftKey(examId, qid));
  }

  async function submit() {
    setPhase('scoring'); setErr('');
    try {
      /* a fresh take wins; otherwise re-grade the recording of the entry on screen */
      let blob = take ? take.blob : null;
      let ms = take ? take.ms : 0;
      if (!blob && mode === 'voice' && shown && shown.audio) {
        blob = await getClip(shown.audio);
        ms = shown.ms || 0;
      }
      const wav = blob && (!ms || ms > 700) ? await blobToWav(blob) : null;
      const feedback = await scoreAnswer({
        wavBytes: wav, question, examTitle, topic, level,
        questionId: qid, nextQuestionId: nextQid,
        transcriptHint: mode === 'text' ? typed : undefined,
      });
      const id = 'e' + Date.now();
      const reuse = !take && shown && shown.audio ? shown.audio : null;
      const audio = reuse || (mode === 'voice' && take ? clipKey(examId, qid, id) : null);
      if (!reuse && audio && take) await putClip(audio, take.blob);
      answers.add(examId, qid, { id, at: Date.now(), ms, feedback, audio, mode });
      await delClip(draftKey(examId, qid));
      if (audio) setUrls((u) => ({ ...u, [audio]: reuse ? (urls[reuse] || u[audio]) : take.url }));
      setOpenId(id);
      setTake(null);
      setPhase('idle');
    } catch (e) {
      setErr(String(e.message || e));
      setPhase('error');
    }
  }

  async function removeEntry(e) {
    if (!confirm('이 채점 기록을 삭제할까요?')) return;
    if (e.audio) {
      URL.revokeObjectURL(urls[e.audio]);
      await delClip(e.audio);
    }
    answers.remove(examId, qid, e.id);
  }

  const ai = aiSettings();
  const modelRow = h('div', { class: 'modelrow' },
    h('span', { class: 'hint' }, '모델'),
    h('select', {
      value: ai.model, 'aria-label': '채점 모델',
      onChange: (e) => { saveAiSettings({ model: e.currentTarget.value }); setSt((n) => n + 1); },
    }, MODEL_CHOICES.map((m) => h('option', { key: m, value: m }, m))),
    h('span', { class: 'grow' }),
    h(Btn, { onClick: onOpenSettings }, '키·설정'));

  if (!hasKey()) {
    return h('div', { class: 'rec' },
      modelRow,
      h('div', { class: 'row' },
        h('div', { class: 'grow' },
          h('div', { class: 't-b' }, '답변 채점 (Gemini)'),
          h('div', { class: 'hint' }, '내 Gemini API 키를 설정에 넣으면 녹음한 답변을 채점해 줍니다.')),
        h(Btn, { variant: 'primary', onClick: onOpenSettings }, '키 설정')));
  }

  return h('div', { class: 'col', style: 'gap:12px' },
    h('div', { class: 'rec' },
      modelRow,
      h('div', { class: 'row' },
        phase === 'rec'
          ? h('button', { class: 'mic recording', onClick: stopRec, 'aria-label': '녹음 중지' }, h(IconClose, { size: 26 }))
          : h('button', {
            class: 'mic', onClick: begin, 'aria-label': '녹음 시작', disabled: mode === 'text',
          }, h('span', { style: 'font-size:22px' }, '🎙')),
        take ? h(IconBtn, { icon: IconClose, label: '이 녹음 버리기', variant: 'bordered', onClick: discardTake }) : null,
        h('div', { class: 'grow' },
          h('div', { class: 'timer' }, fmt(phase === 'rec' ? elapsed : take ? take.ms : (shown ? shown.ms : 0))),
          h('div', { class: 'hint' },
            phase === 'rec' ? '녹음 중… 답변이 끝나면 정지 버튼을 누르세요'
              : take ? '아직 채점하지 않은 녹음입니다 · 채점하거나 다시 녹음하세요'
                : mode === 'text' ? '글로 답변을 적고 채점할 수 있습니다'
                  : shown ? '🎙 를 다시 눌러 새 녹음을 하고 채점하면 기록이 하나 더 쌓입니다'
                    : '버튼을 눌러 답변을 녹음하세요 (OPIc처럼 크게, 끝까지)')),
        phase === 'rec' ? h('div', { class: 'wave' }, [0, 1, 2, 3, 4, 5, 6].map((i) => h('i', { key: i }))) : null),

      take ? h(Player, { src: take.url, label: '방금 녹음' }) : null,

      h('div', { class: 'row mt3' },
        h(Seg, {
          value: mode,
          options: [{ value: 'voice', label: '녹음' }, { value: 'text', label: '글로 답변' }],
          onChange: (v) => { if (phase === 'rec') cancelRec(); setMode(v); },
        }),
        h('div', { class: 'grow' }),
        (mode === 'text' ? typed.trim().length > 0 : !!take || !!shown)
          ? h(Btn, { variant: 'primary', onClick: submit, disabled: phase === 'scoring' },
            take ? '채점하기' : shown ? '이 녹음으로 다시 채점' : '채점하기') : null,
        phase === 'scoring' ? h('span', { class: 'hint' }, '채점 중… (10~30초)') : null),

      mode === 'text' ? h('div', null,
        h('textarea', {
          class: 'mt3', rows: 5, placeholder: '영어로 답변을 적어 주세요 (문법·구성 위주로 채점됩니다)',
          value: typed, onInput: (e) => setTyped(e.currentTarget.value),
        }),
        h('p', { class: 'hint mt2' }, '글로 채점하면 발음 평가는 제외됩니다. 녹음 모드에서는 발음·억양도 함께 봅니다.')) : null,

      phase === 'rec' ? h('p', { class: 'hint mt2' }, '녹음 중에는 화면이 자동으로 꺼지지 않게 유지합니다.') : null,
      warn ? h('p', { class: 'hint mt2', style: 'color:var(--warn)' }, warn) : null,
      err ? h('p', { class: 'hint mt3', style: 'color:#e5484d' }, err) : null),

    /* ---- history of gradings for this question */
    showHistory && entries.length ? h('div', { class: 'hist' },
      h('div', { class: 'row' },
        h('b', { class: 'grow' }, `채점 기록 ${entries.length}개`),
        h(Btn, { onClick: () => setHistOpen(!histOpen) }, histOpen ? '접기' : '펼치기')),
      histOpen ? h('div', { class: 'list mt3' }, [...entries].reverse().map((e) => h('div', {
        key: e.id, class: `rowitem ${e.id === (shown && shown.id) ? 'cur' : ''}`,
      },
        h('span', { class: `dot ${e.id === (shown && shown.id) ? '' : 'muted'}` }),
        h('button', {
          class: 'grow col', style: 'background:none;border:0;text-align:left;color:inherit;cursor:pointer;min-width:0',
          onClick: () => setOpenId(e.id),
        },
          h('div', { class: 'rt' },
            (e.feedback.level_estimate || {}).band || '채점',
            h('span', { class: 'dim t-s' }, `  ${new Date(e.at).toLocaleString('ko-KR')}`),
            e.mode === 'text' ? h('span', { class: 'badge' }, '글') : null),
          h('div', { class: 'rs nowrap' }, (e.feedback.transcript || '').slice(0, 70))),
        h(IconBtn, { icon: IconTrash, label: '기록 삭제', sm: true, onClick: () => removeEntry(e) })))
      ) : null) : null,

    /* ---- feedback of the selected grading */
    shown ? h(divFeedback, { fb: shown.feedback, audioUrl: shown.audio ? urls[shown.audio] : null,
      onDeleteAudio: () => {
        if (shown.audio) { URL.revokeObjectURL(urls[shown.audio]); delClip(shown.audio); }
        answers.clearAudio(examId, qid, shown.id);
      } }) : null);
}

const divFeedback = ({ fb, audioUrl, onDeleteAudio }) => h('div', { class: 'col', style: 'gap:10px' },
  audioUrl ? h('div', { class: 'rec' }, h('div', { class: 'hint' }, '이 채점의 녹음'), h(Player, { src: audioUrl, onDelete: onDeleteAudio })) : null,
  h(Feedback, { fb }),
  fb.cache ? h('p', { class: 'hint' }, '컨텍스트: ', fb.cache.used
    ? `캐시 재사용 (${fb.cache.cachedTokens || 0} tokens 캐시 · ${fb.cache.promptTokens || 0} tokens 전송)`
    : '캐시 미지원 모델 — 루브릭을 매번 함께 전송') : null);

/* ------------------------------------------------------------------ FACT rendering */
function Status({ s }) {
  const map = { covered: ['st-ok', '충족'], partly: ['st-part', '부분'], missing: ['st-miss', '누락'] };
  const [cls, label] = map[s] || ['', s || ''];
  return h('span', { class: cls }, label);
}

export function Feedback({ fb }) {
  const f = fb.fact || {};
  const A = f.accuracy || {}, C = f.context || {}, T = f.text_type || {}, F = f.function || {};
  const sec = (title, children) => h('div', { class: 'sec' }, h('h4', null, title), children);
  return h('div', { class: 'fb' },
    h('div', { class: 'fb-head' },
      h(IconCheck, { size: 18 }),
      h('b', { class: 'grow' }, 'F-A-C-T 피드백'),
      fb.level_estimate ? h('span', { class: 'lvl' }, h('b', null, fb.level_estimate.band), h('span', { class: 'hint' }, '추정')) : null),
    h('div', { class: 'fb-body' },
      sec('전사 (Transcript)', h('p', { class: 't-s', style: 'white-space:pre-wrap' }, fb.transcript || '(없음)')),

      sec('F · Function', h('div', null,
        h('p', { class: 't-s' }, F.summary || ''),
        (F.elements || []).length ? h('ul', null, F.elements.map((e, i) => h('li', { key: i }, e.element, ' — ', h(Status, { s: e.status })))) : null,
        F.main_gap ? h('p', { class: 't-s' }, h('b', null, '가장 큰 문제: '), F.main_gap) : null)),

      sec('A · Accuracy', h('div', null,
        (A.issues || []).length
          ? h('div', null, A.issues.map((x, i) => h('div', { key: i, class: 'quote' },
            h('div', null, '“', x.quote, '”'),
            h('div', { class: 't-s mt1' }, x.problem),
            h('div', { class: 't-s fix' }, '→ ', x.correction),
            x.rule_ko ? h('div', { class: 'hint' }, x.rule_ko) : null)))
          : h('p', { class: 't-s dim' }, '눈에 띄는 문법 오류는 없습니다.')),
        A.pronunciation ? h('p', { class: 'hint mt2' }, '발음/억양: ', A.pronunciation) : null),

      sec('C · Context & Content', h('div', null,
        h('p', { class: 't-s' }, C.summary || ''),
        (C.needs || []).length ? h('ul', null, C.needs.map((x, i) => h('li', { key: i }, x))) : null)),

      sec('T · Text Type', h('div', null,
        h('p', { class: 't-s' }, T.summary || ''),
        T.type ? h('p', { class: 'hint' }, '유형: ', T.type) : null,
        (T.issues || []).length ? h('ul', null, T.issues.map((x, i) => h('li', { key: i }, x))) : null)),

      fb.level_estimate ? sec('1. 예상 등급 (추정)', h('div', null,
        h('p', { class: 't-s' }, h('b', null, fb.level_estimate.band), ' — ', fb.level_estimate.why || ''),
        h('p', { class: 'hint' }, '※ 공식 점수가 아닌 추정치입니다.'))) : null,

      fb.corrected_answer ? sec('2. 교정·개선 예시 답변', h('p', { class: 't-b', style: 'white-space:pre-wrap' }, fb.corrected_answer)) : null,

      (fb.top3 || []).length ? sec('3. 우선순위 개선 3가지', h('ol', null, fb.top3.map((t, i) => h('li', { key: i },
        h('div', null, h('b', null, t.problem)),
        h('div', { class: 't-s fix' }, '→ ', t.fix),
        h('div', { class: 'hint' }, t.why))))) : null,

      (fb.next_structure || []).length ? sec('4. 다음 답변 구조', h('ol', null, fb.next_structure.map((x, i) => h('li', { key: i }, x)))) : null,

      fb.checkpoint ? sec('5. 진행 상황', h('p', { class: 't-s' }, `완료 #${fb.checkpoint.completed ?? '-'} · 다음 #${fb.checkpoint.next ?? '-'}`)) : null,

      (fb.fillers_used || []).length ? sec('사용한 필러', h('p', { class: 't-s' }, fb.fillers_used.join(' · '))) : null));
}
