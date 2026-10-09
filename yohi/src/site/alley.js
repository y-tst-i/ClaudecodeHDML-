import * as THREE from 'three';
import { createCreature } from '../chara/creature.js';
import { mulberry32 } from '../room/world.js';
import { sfx } from '../audio.js';

// 場面2：夜の路地。壁をドラッグでスプレーすると、隠れているタグ（ロゴB）の形に塗れていき、
// 一定以上塗ると一気にタグが完成する（衝撃）。けものはノズルを目で追い、完成で跳ねる。
// 塗った跡は「吹いた点の一覧」から描く（点の i 番目の飛沫は種 i の乱数で決まる＝同じ操作なら同じ絵）。
const PAINT_W = 2.7, PAINT_H = 1.8;            // 塗れる面（ロゴBと同じ 3:2）
const GRID_W = 96, GRID_H = 64;                // 塗れた量を数えるための升目
const COMPLETE_AT = 0.33;                      // ロゴの面積の何割を塗ったら完成するか

export async function createAlley(renderer, env) {
  const loader = new THREE.TextureLoader();
  const load = async (url, srgb = true, rx = 1, ry = rx) => {
    const t = await loader.loadAsync(url);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 8;
    return t;
  };
  const tex = {
    brick: await load(new URL('../../assets/alley/wall_brick.jpg', import.meta.url).href, true, 4, 2),
    asphalt: await load(new URL('../../assets/alley/asphalt_wet.jpg', import.meta.url).href, true, 6, 6),
    shutter: await load(new URL('../../assets/alley/shutter_metal.jpg', import.meta.url).href, true, 1.5, 1),
    posterA: await load(new URL('../../assets/alley/poster_a.jpg', import.meta.url).href),
    posterB: await load(new URL('../../assets/alley/poster_b.jpg', import.meta.url).href),
    posterC: await load(new URL('../../assets/alley/poster_c.jpg', import.meta.url).href),
    stickers: await load(new URL('../../assets/alley/stickers.png', import.meta.url).href),
    logoB: await load(new URL('../../assets/logo/logo_b_street.png', import.meta.url).href),
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030304);
  scene.fog = new THREE.FogExp2(0x030304, 0.09);

  // ---------- 地面と壁 ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.28, metalness: 0.0, color: 0x5a5a5a }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshStandardMaterial({ map: tex.brick, roughness: 0.85, color: 0x9a8a84 }));
  wall.position.set(0, 3, -1);
  scene.add(wall);
  const shutter = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.9), new THREE.MeshStandardMaterial({ map: tex.shutter, roughness: 0.5, metalness: 0.6, color: 0x8a8a8a }));
  shutter.position.set(-3.6, 1.45, -0.98);
  scene.add(shutter);
  // 貼り紙（少し傾けて、重ねて貼る）
  const rnd = mulberry32(11);
  const posters = [[tex.posterA, 2.3, 1.9, 0.62], [tex.posterB, 2.9, 1.5, 0.55], [tex.posterC, 3.45, 2.1, 0.5], [tex.posterA, -2.25, 2.3, 0.45]];
  posters.forEach(([map, x, y, s], i) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 1.5), new THREE.MeshStandardMaterial({ map, roughness: 0.9, color: 0xb0aaa0 }));
    p.position.set(x, y, -0.985 + i * 0.002);
    p.rotation.z = (rnd() - 0.5) * 0.12;
    scene.add(p);
  });
  // ステッカー（シートを 3×2 に切り分けて、あちこちに貼る）
  for (let i = 0; i < 9; i++) {
    const k = i % 6, t = tex.stickers.clone();
    t.needsUpdate = true;
    t.repeat.set(1 / 3, 1 / 2);
    t.offset.set((k % 3) / 3, k < 3 ? 0.5 : 0);
    const size = 0.22 + rnd() * 0.12;
    const st = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, roughness: 0.4 }));
    const spots = [[-1.95, 1.1], [-2.6, 0.8], [1.85, 0.9], [2.25, 0.62], [3.3, 1.0], [-1.6, 2.65], [0.9, 2.85], [-2.9, 2.0], [3.9, 2.4]];
    st.position.set(spots[i][0], spots[i][1], -0.975);
    st.rotation.z = (rnd() - 0.5) * 0.6;
    scene.add(st);
  }

  // ---------- 塗れる面：吹いた跡（canvas）＋隠れたタグ ----------
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 800;
  const g2 = canvas.getContext('2d');
  const paintTex = new THREE.CanvasTexture(canvas);
  paintTex.colorSpace = THREE.SRGBColorSpace;
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(PAINT_W, PAINT_H), new THREE.MeshStandardMaterial({ map: paintTex, transparent: true, roughness: 0.55, emissive: 0xc7ffdb, emissiveMap: paintTex, emissiveIntensity: 0.18 }));
  paint.position.set(0, 1.55, -0.97);
  scene.add(paint);
  // 完成したタグ：オレンジのスプレー。左から右へ吹きつけるように現れ、垂れる
  const reveal = { value: 0 }, drip = { value: 0 };
  const tagMat = new THREE.MeshStandardMaterial({ map: tex.logoB, color: 0xff481b, transparent: true, roughness: 0.5, emissive: 0xff5a1f, emissiveIntensity: 0.9 });
  tagMat.onBeforeCompile = (sh) => {
    sh.uniforms.uReveal = reveal; sh.uniforms.uDrip = drip;
    sh.fragmentShader = 'uniform float uReveal, uDrip;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float n = fract(sin(dot(floor(vMapUv * 90.0), vec2(12.9898, 78.233))) * 43758.5453);
      float edge = mix(-0.1, 1.1, uReveal) + (n - 0.5) * 0.04;
      diffuseColor.a *= smoothstep(edge + 0.02, edge - 0.02, vMapUv.x);
      // 垂れ：細い所だけ下へ伸ばす（ロゴの下側を少しずつ見せる）
      diffuseColor.a *= vMapUv.y > 0.42 ? 1.0 : step(mix(0.42, 0.0, uDrip), vMapUv.y);`);
  };
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(PAINT_W, PAINT_H), tagMat);
  tag.position.set(0, 1.55, -0.965);
  scene.add(tag);

  // ロゴの形を升目に落とす（どれだけ塗れたかを数えるため）
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = GRID_W; maskCanvas.height = GRID_H;
  const mg = maskCanvas.getContext('2d');
  mg.drawImage(tex.logoB.image, 0, 0, GRID_W, GRID_H);
  const md = mg.getImageData(0, 0, GRID_W, GRID_H).data;
  const inLogo = new Uint8Array(GRID_W * GRID_H);
  let logoCells = 0;
  for (let i = 0; i < inLogo.length; i++) if (md[i * 4 + 3] > 100) { inLogo[i] = 1; logoCells++; }

  // ---------- 光：オレンジのナトリウム灯と、遠くのテレビの緑白い光 ----------
  scene.add(new THREE.HemisphereLight(0x2a3a44, 0x080808, 0.5));
  // 壁が読めるだけの、弱く冷たい正面光（遠くのテレビの光が回り込んでいる想定）
  const fill = new THREE.DirectionalLight(0x9fc8c0, 0.35);
  fill.position.set(-2, 3, 6);
  scene.add(fill);
  const lamp = new THREE.PointLight(0xffa868, 40, 14, 1.25);
  lamp.position.set(2.4, 3.6, 0.4);
  scene.add(lamp);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb070).multiplyScalar(4) }));
  bulb.position.copy(lamp.position);
  scene.add(bulb);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.5), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
  arm.position.set(2.4, 3.72, -0.3);
  scene.add(arm);
  const tvGlow = new THREE.PointLight(0xc8ffe0, 4, 10, 1.4);
  tvGlow.position.set(-4.5, 1.2, 2.5);
  scene.add(tvGlow);
  const nozzleLight = new THREE.PointLight(0xe0fff0, 0, 1.6, 2);
  scene.add(nozzleLight);

  // ---------- けもの ----------
  const mon = createCreature({ envMap: env, glowScale: 0.45 });
  mon.group.traverse((o) => { if (o.material?.envMapIntensity !== undefined) o.material.envMapIntensity *= 0.35; });
  const holder = new THREE.Group();
  holder.add(mon.group);
  holder.scale.setScalar(0.95);
  holder.position.set(-1.75, 0, -0.25);
  holder.rotation.y = 1.05;   // 横向きで壁（スプレー）を見ている
  scene.add(holder);
  // 後ろからの細い光で、暗がりでも黒い体の輪郭が分かるように（でないと目と胸のしまだけが浮いて、顔に見える）
  const rim = new THREE.PointLight(0xc8ffe0, 2.2, 1.5, 1.6);
  rim.position.set(-2.25, 1.15, -0.45);
  scene.add(rim);
  const rim2 = new THREE.PointLight(0xffa868, 2.5, 2.2, 1.5);
  rim2.position.set(-1.0, 0.9, -0.6);
  scene.add(rim2);

  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 60);
  const raycaster = new THREE.Raycaster();

  // ---------- 状態 ----------
  const st = { t: 0, enterAt: 0, points: [], drawn: 0, painted: new Uint8Array(GRID_W * GRID_H), coverage: 0, completeAt: null, holding: false, speed: 0, nozzle: null };
  let sprayLoop = null;

  // 吹いた点 i を canvas に描く：やわらかい芯＋まわりの飛沫（種 i の乱数）
  function stamp(i) {
    const p = st.points[i];
    const r = mulberry32(1000 + i);
    const x = p.u * canvas.width, y = (1 - p.v) * canvas.height, R = 24;
    const grad = g2.createRadialGradient(x, y, 0, x, y, R);
    grad.addColorStop(0, 'rgba(236,255,244,0.85)');
    grad.addColorStop(0.45, 'rgba(236,255,244,0.45)');
    grad.addColorStop(0.75, 'rgba(236,255,244,0.08)');
    grad.addColorStop(1, 'rgba(232,255,240,0)');
    g2.fillStyle = grad;
    g2.beginPath(); g2.arc(x, y, R, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = 'rgba(240,255,245,0.85)';
    for (let k = 0; k < 34; k++) {
      const a = r() * Math.PI * 2, d = R * (0.4 + r() * 1.4), s = 0.6 + r() * 1.8;
      g2.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, s, s);
    }
    // 升目に「塗れた」を記録
    const cx = Math.floor(p.u * GRID_W), cy = Math.floor((1 - p.v) * GRID_H), cr = Math.ceil(R / canvas.width * GRID_W);
    for (let yy = cy - cr; yy <= cy + cr; yy++) for (let xx = cx - cr; xx <= cx + cr; xx++) {
      if (xx < 0 || yy < 0 || xx >= GRID_W || yy >= GRID_H || (xx - cx) ** 2 + (yy - cy) ** 2 > cr * cr) continue;
      st.painted[yy * GRID_W + xx] = 1;
    }
  }
  function flush() {
    if (st.drawn === st.points.length) return;
    while (st.drawn < st.points.length) stamp(st.drawn++);
    paintTex.needsUpdate = true;
    let hit = 0;
    for (let i = 0; i < inLogo.length; i++) if (inLogo[i] && st.painted[i]) hit++;
    st.coverage = hit / logoCells;
  }
  // 画面の位置 → 塗れる面の上の uv
  function pick(ndc) {
    raycaster.setFromCamera(ndc, camera);
    const h = raycaster.intersectObject(paint)[0];
    return h ? { u: h.uv.x, v: h.uv.y, p: h.point } : null;
  }
  function addPoint(hitp) {
    const last = st.points[st.points.length - 1];
    // 間をあけすぎないように、離れていれば間を埋める
    if (last) {
      const d = Math.hypot(hitp.u - last.u, (hitp.v - last.v) / 1.5);
      const n = Math.min(8, Math.floor(d / 0.012));
      for (let k = 1; k <= n; k++) st.points.push({ u: last.u + (hitp.u - last.u) * k / (n + 1), v: last.v + (hitp.v - last.v) * k / (n + 1) });
    }
    st.points.push({ u: hitp.u, v: hitp.v });
  }

  function draw(look) {
    const t = st.t, since = st.completeAt === null ? -1 : t - st.completeAt;
    flush();
    // 完成：0.5秒で吹きつけるように現れ、そのあと垂れる
    reveal.value = since < 0 ? 0 : Math.min(1, since / 0.5);
    drip.value = since < 0.4 ? 0 : Math.min(1, ((since - 0.4) / 1.6) ** 2);
    const hit = since < 0 ? 0 : Math.exp(-since * 4) * 0.8;
    // ノズルの光（吹いている所がぼんやり光る）
    if (st.nozzle && st.holding && st.completeAt === null) { nozzleLight.position.copy(st.nozzle).add(new THREE.Vector3(0, 0, 0.3)); nozzleLight.intensity = 0.6 + st.speed * 2; }
    else nozzleLight.intensity *= 0.8;
    lamp.intensity = 40 * (0.94 + 0.06 * Math.sin(t * 50) * (Math.sin(t * 0.7) > 0.95 ? 1 : 0.1));   // ときどきジジッとちらつく
    // けもの：ノズルを目で追う。完成で跳ねる
    const lk = st.nozzle ? { x: THREE.MathUtils.clamp((st.nozzle.x - holder.position.x) * 0.25 - 0.3, -1, 1), y: THREE.MathUtils.clamp((st.nozzle.y - 1.0) * 0.8, -1, 1) } : look;
    mon.update({ t, power: st.completeAt === null ? Math.min(0.6, st.coverage / COMPLETE_AT * 0.6) : 1, sinceImpact: since, look: lk });
    // カメラ：入ってきた瞬間は壁に近い位置から引く。マウスで少し覗き込む
    const intro = Math.min(1, (t - st.enterAt) / 0.9), e = 1 - (1 - intro) ** 3;
    const shake = hit * 0.05;
    camera.position.set(look.x * 0.3 + Math.sin(t * 57) * shake, 1.3 + look.y * 0.15 + Math.cos(t * 49) * shake, 2.2 + 2.6 * e);
    camera.lookAt(look.x * 0.1, 1.0, -1);
    return { hit: Math.max(hit, (1 - intro) * 0.5), power: Math.min(1, st.coverage / COMPLETE_AT) * 0.5 };
  }

  return {
    scene, camera, hint: 'DRAG',
    setQuality() {},
    reset() {
      st.t = 0; st.enterAt = 0; st.points = []; st.drawn = 0; st.painted.fill(0); st.coverage = 0; st.completeAt = null; st.holding = false; st.nozzle = null;
      g2.clearRect(0, 0, canvas.width, canvas.height); paintTex.needsUpdate = true;
    },
    enter() { sfx('rattle'); sprayLoop?.stop(); sprayLoop = sfx('spray', { gain: 0, loop: true }); },
    leave() { sprayLoop?.stop(0.1); sprayLoop = null; },
    down(ndc) { st.holding = true; const h = pick(ndc); if (h && st.completeAt === null) { addPoint(h); st.nozzle = h.p; } },
    up() { st.holding = false; },
    move(ndc, dist) {
      if (!st.holding || st.completeAt !== null) return;
      const h = pick(ndc);
      if (!h) return;
      addPoint(h);
      st.nozzle = h.p;
      st.speed = Math.min(1, st.speed + dist * 0.02);
    },
    tick(dt) {
      st.t += dt;
      st.speed *= Math.pow(0.02, dt);
      if (sprayLoop) sprayLoop.gain.gain.value = st.holding && st.completeAt === null ? 0.25 + st.speed * 0.75 : 0;
      if (st.completeAt === null && st.coverage >= COMPLETE_AT) { st.completeAt = st.t; sfx('final'); sfx('rattle'); sprayLoop?.stop(0.05); }
      if (st.completeAt !== null && st.t - st.completeAt > 3.2) return 'end';
      return null;
    },
    progress() { return st.completeAt === null ? Math.min(1, st.coverage / COMPLETE_AT) : 0; },
    busy() { return st.completeAt !== null; },
    draw,
    state: () => ({ coverage: st.coverage, completed: st.completeAt !== null, points: st.points.length }),
    // ?mode=render 用：台本どおりにジグザグに吹く（同じ t なら同じ絵）
    script(t) {
      this.reset();
      st.t = t; st.enterAt = -10;
      const n = Math.floor(Math.min(t, 3.0) * 90);
      for (let i = 0; i < n; i++) { const k = i / 270; st.points.push({ u: 0.08 + 0.84 * ((k * 5) % 1), v: 0.25 + 0.5 * Math.abs(Math.sin(k * 23)) }); }
      flush();
      if (t >= 3.0) st.completeAt = 3.0;
    },
    dust: null,
  };
}
