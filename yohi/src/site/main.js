import '@fontsource/jetbrains-mono/600.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createPost } from '../room/post.js';
import { createRoom } from './room.js';
import { createAlley } from './alley.js';
import { createShop } from './shop.js';
import { createEnd } from './end.js';
import { createTune } from './tune.js';
import { createWire } from './wire.js';
import { prepareAudio, resumeAudio, sfx, setMuted, setDuck, audioState } from '../audio.js';

// YOHI の体験型サイト（複数の場面）。場面1：ブラウン管の部屋 → 場面2：夜の路地 → 部屋へ戻る。
// 共通：描画・仕上げの効果・音・UI・自動の画質調整。場面ごとの絵は state の純関数。
const params = new URLSearchParams(location.search);
const RENDER = params.get('mode') === 'render';
const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: RENDER, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setPixelRatio(1);
$('screen').appendChild(renderer.domElement);
const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

// エンディング用：各場面の見せ場の1コマ（ポスターに刷る）
const room = await createRoom(renderer, env), alley = await createAlley(renderer, env), shop = await createShop(renderer, env);
const tune = await createTune(renderer, env, { inner: alley });
const shotScenes = [room, alley, shop];   // ポスターに刷る場面
const shots = [null, null, null];
const grab = (s) => {
  const i = shotScenes.indexOf(s);
  if (i < 0) return;
  const c = shots[i] ?? document.createElement('canvas');
  c.width = 640; c.height = 360;
  // 画面の真ん中の 16:9 を切り出す（縦長の画面でも絵が歪まないように）
  const W = renderer.domElement.width, H = renderer.domElement.height;
  const cw = Math.min(W, H * 16 / 9), ch = cw * 9 / 16;
  c.getContext('2d').drawImage(renderer.domElement, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, 640, 360);
  shots[i] = c;
};
const end = await createEnd(renderer, env, { getShots: () => shots, getSpray: () => alley.paintCanvas });
const wire = await createWire(renderer, env, { getPoster: () => end.prepare() });
const scenes = [room, tune, alley, shop, wire, end];
const NAMES = ['room', 'tune', 'alley', 'shop', 'wire', 'end'];
let cur = Math.max(0, NAMES.indexOf(params.get('scene') ?? 'room'));
const post = createPost(renderer, scenes[0].scene, scenes[0].camera, scenes[0].dust);
const use = (i) => { cur = i; post.setView(scenes[i].scene, scenes[i].camera); };
use(cur);

const QUALITY = [{ name: 'HIGH', scale: 1, dpr: 2 }, { name: 'MID', scale: 0.72, dpr: 1.25 }, { name: 'LOW', scale: 0.5, dpr: 1 }];
let quality = 0;
// 画面いっぱいに描く。横長は 16:9 の上下を切り、縦長（スマホ）は 16:9 の横幅を全部見せて上下を広げる
let aspect = 16 / 9;
function fit() {
  const Q = QUALITY[quality];
  aspect = RENDER ? 16 / 9 : innerWidth / innerHeight;
  const cssW = RENDER ? 1920 : innerWidth, cssH = RENDER ? 1080 : innerHeight;
  const dpr = RENDER ? 1 : Math.min(devicePixelRatio || 1, Q.dpr) * Q.scale;
  let pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
  const k = Math.min(1, 1920 * 1080 / (pw * ph));   // 描く画素は 1920×1080 ぶんまで
  pw = Math.round(pw * Math.sqrt(k)); ph = Math.round(ph * Math.sqrt(k));
  renderer.setSize(pw, ph, false);
  post.setSize(pw, ph);
}
fit();
function render(t, look, tvOff = 0) {
  const { hit, power, mask = 0, wipe = 0 } = scenes[cur].draw(look);
  // 場面のカメラは 16:9 で設計してある。縦長の画面では横の見える幅を保つように画角を広げる（描いたら元に戻す）
  // （場面が自分で画角を変えたら、それを新しい基準にする。マウスで指す計算も同じ画角で行うので、描いたあとも戻さない）
  const cam = scenes[cur].camera;
  const base = cam.fov !== cam.userData.adj ? cam.fov : cam.userData.base;
  cam.userData.base = base;
  // 縦長（スマホ）は横幅の6割を見せる（全部見せると主役が小さくなりすぎる）。左右の端は切れる
  const keepW = aspect < 1 ? 0.6 : 1;
  cam.fov = aspect < 16 / 9 ? Math.max(base, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base) / 2) * (16 / 9) * keepW / aspect))) : base;
  cam.userData.adj = cam.fov;
  cam.aspect = aspect;
  cam.updateProjectionMatrix();
  post.render({ t, hit, power, mask, wipe, tvOff });
}

if (RENDER) {
  document.body.classList.add('ready');
  // エンディングの確認用：各場面を台本の見せ場の時刻で1コマずつ描いて撮る
  const SHOT_T = [3.95, 5.0, 7.4];
  window.__seek = (t) => {
    if ((scenes[cur] === end || scenes[cur] === wire) && !shots[0]) { shotScenes.forEach((s, i) => { use(scenes.indexOf(s)); s.script(SHOT_T[i]); render(SHOT_T[i], { x: 0, y: 0 }); grab(s); }); use(NAMES.indexOf(params.get('scene'))); }
    scenes[cur].script(t); render(t, { x: 0, y: 0 });
  };
  window.__showreel = { fps: 30, duration: 6, seek: (t) => (window.__seek(t), renderer.domElement.toDataURL('image/png')) };
} else {
  addEventListener('resize', fit);
  prepareAudio();
  let started = false, muted = false, t = 0, ended = false;
  const look = { x: 0, y: 0 }, lookTarget = { x: 0, y: 0 };
  const ndc = new THREE.Vector2();
  const toNdc = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    return ndc;
  };
  const surface = $('screen');
  let lastX = 0, lastY = 0;
  // 放っておく（15秒）か、マウスが画面の外に出ると、サイト全体がブラウン管のように消える。触ると点く
  const IDLE_OFF = 15, AWAY_OFF = 0.8, OFF_LEN = 0.55, ON_LEN = 0.35;
  let idle = 0, away = false, awayFor = 0, tvOff = 0, offTarget = 0, offShown = false;
  const wake = () => { idle = 0; away = false; awayFor = 0; };
  document.documentElement.addEventListener('pointerleave', () => { away = true; });
  addEventListener('blur', () => { away = true; });
  surface.addEventListener('pointerdown', (e) => {
    wake();
    resumeAudio();
    if (!started) { started = true; sfx('power', { gain: 0.8 }); scenes[cur].enter?.(); }
    surface.setPointerCapture(e.pointerId);
    lastX = e.clientX; lastY = e.clientY;
    scenes[cur].down(toNdc(e));
  });
  const up = () => scenes[cur].up();
  surface.addEventListener('pointerup', up);
  surface.addEventListener('pointercancel', up);
  addEventListener('pointermove', (e) => {
    wake();
    lookTarget.x = e.clientX / innerWidth * 2 - 1; lookTarget.y = -(e.clientY / innerHeight * 2 - 1);
    const d = Math.hypot(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
    scenes[cur].move(toNdc(e), d);
  });
  // スクロール（ホイール・トラックパッド）：使う場面だけが受け取る
  surface.addEventListener('wheel', (e) => { wake(); if (started && scenes[cur].wheel) { e.preventDefault(); scenes[cur].wheel(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY); } }, { passive: false });
  addEventListener('keydown', (e) => { wake(); if (e.code === 'Space' && !e.repeat && e.target.tagName !== 'BUTTON') { e.preventDefault(); resumeAudio(); if (!started) { started = true; scenes[cur].enter?.(); } scenes[cur].down(new THREE.Vector2(0, 0)); } });
  addEventListener('keyup', (e) => { if (e.code === 'Space') up(); });
  $('sound').addEventListener('click', () => { muted = !muted; setMuted(muted); $('sound').textContent = muted ? 'SOUND OFF' : 'SOUND ON'; });
  // SAVE：折る前のポスター（その人のスプレー跡入り）を画像で持ち帰る
  $('save').addEventListener('click', async () => {
    const blob = await end.posterBlob();
    const name = 'yohi-night.png';
    try {
      const dl = await window.claude?.use?.('downloads');
      if (dl) { await dl.save({ filename: name, data: blob }); return; }
    } catch (e) { if (e?.code === 'declined' || e?.code === 'rate_limited') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  $('replay').addEventListener('click', () => { ended = false; $('replay').hidden = true; $('save').hidden = true; scenes[cur].leave?.(); scenes[0].reset(); use(0); scenes[0].enter?.(); ui(); });
  function ui() {
    $('count').textContent = `${String(cur + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}`;
    $('hint').textContent = tvOff > 0.5 ? 'MOVE' : scenes[cur].busy() ? '' : scenes[cur].hint;   // 最後の場面は終わっても遊べる（REPLAY と並べて操作を出す）
  }
  ui();

  // 自動の画質調整（45コマか1.5秒の早い方で判定し、遅ければ1段ずつ下げる。上げ直さない）
  const showQuality = () => { $('quality').textContent = QUALITY[quality].name; };
  showQuality();
  let samples = [], settleUntil = performance.now() + 1500;
  const measure = (raw, now) => {
    if (now < settleUntil || quality >= QUALITY.length - 1) return;
    samples.push(raw);
    const spent = samples.reduce((a, b) => a + b, 0);
    if (samples.length < 45 && !(spent > 1.5 && samples.length >= 4)) return;
    const avg = spent / samples.length;
    samples = [];
    if (avg > 0.028) { quality++; fit(); scenes.forEach((s) => s.setQuality(quality)); showQuality(); settleUntil = now + 1500; }
  };

  let last = performance.now();
  const frame = (now) => {
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw);
    last = now;
    measure(raw, now);
    // 電源オフ／オン（場面が自動で進んでいる最中は消さない）
    idle += dt; awayFor = away ? awayFor + dt : 0;
    const want = started && !scenes[cur].busy() && (idle > IDLE_OFF || awayFor > AWAY_OFF) ? 1 : 0;
    if (want !== offTarget) { offTarget = want; if (want) { sfx('off', { gain: 0.9 }); setDuck(0.12, 0.4); } else { sfx('power', { gain: 0.5 }); setDuck(1, 0.2); } }
    tvOff = offTarget ? Math.min(1, tvOff + dt / OFF_LEN) : Math.max(0, tvOff - dt / ON_LEN);
    if (tvOff >= 1) { if (!offShown) render(t, look, 1); offShown = true; requestAnimationFrame(frame); return; }   // 消えている間は時間を止め、描かない
    offShown = false;
    t += dt;
    const ev = started ? scenes[cur].tick(dt) : null;
    // 'exit'：次の場面へ（前の場面の音を止め、次の場面を最初から始める）
    if (ev === 'exit' && cur + 1 < scenes.length) { scenes[cur].leave?.(); const n = cur + 1; scenes[n].reset(); use(n); scenes[n].enter?.(); sfx('cut', { gain: 1.2 }); }
    if (ev === 'end' && !ended) { ended = true; $('replay').hidden = false; $('save').hidden = scenes[cur] !== end; }
    look.x += (lookTarget.x - look.x) * Math.min(1, dt * 3);
    look.y += (lookTarget.y - look.y) * Math.min(1, dt * 3);
    $('bar').style.transform = `scaleX(${started ? scenes[cur].progress() : 0})`;
    ui();
    render(t, look, tvOff);
    if (scenes[cur].snapNow?.()) grab(scenes[cur]);   // 描いた直後なら、画面の中身をそのまま写せる
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  document.body.classList.add('ready');   // 読み込み表示を消す
  window.__site = { state: () => ({ started, tvOff, scene: cur, ended, busy: scenes[cur].busy(), ...scenes[cur].state(), quality: QUALITY[quality].name, audio: audioState() }) };
}
