import '@fontsource/jetbrains-mono/600.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createPost } from '../room/post.js';
import { createRoom } from './room.js';
import { createAlley } from './alley.js';
import { prepareAudio, resumeAudio, sfx, setMuted, audioState } from '../audio.js';

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

const scenes = [await createRoom(renderer, env), await createAlley(renderer, env)];
let cur = params.get('scene') === 'alley' ? 1 : 0;
const post = createPost(renderer, scenes[0].scene, scenes[0].camera, scenes[0].dust);
const use = (i) => { cur = i; post.setView(scenes[i].scene, scenes[i].camera); };
use(cur);

const QUALITY = [{ name: 'HIGH', scale: 1, dpr: 2 }, { name: 'MID', scale: 0.72, dpr: 1.25 }, { name: 'LOW', scale: 0.5, dpr: 1 }];
let quality = 0;
function fit() {
  const Q = QUALITY[quality];
  const w = RENDER ? 1920 : Math.min(innerWidth, innerHeight * 16 / 9) * Q.scale, dpr = RENDER ? 1 : Math.min(devicePixelRatio || 1, Q.dpr);
  const pw = Math.min(1920, Math.round(w * dpr)), ph = Math.round(pw * 9 / 16);
  renderer.setSize(pw, ph, false);
  post.setSize(pw, ph);
  for (const s of scenes) { s.camera.aspect = 16 / 9; s.camera.updateProjectionMatrix(); }
}
fit();
function render(t, look) {
  const { hit, power } = scenes[cur].draw(look);
  post.render({ t, hit, power });
}

if (RENDER) {
  window.__seek = (t) => { scenes[cur].script(t); render(t, { x: 0, y: 0 }); };
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
  surface.addEventListener('pointerdown', (e) => {
    resumeAudio();
    if (!started) { started = true; sfx('power', { gain: 0.8 }); }
    surface.setPointerCapture(e.pointerId);
    lastX = e.clientX; lastY = e.clientY;
    scenes[cur].down(toNdc(e));
  });
  const up = () => scenes[cur].up();
  surface.addEventListener('pointerup', up);
  surface.addEventListener('pointercancel', up);
  addEventListener('pointermove', (e) => {
    lookTarget.x = e.clientX / innerWidth * 2 - 1; lookTarget.y = -(e.clientY / innerHeight * 2 - 1);
    const d = Math.hypot(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
    scenes[cur].move(toNdc(e), d);
  });
  addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat && e.target.tagName !== 'BUTTON') { e.preventDefault(); resumeAudio(); started = true; scenes[cur].down(new THREE.Vector2(0, 0)); } });
  addEventListener('keyup', (e) => { if (e.code === 'Space') up(); });
  $('sound').addEventListener('click', () => { muted = !muted; setMuted(muted); $('sound').textContent = muted ? 'SOUND OFF' : 'SOUND ON'; });
  $('replay').addEventListener('click', () => { ended = false; $('replay').hidden = true; scenes[1].leave?.(); scenes[0].reset(); use(0); ui(); });
  function ui() {
    $('count').textContent = `${String(cur + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}`;
    $('hint').textContent = ended || scenes[cur].busy() ? '' : scenes[cur].hint;
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
    t += dt;
    const ev = started ? scenes[cur].tick(dt) : null;
    if (ev === 'exit') { scenes[1].reset(); use(1); scenes[1].enter(); sfx('cut', { gain: 1.2 }); }
    if (ev === 'end' && !ended) { ended = true; $('replay').hidden = false; }
    look.x += (lookTarget.x - look.x) * Math.min(1, dt * 3);
    look.y += (lookTarget.y - look.y) * Math.min(1, dt * 3);
    $('bar').style.transform = `scaleX(${started ? scenes[cur].progress() : 0})`;
    ui();
    render(t, look);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.__site = { state: () => ({ started, scene: cur, ended, ...scenes[cur].state(), quality: QUALITY[quality].name, audio: audioState() }) };
}
