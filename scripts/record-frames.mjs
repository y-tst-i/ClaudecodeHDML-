// 仮想時計で1コマずつ進めて録画する（重いWebGLでも、実際の速さどおりの動画になる）
//   node scripts/record-frames.mjs <URL> <秒数の並び: "4,3,3"> <出力.mp4> [fps]
//   ページ側に window.__rec = { go(i), frame(dt) } が必要
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const [url, holds, out = 'out/rec.mp4', fpsArg = '24'] = process.argv.slice(2);
const fps = Number(fpsArg);
const secs = holds.split(',').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error(e.message));
await page.goto(url);
await page.waitForFunction(() => window.__rec);
const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', out], { stdio: ['pipe', 'inherit', 'inherit'] });
let n = 0;
for (let i = 0; i < secs.length; i++) {
  await page.evaluate((i) => window.__rec.go(i), i);
  for (let f = 0; f < Math.round(secs[i] * fps); f++) {
    await page.evaluate((dt) => window.__rec.frame(dt), 1 / fps);
    ff.stdin.write(await page.screenshot({ type: 'jpeg', quality: 90 }));
    if (++n % 48 === 0) console.log(`step ${i + 1}/${secs.length} frame ${n}`);
  }
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log('→', out);
