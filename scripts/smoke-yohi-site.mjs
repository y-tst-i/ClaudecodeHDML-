// YOHI サイト（部屋 → 路地 → 印刷工房）の通しテスト。公開先と同じ CSP をかけて、最後まで遊べるか・音が読めるか。
//   npx vite build --config yohi/vite.site.config.js && node scripts/smoke-yohi-site.mjs
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const html = await readFile('out/yohi-site/site.html');
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "connect-src 'self'" }); res.end(html); });
await new Promise((r) => server.listen(0, r));
await mkdir('out/yohi-site/smoke', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:${server.address().port}/`);
await page.waitForFunction(() => window.__site, null, { timeout: 180000 });
const state = () => page.evaluate(() => window.__site.state());
const until = (fn, ms = 240000) => page.waitForFunction(fn, null, { timeout: ms, polling: 200 });
const shot = (n) => page.screenshot({ path: `out/yohi-site/smoke/${n}.png` });

// 場面1：消えているテレビを押す → 隠しチャンネル（暗視カメラ）が点く
await page.mouse.click(1040, 360);
await page.waitForTimeout(300);
const sec = (await state()).secret;
console.log(sec !== null ? '✓ 部屋：隠しチャンネルが点く' : '△ 部屋：押した所にテレビがなかった（隠しチャンネルは未確認）');
if (sec !== null) { await until(() => window.__site.state().secret > 1.5, 60000); await shot('room-secret'); }
// 長押しで溜めきる → けものが画面に飛び込む → 路地へ
await page.mouse.move(640, 360);
await page.mouse.down();
await until(() => window.__site.state().impacted);
await page.mouse.up();
console.log('✓ 部屋：溜めきって衝撃');
await until(() => window.__site.state().scene === 1);
console.log('✓ 部屋 → 巻き取りへ切り替わる');
// 場面2：スクロールで縦の同期を合わせる → 絵が紙になって引き出される → 路地へ
await page.mouse.move(640, 360);
for (let i = 0; i < 80 && !(await state()).locked; i++) {
  const off = (await state()).off ?? 0;
  await page.mouse.wheel(0, Math.max(-400, Math.min(400, -off / 0.0006 * 0.9)));
  await page.waitForTimeout(400);
}
await until(() => window.__site.state().locked, 60000);
await shot('tune-locked');
console.log('✓ 巻き取り：スクロールで絵が止まる');
await until(() => window.__site.state().scene === 2);
console.log('✓ 巻き取り → 路地へ（紙に飛び込む）');
await shot('alley-enter');

// 場面2：壁をジグザグにドラッグして塗る → タグが完成
await page.mouse.move(430, 240);
await page.mouse.down();
for (let i = 0; i < 400 && !(await state()).completed; i++) {
  const row = i % 12;
  await page.mouse.move(i % 2 ? 430 : 850, 230 + row * 18, { steps: 8 });
  if (i === 6) await shot('alley-spraying');
}
await page.mouse.up();
const s = await state();
console.log(`✓ 路地：塗った量 ${(s.coverage * 100).toFixed(0)}%（点 ${s.points}）・影が舐めた ${s.licks} 回（t=${s.t?.toFixed?.(1)}）`);
if (!s.shadowOut || s.licks < 1) throw new Error('影が這い出していない');
await until(() => window.__site.state().completed);
console.log('✓ 路地：タグが完成');
await until(() => window.__site.state().scene === 3);
console.log('✓ 路地 → 印刷工房へ切り替わる（紙が横切る）');
await shot('shop-enter');

// 場面3：レバーを3回引く（刷っている最中は受け付けないので、1回ずつ待つ）
for (let k = 1; k <= 3; k++) {
  await until(() => !window.__site.state().busy, 60000).catch(() => {});
  await page.mouse.click(640, 360);
  await page.waitForFunction((n) => window.__site.state().presses >= n, k, { timeout: 60000, polling: 200 });
}
console.log('✓ 印刷工房：3回刷った');
await until(() => window.__site.state().burst);
console.log('✓ 印刷工房：全開で刷り上がりが舞う');
await shot('shop-burst');
// 音を盗む：けものが電線を噛んだら、クリックで「ドン」。4回吐くと低音を返し、エンディングへ
await until(() => window.__site.state().stolen, 180000);
for (let k = 1; k <= 4; k++) {
  await page.mouse.click(400 + k * 60, 300);
  await page.waitForFunction((n) => window.__site.state().dons >= n || window.__site.state().scene === 4, k, { timeout: 30000, polling: 200 });
  if (k === 1) { await page.waitForTimeout(300); await shot('shop-don'); }
  await until(() => window.__site.state().scene === 4 || window.__site.state().donReady, 30000);
}
console.log('✓ 印刷工房：低音を盗まれて、クリックで「ドン」を4回');
await until(() => window.__site.state().scene === 4, 240000);
console.log('✓ 印刷工房 → 夜を縫う線へ');
// 場面5：端子を2つずつ選んで、電線を3本張る
const box = await page.evaluate(() => { const r = document.querySelector('#screen canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const px = ([x, y]) => [box.x + (x + 1) / 2 * box.w, box.y + (1 - y) / 2 * box.h];
for (const [k, [a, b]] of [[0, 5], [2, 7], [4, 3]].entries()) {
  await page.waitForTimeout(1500);
  const terms = (await state()).terms;
  await page.mouse.click(...px(terms[a]));
  await page.waitForFunction((a) => window.__site.state().sel === a, a, { timeout: 30000, polling: 200 });
  await page.mouse.click(...px(terms[b]));
  await page.waitForFunction((n) => window.__site.state().wires >= n, k + 1, { timeout: 30000, polling: 200 });
  if (k === 1) await shot('wire-two');
}
console.log('✓ 夜を縫う線：3本張って、紙が組み上がる');
await until(() => window.__site.state().scene === 5, 240000);
console.log('✓ 夜を縫う線 → エンディングへ');
await until(() => !document.getElementById('replay').hidden, 240000);
const saveShown = await page.evaluate(() => !document.getElementById('save').hidden);
if (!saveShown) throw new Error('SAVE が出ていない');
await shot('end');
console.log('✓ エンディング：紙を折って封、SAVE と REPLAY が出る');
// 電源オフ：マウスが画面の外に出ると消える → 動かすと点く
await page.evaluate(() => document.documentElement.dispatchEvent(new PointerEvent('pointerleave')));
await until(() => window.__site.state().tvOff >= 1, 60000);
await shot('tv-off');
await page.mouse.move(600, 300);
await until(() => window.__site.state().tvOff === 0, 60000);
console.log('✓ 画面の外へ出ると消え、戻ると点く');
await page.click('#replay');
await until(() => window.__site.state().scene === 0 && !window.__site.state().impacted);
console.log('✓ REPLAY で部屋に戻る');
const audio = (await state()).audio;
console.log('audio:', JSON.stringify(audio));
if (audio.loaded !== 38 || audio.error || audio.state !== 'running') throw new Error(`音が準備できていない: ${JSON.stringify(audio)}`);
await browser.close();
server.close();
if (errors.length) { console.error('エラー:', [...new Set(errors)]); process.exit(1); }
console.log('smoke OK');
