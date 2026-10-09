// YOHI IWAKIRI — 15秒の音をコードで合成して WAV に書き出す。
//   node yohi/audio/build.mjs  → yohi/assets/audio/score.wav（48kHz / ステレオ / 16bit）
// 映像と同じく「時刻だけで決まる」：乱数は種つき（mulberry32）。音のタイミングは film.js の動きから計算する。
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SR = 48000;
const DURATION = 15;
const BEAT = 0.5; // 120BPM
const N = SR * DURATION;
const L = new Float32Array(N), R = new Float32Array(N);       // ドライ
const sendL = new Float32Array(N), sendR = new Float32Array(N); // 残響へ送る分

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(2026);
const noise = () => rnd() * 2 - 1;

// 鳴らす：fn(τ) が τ 秒目のモノラル値を返す。pan -1..1、rev は残響への送り量
function play(t0, dur, fn, { gain = 1, pan = 0, rev = 0.15 } = {}) {
  const i0 = Math.max(0, Math.round(t0 * SR)), i1 = Math.min(N, Math.round((t0 + dur) * SR));
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = i0; i < i1; i++) {
    const v = fn((i - t0 * SR) / SR);
    L[i] += v * gl; R[i] += v * gr;
    sendL[i] += v * gl * rev; sendR[i] += v * gr * rev;
  }
}

// フィルタ（RBJ biquad）。毎サンプル係数を変えられるように関数で返す
function biquad() {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x, type, f, q = 0.707) => {
    const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; } // bp
    const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const range = (t, a, b) => clamp01((t - a) / (b - a));

// ---------- 楽器 ----------
function kick(t0, g = 1, len = 0.45) {
  let ph = 0;
  play(t0, len, (t) => { ph += 2 * Math.PI * (45 + 110 * Math.exp(-t / 0.035)) / SR; return Math.tanh(Math.sin(ph) * 1.6) * Math.exp(-t / (len * 0.4)) + noise() * 0.3 * Math.exp(-t / 0.004); }, { gain: 0.9 * g, rev: 0.05 });
}
function sub(t0, g = 1, len = 1.6, f = 41.2) {
  let ph = 0;
  play(t0, len, (t) => { ph += 2 * Math.PI * f * (1 + 0.6 * Math.exp(-t / 0.08)) / SR; return Math.tanh(Math.sin(ph) * 2.2) * env(t, 0.005, len * 0.35); }, { gain: 0.7 * g, rev: 0.02 });
}
function hat(t0, g = 1, open = false) {
  const f = biquad();
  play(t0, open ? 0.25 : 0.06, (t) => f(noise(), 'hp', 8000) * Math.exp(-t / (open ? 0.08 : 0.018)), { gain: 0.32 * g, pan: 0.25, rev: 0.08 });
}
function clap(t0, g = 1) {
  const f = biquad();
  play(t0, 0.3, (t) => {
    const bursts = [0, 0.011, 0.022].reduce((s, o) => s + (t >= o ? Math.exp(-(t - o) / 0.006) : 0), 0);
    return f(noise(), 'bp', 1400, 0.9) * (bursts * 0.6 + Math.exp(-t / 0.09));
  }, { gain: 0.5 * g, rev: 0.35 });
}
// ブラウン管：帯がはまる「カチッ」
function snap(t0, g = 1, pan = 0) {
  const f = biquad();
  play(t0, 0.08, (t) => (Math.sin(2 * Math.PI * 2300 * t) * 0.5 + f(noise(), 'bp', 4200, 2)) * Math.exp(-t / 0.012), { gain: 0.7 * g, pan, rev: 0.2 });
}
// 衝撃：サブ＋ノイズの破裂＋キック＋ブラウン管の高い鳴き
function impact(t0, g = 1) {
  kick(t0, 1.3 * g, 0.7);
  sub(t0, 1.1 * g, 2.0);
  const f = biquad();
  play(t0, 1.4, (t) => f(noise(), 'lp', 300 + 9000 * Math.exp(-t / 0.15)) * Math.exp(-t / 0.35), { gain: 0.55 * g, rev: 0.6 });
  play(t0, 0.9, (t) => Math.sin(2 * Math.PI * 7800 * t) * 0.04 * Math.exp(-t / 0.3), { gain: g, rev: 0.3 });
}
// カット頭の白フラッシュに合わせた「バシッ」
function cutHit(t0, g = 1) {
  const f = biquad();
  play(t0, 0.6, (t) => f(noise(), 'hp', 2500) * Math.exp(-t / 0.12), { gain: 0.35 * g, rev: 0.5 });
}
// 次のカットへ吸い込まれる上昇音
function riser(t1, dur = 0.6, g = 1) {
  const f = biquad();
  play(t1 - dur, dur, (t) => { const k = t / dur; return f(noise(), 'bp', 600 + 7000 * k * k, 1.2) * k * k; }, { gain: 0.35 * g, rev: 0.3 });
}
// ブラウン管の電源：ボン＋消磁のブーン
function powerOn(t0) {
  let ph = 0;
  play(t0, 0.9, (t) => { ph += 2 * Math.PI * 60 / SR; return (Math.sign(Math.sin(ph)) * 0.25 + Math.sin(ph * 3) * 0.2) * Math.exp(-t / 0.25); }, { gain: 0.35, rev: 0.2 });
  kick(t0, 0.6, 0.3);
}
function hum(t0, t1) {
  let ph = 0;
  const f = biquad();
  play(t0, t1 - t0, (t) => { ph += 2 * Math.PI * 50 / SR; const fade = range(t, 0, 0.3) * (1 - range(t, t1 - t0 - 0.1, t1 - t0)); return (Math.sin(ph) * 0.5 + Math.sin(ph * 2) * 0.3 + f(noise(), 'bp', 3000, 3) * 0.15 * (rnd() > 0.995 ? 6 : 1)) * fade; }, { gain: 0.12, rev: 0.05 });
}
// スプレー缶：振る音（中の玉）と噴射
function rattle(t0) {
  for (let k = 0; k < 4; k++) {
    const f = biquad();
    play(t0 + k * 0.055, 0.05, (t) => f(noise(), 'bp', 3500 + 900 * k, 4) * Math.exp(-t / 0.008), { gain: 0.5, pan: -0.3, rev: 0.15 });
  }
}
function spray(t0, t1, g = 1, pan = 0) {
  const f1 = biquad(), f2 = biquad();
  const d = t1 - t0;
  play(t0, d, (t) => { const a = range(t, 0, 0.02) * (1 - range(t, d - 0.03, d)); return (f1(noise(), 'bp', 6500, 0.7) + f2(noise(), 'bp', 2400, 1.5) * 0.4) * a * (0.85 + 0.15 * Math.sin(t * 40)); }, { gain: 0.45 * g, pan, rev: 0.25 });
}
// 垂れる雫の「ポタッ」
function drip(t0, g = 1, pan = 0) {
  play(t0, 0.08, (t) => Math.sin(2 * Math.PI * (300 + 900 * Math.exp(-t / 0.012)) * t) * Math.exp(-t / 0.02), { gain: 0.3 * g, pan, rev: 0.4 });
}
// 紙送り
function paperFeed(t0, dur) {
  const f = biquad();
  play(t0, dur, (t) => { const k = t / dur; return f(noise(), 'bp', 900 + 2500 * k, 0.8) * Math.sin(Math.PI * k); }, { gain: 0.45, pan: 0, rev: 0.15 });
}
// 印刷機の「ガシャン」：低い打撃＋金属の鳴り（倍音がずれた正弦波）＋ノイズ
function stamp(t0, g = 1) {
  kick(t0, 0.9 * g, 0.35);
  const f = biquad();
  const partials = [420, 1130, 1870, 2930, 4410];
  play(t0, 0.5, (t) => partials.reduce((s, p, i) => s + Math.sin(2 * Math.PI * p * t) * Math.exp(-t / (0.18 / (i + 1))) / (i + 1.5), 0) * 0.6 + f(noise(), 'lp', 2500) * Math.exp(-t / 0.03), { gain: 0.5 * g, rev: 0.35 });
}
// グリッチ：0.25秒ごとに違うデジタルの破片
function glitch(t0, slot) {
  const kind = slot % 3, hz = [220, 330, 440, 660, 880][(slot * 7) % 5];
  const pan = ((slot * 37) % 9) / 4 - 1;
  if (kind === 0) play(t0, 0.07, (t) => Math.sign(Math.sin(2 * Math.PI * hz * t)) * Math.exp(-t / 0.03), { gain: 0.12, pan, rev: 0.1 });
  else if (kind === 1) { let hold = 0; play(t0, 0.09, (t) => { if ((Math.round(t * SR) % 24) === 0) hold = noise(); return hold * Math.exp(-t / 0.04); }, { gain: 0.25, pan, rev: 0.1 }); }
  else play(t0, 0.12, (t) => Math.sin(2 * Math.PI * hz * 2 * t * (1 + 4 * t)) * (Math.floor(t * 60) % 2) * Math.exp(-t / 0.05), { gain: 0.15, pan, rev: 0.1 });
}
// 上から落ちてくる風切り
function whoosh(t0, dur) {
  const f = biquad();
  play(t0, dur, (t) => { const k = t / dur; return f(noise(), 'bp', 4000 - 3000 * k, 1) * Math.sin(Math.PI * Math.min(1, k * 1.2)); }, { gain: 0.4, rev: 0.3 });
}
function tick(t0, g = 1, pan = 0) {
  play(t0, 0.02, (t) => Math.sin(2 * Math.PI * 3200 * t) * Math.exp(-t / 0.004), { gain: 0.18 * g, pan, rev: 0.15 });
}

// ---------- 譜面（film.js と同じ時刻） ----------
// C1 SIGNAL 0–3
powerOn(0);
hum(0, 3);
for (let band = 7; band >= 0; band--) snap(0.2 + (7 - band) * 0.17 + 0.16, 0.8 + (7 - band) * 0.05, band % 2 ? -0.4 : 0.4);
riser(2.0, 0.55, 0.8);
impact(2.0);
kick(2.5, 0.5);
riser(3.0, 0.45, 0.6);
// C2 STREET 3–6：拍に乗る。描く速さに合わせて噴射
cutHit(3.0);
rattle(3.0);
for (let b = 3.0; b < 6.0; b += BEAT) { kick(b, 0.85); hat(b + 0.25); }
clap(4.0); clap(5.0);
sub(3.0, 0.6, 1.0); sub(4.0, 0.6, 1.0, 49);
spray(3.2, 3.62, 1.0, -0.4); spray(3.85, 4.0, 0.9, 0); spray(4.0, 4.75, 1.0, 0.4);
impact(5.0, 0.7);
for (let k = 0; k < 9; k++) drip(5.1 + k * 0.1 + rnd() * 0.06, 0.6 + rnd() * 0.5, rnd() * 1.6 - 0.8);
riser(6.0, 0.5, 0.7);
// C3 MODE 6–9：紙送り → ガシャン、ガシャン、ガッシャン
cutHit(6.0);
paperFeed(6.0, 0.42);
stamp(6.5, 0.8); stamp(7.0, 0.9); stamp(7.5, 1.3); sub(7.5, 0.8, 1.2);
for (let b = 8.0; b < 9.0; b += 0.25) hat(b, 0.7);
riser(9.0, 0.5, 0.8);
// C4 GLITCH 9–12：いちばん密度が高い
cutHit(9.0);
for (let s = 0; s < 12; s++) glitch(9.0 + s * 0.25, s);
for (let b = 9.0; b < 12.0; b += BEAT) { kick(b, 1.0); sub(b, 0.35, 0.45, b % 2 < 1 ? 41.2 : 55); }
for (let b = 9.0; b < 12.0; b += 0.125) hat(b, b % 0.25 ? 0.5 : 0.9);
clap(9.5); clap(10.5); clap(11.5);
riser(12.0, 0.7, 1.0);
// C5 LOCKUP 12–15：落ちて、伸びて、吹き付けて、決める
cutHit(12.0, 1.3);
whoosh(12.0, 0.3);
kick(12.3, 1.2, 0.6); sub(12.3, 0.9, 1.5);
for (let k = 0; k < 16; k++) tick(12.35 + k * 0.03 + 0.25, 0.6 + k * 0.03, k / 7.5 - 1);
rattle(12.75);
spray(12.9, 13.9, 0.9, 0.5);
impact(14.0, 1.1);

// ---------- 残響（Schroeder：コム4本＋オールパス2本、左右で長さを変えて広がり） ----------
function reverb(inp, combs, aps) {
  const out = new Float32Array(N);
  for (const len of combs) {
    const buf = new Float32Array(len); let i = 0, lp = 0;
    for (let n = 0; n < N; n++) { const y = buf[i]; lp = y * 0.7 + lp * 0.3; buf[i] = inp[n] + lp * 0.8; out[n] += y / combs.length; i = (i + 1) % len; }
  }
  for (const len of aps) {
    const buf = new Float32Array(len); let i = 0;
    for (let n = 0; n < N; n++) { const b = buf[i], x = out[n]; out[n] = -x + b; buf[i] = x + b * 0.5; i = (i + 1) % len; }
  }
  return out;
}
const wl = reverb(sendL, [1557, 1617, 1491, 1422].map((x) => x * 2), [225, 556]);
const wr = reverb(sendR, [1580, 1640, 1514, 1445].map((x) => x * 2), [248, 579]);

// ---------- 仕上げ：残響を足して、軽く潰して（tanh）、最後は減衰。16bit WAV ----------
const pcm = Buffer.alloc(44 + N * 4);
let peak = 0;
for (let n = 0; n < N; n++) peak = Math.max(peak, Math.abs(L[n] + wl[n] * 0.5), Math.abs(R[n] + wr[n] * 0.5));
const pre = 1.6 / peak;
for (let n = 0; n < N; n++) {
  const t = n / SR, fade = 1 - range(t, DURATION - 0.4, DURATION);
  const l = Math.tanh((L[n] + wl[n] * 0.5) * pre) * 0.89 * fade;
  const r = Math.tanh((R[n] + wr[n] * 0.5) * pre) * 0.89 * fade;
  pcm.writeInt16LE(Math.round(l * 32767), 44 + n * 4);
  pcm.writeInt16LE(Math.round(r * 32767), 46 + n * 4);
}
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write('WAVE', 8);
pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34);
pcm.write('data', 36); pcm.writeUInt32LE(N * 4, 40);
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/audio/score.wav');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, pcm);
console.log(`→ ${out}`);
