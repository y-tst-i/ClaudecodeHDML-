// 指定した時刻のフレームだけを書き出して確認する（AIが自分の出力を「見る」ための道具）。
//   npm run probe -- 2.5 5.0 12.3   → out/probe/t2.5.png ... と out/probe/sheet.png
//   npm run probe -- --page /walk/ 1 4  … 別のページ（walk/ など）を撮る。--q grid=1 でクエリを足す
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv.splice(i, 2)[1]; };
const pagePath = opt('--page', '/');
const extraQuery = opt('--q', '');
const times = argv.map(Number);
const server = await createServer({ server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error(e));
await page.goto(`http://localhost:5198${pagePath}?mode=render${extraQuery ? '&' + extraQuery : ''}`);
await page.waitForFunction(() => window.__showreel, null, { timeout: 120000 });
const { width: W = 1280, height: H = 720 } = await page.evaluate(() => ({ width: window.__showreel.width, height: window.__showreel.height }));
await mkdir('out/probe', { recursive: true });
const files = [];
for (const t of times) {
  const data = await page.evaluate((t) => window.__showreel.seek(t), t);
  const f = `out/probe/t${t}.png`;
  await writeFile(f, Buffer.from(data.split(',')[1], 'base64'));
  files.push(f);
}
await browser.close();
await server.close();
// 4列のコンタクトシートにまとめる
const cols = Math.min(4, files.length);
const args = files.flatMap((f) => ['-i', f]);
const layout = files.map((_, i) => `${(i % cols) * W}_${Math.floor(i / cols) * H}`).join('|');
spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...args, '-filter_complex', files.length > 1 ? `xstack=inputs=${files.length}:layout=${layout}:fill=black,scale=1600:-1` : 'scale=1600:-1', 'out/probe/sheet.png']);
console.log('→ out/probe/sheet.png');
