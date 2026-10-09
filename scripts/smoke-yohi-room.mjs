// ブラウン管の部屋の通しテスト：長押しで溜まり、離すと抜け、溜めきると衝撃 → REPLAY。音20個が読めること。
//   npx vite build --config yohi/vite.room.config.js && node scripts/smoke-yohi-room.mjs
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const html = await readFile('out/yohi-room/room.html');
// 公開先（claude.ai）と同じく通信先を絞る
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "connect-src 'self'" }); res.end(html); });
await new Promise((r) => server.listen(0, r));
await mkdir('out/yohi-room/smoke', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:${server.address().port}/`);
await page.waitForFunction(() => window.__room, null, { timeout: 120000 });
const state = () => page.evaluate(() => window.__room.state());
const until = (fn, ms = 180000) => page.waitForFunction(fn, null, { timeout: ms, polling: 100 });

await page.mouse.move(640, 360);
await page.mouse.down();
await until(() => window.__room.state().power > 0.4);
await page.mouse.up();
// GPU の無い環境では1コマが1秒近くかかるので、決まった時間ではなく「実際に下がるまで」待つ
const a = await state();
const t0 = Date.now();
await page.waitForFunction((p) => window.__room.state().power < p - 0.05, a.power, { timeout: 120000, polling: 100 }).catch(() => { throw new Error(`離しても抜けない ${JSON.stringify(a)}`); });
console.log(`  （この環境での1コマ ≒ ${await page.evaluate(() => new Promise((r) => { const s = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => r(Math.round((performance.now() - s) / 2)))); }))}ms、抜けるまで ${Date.now() - t0}ms）`);
console.log('✓ 長押しで溜まり、離すと抜ける');
await page.screenshot({ path: 'out/yohi-room/smoke/half.png' });
await page.mouse.down();
await until(() => window.__room.state().impacted);
await page.mouse.up();
console.log('✓ 溜めきると衝撃');
await until(() => !document.getElementById('replay').hidden, 60000);
await page.screenshot({ path: 'out/yohi-room/smoke/after.png' });
await page.click('#replay');
await until(() => !window.__room.state().impacted && window.__room.state().power < 0.01);
console.log('✓ REPLAY で暗い部屋に戻る');
// GPU の無いこの環境は遅いので、自動の画質調整で HIGH から下がっているはず
const q = (await state()).quality;
console.log(`✓ 自動の画質調整: ${q}`);
if (q === 'HIGH') throw new Error('遅いのに画質が下がっていない');
const audio = (await state()).audio;
console.log('audio:', JSON.stringify(audio));
if (audio.loaded !== 20 || audio.error || audio.state !== 'running') throw new Error(`音が準備できていない: ${JSON.stringify(audio)}`);
await browser.close();
server.close();
if (errors.length) { console.error('エラー:', [...new Set(errors)]); process.exit(1); }
console.log('smoke OK');
