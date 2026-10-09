// 効果音エンジン（体験型サイトとブラウン管の部屋で共通）。
// 音はファイル（yohi/audio/build.mjs --sfx で書き出したもの）、鳴らすタイミングはコード。
const SFX_URLS = import.meta.glob('../assets/audio/sfx/*.mp3', { eager: true, query: '?url', import: 'default' });

let ctx = null, master = null, error = '';
const buffers = {};

// 埋め込み（data: URL）は fetch を使わずにバイト列にする（公開先の CSP で data: への fetch が止められるため）
function toArrayBuffer(url) {
  if (!url.startsWith('data:')) return fetch(url).then((r) => r.arrayBuffer());
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return Promise.resolve(bytes.buffer);
}

// ページを開いた時点で準備（止まった AudioContext でも decode はできる）。鳴らし始めは最初の操作で resume()
export function prepareAudio() {
  if (ctx) return;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { error = String(e); return; }
  master = ctx.createGain();
  master.connect(ctx.destination);
  for (const [p, url] of Object.entries(SFX_URLS)) {
    const name = p.split('/').pop().replace('.mp3', '');
    toArrayBuffer(url).then((ab) => ctx.decodeAudioData(ab)).then((b) => { buffers[name] = b; }).catch((e) => { error = `${name}: ${e}`; });
  }
}
export function resumeAudio() { if (ctx && ctx.state !== 'running') ctx.resume(); }
export function setMuted(m) { if (master) master.gain.value = m ? 0 : 1; }
export function audioState() { return { state: ctx?.state, loaded: Object.keys(buffers).length, error }; }

// 鳴らす。pan -1..1。止まった状態で予約しても resume した瞬間に鳴る
export function sfx(name, { gain = 1, offset = 0, loop = false, pan = 0 } = {}) {
  if (!ctx || !buffers[name]) return null;
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  src.loop = loop;
  const g = ctx.createGain();
  g.gain.value = gain;
  let node = src.connect(g);
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
  node.connect(master);
  src.start(0, Math.min(offset, src.buffer.duration - 0.01));
  return {
    gain: g,
    stop(fade = 0.06) { const t = ctx.currentTime; g.gain.setTargetAtTime(0, t, fade / 3); src.stop(t + fade + 0.05); },
  };
}
