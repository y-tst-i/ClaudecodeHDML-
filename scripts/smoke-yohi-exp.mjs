// YOHI 体験型サイトの通しテスト：長押し → ドラッグ → クリック3回 → 動かす → 最後（REPLAY）まで進むか。
//   npx vite build --config yohi/vite.config.js && node scripts/smoke-yohi-exp.mjs
// 各場面のスクリーンショットを out/yohi-exp/smoke/ に保存する。
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const html = await readFile('out/yohi-exp/experience.html');
const server = createServer((req, res) => { // 公開先（claude.ai）と同じく通信先を絞る。data: URL への fetch が止められる環境でも音が読めるかを確かめる
  res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "connect-src 'self'" }); res.end(html); });
await new Promise((r) => server.listen(0, r));
await mkdir('out/yohi-exp/smoke', { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:${server.address().port}/`);
await page.waitForFunction(() => window.__exp);
const state = () => page.evaluate(() => window.__exp.state());
const until = (fn, ms = 60000) => page.waitForFunction(fn, null, { timeout: ms, polling: 100 });
const shot = (name) => page.screenshot({ path: `out/yohi-exp/smoke/${name}.png` });

// C1：長押し（途中で離すと戻ることも確認）
await page.mouse.move(640, 360);
await page.mouse.down();
await until(() => window.__exp.state().lt > 1.0);
await page.mouse.up();
const atRelease = await state();
await page.waitForTimeout(600);
const afterRelease = await state();
if (afterRelease.lt >= atRelease.lt) throw new Error(`C1: 離しても戻らない ${JSON.stringify({ atRelease, afterRelease })}`);
await shot('c1-released');
await page.mouse.down();
await until(() => window.__exp.state().auto);
await page.mouse.up();
await shot('c1-impact');
await until(() => window.__exp.state().room === 1);
console.log('✓ C1 長押しで溜まり、離すと戻り、溜めきるとドン');

// C2：ドラッグで描く
await until(() => window.__exp.state().lt >= 0.2);
await page.mouse.move(200, 400);
await page.mouse.down();
for (let i = 0; i < 40 && (await state()).room === 1 && !(await state()).auto; i++) {
  await page.mouse.move(i % 2 ? 200 : 1080, 400, { steps: 6 });
  if (i === 6) await shot('c2-drawing');
}
await page.mouse.up();
await until(() => window.__exp.state().room === 2);
console.log('✓ C2 ドラッグで描ける');

// C3：クリック3回
for (let k = 0; k < 3; k++) {
  await until(() => [0.45, 0.95, 1.45].some((w) => Math.abs(window.__exp.state().lt - w) < 0.002));
  await page.mouse.click(640, 360);
  if (k === 1) await shot('c3-pressed');
}
await until(() => window.__exp.state().room === 3);
console.log('✓ C3 クリック3回で刷れる');

// C4：動かす
for (let i = 0; i < 200 && (await state()).room === 3; i++) {
  await page.mouse.move(i % 2 ? 300 : 980, 200 + (i % 5) * 80, { steps: 3 });
  if (i === 20) await shot('c4-moving');
}
await until(() => window.__exp.state().room === 4);
console.log('✓ C4 動かすと顔が切り替わる');

// C5：自動で締めて REPLAY
await until(() => window.__exp.state().ended);
await shot('c5-end');
if (!(await page.isVisible('#replay'))) throw new Error('REPLAY が出ない');
await page.click('#replay');
await until(() => window.__exp.state().room === 0 && !window.__exp.state().ended);
console.log('✓ C5 最後まで進み、REPLAY で最初に戻る');

// 音：効果音20個がすべて読めて、鳴る状態になっているか
const audio = (await state()).audio;
console.log('audio:', JSON.stringify(audio));
if (audio.loaded !== 20 || audio.error || audio.state !== 'running') throw new Error(`音が準備できていない: ${JSON.stringify(audio)}`);
await browser.close();
server.close();
if (errors.length) { console.error('エラー:', [...new Set(errors)]); process.exit(1); }
console.log('smoke OK');
