import '@fontsource-variable/noto-sans-jp';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './style.css';
import * as THREE from 'three';
import { createComposite } from './composite.js';
import { createWall } from './scenes/wall.js';
import { createCube } from './scenes/cube.js';
import { createPantheon } from './scenes/pantheon.js';
import { STEPS } from './steps.js';

// v2 エンジン：WebGL の世界を2つの画面(A/B)に描き、転換シェーダーで合成。文字は HTML で1文字ずつ動かす。
THREE.ColorManagement.enabled = false;
const Q = new URLSearchParams(location.search);
const stage = document.getElementById('stage');
const layer = document.getElementById('layer');
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(1);
renderer.setSize(1920, 1080, false);
const RS = Number(Q.get('scale') ?? 1); // 内部解像度（撮影環境向けに下げられる）
const rtOpts = { type: THREE.HalfFloatType, samples: 4 };
const rtA = new THREE.WebGLRenderTarget(1920 * RS, 1080 * RS, rtOpts);
const rtB = new THREE.WebGLRenderTarget(1920 * RS, 1080 * RS, rtOpts);
if (RS !== 1) renderer.setSize(1920 * RS, 1080 * RS, false);
const comp = createComposite();
const SCENES = { wall: createWall(), cube: createCube(), pantheon: createPantheon() };

const clamp = (x) => Math.min(1, Math.max(0, x));
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const REC = Q.has('rec'); // 録画用：時間を1コマずつ進める
let vt = 0;
const now = () => (REC ? vt : performance.now() / 1000);
const state = { i: -1, at: 0, prev: null, prevScene: null };

function fit() {
  const k = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `translate(-50%, -50%) scale(${k})`;
}
addEventListener('resize', fit);
fit();

// 数値パラメータは前の行から補間（easing はステップごとに選べる）
function paramsAt(i, k) {
  const step = STEPS[i];
  const from = step.from ?? (state.prevScene === step.scene && state.prev ? state.prev : null);
  if (!from) return { ...step.p };
  const e = (step.ease === 'expo' ? outExpo : inOut)(clamp((k - (step.delay ?? 0)) / (step.dur ?? 1.4)));
  const out = {};
  for (const key of new Set([...Object.keys(from), ...Object.keys(step.p)])) {
    const a = from[key], b = step.p[key];
    out[key] = typeof a === 'number' && typeof b === 'number' ? a + (b - a) * e : key in step.p ? b : a;
  }
  return out;
}

function go(i, { instant = false } = {}) {
  i = Math.max(0, Math.min(STEPS.length - 1, i));
  if (i === state.i) return;
  if (state.i >= 0) {
    state.prev = paramsAt(state.i, now() - state.at);
    state.prevScene = STEPS[state.i].scene;
  }
  state.i = i;
  state.at = instant ? now() - 30 : now();
  const step = STEPS[i];
  renderLayer(step.html ?? '');
  stage.dataset.tone = step.tone ?? 'dark';
  document.getElementById('tbSection').textContent = step.section ?? 'INTRODUCTION';
  document.getElementById('tbSheet').textContent = `${String(i + 1).padStart(2, '0')} / ${String(STEPS.length).padStart(2, '0')}`;
  history.replaceState(null, '', `#${i + 1}`);
}

// 文字：1文字ずつマスクの下からせり上がる（.split）、叩きつける（.slam）、数字は数え上げる（data-count）
function splitChars(el) {
  let n = 0;
  const walk = (node) => {
    for (const c of [...node.childNodes]) {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const ch of c.textContent) {
          const o = document.createElement('span');
          o.className = 'ch';
          const inner = document.createElement('span');
          inner.textContent = ch;
          inner.style.setProperty('--i', n++);
          o.appendChild(inner);
          frag.appendChild(o);
        }
        c.replaceWith(frag);
      } else if (c.nodeType === 1 && c.tagName !== 'BR') walk(c);
    }
  };
  walk(el);
}
function countUp(el) {
  const to = Number(el.dataset.count);
  const t0 = now();
  const delay = Number(el.dataset.delay ?? 0);
  const tick = () => {
    const k = clamp((now() - t0 - delay) / 1.1);
    el.textContent = Math.round(to * outExpo(k));
    if (k < 1) requestAnimationFrame(tick);
  };
  tick();
}
function renderLayer(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const base = (el) => [...el.classList].filter((c) => !['in', 'on', 'out'].includes(c)).join(' ');
  const current = new Map([...layer.children].filter((el) => el.dataset.k && !el.classList.contains('out')).map((el) => [el.dataset.k, el]));
  const stay = new Set();
  for (const el of [...tpl.content.children]) {
    const old = el.dataset.k && current.get(el.dataset.k);
    if (old && old.dataset.src === el.innerHTML && base(old) === base(el)) {
      stay.add(old);
      continue;
    }
    el.dataset.src = el.innerHTML;
    if (el.matches('.split, .slam')) splitChars(el);
    el.classList.add('in');
    layer.appendChild(el);
    stay.add(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('on');
      if (STILL) el.querySelectorAll('[data-count]').forEach((c) => (c.textContent = c.dataset.count));
    else el.querySelectorAll('[data-count]').forEach(countUp);
      if (el.dataset.count) countUp(el);
    }));
  }
  for (const el of [...layer.children]) {
    if (stay.has(el) || el.classList.contains('out')) continue;
    el.classList.add('out');
    setTimeout(() => el.remove(), 500);
  }
}

const STILL = Q.has('still') || REC; // 撮影用：毎フレームは描かず、go() のたびに1回だけ描く
function frame() {
  drawOnce();
  if (!STILL) requestAnimationFrame(frame);
}
function drawOnce() {
  const t = now();
  const step = STEPS[state.i];
  const k = t - state.at;
  const trans = step.trans ?? (state.prevScene && state.prevScene !== step.scene ? 'fade' : 'none');
  const tdur = trans === 'pour' ? 2.4 : trans === 'fade' ? 1.0 : 0;
  const s = { p: paramsAt(state.i, k), k, t };
  const u = comp.uniforms;
  const transitioning = state.prevScene && tdur > 0 && k < tdur;
  if (transitioning) {
    SCENES[state.prevScene].render(renderer, rtA, { p: state.prev, k: 99, t });
    u.uType.value = trans === 'pour' ? 2 : 1;
    u.uP.value = k / tdur;
  } else {
    u.uType.value = 0;
    u.uP.value = 1;
  }
  SCENES[step.scene].render(renderer, rtB, s);
  u.tA.value = rtA.texture;
  u.tB.value = rtB.texture;
  u.uTime.value = t;
  // 衝撃：揺れと白フラッシュ（impact の行だけ）
  const hit = step.impact != null ? Math.max(0, 1 - (k - step.impact) / 0.45) * (k >= step.impact ? 1 : 0) : 0;
  u.uShake.value.set(Math.sin(t * 93) * 0.012 * hit * hit, Math.cos(t * 71) * 0.012 * hit * hit);
  u.uFlash.value = step.impact != null && k >= step.impact ? Math.max(0, 1 - (k - step.impact) / 0.18) * 0.55 : 0;
  comp.render(renderer);
}

function next() { go(state.i + 1); }
addEventListener('click', (e) => (e.button === 0 ? next() : null));
addEventListener('contextmenu', (e) => { e.preventDefault(); go(state.i - 1); });
addEventListener('keydown', (e) => {
  if (['ArrowRight', ' ', 'PageDown', 'Enter'].includes(e.key)) next();
  else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) go(state.i - 1);
  else if (e.key === 'f' || e.key === 'F') (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  else if (e.key === 'b' || e.key === 'B') stage.classList.toggle('black');
});
const started = new WeakMap();
window.__rec = {
  go: (i) => go(i),
  frame(dt) {
    vt += dt;
    for (const a of document.getAnimations()) {
      if (!started.has(a)) started.set(a, vt);
      a.pause();
      a.currentTime = (vt - started.get(a)) * 1000;
    }
    drawOnce();
  },
};
window.__slides = {
  count: STEPS.length,
  go: (i) => {
    go(i, { instant: true });
    if (STILL) drawOnce();
  },
};

await document.fonts.load('900 64px "Noto Sans JP Variable"');
await document.fonts.load('400 16px "JetBrains Mono"');
go((parseInt(location.hash.slice(1)) || 1) - 1);
requestAnimationFrame(frame);
