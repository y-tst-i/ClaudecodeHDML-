import '@fontsource-variable/noto-sans-jp';
import '@fontsource-variable/inter';
import './style.css';
import { T } from './tokens.js';
import { section } from './world/section.js';
import { chart, force, hydration, plain, precast, timeline, timer } from './world/scenes.js';
import { clamp, ease, lerp } from './world/util.js';
import { STEPS } from './steps.js';

// ページをめくらず、1つの世界の中をカメラが進む。クリックするたびに「話す分だけ」が現れる。
// 操作：クリック / → / スペース = 次へ、← = 戻る、B = 暗転、F = 全画面、T = タイマーやり直し
const SCENES = { section, force, timeline, hydration, chart, precast, timer, plain };

const stage = document.getElementById('stage');
const canvas = document.getElementById('world');
const layer = document.getElementById('layer');
const g = canvas.getContext('2d');
const dpr = Math.min(2, window.devicePixelRatio || 1);
canvas.width = 1920 * dpr;
canvas.height = 1080 * dpr;

function fit() {
  const k = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `translate(-50%, -50%) scale(${k})`;
}
addEventListener('resize', fit);
fit();

const state = { i: -1, at: 0, prev: null, prevScene: null, timerStart: null, black: false };
const now = () => performance.now() / 1000;

// 今画面に出ているパラメータ（移動の途中でも、その瞬間の値）
function paramsAt(i, k) {
  const step = STEPS[i];
  const prev = state.prev && state.prevScene === step.scene ? state.prev : null;
  if (!prev) return { ...step.p };
  const e = ease.inOut(clamp(k / (step.dur ?? T.move)));
  const out = {};
  for (const key of new Set([...Object.keys(prev), ...Object.keys(step.p)])) {
    const a = prev[key], b = step.p[key];
    out[key] = typeof a === 'number' && typeof b === 'number' ? lerp(a, b, e) : b ?? a;
  }
  return out;
}

function go(i, { instant = false } = {}) {
  i = Math.max(0, Math.min(STEPS.length - 1, i));
  if (i === state.i) return;
  const k = now() - state.at;
  if (state.i >= 0) {
    state.prev = paramsAt(state.i, k);
    state.prevScene = STEPS[state.i].scene;
    state.prevI = state.i;
  }
  state.i = i;
  state.at = instant ? now() - 10 : now();
  state.timerStart = null;
  renderLayer(STEPS[i]);
  document.getElementById('hudSection').textContent = STEPS[i].section ?? '';
  document.getElementById('hudCount').textContent = `${String(i + 1).padStart(2, '0')} / ${STEPS.length}`;
  document.getElementById('hudBar').style.width = `${((i + 1) / STEPS.length) * 100}%`;
  stage.dataset.tone = STEPS[i].tone ?? 'light';
  history.replaceState(null, '', `#${i + 1}`);
}

// 文字のレイヤー：前の画面と同じ要素（data-k が同じ）はそのまま残し、新しい要素だけを出す
function renderLayer(step) {
  const tpl = document.createElement('template');
  tpl.innerHTML = step.html ?? '';
  const base = (el) => [...el.classList].filter((c) => !['in', 'on', 'out'].includes(c)).join(' ');
  const current = new Map([...layer.children].filter((el) => el.dataset.k && !el.classList.contains('out')).map((el) => [el.dataset.k, el]));
  const stay = new Set();
  for (const el of [...tpl.content.children]) {
    const old = el.dataset.k && current.get(el.dataset.k);
    if (old && old.innerHTML === el.innerHTML && base(old) === base(el)) {
      stay.add(old);
      continue;
    }
    el.classList.add('in');
    layer.appendChild(el);
    stay.add(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  }
  for (const el of [...layer.children]) {
    if (stay.has(el) || el.classList.contains('out')) continue;
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
  }
}

function frame() {
  const t = now();
  const step = STEPS[state.i];
  const k = t - state.at;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const p = paramsAt(state.i, k);
  const s = { p, k, t, timerElapsed: state.timerStart == null ? null : t - state.timerStart };
  const changing = state.prevScene && state.prevScene !== step.scene && k < 0.9;
  if (changing) {
    // 別の場面へ：前の画面に吸い込まれるように寄りながら消え、次の画面が奥から来る
    const e = ease.inOut(clamp(k / 0.9));
    g.save();
    g.translate(960, 540);
    g.scale(1 + e * 1.4, 1 + e * 1.4);
    g.translate(-960, -540);
    SCENES[state.prevScene].draw(g, { p: state.prev, k: 99, t });
    g.restore();
    g.save();
    g.globalAlpha = e;
    g.translate(960, 540);
    g.scale(0.82 + 0.18 * e, 0.82 + 0.18 * e);
    g.translate(-960, -540);
    SCENES[step.scene].draw(g, s);
    g.restore();
  } else {
    SCENES[step.scene].draw(g, s);
  }
  if (state.black) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 1920, 1080);
  }
  requestAnimationFrame(frame);
}

function next() {
  const step = STEPS[state.i];
  // タイマーの画面では、最初のクリックでタイマーを動かす
  if (step.scene === 'timer' && state.timerStart == null) return (state.timerStart = now());
  go(state.i + 1);
}
addEventListener('click', (e) => (e.button === 0 ? next() : null));
addEventListener('contextmenu', (e) => { e.preventDefault(); go(state.i - 1); });
addEventListener('keydown', (e) => {
  if (['ArrowRight', ' ', 'PageDown', 'Enter'].includes(e.key)) next();
  else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) go(state.i - 1);
  else if (e.key === 'b' || e.key === 'B' || e.key === '.') state.black = !state.black;
  else if (e.key === 'f' || e.key === 'F') (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  else if (e.key === 't' || e.key === 'T') state.timerStart = null;
  else if (e.key === 'Home') go(0);
});

// shoot.mjs（撮影）用：i 番目を、アニメーションが終わった状態で表示する
window.__slides = { count: STEPS.length, go: (i) => go(i, { instant: true }) };

await document.fonts.load(`900 64px "Noto Sans JP Variable"`);
await document.fonts.load(`800 64px "Inter Variable"`);
go((parseInt(location.hash.slice(1)) || 1) - 1);
requestAnimationFrame(frame);
