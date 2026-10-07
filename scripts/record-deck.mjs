// スライドを実際にクリックして進める様子を録画する（動きの確認用）
//   node scripts/record-deck.mjs <URL> <開始番号> <終了番号> <1枚の秒数> <出力.mp4>
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
const [url, from = '1', to = '12', sec = '2.4', out = 'out/deck-preview.mp4'] = process.argv.slice(2);
const dir = 'out/rec-tmp';
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
await page.goto(`${url}#${from}`);
await page.waitForTimeout(2500);
for (let i = Number(from); i < Number(to); i++) {
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(Number(sec) * 1000);
}
await ctx.close();
await browser.close();
const webm = readdirSync(dir).find((f) => f.endsWith('.webm'));
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', '1.5', '-i', `${dir}/${webm}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', out]);
console.log('→', out);
