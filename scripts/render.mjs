// 映像の書き出し / カット表の生成。
//   npm run render  → out/showreel.mp4
//   npm run cuts    → docs/cuts/*.png と docs/CUTSHEET.md
// ブラウザで ?mode=render を開き、時刻 t を1フレームずつ seek して PNG を取り出す。
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { CUTS } from '../src/cuts.js';

const stills = process.argv.includes('--stills');
// --page mako/ のように別の作品を書き出せる（出力は out/<名前>.mp4）
const pi = process.argv.indexOf('--page');
const pagePath = pi > 0 ? process.argv[pi + 1] : '';
const outName = pagePath ? pagePath.replace(/\W+/g, '') : 'showreel';
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error(e));
await page.goto(`http://localhost:5199/${pagePath}?mode=render`);
await page.waitForFunction(() => window.__showreel);
const cfg = await page.evaluate(() => ({ fps: window.__showreel.fps, duration: window.__showreel.duration }));
const grab = async (t) => Buffer.from((await page.evaluate((t) => window.__showreel.seek(t), t)).split(',')[1], 'base64');

if (stills) {
  await mkdir('docs/cuts', { recursive: true });
  const rows = [];
  for (const c of CUTS) {
    await writeFile(`docs/cuts/${c.id}_in.png`, await grab(c.start + 0.02));
    await writeFile(`docs/cuts/${c.id}_out.png`, await grab(c.end - 0.02));
    rows.push(`| ${c.id} | ${c.start.toFixed(1)}–${c.end.toFixed(1)}s | <img src="cuts/${c.id}_in.png" width="240"> | <img src="cuts/${c.id}_out.png" width="240"> | ${c.motion} | ${c.web} | ${c.fb || ''} |`);
    console.log('cut', c.id);
  }
  const md = `# カット表（自動生成：npm run cuts）\n\nFBは src/cuts.js の \`fb\` に書く。\n\n| ID | 尺 | はじめ | おわり | 動き | Webでの操作 | FB |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
  await writeFile('docs/CUTSHEET.md', md);
} else {
  await mkdir('out', { recursive: true });
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(cfg.fps), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', `out/${outName}.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.round(cfg.fps * cfg.duration);
  for (let f = 0; f < total; f++) {
    const buf = await grab(f / cfg.fps);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 30 === 0) console.log(`frame ${f}/${total}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`→ out/${outName}.mp4`);
}

await browser.close();
await server.close();
