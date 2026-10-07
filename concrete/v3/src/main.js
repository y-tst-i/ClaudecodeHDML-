import '@fontsource-variable/noto-sans-jp';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './style.css';
import { STEPS } from './steps.js';

// v3 エンジン：写真と文字だけ。動きは CSS の transition/animation で、JS は「どれを出すか」と数字だけ。
// 操作：クリック / → / スペース = 次へ、右クリック / ← = 戻る、B = 暗転、F = 全画面
const IMG = Object.fromEntries(Object.entries(import.meta.glob('./img/*.jpg', { eager: true, import: 'default' })).map(([p, u]) => [p.split('/').pop().replace('.jpg', ''), u]));
const Q = new URLSearchParams(location.search);
const REC = Q.has('rec');
const STILL = Q.has('still') || REC;
let vt = 0;
const now = () => (REC ? vt : performance.now() / 1000);

const stage = document.getElementById('stage');
if (STILL && !REC) stage.classList.add('still');
const layer = document.getElementById('layer');
const state = { i: -1, at: 0, timerStart: null };

function fit() {
  const k = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `translate(-50%, -50%) scale(${k})`;
}
addEventListener('resize', fit);
fit();

// フィルムグレイン（1回だけ作ってタイルにする）
(() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const d = g.createImageData(256, 256);
  let s = 3;
  for (let i = 0; i < d.data.length; i += 4) {
    s = (s * 16807) % 2147483647;
    const v = s % 256;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  document.querySelector('.grain').style.backgroundImage = `url(${c.toDataURL()})`;
})();

// ---------- 文字 ----------
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
      } else if (c.nodeType === 1 && c.tagName !== 'BR' && !c.classList.contains('nosplit')) walk(c);
    }
  };
  walk(el);
}
const fmt = (v, f) => (f === 'comma' ? v.toLocaleString('en-US') : String(v));
function countUp(el) {
  const to = Number(el.dataset.count), from = Number(el.dataset.from ?? 0);
  const dur = Number(el.dataset.dur ?? 1.2), delay = Number(el.dataset.delay ?? 0);
  const t0 = now();
  const ease = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  if (STILL && !REC) return (el.textContent = fmt(to, el.dataset.fmt));
  const tick = () => {
    const k = Math.min(1, Math.max(0, (now() - t0 - delay) / dur));
    el.textContent = fmt(Math.round(from + (to - from) * ease(k)), el.dataset.fmt);
    if (k < 1) requestAnimationFrame(tick);
  };
  el.textContent = fmt(from, el.dataset.fmt);
  tick();
  if (REC) counters.push(tick);
}
let counters = [];

function renderLayer(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.replace(/data-img="(\w+)"/g, (_, n) => `src="${IMG[n] ?? ''}" data-name="${n}"`);
  const base = (el) => [...el.classList].filter((c) => !['in', 'on', 'out', 'reveal'].includes(c)).join(' ');
  const current = new Map([...layer.children].filter((el) => el.dataset.k && !el.classList.contains('out')).map((el) => [el.dataset.k, el]));
  const stay = new Set();
  counters = [];
  for (const el of [...tpl.content.children]) {
    const old = el.dataset.k && current.get(el.dataset.k);
    // 同じ要素は残す。data-then が付いていれば、残したまま「次の状態」へ（例：3択の答え合わせ）
    if (old && old.dataset.src === (el.dataset.src ?? el.innerHTML) && base(old) === base(el)) {
      if (el.dataset.then) old.classList.add(...el.dataset.then.split(' '));
      stay.add(old);
      continue;
    }
    el.dataset.src = el.innerHTML;
    if (el.matches('.split, .slam, .type')) splitChars(el);
    el.querySelectorAll('.split, .slam, .type').forEach(splitChars);
    el.classList.add('in');
    layer.appendChild(el);
    stay.add(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('on');
      if (el.dataset.then) el.classList.add(...el.dataset.then.split(' '));
      el.querySelectorAll('[data-count]').forEach(countUp);
      if (el.dataset.count) countUp(el);
    }));
  }
  for (const el of [...layer.children]) {
    if (stay.has(el) || el.classList.contains('out')) continue;
    el.classList.add('out');
    setTimeout(() => el.remove(), 700);
  }
}

// ---------- タイマー ----------
function drawTimer() {
  const el = layer.querySelector('[data-timer]');
  if (!el) return;
  const total = Number(el.dataset.timer);
  const left = state.timerStart == null ? total : Math.max(0, total - (now() - state.timerStart));
  const ring = el.querySelector('.prog');
  const C = 2 * Math.PI * 280;
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C * (1 - left / total);
  ring.style.stroke = left <= 30 ? 'var(--accent)' : 'var(--paper)';
  el.querySelector('.timer-txt').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  el.querySelector('.timer-hint').textContent = state.timerStart == null ? 'クリックでスタート' : left === 0 ? 'そこまで！' : '';
}

function go(i) {
  i = Math.max(0, Math.min(STEPS.length - 1, i));
  if (i === state.i) return;
  state.i = i;
  state.at = now();
  state.timerStart = null;
  const step = STEPS[i];
  renderLayer(step.html ?? '');
  stage.dataset.tone = step.tone ?? 'dark';
  document.getElementById('tbSection').textContent = step.section ?? 'INTRODUCTION';
  document.getElementById('tbSheet').textContent = `${String(i + 1).padStart(2, '0')} / ${String(STEPS.length).padStart(2, '0')}`;
  // 衝撃：少し遅れて画面が揺れる
  stage.classList.remove('shake');
  if (step.impact != null) setTimeout(() => { void stage.offsetWidth; stage.classList.add('shake'); }, REC ? 0 : step.impact * 1000);
  history.replaceState(null, '', `#${i + 1}`);
}
function next() {
  if (layer.querySelector('[data-timer]') && state.timerStart == null) return (state.timerStart = now());
  go(state.i + 1);
}
addEventListener('click', (e) => (e.button === 0 ? next() : null));
addEventListener('contextmenu', (e) => { e.preventDefault(); go(state.i - 1); });
addEventListener('keydown', (e) => {
  if (['ArrowRight', ' ', 'PageDown', 'Enter'].includes(e.key)) next();
  else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) go(state.i - 1);
  else if (e.key === 'b' || e.key === 'B' || e.key === '.') stage.classList.toggle('black');
  else if (e.key === 'f' || e.key === 'F') (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
});
const loop = () => { drawTimer(); if (!STILL) requestAnimationFrame(loop); };

// 撮影・録画用
window.__slides = { count: STEPS.length, go: (i) => { go(i); setTimeout(() => layer.querySelectorAll('.in').forEach((el) => el.getAnimations({ subtree: true }).forEach((a) => a.finish?.())), 60); drawTimer(); } };
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
    counters.forEach((f) => f());
    drawTimer();
  },
};

await document.fonts.load('900 64px "Noto Sans JP Variable"');
await document.fonts.load('400 16px "JetBrains Mono"');
go((parseInt(location.hash.slice(1)) || 1) - 1);
loop();
