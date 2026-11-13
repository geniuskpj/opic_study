# OPIc Study

Shadowing sentences extracted from OPIc listening videos, plus the expression banks and past
questions from a Korean OPIc practice site — packaged as one static app that works on a phone.

**Live:** https://geniuskpj.github.io/opic_study/

## What is in it

| Tab | Content |
|---|---|
| 홈 | continue where you stopped, groups due for review, today's count, shortcuts |
| 문장 | **one searchable list of all 365 items** — 59 shadowing phrase groups (296 sentences), 151 선택주제 sentences, 72 master patterns, 83 model answers; filter by source and by OPIc topic (13) |
| 문제 | 423 past questions (94 with model answers) + **7 video mock exams (98 spoken questions, transcribed)** + the book's 34 exam sets — every mock-exam question can be answered, recorded and **graded by Gemini** |
| 자료 | 50 topics of expressions, answer templates, and 12 markdown documents |
| ★ 저장 | starred sentences, questions and expressions (Settings exports/imports them) |

The core screen is the **shadowing session**: one phrase group at a time, the sentences stacked
with the target phrase highlighted, a big play button, speech rate, repeat count, an automatic
pause after each sentence for you to repeat it out loud, optional text hiding for recall, and a
self-rating (다시 / 보통 / 외움) that schedules the group for review in 0 / 3 / 7 days.

## Mock-exam scoring (bring your own Gemini key)

Every question you can answer has a recorder — the mock exams (video exams and the book's 34 sets)
**and every question in the 문제 tab**:

1. press 🎙, answer out loud for as long as you like (an OPIc answer is 1–2 minutes), stop;
2. play it back, re-record if you want, and press **채점하기** — you can grade question by question,
   there is no need to finish the whole exam first;
3. you can switch the grading model right there in the recorder — `gemini-4-hydrogen` is the
   default (free tier, verified to accept inline audio + JSON mode), with the flash family as
   alternatives. Recording again after a grading simply adds a new evaluation to the history;
4. the audio is converted **in the page** to 16 kHz mono WAV and sent to Gemini with the question;
   typed answers ("글로 답변") are graded too, minus pronunciation.

**The rubric is cached when the API allows it**: the prompt prefix (rubric + a worked example, which
also pushes it past Gemini's 1024-token caching minimum) is registered once as a `cachedContents`
entry and later calls reference that id instead of re-uploading the prompt. Verified against the live
API: `gemini-4-hydrogen` reports *explicit caching is not supported*, and the flash models accept the
size but the free tier answers `TotalCachedContentStorageTokensPerModelFreeTier limit`. The app
detects this, remembers it per model, falls back to sending the rubric inline and shows the state in
Settings and under each feedback block — so it starts using the cache the moment the quota allows.

**List state and scroll survive navigation**: search text, filters and the scroll offset of a list
(문제, 문장, …) are remembered per tab, so the back button returns you to the same result set and the
same offset instead of a random position.

**Nothing is lost when you navigate away**: the take is written to IndexedDB the moment you stop
recording (a draft), and every grading keeps its own clip. Each question keeps a **history** of
gradings — date, level band and transcript — which you can reopen and delete individually.
Recordings play in a custom player (play/pause, seek, time) that is visible in both themes.
Capacity lives in Settings → 녹음 · 저장 공간 (usage/quota from `navigator.storage.estimate()`,
a persistent-storage request, delete-recordings-only and delete-all-results).

Why IndexedDB and not localStorage: `localStorage` is capped at about 5 MB per origin, and audio is
binary — a one-minute answer is ~180 KB as Opus, so base64 in localStorage would fill the quota
after a couple of takes and evict your stars and progress. IndexedDB stores Blobs natively against a
quota that is a share of free disk (this build reports ~10 GB), which is the right place for audio.

The feedback follows the F-A-C-T framework — **F**unction (was every part of the question answered?),
**A**ccuracy (real errors, quoted with a correction and the rule in Korean), **C**ontext & Content,
**T**ext Type — followed by a verbatim transcript, an IL/IM/IH/AL-style level estimate, a corrected
sample answer that uses only what you actually said, the top three improvements, a structure for the
next attempt, and a progress checkpoint. Natural fillers (*Let me think for a second*, *That's a tough
question*, *Well, I'd say…*) are reported as strategy, never penalised.

Your API key is stored **only in this browser** (`localStorage`, `opic.ai.v1`) and is sent directly to
Google's API from the page — there is no server in between and nothing is uploaded anywhere else. A
model picker, a connection test and mic/audio diagnostics live in Settings. Answers and feedback are
kept per exam+question, so an exam resumes at the first question you have not graded yet.

## Data is downloaded once

- the whole pack is one 0.56 MB JSON file (`data/study-pack.json`), streamed on the first visit
  with a progress bar and then kept in `localStorage`; later visits start instantly
- `data/version.json` is checked in the background — if the pack changes, a banner offers a re-download
- the 10 documents (`data/docs.json`, 0.75 MB) are fetched only when you open the Docs tab
- a service worker caches the shell and the JSON so the app opens offline
- your stars and progress are versioned, keyed by stable content hashes (not array positions), and
  can be exported/imported as JSON. Nothing is uploaded anywhere.

## Stack

Preact + plain CSS custom properties, bundled with esbuild — no Tailwind, no framework router,
no runtime markdown parser (documents are rendered to HTML at build time).

```
index.html                 app shell (theme applied before first paint)
assets/js/app.js           bundle (74 KB)
assets/js/app.css          stylesheet (14 KB), design tokens in :root
data/study-pack.json       the study pack, downloaded once
data/docs.json             pre-rendered markdown documents
data/version.json          version + size + counts
md/*.md                    markdown documents (incl. mock-exams.md, kangjiwan-material.md)
sw.js                      offline cache (network-first everywhere, cache as offline fallback)
app-src/                   source: src/*.jsx, src/style.css, build.mjs
```

The documents are regenerated from the extracted data on every build: `sentences-by-phrase.md`,
`sentences-plain.md`, `phrases-by-topic.md`, `mock-exams.md`, `kangjiwan-material.md`, the five
`site-*.md` files and the pack index.

Build:

```bash
cd app-src
npm install
npm run build      # writes assets/js/app.{js,css} and data/docs.json (repo root is the site)
```

## How the content was produced

1. Every video is a slide deck. Keyframes were found with ffmpeg scene detection (200 for the
   one-hour compilation, ~30–50 for the 20-sentence ones) and OCR'd.
2. Duplicate frames were collapsed so each sentence appears once, in video order. A QA pass
   dropped non-sentence rows (menu boards, keyboard mash, promo hooks) and repaired truncated text.
3. Sentences were grouped by the phrase they share (3–4 per group); the grouping was verified in
   code — the phrase's key word must really appear in at least 75% of the group's sentences.
3b. Every group was then filed under one of the site's own OPIc topics (여가시간, 교통수단, 재활용,
   카페가기, 기술 …) so the sentences, the questions and the expression lists can be browsed with
   the same vocabulary.
4. The seven 실전 모의고사 videos only show "Question N of 15" — the interviewer's questions exist
   in the audio alone, so each exam's audio was chunked and transcribed (Korean commentary ignored),
   giving 14 questions per exam (question 1, the self-introduction, is skipped in every video).
5. Three 강지완 오픽TV videos have a different slide format each (Q&A answers, 150 numbered 선택주제
   sentences with translations, 72 master patterns with slots), so each was OCR'd with its own
   prompt and de-duplicated by text; gaps were re-sampled more densely and merged.
6. The site data came from its own JSON/JS files, dumped verbatim, then rendered into markdown and
   into the app bundle. Sentences re-used across videos collapse into one study unit with several
   source videos.

## Credits

- Sentence text: 오픽노잼 shadowing uploads — belongs to their authors.
- Questions, expressions and templates: the OPIcGPT study room
  (https://opicgpt-study-room.cianlong5977.chatgpt.site/).
- This repository only reorganises that material for personal study; rights remain with the
  original creators and nothing here is offered for commercial use.
