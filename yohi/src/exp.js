import '@fontsource/jetbrains-mono/600.css';
import { createStage } from './stage.js';

// 体験型サイト：映像と同じシェーダーを、時刻ではなく「見る人の操作」で進める。
// 絵は stage.render(t) の純関数のまま。操作が決めるのは t だけ（映像と絵がズレない）。
const CUT = 3;            // 1カット3秒（film.js と同じ）
const ROOMS = [
  { id: 'C1', hint: 'HOLD' },
  { id: 'C2', hint: 'DRAG' },
  { id: 'C3', hint: 'CLICK' },
  { id: 'C4', hint: 'MOVE' },
  { id: 'C5', hint: '' },
];
// film.js から計算した「絵が変わる瞬間」（カット内の秒）
const BAND_LAND = [...Array(8)].map((_, i) => 0.2 + i * 0.17 + 0.16);   // C1 帯がはまる
const PRESS_WAIT = [0.45, 0.95, 1.45], PRESS_AT = [0.5, 1.0, 1.5];      // C3 刷る
const SLOT = 0.25, SLOT_OFFSET = 0.06;                                  // C4 顔の切替（白フラッシュを避けて少し後ろ）

const $ = (id) => document.getElementById(id);
// Web では質感は軽い JPEG（ロゴは透明が要るので PNG）
const stage = await createStage({
  files: {
    tA: new URL('../assets/logo/logo_a_mode.png', import.meta.url).href, tB: new URL('../assets/logo/logo_b_street.png', import.meta.url).href,
    tD: new URL('../assets/logo/logo_d_mono.png', import.meta.url).href, tWall: new URL('../assets/tex/street_wall.jpg', import.meta.url).href,
    tPaper: new URL('../assets/tex/riso_paper.jpg', import.meta.url).href, tGrain: new URL('../assets/tex/riso_grain.jpg', import.meta.url).href,
    tCrt: new URL('../assets/tex/crt_glass.jpg', import.meta.url).href, tMetal: new URL('../assets/tex/metal_brushed.jpg', import.meta.url).href,
  },
});
$('screen').appendChild(stage.canvas);

// ---------- 音：効果音ファイルを読み込み、操作に合わせて鳴らす ----------
const SFX_URLS = import.meta.glob('../assets/audio/sfx/*.mp3', { eager: true, query: '?url', import: 'default' });
let ctx = null, master = null, muted = false, grooveT0 = 0;
const buffers = {};
function initAudio() {
  if (ctx) return ctx.resume();
  ctx = new AudioContext();
  master = ctx.createGain();
  master.connect(ctx.destination);
  for (const [p, url] of Object.entries(SFX_URLS)) {
    const name = p.split('/').pop().replace('.mp3', '');
    fetch(url).then((r) => r.arrayBuffer()).then((ab) => ctx.decodeAudioData(ab)).then((b) => { buffers[name] = b; }).catch(() => {});
  }
}
function sfx(name, { gain = 1, offset = 0, loop = false, at = 0 } = {}) {
  if (!ctx || !buffers[name]) return null;
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  src.loop = loop;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start(at || 0, Math.min(offset, src.buffer.duration - 0.01));
  return {
    gain: g,
    stop(fade = 0.06) { const t = ctx.currentTime; g.gain.setTargetAtTime(0, t, fade / 3); src.stop(t + fade + 0.05); },
  };
}
let groove = null;
function startGroove() { stopGroove(); groove = sfx('groove', { gain: 0.7, loop: true }); grooveT0 = ctx?.currentTime ?? 0; }
function stopGroove() { groove?.stop(0.2); groove = null; }
// 次の16分音符（ビートに音をハメる）
function next16() { if (!ctx || !groove) return 0; const q = 0.125, d = ctx.currentTime - grooveT0; return grooveT0 + Math.ceil((d + 0.01) / q) * q; }

// ---------- 状態 ----------
let started = false, room = 0, lt = 0, auto = false, holding = false;
let charge = null, spray = null, pressIdx = 0, slot = 0, moveAcc = 0, pendingSlotAt = null, ended = false;

function enter(r) {
  room = r; lt = 0; auto = false; pressIdx = 0; slot = 0; moveAcc = 0; pendingSlotAt = null;
  charge?.stop(); charge = null; spray?.stop(); spray = null;
  if (r > 0) sfx('cut');
  if (r === 1) { sfx('rattle'); startGroove(); spray = sfx('spray', { gain: 0, loop: true }); }
  if (r === 2) { stopGroove(); sfx('feed'); }
  if (r === 3) startGroove();
  if (r === 4) { stopGroove(); sfx('drop'); auto = true; }
  ui();
}
function crossed(prev, now, at) { return prev < at && now >= at; }

function update(dt) {
  if (!started) return;
  const prev = lt;
  if (room === 0) {
    if (auto) lt += dt;
    else if (lt < 0.35) lt = Math.min(0.35, lt + dt);           // 電源が入る
    else if (holding) {                                          // 長押しで溜まる
      if (!charge) charge = sfx('charge', { offset: Math.max(0, lt - 0.3) });
      lt = Math.min(2.0, lt + dt * 0.9);
    }
    else lt = Math.max(0.35, lt - dt * 1.4);                    // 離すと抜けていく（帯が逆再生でほどける）
    BAND_LAND.forEach((at, i) => { if (crossed(prev, lt, at)) sfx('snap', { gain: 0.6 + i * 0.05 }); });
    if (!auto && lt >= 2.0) { auto = true; charge?.stop(0.02); charge = null; sfx('impact'); }
  } else if (room === 1) {
    if (lt < 0.2) lt = Math.min(0.2, lt + dt);
    if (holding && !auto) lt = Math.min(1.76, lt + dt);        // キーボード（スペース長押し）でも描ける
    if (auto) lt += dt;
    // 噴射音の大きさ = 描く速さ
    const speed = (lt - prev) / Math.max(dt, 1e-3);
    if (spray && ctx) spray.gain.gain.setTargetAtTime(auto ? 0 : Math.min(1, speed * 0.8), ctx.currentTime, 0.03);
    if (!auto && lt >= 1.75) auto = true;
    if (crossed(prev, lt, 2.0)) sfx('hit');
  } else if (room === 2) {
    if (auto) lt += dt;
    else if (pressIdx < 3 && lt < PRESS_WAIT[pressIdx]) lt = Math.min(PRESS_WAIT[pressIdx], lt + dt);
  } else if (room === 3) {
    if (lt < SLOT_OFFSET) lt = Math.min(SLOT_OFFSET, lt + dt);
    if (pendingSlotAt !== null && (!ctx || ctx.currentTime >= pendingSlotAt - 0.005)) { pendingSlotAt = null; advanceSlot(); }
  } else if (room === 4) {
    lt = Math.min(2.98, lt + dt);
    if (crossed(prev, lt, 0.6)) sfx('ticks');
    if (crossed(prev, lt, 0.75)) sfx('rattle');
    if (crossed(prev, lt, 0.9)) sfx('spray', { gain: 0.8 })?.gain.gain.setTargetAtTime(0, ctx.currentTime + 0.9, 0.05);
    if (crossed(prev, lt, 2.0)) sfx('final');
    if (lt >= 2.98 && !ended) { ended = true; ui(); }
  }
  if (room < 4 && lt >= CUT) enter(room + 1);
}

// C4：動かした量がたまるたびに、次の16分音符で顔を切り替える（音と絵を同時に）
function requestSlot() {
  if (room !== 3 || pendingSlotAt !== null) return;
  const at = next16();
  if (at) { pendingSlotAt = at; sfx(`stab${(slot + 1) % 4}`, { at }); }
  else { advanceSlot(); sfx(`stab${slot % 4}`); }
}
function advanceSlot() {
  slot++;
  if (slot >= 12) { enter(4); return; }
  lt = slot * SLOT + SLOT_OFFSET;
}
// C3：クリックで刷る
function press() {
  if (room !== 2 || auto || pressIdx >= 3 || lt < PRESS_WAIT[pressIdx] - 0.001) return;
  lt = PRESS_AT[pressIdx];
  sfx(`press${pressIdx + 1}`);
  pressIdx++;
  if (pressIdx === 3) auto = true;   // 3回目のあとは最後まで自動。それ以外は update() が次の待ち位置まで進める
  ui();
}
// ---------- 入力（マウス・タッチ・キーボード） ----------
function begin() {
  if (!started) { started = true; initAudio(); sfx('power'); }
  else initAudio();
}
function holdStart() {
  begin();
  holding = true;
  if (room === 2) press();
  if (room === 3) requestSlot();
}
function holdEnd() { holding = false; if (room === 0) { charge?.stop(0.08); charge = null; } }
let lastX = 0, lastY = 0;
const surface = $('screen');
surface.addEventListener('pointerdown', (e) => { lastX = e.clientX; lastY = e.clientY; surface.setPointerCapture(e.pointerId); holdStart(); });
surface.addEventListener('pointerup', holdEnd);
surface.addEventListener('pointercancel', holdEnd);
surface.addEventListener('pointermove', (e) => {
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  if (room === 1 && holding && !auto && lt >= 0.2) lt = Math.min(1.76, lt + Math.abs(dx) / innerWidth * 1.8 + Math.abs(dy) / innerHeight * 0.6);
  if (room === 3 && started) { moveAcc += Math.hypot(dx, dy); if (moveAcc > 90) { moveAcc = 0; requestSlot(); } }
});
addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  if (e.target.tagName === 'BUTTON') return;
  e.preventDefault();
  holdStart();
});
addEventListener('keyup', (e) => { if (e.code === 'Space') holdEnd(); });

// ---------- UI：最小限。英字の字間0・8の倍数・角丸なし ----------
function ui() {
  $('count').textContent = `${String(room + 1).padStart(2, '0')} / 05`;
  const showHint = !auto && !ended && ROOMS[room].hint;
  $('hint').textContent = !started ? 'HOLD' : showHint ? ROOMS[room].hint : '';
  $('replay').hidden = !ended;
}
$('sound').addEventListener('click', () => {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 1;
  $('sound').textContent = muted ? 'SOUND OFF' : 'SOUND ON';
  $('sound').setAttribute('aria-pressed', String(!muted));
});
$('replay').addEventListener('click', () => { ended = false; enter(0); lt = 0; begin(); sfx('power'); });

// ---------- 画面サイズ（最大1920x1080、16:9） ----------
function fit() {
  const w = Math.min(innerWidth, innerHeight * 16 / 9), dpr = Math.min(devicePixelRatio || 1, 2);
  const pw = Math.min(1920, Math.round(w * dpr));
  stage.setSize(pw, Math.round(pw * 9 / 16));
}
addEventListener('resize', fit);
fit();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  // C1 の長押し進捗を細い線で見せる
  const p = room === 0 && !auto ? Math.max(0, (lt - 0.35) / 1.65) : room === 1 && !auto ? Math.max(0, (lt - 0.2) / 1.55) : room === 2 ? pressIdx / 3 : room === 3 ? slot / 12 : 0;
  $('bar').style.transform = `scaleX(${started && ROOMS[room].hint && !auto ? p : 0})`;
  stage.render(room * CUT + lt);
  requestAnimationFrame(frame);
}
ui();
requestAnimationFrame(frame);

// 自動テスト用（scripts/smoke-yohi-exp.mjs）
window.__exp = { state: () => ({ started, room, lt, auto, ended, slot, pressIdx }) };
