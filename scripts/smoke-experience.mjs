// 体験型モードを自動操作して、最後まで進めるか確認する。
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ server: { port: 5197 }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost:5197/?mode=experience');
const label = p.locator('.action__label');
const step = async (name, fn) => { await label.waitFor({ state: 'visible', timeout: 20000 }); console.log(name, '→', await label.textContent()); await fn(); };
await step('S1', async () => { for (let i = 0; i < 3; i++) await p.mouse.click(640, 360); });
await step('S2', async () => { await p.mouse.move(200, 500); await p.mouse.down(); for (let x = 0; x < 20; x++) await p.mouse.move(x % 2 ? 200 : 1100, 500, { steps: 4 }); await p.mouse.up(); });
await step('S3', async () => { await p.mouse.click(700, 330); });
await p.locator('.replay').waitFor({ state: 'visible', timeout: 20000 });
await p.screenshot({ path: 'out/experience-end.png' });
console.log('replay visible, errors:', errors.length ? errors : 'none');
await b.close(); await server.close();
