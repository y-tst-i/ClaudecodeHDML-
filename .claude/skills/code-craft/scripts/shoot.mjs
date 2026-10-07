#!/usr/bin/env node
// shoot.mjs — コードで作った成果物を「撮って」、一覧シートとFB表を作る。
//
//   node shoot.mjs <URL | HTMLファイル | ディレクトリ> [options]
//
//   --mode auto|page|time|slides   撮り方（auto: ページが公開しているAPIから判定）
//   --times 0,2.5,5                time モード：撮る秒数（ページに window.__seek(t) が必要）
//   --viewports desktop,mobile     page モード：画面サイズ（desktop=1440x900, mobile=390x844, WxH も可）
//   --full                         page モード：ページ全体を縦に撮る
//   --size 1920x1080               time/slides モードのビューポート（既定 1280x720 / 1920x1080）
//   --out out/shots/v1             出力先（既定 out/shots/<日時>）
//   --wait 400                     各ショット前の待ち時間(ms)
//   --pdf                          slides モード：deck.pdf も書き出す
//   --label "v1"                   シートの見出し
//
// ページ側の約束（あれば使う、なくても page モードで撮れる）
//   window.__seek(t)                     時刻 t の1フレームを描く（決定論的に）
//   window.__slides = { count, go(i) }   i 枚目を表示する
//
// 出力: 各PNG / sheet.png（コンタクトシート） / review.md（FB表）
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const flag = (k) => argv.includes(`--${k}`);
const VALUED = ['mode', 'times', 'viewports', 'size', 'out', 'wait', 'label'];
const target = argv.find((a, i) => !a.startsWith('--') && !VALUED.includes((argv[i - 1] ?? '').slice(2)));
if (!target) { console.error('usage: node shoot.mjs <url|file|dir> [--mode time --times 0,1,2]'); process.exit(1); }

// playwright はプロジェクト → グローバルの順で探す（スキル単体でどのリポジトリでも動くように）
async function loadPlaywright() {
  const bases = [path.join(process.cwd(), 'x.js')];
  try { bases.push(path.join(execSync('npm root -g').toString().trim(), 'x.js')); } catch {}
  for (const b of bases) {
    try { const m = await import(pathToFileURL(createRequire(b).resolve('playwright')).href); return m.chromium ? m : m.default; } catch {}
  }
  console.error('playwright が見つかりません。`npm i -D playwright` してください（ブラウザは既存のものを使います）。');
  process.exit(1);
}

// ローカルのファイル/ディレクトリは簡易サーバで配信（file:// だと ES Modules が動かないため）
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' };
async function serve(p) {
  const abs = path.resolve(p);
  const root = statSync(abs).isDirectory() ? abs : path.dirname(abs);
  const entry = statSync(abs).isDirectory() ? 'index.html' : path.basename(abs);
  const server = createServer(async (req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(root, u === '/' ? entry : u);
    if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' });
    res.end(await readFile(f));
  });
  await new Promise((r) => server.listen(0, r));
  return { url: `http://localhost:${server.address().port}/${entry}`, close: () => server.close() };
}

const isUrl = /^https?:\/\//.test(target);
const srv = isUrl ? null : await serve(target);
const url = isUrl ? target : srv.url;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
const out = opt('out', `out/shots/${stamp}`);
const wait = Number(opt('wait', 400));
await mkdir(out, { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const parseSize = (s) => { const [w, h] = s.split('x').map(Number); return { width: w, height: h }; };
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 }, tablet: { width: 834, height: 1194 } };

async function open(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts?.ready);
  return page;
}
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

const shots = [];
let mode = opt('mode', 'auto');
let page = await open(opt('size') ? parseSize(opt('size')) : { width: 1280, height: 720 });
if (mode === 'auto') {
  mode = await page.evaluate(() => (typeof window.__seek === 'function' ? 'time' : window.__slides ? 'slides' : 'page'));
}

if (mode === 'time') {
  const times = (opt('times') ?? '0,1,2,3').split(',').map(Number);
  for (const t of times) {
    await page.evaluate((t) => window.__seek(t), t);
    await settle(page);
    const file = `t${t.toFixed(2).padStart(6, "0")}.png`;
    await page.screenshot({ path: path.join(out, file) });
    shots.push({ id: `${t}s`, file });
  }
} else if (mode === 'slides') {
  await page.close();
  page = await open(parseSize(opt('size', '1920x1080')));
  const count = await page.evaluate(() => window.__slides?.count ?? document.querySelectorAll('[data-slide], section').length);
  for (let i = 0; i < count; i++) {
    await page.evaluate((i) => (window.__slides ? window.__slides.go(i) : document.querySelectorAll('[data-slide], section')[i].scrollIntoView()), i);
    await page.waitForTimeout(wait);
    await settle(page);
    const file = `s${String(i + 1).padStart(2, '0')}.png`;
    await page.screenshot({ path: path.join(out, file) });
    shots.push({ id: `S${i + 1}`, file });
  }
  if (flag('pdf')) {
    const { width, height } = parseSize(opt('size', '1920x1080'));
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: path.join(out, 'deck.pdf'), width: `${width}px`, height: `${height}px`, printBackground: true });
  }
} else {
  await page.close();
  for (const name of (opt('viewports') ?? 'desktop,mobile').split(',')) {
    page = await open(VIEWPORTS[name] ?? parseSize(name));
    await page.waitForTimeout(wait);
    // 横スクロールのはみ出しは撮っても気づきにくいので数値で検出する
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (overflow > 0) errors.push(`[${name}] 横にはみ出しています: ${overflow}px`);
    const file = `${name}.png`;
    await page.screenshot({ path: path.join(out, file), fullPage: flag('full') });
    shots.push({ id: name, file });
    await page.close();
  }
}

// コンタクトシート：ブラウザで並べて撮る（ffmpeg 等に依存しない）
const label = opt('label', path.basename(out));
const imgs = await Promise.all(shots.map(async (s) => ({ ...s, src: `data:image/png;base64,${(await readFile(path.join(out, s.file))).toString('base64')}` })));
const cols = mode === 'page' ? Math.min(shots.length, 2) : Math.min(shots.length, 4);
const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await sheet.setContent(`<style>body{margin:0;padding:24px;background:#111;color:#eee;font:13px/1.4 system-ui,sans-serif}
h1{font-size:16px;margin:0 0 16px}.g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px;align-items:start}
figure{margin:0}img{max-width:100%;max-height:760px;display:block;outline:1px solid #333}figcaption{padding:8px 0 0;color:#aaa}</style>
<h1>${label} — ${mode} — ${url}</h1><div class="g">${imgs.map((s) => `<figure><img src="${s.src}"><figcaption>${s.id}</figcaption></figure>`).join('')}</div>`);
await sheet.screenshot({ path: path.join(out, 'sheet.png'), fullPage: true });

const md = `# Review — ${label}\n\n対象: ${url}  \nモード: ${mode}\n\n` +
  (errors.length ? `## ⚠ 検出されたエラー\n${[...new Set(errors)].map((e) => `- ${e}`).join('\n')}\n\n` : '') +
  `| ID | 画 | 自己レビュー（AI） | FB（人） | 対応 |\n|---|---|---|---|---|\n` +
  shots.map((s) => `| ${s.id} | <img src="${s.file}" width="320"> |  |  |  |`).join('\n') + '\n';
await writeFile(path.join(out, 'review.md'), md);

await browser.close();
srv?.close();
console.log(`mode=${mode} shots=${shots.length} errors=${errors.length}`);
if (errors.length) console.log([...new Set(errors)].map((e) => '  ! ' + e).join('\n'));
console.log(`→ ${path.join(out, 'sheet.png')}\n→ ${path.join(out, 'review.md')}`);
