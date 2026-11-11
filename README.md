# OPIc Study

Shadowing sentences extracted from OPIc listening videos, plus the expression banks and past
questions from a Korean OPIc practice site — packaged as one static app that works on a phone.

**Live:** https://geniuskpj.github.io/opic_study/

## What is in it

| Tab | Content |
|---|---|
| 홈 | continue where you stopped, groups due for review, today's count, shortcuts |
| 쉐도잉 | 296 sentences from 11 videos as 59 phrase groups — browse **by video** or **by OPIc topic** (13 topics), filter unfinished / starred |
| 문제 | 423 past questions (background survey / unexpected topic / role-play), 94 with model answers, filters by type and topic |
| 자료 | 50 topics of expressions, answer templates, and 10 markdown documents (including the phrases grouped by OPIc topic) |
| ★ 저장 | starred sentences, questions and expressions (Settings exports/imports them) |

The core screen is the **shadowing session**: one phrase group at a time, the sentences stacked
with the target phrase highlighted, a big play button, speech rate, repeat count, an automatic
pause after each sentence for you to repeat it out loud, optional text hiding for recall, and a
self-rating (다시 / 보통 / 외움) that schedules the group for review in 0 / 3 / 7 days.

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
assets/js/app.js           bundle (65 KB)
assets/js/app.css          stylesheet (14 KB), design tokens in :root
data/study-pack.json       the study pack, downloaded once
data/docs.json             pre-rendered markdown documents
data/version.json          version + size + counts
sw.js                      offline cache (network-first for data, SWR for the shell)
app-src/                   source: src/*.jsx, src/style.css, build.mjs
```

Build:

```bash
cd app-src
npm install
npm run build      # writes ../app/assets/js/app.{js,css} and ../app/data/docs.json
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
   the same vocabulary. `work/group_topics.json` holds the mapping.
4. The site data came from its own JSON/JS files, dumped verbatim, then rendered into markdown and
   into the app bundle. Sentences re-used across videos collapse into one study unit with several
   source videos.

## Credits

- Sentence text: 오픽노잼 shadowing uploads — belongs to their authors.
- Questions, expressions and templates: the OPIcGPT study room
  (https://opicgpt-study-room.cianlong5977.chatgpt.site/).
- This repository only reorganises that material for personal study; rights remain with the
  original creators and nothing here is offered for commercial use.
