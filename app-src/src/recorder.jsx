/* recorder.jsx — record one answer, send it for scoring, show the F-A-C-T feedback.
   Scoring uses the learner's own Gemini key (Settings); the request goes straight to Google. */
import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { answers } from './core.js';
import { hasKey, startRecording, blobToWav, scoreAnswer } from './score.js';
import { Btn, IconBtn, Chip, Seg, IconPlay, IconClose, IconCheck, IconGear } from './ui.jsx';

const fmt = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

export function AnswerRecorder({ examId, examTitle, qid, question, topic, level, nextQid, onOpenSettings, compact }) {
  const saved = answers.get(examId, qid);
  const [phase, setPhase] = useState(saved ? 'done' : 'idle');   // idle | rec | ready | scoring | done | error
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState('');
  const [fb, setFb] = useState(saved ? saved.feedback : null);
  const [mode, setMode] = useState('voice');                     // voice | text
  const [typed, setTyped] = useState('');
  const rec = useRef(null);
  const timer = useRef(0);
  const audioUrl = useRef(null);
  const [audio, setAudio] = useState(null);

  useEffect(() => {
    setPhase(saved ? 'done' : 'idle'); setFb(saved ? saved.feedback : null); setErr('');
    setAudio(null); setElapsed(0); setTyped('');
    if (audioUrl.current) { URL.revokeObjectURL(audioUrl.current); audioUrl.current = null; }
    return () => { clearInterval(timer.current); if (rec.current) rec.current.cancel(); };
  }, [examId, qid]);

  const tick = () => { if (rec.current) setElapsed(rec.current.elapsed()); };

  async function begin() {
    setErr('');
    try {
      rec.current = await startRecording();
      setElapsed(0);
      timer.current = setInterval(tick, 200);
      setPhase('rec');
    } catch (e) {
      setErr('마이크를 사용할 수 없습니다: ' + (e.message || e));
      setPhase('error');
    }
  }
  async function stopRec() {
    clearInterval(timer.current);
    const blob = await rec.current.stop();
    rec.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = URL.createObjectURL(blob);
    setAudio({ url: audioUrl.current, blob, ms: elapsed });
    setPhase('ready');
  }
  function cancelRec() {
    clearInterval(timer.current);
    if (rec.current) { rec.current.cancel(); rec.current = null; }
    setPhase('idle'); setElapsed(0);
  }

  async function submit() {
    setPhase('scoring'); setErr('');
    try {
      let wav = null;
      if (mode === 'voice' && audio && audio.blob && audio.ms > 800) wav = await blobToWav(audio.blob);
      const feedback = await scoreAnswer({
        wavBytes: wav, question, examTitle, topic, level,
        questionId: qid, nextQuestionId: nextQid,
        transcriptHint: mode === 'text' ? typed : undefined,
      });
      answers.save(examId, qid, { at: Date.now(), ms: audio ? audio.ms : 0, feedback });
      setFb(feedback); setPhase('done');
    } catch (e) {
      setErr(String(e.message || e)); setPhase('error');
    }
  }

  if (!hasKey()) {
    return h('div', { class: 'rec' },
      h('div', { class: 'row' },
        h('div', { class: 'grow' },
          h('div', { class: 't-b' }, '답변 채점 (Gemini)'),
          h('div', { class: 'hint' }, '내 Gemini API 키를 설정에 넣으면 녹음한 답변을 채점해 줍니다.')),
        h(Btn, { variant: 'primary', onClick: onOpenSettings }, '키 설정')));
  }

  return h('div', { class: 'col', style: 'gap:12px' },
    h('div', { class: 'rec' },
      h('div', { class: 'row' },
        phase === 'rec'
          ? h('button', { class: 'mic recording', onClick: stopRec, 'aria-label': '녹음 중지' }, h(IconClose, { size: 26 }))
          : phase === 'ready' || phase === 'scoring'
            ? h(IconBtn, { icon: IconClose, label: '다시 녹음', variant: 'bordered', onClick: () => { setPhase('idle'); setAudio(null); } })
            : h('button', { class: 'mic', onClick: begin, 'aria-label': '녹음 시작', disabled: mode === 'text' }, h('span', { style: 'font-size:22px' }, '🎙')),
        h('div', { class: 'grow' },
          h('div', { class: 'timer' }, fmt(phase === 'rec' ? elapsed : audio ? audio.ms : 0)),
          h('div', { class: 'hint' },
            phase === 'rec' ? '녹음 중… 답변이 끝나면 정지 버튼을 누르세요'
              : audio ? '녹음 완료 · 재생해 보거나 바로 채점하세요'
                : mode === 'text' ? '글로 답변을 적고 채점할 수 있습니다'
                  : '버튼을 눌러 답변을 녹음하세요 (OPIc처럼 크게, 끝까지)')),
        phase === 'rec' ? h('div', { class: 'wave' }, [0, 1, 2, 3, 4, 5, 6].map((i) => h('i', { key: i }))) : null),
      audio ? h('audio', { src: audio.url, controls: true, style: 'width:100%;margin-top:10px' }) : null,
      h('div', { class: 'row mt3' },
        h(Seg, {
          value: mode,
          options: [{ value: 'voice', label: '녹음' }, { value: 'text', label: '글로 답변' }],
          onChange: (v) => { if (phase === 'rec') cancelRec(); setMode(v); },
        }),
        h('div', { class: 'grow' }),
        (phase === 'ready' || phase === 'done' || phase === 'error')
          ? h(Btn, { variant: 'primary', onClick: submit, disabled: phase === 'scoring' }, fb ? '다시 채점' : '채점하기') : null,
        phase === 'scoring' ? h('span', { class: 'hint' }, '채점 중… (10~30초)') : null),
      mode === 'text' ? h('textarea', {
        class: 'mt3', rows: 5, placeholder: '영어로 답변을 적어 주세요 (문법·구성 위주로 채점됩니다)',
        value: typed, onInput: (e) => setTyped(e.currentTarget.value),
      }) : null,
      err ? h('p', { class: 'hint mt3', style: 'color:#e5484d' }, err) : null,
      fb ? h('p', { class: 'hint mt2' }, `채점 완료 · ${new Date(fb.at).toLocaleString('ko-KR')} · 모델 ${fb.model || ''}`) : null),

    fb ? h(Feedback, { fb }) : null);
}

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
