/* score.js — OPIc answer scoring with the learner's own Gemini API key.
 *
 * The key lives only in this browser (localStorage) and is sent to Google, never anywhere else.
 * Audio is recorded with MediaRecorder, converted to 16 kHz mono WAV in the page (Gemini does not
 * accept webm/opus reliably), and posted inline together with the question.
 */

const AI_KEY = 'opic.ai.v1';
/* gemini-4-hydrogen is on the free tier and accepts inline audio + JSON mode (verified), so it is
   the default; the flash family stays available for speed/limits. */
export const DEFAULT_MODEL = 'gemini-4-hydrogen';
export const MODEL_CHOICES = [
  'gemini-4-hydrogen', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest',
  'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest',
];

export function aiSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(AI_KEY) || 'null') || {};
    return { key: raw.key || '', model: raw.model || DEFAULT_MODEL };
  } catch (e) { return { key: '', model: DEFAULT_MODEL }; }
}
export function saveAiSettings(patch) {
  const next = { ...aiSettings(), ...patch };
  try { localStorage.setItem(AI_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
  return next;
}
export const hasKey = () => !!aiSettings().key;

/* ------------------------------------------------------------------ audio */
/** Record with MediaRecorder.
 *  Returns { stop(), cancel(), startedAt, elapsed(), track, clear() }.
 *  `onInterrupt(reason)` fires when the browser mutes or ends the microphone (screen off, another app
 *  grabbing the audio, permission revoked) so the caller can stop and keep what was captured. */
export function startRecording({ onInterrupt } = {}) {
  const constraints = { audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } };
  return navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const mime = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.start(250);

    const startedAt = Date.now();
    const stopTracks = () => { try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {} };
    const track = stream.getAudioTracks()[0] || null;

    let onVis = null;
    if (onInterrupt) {
      if (track) {
        track.onmute = () => onInterrupt('muted');
        track.onended = () => onInterrupt('ended');
        track.oninactive = () => onInterrupt('inactive');
      }
      onVis = () => { if (document.visibilityState !== 'visible') onInterrupt('hidden'); };
      document.addEventListener('visibilitychange', onVis);
    }
    const clear = () => { if (onVis) document.removeEventListener('visibilitychange', onVis); };

    const finish = () => new Promise((resolve) => {
      mr.onstop = () => { stopTracks(); resolve(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })); };
      try { mr.stop(); } catch (e) { stopTracks(); resolve(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })); }
    });

    return {
      startedAt, track, clear,
      elapsed: () => Date.now() - startedAt,
      stop() { clear(); return finish(); },
      cancel() { clear(); try { mr.stop(); } catch (e) {} stopTracks(); },
    };
  });
}

/** 16-bit PCM mono WAV from Float32 samples. */
export function encodeWav(samples, sampleRate) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] || 0));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const header = new ArrayBuffer(44);
  const dv = new DataView(header);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + out.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true); dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, out.length * 2, true);
  const bytes = new Uint8Array(44 + out.length * 2);
  bytes.set(new Uint8Array(header), 0);
  bytes.set(new Uint8Array(out.buffer), 44);
  return bytes;
}

/** Decode any recorded blob and re-encode as 16-bit PCM mono WAV at 16 kHz. */
export async function blobToWav(blob) {
  const buf = await blob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const decoded = await ctx.decodeAudioData(buf.slice(0));
  const src = decoded.getChannelData(0);
  const rate = decoded.sampleRate;
  const target = 16000;
  const ratio = rate / target;
  const outLen = Math.floor(src.length / ratio);
  const samples = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) samples[i] = src[Math.floor(i * ratio)] || 0;
  ctx.close && ctx.close();
  return encodeWav(samples, target);
}

export function bytesToBase64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

/* ------------------------------------------------------------------ prompt */
const RUBRIC = `You are a strict but constructive OPIc examiner and speaking coach.
You receive (1) the exam question the learner was asked, and (2) the learner's recorded spoken answer.
Grade ONLY what the learner actually said. Never invent, assume or embellish personal history,
events, opinions or feelings that are not in the recording.

Always attach a verbatim transcript first ("transcript"), then organise the feedback exactly as F-A-C-T:

F — Function: did the answer fulfil the communicative purpose of the question? List every element the
    question asked for and mark each "covered", "partly" or "missing". Name the single most important gap.
A — Accuracy: real grammar, vocabulary, collocation, tense, article, preposition, word-form and
    sentence-construction problems. For each: quote the learner's exact phrase, say what is wrong or
    unnatural, give a natural correction, and explain the rule in Korean. Distinguish genuine errors from
    acceptable conversational English — do not invent errors and do not rewrite for style alone.
    Pronunciation, stress and rhythm may be judged only from the audio; when you can hear the audio judge
    them briefly, and say so explicitly if you cannot assess something.
C — Context & Content: relevance, specificity, supporting detail, development, chronology, examples,
    internal consistency. Point out where a concrete detail or example is missing — but never supply one
    yourself.
T — Text Type: organisation, coherence, transitions, fluency, pacing, and whether it sounds like natural
    spoken English for that task type (description, routine, past experience, comparison, issue/opinion,
    role-play). Flag awkward sequencing, disconnected points, repetition or essay-like rehearsal.

Then always add all of these:
1. level_estimate: an IL/IM/IH/AL-style estimate with a short evidence-based reason; label it clearly as
   an estimate, not an official score.
2. corrected_answer: a corrected, improved sample answer in natural spoken English that uses ONLY the
   information the learner actually gave and preserves their meaning.
3. top3: the three highest-impact improvements; each names the problem, gives a concrete fix and says why
   it matters.
4. next_structure: a short sequence of content beats to use on the next attempt, appropriate to the
   question type (a scaffold, not a fabricated answer).
5. checkpoint: the question id just completed and the next question id.

Filler note: natural fillers such as "Let me think for a second.", "That's a tough question.",
"You know...", "Well, I'd say...", "The thing is...", "Let me rephrase that." are legitimate strategy —
report them in fillers_used and never count them as errors. Only flag them when they are repeated
mechanically or used unnaturally.
Avoid generic praise: every comment must point at a phrase, an omitted task element or another
identifiable feature of the learner's answer. Be strict, specific and constructive.

Write all explanations, labels and prose in KOREAN, but keep English quotes, corrections and the
corrected sample answer in English.

Return ONLY this JSON (no markdown fences):
{
 "transcript": "<verbatim English transcript>",
 "fact": {
   "function": {"summary":"<Korean>","elements":[{"element":"<what the question asked>","status":"covered|partly|missing"}],"main_gap":"<Korean>"},
   "accuracy": {"issues":[{"quote":"<learner's exact words>","problem":"<Korean>","correction":"<English>","rule_ko":"<Korean rule>"}],"pronunciation":"<Korean note or '오디오로 평가 불가'>"},
   "context": {"summary":"<Korean>","needs":["<Korean>"]},
   "text_type": {"summary":"<Korean>","type":"<description|routine|past|comparison|issue|role-play>","issues":["<Korean>"]}
 },
 "level_estimate": {"band":"<IL|IM1|IM2|IM3|IH|AL>","why":"<Korean>"},
 "corrected_answer": "<English>",
 "top3": [{"problem":"<Korean>","fix":"<English/Korean>","why":"<Korean>"}],
 "next_structure": ["<beats in order>"],
 "checkpoint": {"completed":"<id>","next":"<id>"},
 "fillers_used": ["<filler>"]
}`;

/** Appended to the rubric ONLY inside an explicitly cached prefix: Gemini requires >=1024 tokens
 *  to cache, and a worked example plus the filler policy both improve consistency. */
const RUBRIC_EXTRA = `

WORKED EXAMPLE (follow this shape exactly)
Question: "Tell me about your favorite cafe. What does it look like, and what do you usually do there?"
Learner answer: "I go to cafe near my home. It is cozy and quiet. I usually drink latte and talk my friend. The staffs are kind."
Expected output fragments:
- function.elements: [{"element":"describe the cafe","status":"covered"},
  {"element":"what you usually do there","status":"partly"}] and main_gap about the missing routine detail.
- accuracy.issues: {"quote":"I go to cafe near my home","problem":"가산명사 단수 앞에 관사가 빠졌습니다",
  "correction":"I go to a cafe near my home","rule_ko":"셀 수 있는 명사 단수형에는 a/an 또는 the가 필요합니다"},
  {"quote":"talk my friend","problem":"talk는 자동사라 목적어 앞에 전치사가 필요합니다",
  "correction":"talk with my friend","rule_ko":"talk to/with + 사람 형태로 씁니다"},
  {"quote":"The staffs are kind","problem":"staff는 집합명사로 복수형을 쓰지 않습니다",
  "correction":"The staff are kind","rule_ko":"staff, police 등은 단수형 그대로 복수 취급합니다"}.
- context.needs: ["매장의 구체적인 모습", "방문 빈도나 시간대"] (never invent these for the learner).
- text_type: type "description", issues about missing closing sentence and the repeated "I ..." openings.
- level_estimate: IM2 with a reason tied to the lack of specific detail.
- corrected_answer: uses ONLY the cafe, the cozy/quiet impression, the latte, the friend and the kind staff.
- next_structure: ["which cafe and where", "what it looks like", "my usual routine there", "why I keep going"]

STYLE RULES
- Every comment must point at a quoted phrase, an omitted question element or another identifiable feature.
- No generic praise, no invented biography, no stylistic rewrites of correct English.
- Keep the Korean explanations short and practical: what is wrong, the fix, the rule.
- If the answer is short (<20 seconds of speech), say so in F and explain the length target for the level.
- Prefer 6-12 accuracy issues at most: the ones that matter, ordered by impact.`;
/* ------------------------------------------------------------------ context cache */
const CACHE_STATE = 'opic.ai.cache.v1';
const TTL_MS = 3600 * 1000;

function cacheState() {
  try { return JSON.parse(localStorage.getItem(CACHE_STATE) || '{}') || {}; }
  catch (e) { return {}; }
}
function saveCacheState(st) { try { localStorage.setItem(CACHE_STATE, JSON.stringify(st)); } catch (e) {} }

export function cacheInfo(model) {
  const st = cacheState();
  const cur = (st.active || {})[model];
  return {
    name: cur && cur.exp > Date.now() ? cur.name : null,
    tokens: cur ? cur.tokens : 0,
    expiresIn: cur ? Math.max(0, cur.exp - Date.now()) : 0,
    unsupported: ((st.unsupported || {})[model]) || null,
  };
}

export function forgetCache(model) {
  const st = cacheState();
  if (st.active) delete st.active[model];
  if (st.unsupported) delete st.unsupported[model];
  saveCacheState(st);
}

/** Create (or reuse) an explicit cache for the rubric and return "cachedContents/…" or null.
 *  Models that cannot cache (gemini-4-hydrogen) or whose prefix is under the 1024-token minimum are
 *  remembered as unsupported so we never pay for a failing call twice. */
export async function ensureContextCache(model) {
  const { key } = aiSettings();
  if (!key) return null;
  const st = cacheState();
  st.active = st.active || {}; st.unsupported = st.unsupported || {};
  if (st.unsupported[model]) return null;
  const cur = st.active[model];
  if (cur && cur.exp > Date.now() + 60000) return cur.name;

  const url = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${encodeURIComponent(key)}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${model}`,
        systemInstruction: { parts: [{ text: RUBRIC + RUBRIC_EXTRA }] },
        ttl: '3600s', displayName: 'opic-fact-rubric',
      }),
    });
  } catch (e) { return null; }
  if (!res.ok) {
    let msg = '';
    try { msg = ((await res.json()).error || {}).message || ''; } catch (e) { /* ignore */ }
    if (/not supported|too small|not available|permission|invalid/i.test(msg)) {
      st.unsupported[model] = msg.slice(0, 140);
      delete st.active[model];
      saveCacheState(st);
    }
    return null;
  }
  const j = await res.json();
  const ttl = String(j.ttl || '3600s').replace('s', '');
  st.active[model] = {
    name: j.name, tokens: (j.usageMetadata || {}).totalTokenCount || 0,
    exp: Date.now() + Math.min(TTL_MS, (Number(ttl) || 3600) * 1000),
  };
  delete st.unsupported[model];
  saveCacheState(st);
  return j.name;
}

async function post(model, key, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try {
      const j = await res.json();
      msg = (j.error && j.error.message) || msg;
      if (res.status === 400 && /API key not valid/i.test(msg)) msg = 'API 키가 올바르지 않습니다';
      if (res.status === 403) msg = 'API 키 권한이 없습니다 (Generative Language API 사용 설정 필요)';
      if (res.status === 429) msg = '무료 할당량을 초과했습니다. 잠시 후 다시 시도하세요';
    } catch (e) { /* keep default */ }
    throw new Error(msg);
  }
  return res.json();
}

/** Score one spoken answer. wavBytes = Uint8Array (16 kHz mono PCM WAV). */
export async function scoreAnswer({ wavBytes, question, examTitle, topic, level, questionId, nextQuestionId, transcriptHint }) {
  const { key, model } = aiSettings();
  if (!key) throw new Error('설정에서 Gemini API 키를 먼저 입력하세요');
  const context = [
    `EXAM: ${examTitle || 'OPIc mock exam'}`,
    `QUESTION ID: ${questionId ?? 'n/a'}${nextQuestionId != null ? ` (next question id: ${nextQuestionId})` : ''}`,
    topic ? `TOPIC: ${topic}` : '',
    level ? `TARGET LEVEL: ${level}` : '',
    `QUESTION: ${question}`,
    wavBytes ? 'The learner\'s spoken answer is attached as audio.'
      : transcriptHint ? 'The learner typed the answer instead of recording it: grade the text, and state clearly that pronunciation cannot be assessed.'
        : 'No answer material was provided.',
    transcriptHint ? `LEARNER'S TYPED ANSWER:\n${transcriptHint}` : '',
  ].filter(Boolean).join('\n');

  const contents = [{
    role: 'user',
    parts: [
      { text: context },
      ...(wavBytes ? [{ inline_data: { mime_type: 'audio/wav', data: bytesToBase64(wavBytes) } }] : []),
    ],
  }];
  const generationConfig = { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: 'application/json' };

  /* the rubric is the same on every request: send it once as a cached prefix and reference its id,
     so later calls skip the prefill. Models without explicit caching get it inline. */
  let cacheName = await ensureContextCache(model);
  const run = (cached) => post(model, key, cached
    ? { cachedContent: cached, contents, generationConfig }
    : { systemInstruction: { parts: [{ text: RUBRIC }] }, contents, generationConfig });

  let data;
  try {
    data = await run(cacheName);
  } catch (e) {
    if (cacheName && /cached content|not found|expired|invalid/i.test(String(e.message))) {
      forgetCache(model);                      // the cache expired server-side: retry inline
      cacheName = null;
      data = await run(null);
    } else throw e;
  }
  const cand = (data.candidates || [])[0] || {};
  const text = (cand.content && cand.content.parts || []).map((p) => p.text || '').join('');
  if (!text) {
    throw new Error(cand.finishReason === 'MAX_TOKENS'
      ? '응답이 토큰 한도에서 잘렸습니다 — 더 큰 출력 한도가 필요합니다 (finishReason: MAX_TOKENS)'
      : '응답이 비어 있습니다 (finishReason: ' + (cand.finishReason || '?') + ')');
  }
  const clean = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();
  let parsed;
  try { parsed = JSON.parse(clean); } catch (e) { throw new Error('피드백 형식을 읽을 수 없습니다'); }
  parsed.model = model;
  parsed.at = Date.now();
  parsed.cache = {
    used: !!cacheName,
    name: cacheName || null,
    cachedTokens: (data.usageMetadata || {}).cachedContentTokenCount || 0,
    promptTokens: (data.usageMetadata || {}).promptTokenCount || 0,
  };
  return parsed;
}
