#!/usr/bin/env node
/**
 * build.mjs — esbuild bundler for the OPIc study app (NO Tailwind, NO Vite).
 *
 * - JSX via preact/jsx-runtime (--jsx=automatic)
 * - CSS bundled as one file (esbuild handles @import + nesting)
 * - markdown with /doc/<name>.md URLs is pre-rendered at build time into data/docs.json
 *
 * usage: node build.mjs [--watch]
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.dirname(HERE);               // the published site = repo root (index.html lives here)
// markdown source for data/docs.json: MD_DIR when building from the workspace, else keep the committed copy
const MD_DIR = process.env.MD_DIR || path.join(OUT, 'md-src');
const WATCH = process.argv.includes('--watch');

fs.mkdirSync(path.join(OUT, 'assets', 'js'), { recursive: true });

// ---------------------------------------------------------------- markdown -> json
// Rendering at build time keeps a parser out of the browser bundle.
function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  let list = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*\|/.test(raw) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      closeList();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const head = cells(raw);
      const body = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) { body.push(cells(lines[i])); i++; }
      i--;
      out.push('<table><thead><tr>' + head.map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>' +
        body.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    let m;
    if ((m = raw.match(/^(#{1,4})\s+(.*)$/))) { closeList(); const n = m[1].length; out.push(`<h${n}>${inline(m[2])}</h${n}>`); }
    else if (/^\s*>\s?/.test(raw)) { closeList(); out.push(`<blockquote>${inline(raw.replace(/^\s*>\s?/, ''))}</blockquote>`); }
    else if ((m = raw.match(/^\s*[-*]\s+(.*)$/))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = raw.match(/^\s*\d+\.\s+(.*)$/))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if (/^\s*---+\s*$/.test(raw)) { closeList(); out.push('<hr>'); }
    else if (!raw.trim()) closeList();
    else { closeList(); out.push(`<p>${inline(raw)}</p>`); }
  }
  closeList();
  return out.join('\n');
}

function buildDocs() {
  const mdDir = MD_DIR;
  if (!fs.existsSync(mdDir)) {
    console.log('docs.json  markdown source not found (' + mdDir + ') — keeping the committed copy');
    return;
  }
  const files = fs.readdirSync(mdDir).filter((f) => f.endsWith('.md'));
  const docs = files.map((f) => {
    const html = mdToHtml(fs.readFileSync(path.join(mdDir, f), 'utf8'));
    const title = (html.match(/<h1>([^<]+)<\/h1>/) || [, f])[1];
    const headings = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]);
    return { file: f, title, headings, html, bytes: html.length };
  });
  docs.sort((a, b) => (a.file === 'README.md' ? -1 : b.file === 'README.md' ? 1 : a.file.localeCompare(b.file)));
  fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'data', 'docs.json'), JSON.stringify(docs));
  const kb = (fs.statSync(path.join(OUT, 'data', 'docs.json')).size / 1024).toFixed(0);
  console.log(`docs.json  ${docs.length} documents, ${kb} KB`);
}

// ---------------------------------------------------------------- bundle
const NODE_PATHS = [
  path.join(OUT, 'node_modules'),
  path.join(OUT, '..', 'node_modules'),
].filter((p) => fs.existsSync(p));

const opts = {
  entryPoints: [path.join(HERE, 'src', 'main.jsx')],
  nodePaths: NODE_PATHS,
  bundle: true,
  format: 'esm',
  target: ['es2020'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  outfile: path.join(OUT, 'assets', 'js', 'app.js'),
  minify: !WATCH,
  sourcemap: WATCH ? 'inline' : false,
  legalComments: 'none',
  loader: { '.css': 'css' },
  logLevel: 'info',
};
const cssOpts = { ...opts, entryPoints: [path.join(HERE, 'src', 'style.css')], outfile: path.join(OUT, 'assets', 'js', 'app.css') };

buildDocs();
if (WATCH) {
  const ctx1 = await esbuild.context(opts);
  const ctx2 = await esbuild.context(cssOpts);
  await ctx1.watch(); await ctx2.watch();
  console.log('watching…');
} else {
  await esbuild.build(opts);
  await esbuild.build(cssOpts);
  const size = (p) => (fs.statSync(p).size / 1024).toFixed(0) + ' KB';
  console.log('assets/js/app.js  ' + size(opts.outfile));
  console.log('assets/js/app.css ' + size(cssOpts.outfile));
}
