import * as THREE from 'three';
import { createCreature } from '../chara/creature.js';
import { sfx } from '../audio.js';

// 場面4（エンディング）：G8「持ち帰る夜」。カメラが引くと、巡ってきた3つの場面は1枚の紙に刷られたポスターだった。
// ポスターには、その人が路地で吹いたスプレーの跡がそのまま刷られている。けものが紙を折り、しっぽの火花で封をする。
// 絵は state（t）だけで決まる。ポスターは入った時に1回だけ作る（各場面の1コマ＋吹いた跡から）。
const PW = 1200, PH = 2000;                          // ポスターの画素（紙は 1.2 × 2.0）
const PANELS = [220, 800, 1380];                     // 3つの場面のコマの上端（960×540）
const PULL = [0.3, 3.2], WALK = [2.6, 3.8], FOLD = [4.3, 5.1], SEAL = 5.35, END_AT = 6.2;

export async function createEnd(renderer, env, { getShots, getSpray }) {
  const loader = new THREE.TextureLoader();
  const load = async (url, srgb = true, r = 1) => {
    const t = await loader.loadAsync(url);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(r, r);
    t.anisotropy = 8;
    return t;
  };
  const tex = {
    paper: await load(new URL('../../assets/tex/riso_paper.webp', import.meta.url).href),
    grain: await load(new URL('../../assets/tex/riso_grain.webp', import.meta.url).href, false),
    floor: await load(new URL('../../assets/shop/floor_ink.webp', import.meta.url).href, true, 4),
    logoA: await load(new URL('../../assets/logo/logo_a_mode.webp', import.meta.url).href),
    logoB: await load(new URL('../../assets/logo/logo_b_street.webp', import.meta.url).href),
    logoD: await load(new URL('../../assets/logo/logo_d_mono.webp', import.meta.url).href),
  };

  // ---------- ポスター（2D の canvas で刷る：黒とオレンジの2色、版ずれ、紙の粒） ----------
  const poster = document.createElement('canvas');
  poster.width = PW; poster.height = PH;
  const pg = poster.getContext('2d');
  const posterTex = new THREE.CanvasTexture(poster);
  posterTex.colorSpace = THREE.SRGBColorSpace;
  posterTex.anisotropy = 8;
  const PAPER = [226, 216, 196], ORANGE = [255, 72, 27], INK = [18, 16, 17];
  // 1コマを2色刷りにする：明るい所は紙、中くらいはオレンジ、暗い所は黒。黒の版は少しずらす
  function riso(src, x, y, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (src) g.drawImage(src, 0, 0, w, h); else { g.fillStyle = '#222'; g.fillRect(0, 0, w, h); }
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
    // 暗い場面でも読めるように、コマごとに明るさを伸ばす（下2%〜上99.5%を 0〜1 に）
    const sorted = Float32Array.from(lum).sort();
    const lo = sorted[Math.floor(sorted.length * 0.02)], hi = Math.max(lo + 0.05, sorted[Math.floor(sorted.length * 0.995)]);
    for (let i = 0; i < w * h; i++) lum[i] = Math.pow(Math.min(1, Math.max(0, (lum[i] - lo) / (hi - lo))), 0.8);
    const ox = 4, oy = 3;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = yy * w + xx, l = lum[i];
      // 網点（45度の格子）で中間の濃さを表す
      const dot = (Math.sin((xx + yy) * 0.55) * Math.sin((xx - yy) * 0.55) + 1) * 0.5;
      // オレンジの版：中くらいの明るさを網点で。黒の版：暗い所を網点で（少しずらして刷る）
      const o = l > 0.18 + dot * 0.12 && l < 0.7 + dot * 0.25 ? 1 : 0;
      const kx = Math.min(w - 1, xx + ox), ky = Math.min(h - 1, yy + oy);
      const k = lum[ky * w + kx] < 0.08 + dot * 0.3 ? 1 : 0;
      let r = PAPER[0], gg = PAPER[1], b = PAPER[2];
      if (o) { r = r * ORANGE[0] / 255; gg = gg * ORANGE[1] / 255; b = b * ORANGE[2] / 255; }
      if (k) { r = r * INK[0] / 255 * 1.4; gg = gg * INK[1] / 255 * 1.4; b = b * INK[2] / 255 * 1.4; }
      d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    pg.globalCompositeOperation = 'multiply';
    pg.drawImage(c, x, y);
    pg.globalCompositeOperation = 'source-over';
  }
  function compose() {
    pg.fillStyle = `rgb(${PAPER})`;
    pg.fillRect(0, 0, PW, PH);
    // 紙の質感
    pg.globalAlpha = 0.5; pg.globalCompositeOperation = 'multiply';
    pg.drawImage(tex.paper.image, 0, 0, PW, PH);
    pg.globalAlpha = 1; pg.globalCompositeOperation = 'source-over';
    // 見出し（ロゴA）と、3つの場面
    const la = tex.logoA.image, lw = 760, lh = lw * la.height / la.width;
    pg.globalCompositeOperation = 'multiply';
    pg.drawImage(la, (PW - lw) / 2, 110 - lh / 2, lw, lh);
    pg.globalCompositeOperation = 'source-over';
    const shots = getShots();
    PANELS.forEach((y, i) => riso(shots[i], 120, y, 960, 540));
    // その人が吹いた跡：オレンジの版として、ポスター全体に大きく重ねて刷る（世界に1枚）
    const spray = getSpray();
    if (spray) {
      pg.globalAlpha = 0.85; pg.globalCompositeOperation = 'multiply';
      pg.save(); pg.translate(PW / 2, 1070); pg.rotate(-0.08);
      pg.drawImage(spray, -PW * 0.62, -PW * 0.41, PW * 1.24, PW * 0.83);
      pg.restore();
      pg.globalAlpha = 1; pg.globalCompositeOperation = 'source-over';
    }
    // 下の帯：日付と番号（吹いた跡から決まる）
    pg.fillStyle = `rgb(${INK})`;
    pg.font = '600 28px "JetBrains Mono", monospace';
    const d = new Date();
    pg.fillText(`NIGHT ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`, 120, 1975);
    pg.textAlign = 'right';
    pg.fillText('YOHI IWAKIRI', 1080, 1975);
    pg.textAlign = 'left';
    posterTex.needsUpdate = true;
  }

  // ---------- 場面：暗い作業台、吊りランプ、紙、けもの ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030304);
  scene.fog = new THREE.FogExp2(0x030304, 0.12);
  const table = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ map: tex.floor, roughness: 0.7, color: 0x6a6a6a }));
  table.rotation.x = -Math.PI / 2;
  scene.add(table);
  // 紙：上半分と下半分（下半分が折れて上に重なる）。下半分の裏は無地の紙
  const paperMat = new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.92, color: 0xd8d2c8 });
  // 折った紙の表（下半分の裏）：無地の紙に、その人のタグを宛名のように小さく
  const back = document.createElement('canvas');
  back.width = 1200; back.height = 1000;
  const bg2 = back.getContext('2d');
  const backTex = new THREE.CanvasTexture(back);
  backTex.colorSpace = THREE.SRGBColorSpace;
  function composeBack() {
    bg2.fillStyle = `rgb(${PAPER})`; bg2.fillRect(0, 0, 1200, 1000);
    bg2.globalAlpha = 0.55; bg2.globalCompositeOperation = 'multiply';
    bg2.drawImage(tex.paper.image, 0, 0, 1200, 1000);
    bg2.globalAlpha = 1;
    const spray = getSpray();
    if (spray) { bg2.globalAlpha = 0.9; bg2.drawImage(spray, 300, 560, 600, 400); bg2.globalAlpha = 1; }
    bg2.globalCompositeOperation = 'source-over';
    bg2.fillStyle = `rgb(${INK})`; bg2.font = '600 26px "JetBrains Mono", monospace'; bg2.textAlign = 'center';
    bg2.fillText('FOR YOU, FROM THE NIGHT', 600, 960);
    backTex.needsUpdate = true;
  }
  const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.95, color: 0xd0c8b8 });
  const half = (v0, v1) => {
    const geo = new THREE.PlaneGeometry(1.2, 1.0, 1, 1);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (v1 - v0) + v0);
    return geo;
  };
  const sheet = new THREE.Group();
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.y = 0.003;
  scene.add(sheet);
  const top = new THREE.Mesh(half(0.5, 1), paperMat);
  top.position.y = 0.5;
  sheet.add(top);
  const hinge = new THREE.Group();   // 折り目（紙の真ん中）
  sheet.add(hinge);
  const bottom = new THREE.Mesh(half(0, 0.5), paperMat);
  bottom.position.y = -0.5;
  hinge.add(bottom);
  const bottomBack = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0), backMat);
  bottomBack.position.set(0, -0.5, -0.002);
  bottomBack.rotation.x = Math.PI;   // 裏向き。折ると（さらに半回転して）表になり、文字も正しい向きになる
  hinge.add(bottomBack);
  // 封：オレンジの丸いシール（Y のマーク）
  const seal = new THREE.Mesh(new THREE.CircleGeometry(0.11, 48), new THREE.MeshStandardMaterial({ color: 0xff481b, emissive: 0xff481b, emissiveIntensity: 0.6, roughness: 0.35, alphaMap: null }));
  const sealMark = new THREE.Mesh(new THREE.CircleGeometry(0.075, 48), new THREE.MeshBasicMaterial({ map: tex.logoD, transparent: true, color: 0x1a0a06 }));
  sealMark.position.z = 0.001;
  seal.add(sealMark);
  seal.position.set(0, 0.05, 0.012);
  sheet.add(seal);

  scene.add(new THREE.HemisphereLight(0x2a3a44, 0x080808, 0.5));
  const lamp = new THREE.SpotLight(0xffe6c4, 20, 8, 0.75, 0.6, 1.4);
  lamp.position.set(0.3, 3.0, 0.4);
  lamp.target.position.set(0, 0, 0.1);
  scene.add(lamp, lamp.target);
  const tvGlow = new THREE.PointLight(0xc8ffe0, 3, 8, 1.4);
  tvGlow.position.set(-2.5, 1.0, -1.5);
  scene.add(tvGlow);
  const flash = new THREE.PointLight(0xff6030, 0, 1.6, 1.8);
  flash.position.set(0, 0.35, 0);
  scene.add(flash);

  const mon = createCreature({ envMap: env, glowScale: 0.32 });
  mon.group.traverse((o) => { if (o.material?.envMapIntensity !== undefined) o.material.envMapIntensity *= 0.3; if (o.material?.clearcoat) o.material.clearcoatRoughness = 0.35; });
  const holder = new THREE.Group();
  holder.add(mon.group);
  holder.scale.setScalar(0.56);
  scene.add(holder);
  const rim = new THREE.PointLight(0xc8ffe0, 1.4, 1.4, 1.6);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.05, 60);
  camera.up.set(0, 0, -1);   // 真上から見ても向きが決まるように（紙の上 ＝ 画面の上）
  // 寄り：3つ目のコマ（工房）がちょうど画面いっぱい → 引き：作業台の上の紙
  const panelZ = -((1 - (PANELS[2] + 270) / PH) - 0.5) * 2.0;
  const NEAR = { p: new THREE.Vector3(0, 0.81, panelZ + 0.001), l: new THREE.Vector3(0, 0, panelZ) };
  const FAR = { p: new THREE.Vector3(0.25, 1.75, 2.35), l: new THREE.Vector3(0.1, 0, 0.05) };
  const CLOSE = { p: new THREE.Vector3(0.45, 1.25, 1.3), l: new THREE.Vector3(0.32, 0, -0.38) };   // 折ったあと：封の方へ寄る

  const st = { t: 0, built: false };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const seg = (a, b) => clamp01((st.t - a) / (b - a));
  const ease = (x) => x * x * (3 - 2 * x);
  const ease3 = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  const tmp = new THREE.Vector3();
  let bgm = null;

  function draw(look) {
    const t = st.t;
    // カメラ：ゆっくり引いて、少し傾いた見下ろしへ。終わってからはマウスで少し覗き込める
    const k = ease3(seg(...PULL));
    camera.position.lerpVectors(NEAR.p, FAR.p, k);
    camera.position.x += look.x * 0.25 * k; camera.position.z += -look.y * 0.15 * k;
    tmp.lerpVectors(NEAR.l, FAR.l, k);
    const c = ease3(seg(FOLD[1] - 0.2, SEAL + 0.6));
    camera.position.lerp(CLOSE.p, c);
    tmp.lerp(CLOSE.l, c);
    camera.lookAt(tmp);
    // 紙を折る：下半分が持ち上がって、上半分に重なる
    const f = ease(seg(...FOLD));
    hinge.rotation.x = -Math.PI * f;
    hinge.position.z = 0.004 * f;
    // 封：ポンと押される
    const s = t - SEAL;
    seal.visible = s >= 0;
    const pop = s < 0 ? 0 : Math.min(1, s / 0.12) * (1 + 0.25 * Math.exp(-s * 8) * Math.sin(s * 40));
    seal.scale.setScalar(Math.max(0.001, pop));
    seal.position.y = 0.5;   // 折った紙の真ん中
    seal.position.z = 0.012 + 0.004 * f;
    flash.intensity = s >= 0 ? Math.exp(-s * 6) * 2.2 : 0;
    // けもの：右から歩いてきて紙の横で止まる → 折る間は見守る → 封でしっぽを振って跳ねる
    const w = seg(...WALK), we = 1 - (1 - w) ** 2;
    holder.position.set(1.95 - 1.05 * we, w > 0 && w < 1 ? Math.abs(Math.sin(t * 11)) * 0.04 : 0, -0.25);
    holder.rotation.y = -Math.PI / 2 + (w >= 1 ? 0.5 * ease(seg(WALK[1], WALK[1] + 0.4)) : 0);
    rim.position.set(holder.position.x + 0.2, 0.55, holder.position.z - 0.3);
    mon.update({ t, power: 0.3 + (s >= 0 ? 0.6 : 0), sinceImpact: s >= 0 ? s : -1, look: w >= 1 && s < 0 ? { x: -0.6, y: -0.5 } : { x: look.x * 0.5, y: 0.1 }, chomp: 0 });
    // 入ってきた瞬間は紙が横切る（前の場面からの続き）
    const wipe = t < 0.5 ? 0.5 + t : 0;
    return { hit: s >= 0 ? Math.exp(-s * 6) * 0.35 : 0, power: 0.35, wipe };
  }

  return {
    scene, camera, hint: '',
    setQuality() {},
    reset() { st.t = 0; st.built = false; },
    // 前の場面（夜を縫う線）で紙切れに使うため、先にポスターを刷っておく
    prepare() { compose(); composeBack(); st.built = true; return posterTex; },
    enter() {
      compose(); composeBack();
      st.built = true;
      bgm?.stop(); bgm = sfx('bgm_room', { gain: 0.7, loop: true });
    },
    leave() { bgm?.stop(0.4); bgm = null; },
    down() {}, up() {}, move() {},
    tick(dt) {
      const prev = st.t;
      st.t += dt;
      const at = (x) => prev < x && st.t >= x;
      if (at(WALK[0])) sfx('rattle', { gain: 0.3, pan: 0.6 });
      if (at(FOLD[0])) sfx('feed', { gain: 1.0 });
      if (at(FOLD[1] - 0.05)) sfx('snap', { gain: 0.8 });
      if (at(SEAL)) { sfx('press3', { gain: 1.0 }); sfx('hit', { gain: 0.5 }); }
      return st.t >= END_AT ? 'end' : null;
    },
    progress() { return 0; },
    busy() { return st.t < END_AT; },
    draw,
    state: () => ({ t: st.t, built: st.built }),
    // 保存する1枚（折る前のポスター）
    posterBlob: () => new Promise((res) => poster.toBlob(res, 'image/png')),
    script(t) { if (!st.built) { compose(); composeBack(); st.built = true; } st.t = t; },
    dust: null,
  };
}
