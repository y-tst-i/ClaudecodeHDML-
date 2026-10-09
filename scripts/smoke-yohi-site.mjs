// YOHI サイト（部屋 → 路地）の通しテスト。公開先と同じ CSP をかけて、最後まで遊べるか・音が読めるか。
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

// 場面1：長押しで溜めきる → けものが画面に飛び込む → 路地へ
await page.mouse.move(640, 360);
await page.mouse.down();
await until(() => window.__site.state().impacted);
await page.mouse.up();
console.log('✓ 部屋：溜めきって衝撃');
await until(() => window.__site.state().scene === 1);
console.log('✓ 部屋 → 路地へ切り替わる');
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
console.log(`✓ 路地：塗った量 ${(s.coverage * 100).toFixed(0)}%（点 ${s.points}）`);
await until(() => window.__site.state().completed);
console.log('✓ 路地：タグが完成');
await until(() => !document.getElementById('replay').hidden, 120000);
await shot('alley-done');
await page.click('#replay');
await until(() => window.__site.state().scene === 0 && !window.__site.state().impacted);
console.log('✓ REPLAY で部屋に戻る');
const audio = (await state()).audio;
console.log('audio:', JSON.stringify(audio));
if (audio.loaded !== 20 || audio.error || audio.state !== 'running') throw new Error(`音が準備できていない: ${JSON.stringify(audio)}`);
await browser.close();
server.close();
if (errors.length) { console.error('エラー:', [...new Set(errors)]); process.exit(1); }
console.log('smoke OK');
